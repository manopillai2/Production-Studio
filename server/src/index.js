import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { db, one, all, run, tx, setSetting } from './db.js';
import { MEDIA_DIR, TMP_DIR, CLIENT_DIST } from './paths.js';
import { probe, FFMPEG, FFPROBE, imageForAI } from './media.js';
import { isEnglish, LANGS } from './langs.js';
import { channel, assetOut, itemFull, episodeFull, lyricsOut, shotOut, jobOut, DEFAULT_CHANNEL } from './model.js';
import { preflight, runExportJob, toSrt, RESOLUTIONS } from './export.js';
import * as providers from './providers.js';
import { scanLyrics, musicPresets } from './offline.js';
import * as meshy from './meshy.js';
import { seedIfEmpty, patchSampleSpecs } from './seed.js';

const PORT = Number(process.env.PORT || 5175);
const app = express();
app.use(express.json({ limit: '25mb' }));
fs.mkdirSync(TMP_DIR, { recursive: true });
const upload = multer({ dest: TMP_DIR, limits: { fileSize: 4 * 1024 ** 3 } });

// ---------- helpers ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((out) => { if (!res.headersSent) res.json(out ?? { ok: true }); }).catch(next);
const need = (row, what = 'Record') => { if (!row) throw new HttpError(404, `${what} not found.`); return row; };
const num = (v) => (v === '' || v == null ? null : Number(v));
const touchEpisode = (id) => run(`UPDATE episodes SET updated_at=datetime('now') WHERE id=?`, id);

function updateRow(table, id, body, allowed) {
  const keys = Object.keys(body).filter((k) => allowed.includes(k));
  if (!keys.length) return;
  const vals = keys.map((k) => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]));
  run(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...vals, id);
}

const BLENDER_EXT = ['.blend', '.glb', '.gltf', '.fbx', '.obj', '.usd', '.usdz', '.abc'];
/** Move an uploaded temp file into storage/media/<owner>/<id>/ and register it as a Draft asset. */
function saveUpload(file, ownerType, ownerId, category, body = {}) {
  const ext = path.extname(file.originalname).toLowerCase();
  const safe = path.basename(file.originalname, ext).replace(/[^\w\-]+/g, '_').slice(0, 60) || 'file';
  const relDir = path.join(ownerType, String(ownerId));
  fs.mkdirSync(path.join(MEDIA_DIR, relDir), { recursive: true });
  const rel = path.join(relDir, `${Date.now()}-${safe}${ext}`);
  fs.renameSync(file.path, path.join(MEDIA_DIR, rel));
  let mime = file.mimetype || '';
  if (BLENDER_EXT.includes(ext)) mime = 'model/x-blender-asset';
  const meta = /^(video|audio|image)\//.test(mime) ? probe(path.join(MEDIA_DIR, rel)) : {};
  const width = meta.width ?? num(body.width), height = meta.height ?? num(body.height), duration = meta.duration ?? num(body.duration);
  const source = body.source || (BLENDER_EXT.includes(ext) || /blender/i.test(body.source || '') ? 'blender' : 'import');
  const r = run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,width,height,duration,source,status,notes)
                 VALUES(?,?,?,?,?,?,?,?,?,?, 'draft', ?)`,
    ownerType, ownerId, category, body.label || file.originalname, rel.replace(/\\/g, '/'), mime, width, height, duration, source, body.notes || '');
  return assetOut(one('SELECT * FROM assets WHERE id=?', r.lastInsertRowid));
}
const cleanupTmp = (files = []) => files.forEach((f) => fs.existsSync(f.path) && fs.rmSync(f.path, { force: true }));

// ---------- system ----------
app.get('/api/health', h(() => ({ ok: true, ffmpeg: !!FFMPEG, ffprobe: !!FFPROBE, ...providers.providerStatus() })));
app.get('/api/providers', h(() => providers.providerStatus()));

app.get('/api/dashboard', h(() => {
  const episodes = all('SELECT id FROM episodes ORDER BY number, id').map((e) => {
    const f = episodeFull(e.id);
    return { id: f.id, number: f.number, title: f.title, language: f.language, theme: f.theme, progress: f.progress, updated_at: f.updated_at,
      cast: f.cast.map((c) => c.name), shots: f.shots.length, thumbnail_url: f.thumbnail_url };
  });
  const counts = Object.fromEntries(all('SELECT kind, COUNT(*) n FROM items GROUP BY kind').map((r) => [r.kind, r.n]));
  const jobs = all(`SELECT j.*, e.title AS episode_title FROM jobs j LEFT JOIN episodes e ON e.id=j.episode_id ORDER BY j.id DESC LIMIT 8`).map(jobOut);
  return { channel: channel(), episodes, counts, jobs, system: { ffmpeg: !!FFMPEG, ffprobe: !!FFPROBE } };
}));

// ---------- channel identity ----------
app.get('/api/channel', h(() => {
  const c = channel();
  return { ...c, assets: all(`SELECT * FROM assets WHERE owner_type='channel' ORDER BY id`).map(assetOut) };
}));
app.put('/api/channel', h((req) => {
  const merged = { ...channel(), ...req.body };
  delete merged.assets;
  setSetting('channel', merged);
  return merged;
}));
app.post('/api/channel/assets', upload.array('files'), h((req) => {
  const category = req.body.category || 'logo';
  const out = req.files.map((f) => {
    const a = saveUpload(f, 'channel', 0, category, req.body);
    run(`UPDATE assets SET status='approved' WHERE id=?`, a.id); // channel files are used directly
    return { ...a, status: 'approved' };
  });
  const c = channel();
  if (category === 'logo' && out[0]) c.logo_asset_id = out[0].id;
  if (category === 'sound') c.signature_sound_ids = [...(c.signature_sound_ids || []), ...out.map((a) => a.id)];
  setSetting('channel', c);
  return out;
}));

// ---------- library: characters / locations / props ----------
app.get('/api/items', h((req) => {
  const kinds = String(req.query.kind || 'character,location,prop').split(',');
  return all(`SELECT * FROM items WHERE kind IN (${kinds.map(() => '?').join(',')}) ORDER BY name`, ...kinds).map((i) => {
    const versions = all('SELECT id,label,status FROM item_versions WHERE item_id=? ORDER BY id', i.id);
    const latestApproved = [...versions].reverse().find((v) => v.status === 'approved');
    const cover = latestApproved || versions.at(-1);
    const img = cover && one(`SELECT * FROM assets WHERE owner_type='version' AND owner_id=? AND mime LIKE 'image/%' ORDER BY id LIMIT 1`, cover.id);
    const spec = cover ? JSON.parse(one('SELECT spec FROM item_versions WHERE id=?', cover.id)?.spec || '{}') : {};
    return { ...i, versions, cover: assetOut(img), spec, locked: !!latestApproved, approved_count: versions.filter((v) => v.status === 'approved').length };
  });
}));
app.post('/api/items', h((req) => {
  const { kind = 'character', name, description = '', notes = '', blender_link = '' } = req.body;
  if (!name?.trim()) throw new HttpError(400, 'Give it a name first.');
  const r = run('INSERT INTO items(kind,name,description,notes,blender_link) VALUES(?,?,?,?,?)', kind, name.trim(), description, notes, blender_link);
  run(`INSERT INTO item_versions(item_id,label) VALUES(?, 'Draft 1')`, r.lastInsertRowid);
  return itemFull(r.lastInsertRowid);
}));
app.get('/api/items/:id', h((req) => need(itemFull(+req.params.id), 'Library item')));
app.put('/api/items/:id', h((req) => {
  need(one('SELECT id FROM items WHERE id=?', +req.params.id), 'Library item');
  updateRow('items', +req.params.id, req.body, ['name', 'description', 'notes', 'blender_link', 'kind']);
  return itemFull(+req.params.id);
}));
app.delete('/api/items/:id', h((req) => {
  const used = all('SELECT episode_id FROM episode_cast WHERE item_id=?', +req.params.id);
  if (used.length) throw new HttpError(409, `This is used in ${used.length} project(s). Remove it from those projects first.`);
  run(`DELETE FROM assets WHERE owner_type='version' AND owner_id IN (SELECT id FROM item_versions WHERE item_id=?)`, +req.params.id);
  run('DELETE FROM chat_messages WHERE scope=?', `item:${+req.params.id}`);
  run('DELETE FROM items WHERE id=?', +req.params.id);
}));

app.post('/api/items/:id/versions', h((req) => {
  const item = need(one('SELECT * FROM items WHERE id=?', +req.params.id), 'Library item');
  const n = one('SELECT COUNT(*) n FROM item_versions WHERE item_id=?', item.id).n + 1;
  const srcSpec = req.body.copy_from ? one('SELECT spec FROM item_versions WHERE id=?', +req.body.copy_from)?.spec : '{}';
  const r = run('INSERT INTO item_versions(item_id,label,notes,spec) VALUES(?,?,?,?)', item.id, req.body.label || `Draft ${n}`, req.body.notes || '', srcSpec || '{}');
  if (req.body.copy_from) {
    // Copy asset *records* (files are shared, never modified) so the new draft starts from the old one.
    for (const a of all(`SELECT * FROM assets WHERE owner_type='version' AND owner_id=?`, +req.body.copy_from)) {
      run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,width,height,duration,source,status,notes)
           VALUES('version',?,?,?,?,?,?,?,?,?,'draft',?)`, r.lastInsertRowid, a.category, a.label, a.file_path, a.mime, a.width, a.height, a.duration, a.source, a.notes);
    }
  }
  return itemFull(item.id);
}));
app.put('/api/versions/:id', h((req) => {
  const v = need(one('SELECT * FROM item_versions WHERE id=?', +req.params.id), 'Version');
  updateRow('item_versions', v.id, req.body, ['label', 'notes']);
  return itemFull(v.item_id);
}));
app.post('/api/versions/:id/approve', h((req) => {
  const v = need(one('SELECT * FROM item_versions WHERE id=?', +req.params.id), 'Version');
  if (!one(`SELECT id FROM assets WHERE owner_type='version' AND owner_id=?`, v.id)) throw new HttpError(400, 'Import at least one reference file before approving this version.');
  // "Draft 3" becomes "v2" when it is the second locked version; custom labels are kept.
  const lockedN = one(`SELECT COUNT(*) n FROM item_versions WHERE item_id=? AND status='approved'`, v.item_id).n + 1;
  const label = /^Draft \d+$/.test(v.label) ? `v${lockedN}` : v.label;
  run(`UPDATE item_versions SET status='approved', approved_at=datetime('now'), label=? WHERE id=?`, label, v.id);
  run(`UPDATE assets SET status='approved' WHERE owner_type='version' AND owner_id=?`, v.id);
  // Projects that were developing this item now pin the newly locked version.
  run('UPDATE episode_cast SET version_id=? WHERE item_id=? AND version_id IS NULL', v.id, v.item_id);
  return itemFull(v.item_id);
}));
app.post('/api/versions/:id/unapprove', h((req) => {
  const v = need(one('SELECT * FROM item_versions WHERE id=?', +req.params.id), 'Version');
  const used = all('SELECT episode_id FROM episode_cast WHERE version_id=?', v.id);
  if (used.length) throw new HttpError(409, `This approved version is pinned in ${used.length} episode(s). Switch those episodes to another version first.`);
  run(`UPDATE item_versions SET status='draft', approved_at=NULL WHERE id=?`, v.id);
  run(`UPDATE assets SET status='draft' WHERE owner_type='version' AND owner_id=?`, v.id);
  return itemFull(v.item_id);
}));
app.delete('/api/versions/:id', h((req) => {
  const v = need(one('SELECT * FROM item_versions WHERE id=?', +req.params.id), 'Version');
  if (v.status === 'approved') throw new HttpError(409, 'Approved versions cannot be deleted. Un-approve it first.');
  run(`DELETE FROM assets WHERE owner_type='version' AND owner_id=?`, v.id);
  run('DELETE FROM item_versions WHERE id=?', v.id);
  return itemFull(v.item_id);
}));
app.post('/api/versions/:id/assets', upload.array('files'), h((req) => {
  const v = one('SELECT * FROM item_versions WHERE id=?', +req.params.id);
  if (!v) { cleanupTmp(req.files); throw new HttpError(404, 'Version not found.'); }
  if (v.status === 'approved') {
    cleanupTmp(req.files);
    throw new HttpError(409, 'This version is approved and locked. Create a new draft from it to add files — episodes using it will not change.');
  }
  req.files.forEach((f) => saveUpload(f, 'version', v.id, req.body.category || 'reference', req.body));
  return itemFull(v.item_id);
}));

// ---------- assets (generic) ----------
app.put('/api/assets/:id', h((req) => {
  const a = need(one('SELECT * FROM assets WHERE id=?', +req.params.id), 'File');
  updateRow('assets', a.id, req.body, ['label', 'notes', 'category']);
  return assetOut(one('SELECT * FROM assets WHERE id=?', a.id));
}));
app.post('/api/assets/:id/approve', h((req) => {
  const a = need(one('SELECT * FROM assets WHERE id=?', +req.params.id), 'File');
  run(`UPDATE assets SET status=? WHERE id=?`, req.body.status === 'draft' ? 'draft' : 'approved', a.id);
  return assetOut(one('SELECT * FROM assets WHERE id=?', a.id));
}));
app.delete('/api/assets/:id', h((req) => {
  const a = need(one('SELECT * FROM assets WHERE id=?', +req.params.id), 'File');
  if (a.status === 'approved' && a.owner_type !== 'channel') throw new HttpError(409, 'Approved files are locked. Mark it as Draft first if you really want to delete it.');
  if (one('SELECT id FROM episodes WHERE master_audio_id=?', a.id)) throw new HttpError(409, 'This is an episode master track.');
  if (one('SELECT id FROM shots WHERE approved_clip_id=? OR ref_asset_id=?', a.id, a.id)) throw new HttpError(409, 'This file is used by a storyboard shot.');
  run('DELETE FROM assets WHERE id=?', a.id);
  // Only remove the file if no other record (e.g. a copied draft) points at it.
  if (!one('SELECT id FROM assets WHERE file_path=?', a.file_path)) fs.rmSync(path.join(MEDIA_DIR, a.file_path), { force: true });
}));

// ---------- episodes ----------
app.get('/api/episodes', h(() => all('SELECT id, number, title, title_ta FROM episodes ORDER BY number, id')));
app.post('/api/episodes', h((req) => {
  const c = channel();
  const b = req.body;
  if (!b.title?.trim()) throw new HttpError(400, 'Episode title is required.');
  const number = one('SELECT COALESCE(MAX(number),0)+1 n FROM episodes').n;
  const id = tx(() => {
    const r = run(`INSERT INTO episodes(number,title,title_ta,language,theme,learning_goals,target_duration,notes,youtube_title,youtube_description,caption_style,caption_language)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?, 'native')`,
      number, b.title.trim(), b.title_ta || '', LANGS[b.language] ? b.language : 'ta', b.theme || '', b.learning_goals || '', b.target_duration || 60, b.notes || '',
      `${b.title.trim()}${b.title_ta ? ' | ' + b.title_ta : ''} | ${c.name}`,
      (c.description_template || '').replaceAll('{title}', b.title.trim()),
      JSON.stringify(c.caption_style || DEFAULT_CHANNEL.caption_style));
    const eid = r.lastInsertRowid;
    // Reuse cast: each item is pinned to its latest APPROVED version (or the one given).
    for (const it of b.cast || []) {
      const vid = it.version_id || one(`SELECT id FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, it.item_id)?.id || null;
      run('INSERT INTO episode_cast(episode_id,item_id,version_id) VALUES(?,?,?)', eid, it.item_id, vid);
    }
    if (b.copy_shots_from) {
      for (const s of all('SELECT * FROM shots WHERE episode_id=? ORDER BY position', b.copy_shots_from)) {
        run(`INSERT INTO shots(episode_id,position,title,character_item_id,location_item_id,ref_asset_id,motion_notes,look,duration)
             VALUES(?,?,?,?,?,?,?,?,?)`, eid, s.position, s.title, s.character_item_id, s.location_item_id, s.ref_asset_id, s.motion_notes, s.look, s.duration);
      }
    }
    return eid;
  });
  return episodeFull(id);
}));
app.get('/api/episodes/:id', h((req) => need(episodeFull(+req.params.id), 'Episode')));
app.put('/api/episodes/:id', h((req) => {
  need(one('SELECT id FROM episodes WHERE id=?', +req.params.id), 'Episode');
  updateRow('episodes', +req.params.id, req.body,
    ['title', 'title_ta', 'language', 'theme', 'learning_goals', 'target_duration', 'notes', 'youtube_title', 'youtube_description', 'caption_style', 'caption_language', 'number']);
  touchEpisode(+req.params.id);
  return episodeFull(+req.params.id);
}));
app.delete('/api/episodes/:id', h((req) => {
  const id = +req.params.id;
  tx(() => {
    for (const s of all('SELECT id FROM shots WHERE episode_id=?', id)) run(`DELETE FROM assets WHERE owner_type='shot' AND owner_id=?`, s.id);
    run(`DELETE FROM assets WHERE owner_type='episode' AND owner_id=?`, id);
    run('DELETE FROM episodes WHERE id=?', id);
  });
}));
app.put('/api/episodes/:id/cast', h((req) => {
  const id = +req.params.id;
  const { item_id, remove, develop } = req.body;
  let { version_id } = req.body;
  if (remove) run('DELETE FROM episode_cast WHERE episode_id=? AND item_id=?', id, item_id);
  else {
    need(one('SELECT id FROM items WHERE id=?', item_id), 'Library item');
    if (version_id) {
      const v = need(one('SELECT * FROM item_versions WHERE id=? AND item_id=?', version_id, item_id), 'Version');
      if (v.status !== 'approved') throw new HttpError(400, 'Only locked versions can be pinned. Lock it first.');
    } else if (!develop) {
      // Reuse: pin the latest locked version, or develop it if it has never been locked.
      version_id = one(`SELECT id FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, item_id)?.id ?? null;
    } else version_id = null;
    run(`INSERT INTO episode_cast(episode_id,item_id,version_id) VALUES(?,?,?)
         ON CONFLICT(episode_id,item_id) DO UPDATE SET version_id=excluded.version_id`, id, item_id, version_id);
  }
  touchEpisode(id);
  return episodeFull(id);
}));

// ---------- lyrics ----------
app.post('/api/episodes/:id/lyrics', h((req) => {
  const id = +req.params.id;
  need(one('SELECT id FROM episodes WHERE id=?', id), 'Episode');
  let { title = 'New draft', sections, copy_from, source = 'manual' } = req.body;
  if (copy_from) {
    const src = need(one('SELECT * FROM lyrics WHERE id=?', copy_from), 'Lyrics draft');
    title = `${src.title} (copy)`; sections = JSON.parse(src.sections);
  }
  sections ??= [{ type: 'verse', label: 'Verse 1', lines: [{ ta: '', en: '', cue: '' }] }, { type: 'chorus', label: 'Chorus', lines: [{ ta: '', en: '', cue: '' }] }];
  const r = run('INSERT INTO lyrics(episode_id,title,sections,source) VALUES(?,?,?,?)', id, title, JSON.stringify(sections), source);
  return lyricsOut(one('SELECT * FROM lyrics WHERE id=?', r.lastInsertRowid));
}));
app.put('/api/lyrics/:id', h((req) => {
  const l = need(one('SELECT * FROM lyrics WHERE id=?', +req.params.id), 'Lyrics draft');
  if (l.status === 'approved') throw new HttpError(409, 'Approved lyrics are locked. Use "Duplicate as new draft" to make changes.');
  updateRow('lyrics', l.id, req.body, ['title', 'sections', 'notes']);
  run(`UPDATE lyrics SET updated_at=datetime('now') WHERE id=?`, l.id);
  return lyricsOut(one('SELECT * FROM lyrics WHERE id=?', l.id));
}));
app.post('/api/lyrics/:id/approve', h((req) => {
  const l = need(one('SELECT * FROM lyrics WHERE id=?', +req.params.id), 'Lyrics draft');
  const lines = JSON.parse(l.sections).flatMap((s) => s.lines).filter((x) => x.ta?.trim() || x.en?.trim());
  if (!lines.length) throw new HttpError(400, 'Add at least one lyric line before approving.');
  tx(() => {
    run(`UPDATE lyrics SET status='draft' WHERE episode_id=? AND status='approved'`, l.episode_id);
    run(`UPDATE lyrics SET status='approved' WHERE id=?`, l.id);
    run('UPDATE episodes SET approved_lyrics_id=? WHERE id=?', l.id, l.episode_id);
  });
  touchEpisode(l.episode_id);
  return episodeFull(l.episode_id);
}));
app.post('/api/lyrics/:id/unlock', h((req) => {
  const l = need(one('SELECT * FROM lyrics WHERE id=?', +req.params.id), 'Lyrics version');
  if (l.status !== 'approved') throw new HttpError(400, 'These lyrics are not finalized.');
  tx(() => {
    run(`UPDATE lyrics SET status='draft', updated_at=datetime('now') WHERE id=?`, l.id);
    run('UPDATE episodes SET approved_lyrics_id=NULL WHERE id=? AND approved_lyrics_id=?', l.episode_id, l.id);
  });
  touchEpisode(l.episode_id);
  return episodeFull(l.episode_id);
}));
app.delete('/api/lyrics/:id', h((req) => {
  const l = need(one('SELECT * FROM lyrics WHERE id=?', +req.params.id), 'Lyrics draft');
  if (l.status === 'approved') throw new HttpError(409, 'Approved lyrics cannot be deleted.');
  run('DELETE FROM lyrics WHERE id=?', l.id);
}));

// ---------- tune, music & vocals ----------
const AUDIO_CATS = ['hum', 'guide', 'instrumental', 'vocal', 'song'];
app.post('/api/episodes/:id/audio', upload.array('files'), h((req) => {
  const id = +req.params.id;
  const cat = AUDIO_CATS.includes(req.body.category) ? req.body.category : 'song';
  if (!one('SELECT id FROM episodes WHERE id=?', id)) { cleanupTmp(req.files); throw new HttpError(404, 'Episode not found.'); }
  const out = req.files.map((f) => saveUpload(f, 'episode', id, cat, req.body));
  touchEpisode(id);
  return out;
}));
app.post('/api/episodes/:id/master', h((req) => {
  const id = +req.params.id;
  const a = need(one(`SELECT * FROM assets WHERE id=? AND owner_type='episode' AND owner_id=?`, req.body.asset_id, id), 'Audio take');
  if (a.status !== 'approved') throw new HttpError(400, 'Approve this take before making it the master track.');
  run('UPDATE episodes SET master_audio_id=? WHERE id=?', a.id, id);
  touchEpisode(id);
  return episodeFull(id);
}));

// ---------- storyboard / animation ----------
app.post('/api/episodes/:id/shots', h((req) => {
  const id = +req.params.id;
  const pos = one('SELECT COALESCE(MAX(position),-1)+1 p FROM shots WHERE episode_id=?', id).p;
  const b = req.body;
  run(`INSERT INTO shots(episode_id,position,title,lyric_cue,character_item_id,location_item_id,motion_notes,duration)
       VALUES(?,?,?,?,?,?,?,?)`, id, pos, b.title || `Shot ${pos + 1}`, b.lyric_cue || '', b.character_item_id || null, b.location_item_id || null, b.motion_notes || '', b.duration || 4);
  touchEpisode(id);
  return episodeFull(id);
}));
app.put('/api/shots/:id', h((req) => {
  const s = need(one('SELECT * FROM shots WHERE id=?', +req.params.id), 'Shot');
  const b = { ...req.body };
  for (const k of ['trim_in', 'trim_out', 'duration']) if (k in b) b[k] = num(b[k]);
  if (b.trim_in != null && b.trim_in < 0) throw new HttpError(400, 'Trim in cannot be negative.');
  if (b.trim_in != null && b.trim_out != null && b.trim_out <= b.trim_in) throw new HttpError(400, 'Trim out must be after trim in.');
  updateRow('shots', s.id, b, ['title', 'lyric_cue', 'character_item_id', 'location_item_id', 'ref_asset_id', 'motion_notes', 'look', 'duration', 'trim_in', 'trim_out']);
  touchEpisode(s.episode_id);
  return shotOut(one('SELECT * FROM shots WHERE id=?', s.id));
}));
app.delete('/api/shots/:id', h((req) => {
  const s = need(one('SELECT * FROM shots WHERE id=?', +req.params.id), 'Shot');
  run(`DELETE FROM assets WHERE owner_type='shot' AND owner_id=?`, s.id);
  run('DELETE FROM shots WHERE id=?', s.id);
  return episodeFull(s.episode_id);
}));
app.post('/api/episodes/:id/shots/reorder', h((req) => {
  const id = +req.params.id;
  tx(() => (req.body.ids || []).forEach((sid, i) => run('UPDATE shots SET position=? WHERE id=? AND episode_id=?', i, sid, id)));
  touchEpisode(id);
  return episodeFull(id);
}));
app.post('/api/shots/:id/clips', upload.array('files'), h((req) => {
  const s = one('SELECT * FROM shots WHERE id=?', +req.params.id);
  if (!s) { cleanupTmp(req.files); throw new HttpError(404, 'Shot not found.'); }
  req.files.forEach((f) => saveUpload(f, 'shot', s.id, req.body.category || 'clip', req.body));
  touchEpisode(s.episode_id);
  return shotOut(one('SELECT * FROM shots WHERE id=?', s.id));
}));
app.post('/api/shots/:id/approve-clip', h((req) => {
  const s = need(one('SELECT * FROM shots WHERE id=?', +req.params.id), 'Shot');
  const a = need(one(`SELECT * FROM assets WHERE id=? AND owner_type='shot' AND owner_id=?`, req.body.asset_id, s.id), 'Clip');
  if (!/^video\//.test(a.mime)) throw new HttpError(400, 'Only video clips can be approved for the timeline.');
  tx(() => {
    run(`UPDATE assets SET status='draft' WHERE owner_type='shot' AND owner_id=? AND category='clip'`, s.id);
    run(`UPDATE assets SET status='approved' WHERE id=?`, a.id);
    run('UPDATE shots SET approved_clip_id=?, trim_in=0, trim_out=NULL WHERE id=?', a.id, s.id);
  });
  touchEpisode(s.episode_id);
  return shotOut(one('SELECT * FROM shots WHERE id=?', s.id));
}));

// ---------- captions ----------
app.put('/api/episodes/:id/captions', h((req) => {
  const id = +req.params.id;
  const caps = req.body.captions || [];
  for (const c of caps) if (!(Number(c.end) > Number(c.start))) throw new HttpError(400, `Caption "${String(c.text).slice(0, 30)}" ends before it starts.`);
  tx(() => {
    run('DELETE FROM captions WHERE episode_id=?', id);
    for (const c of caps) run('INSERT INTO captions(episode_id,start,end,text) VALUES(?,?,?,?)', id, Number(c.start), Number(c.end), String(c.text));
  });
  touchEpisode(id);
  return episodeFull(id);
}));
app.post('/api/episodes/:id/captions/from-lyrics', h((req) => {
  const ep = need(episodeFull(+req.params.id), 'Episode');
  const lyr = ep.lyrics.find((l) => l.id === ep.approved_lyrics_id);
  if (!lyr) throw new HttpError(400, 'Approve a lyrics draft first.');
  // native = the sung language (default) · en = English meaning · both = sung line + English underneath
  const lang = req.body.language || ep.caption_language || 'native';
  const lines = lyr.sections.flatMap((s) => s.lines).filter((l) => l.ta?.trim() || l.en?.trim());
  const textOf = (l) => (isEnglish(ep.language) || lang === 'en' ? (l.en || l.ta)
    : lang === 'native' ? (l.ta || l.en) : [l.ta, l.en].filter(Boolean).join('\n'));
  const total = ep.timeline.at(-1)?.end || ep.master_audio?.duration || lines.length * 4;
  // One caption per shot when counts match, otherwise spread evenly across the song.
  const caps = lines.map((l, i) => {
    const seg = lines.length === ep.timeline.length ? ep.timeline[i] : null;
    const start = seg ? seg.start : (total / lines.length) * i;
    const end = seg ? seg.end : (total / lines.length) * (i + 1);
    return { start: +start.toFixed(2), end: +(end - 0.1).toFixed(2), text: textOf(l) };
  });
  run('UPDATE episodes SET caption_language=? WHERE id=?', lang, ep.id);
  tx(() => {
    run('DELETE FROM captions WHERE episode_id=?', ep.id);
    for (const c of caps) run('INSERT INTO captions(episode_id,start,end,text) VALUES(?,?,?,?)', ep.id, c.start, c.end, c.text);
  });
  touchEpisode(ep.id);
  return episodeFull(ep.id);
}));
app.get('/api/episodes/:id/captions.srt', (req, res) => {
  const caps = all('SELECT * FROM captions WHERE episode_id=? ORDER BY start', +req.params.id);
  res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="episode-${req.params.id}-captions.srt"`);
  res.send('﻿' + toSrt(caps));
});

// ---------- thumbnail ----------
app.post('/api/episodes/:id/thumbnail', h((req) => {
  const id = +req.params.id;
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(req.body.dataUrl || '');
  if (!m) throw new HttpError(400, 'Thumbnail image data was not received.');
  const rel = `episode/${id}/thumbnail-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`;
  fs.mkdirSync(path.join(MEDIA_DIR, 'episode', String(id)), { recursive: true });
  fs.writeFileSync(path.join(MEDIA_DIR, rel), Buffer.from(m[2], 'base64'));
  run(`UPDATE episodes SET thumbnail_path=?, updated_at=datetime('now') WHERE id=?`, rel, id);
  return episodeFull(id);
}));

// ---------- export jobs ----------
app.post('/api/episodes/:id/export', h((req) => {
  const ep = need(episodeFull(+req.params.id), 'Episode');
  const resolution = RESOLUTIONS[req.body.resolution] ? req.body.resolution : '1080p';
  const problems = preflight(ep);
  if (problems.length) throw new HttpError(400, problems.join(' '));
  const r = run(`INSERT INTO jobs(type,episode_id,status,message,params) VALUES('export',?, 'queued', 'Queued', ?)`,
    ep.id, JSON.stringify({ resolution, burn_captions: !!req.body.burn_captions }));
  setImmediate(() => runExportJob(r.lastInsertRowid));
  return jobOut(one('SELECT * FROM jobs WHERE id=?', r.lastInsertRowid));
}));
app.get('/api/jobs', h((req) => {
  const rows = req.query.episode_id
    ? all('SELECT * FROM jobs WHERE episode_id=? ORDER BY id DESC LIMIT 20', +req.query.episode_id)
    : all('SELECT * FROM jobs ORDER BY id DESC LIMIT 20');
  return rows.map(jobOut);
}));
app.get('/api/jobs/:id', h((req) => jobOut(need(one('SELECT * FROM jobs WHERE id=?', +req.params.id), 'Job'))));

// ---------- AI tool connections ----------
app.get('/api/connections', h(() => providers.providerStatus()));
app.put('/api/connections', h((req) => providers.saveConnection(req.body)));

// ---------- assistant chat history ----------
const chatFor = (scope, episodeId = 0) =>
  all('SELECT id, role, content, ref, created_at FROM chat_messages WHERE scope=? AND COALESCE(episode_id,0)=? ORDER BY id', scope, episodeId || 0)
    .map((m) => ({ ...m, ref: JSON.parse(m.ref || '{}') }));
const addChat = (scope, episodeId, role, content, ref = {}) =>
  run('INSERT INTO chat_messages(episode_id,scope,role,content,ref) VALUES(?,?,?,?,?)', episodeId || null, scope, role, String(content), JSON.stringify(ref));
app.get('/api/chat', h((req) => chatFor(String(req.query.scope), Number(req.query.episode_id) || 0)));
app.delete('/api/chat', h((req) => { run('DELETE FROM chat_messages WHERE scope=? AND COALESCE(episode_id,0)=?', String(req.query.scope), Number(req.query.episode_id) || 0); return []; }));

const libraryText = () => all('SELECT name, kind FROM items').map((i) => `${i.name} (${i.kind})`).join(', ');
const lyricLines = (l) => l.sections.flatMap((s) => s.lines).filter((x) => x.ta?.trim() || x.en?.trim());
const lyricsText = (l) => l.sections.map((s) => `[${s.label}]\n${s.lines.map((x) => [x.ta, x.en].filter(Boolean).join(' / ')).join('\n')}`).join('\n\n');
const finalOrLatestLyrics = (epId) => lyricsOut(
  one('SELECT * FROM lyrics WHERE id=(SELECT approved_lyrics_id FROM episodes WHERE id=?)', epId) || one('SELECT * FROM lyrics WHERE episode_id=? ORDER BY id DESC LIMIT 1', epId));

// ---------- Stage 1: lyrics assistant ----------
app.post('/api/episodes/:id/assistant/lyrics', h(async (req) => {
  const ep = need(one('SELECT * FROM episodes WHERE id=?', +req.params.id), 'Project');
  const message = String(req.body.message || '').trim();
  if (!message) throw new HttpError(400, 'Type what you want the assistant to do.');
  const base = req.body.lyrics_id ? lyricsOut(one('SELECT * FROM lyrics WHERE id=? AND episode_id=?', +req.body.lyrics_id, ep.id)) : null;
  const out = await providers.lyricsAssistant({ channel: channel(), episode: ep, lyrics: base, history: chatFor('lyrics', ep.id), message, library: libraryText() });
  let lyricsId = null;
  if (out.lyrics?.sections?.length) {
    // Every assistant change becomes a NEW draft, so you can always go back.
    const n = one('SELECT COUNT(*) n FROM lyrics WHERE episode_id=?', ep.id).n + 1;
    lyricsId = Number(run(`INSERT INTO lyrics(episode_id,title,sections,source,notes) VALUES(?,?,?, 'assistant', ?)`,
      ep.id, `${out.lyrics.title || ep.title} · v${n}`, JSON.stringify(out.lyrics.sections), message).lastInsertRowid);
  }
  addChat('lyrics', ep.id, 'user', message, base ? { based_on: base.id } : {});
  addChat('lyrics', ep.id, 'assistant', out.reply || 'Done.', lyricsId ? { lyrics_id: lyricsId } : {});
  touchEpisode(ep.id);
  return { messages: chatFor('lyrics', ep.id), lyrics_id: lyricsId, episode: episodeFull(ep.id) };
}));

// ---------- Stage 2: characters & scenery ----------
function itemCard(id) {
  const i = one('SELECT * FROM items WHERE id=?', id);
  if (!i) return null;
  const la = one(`SELECT id,label FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, id);
  const cv = la || one('SELECT id,label FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', id);
  const img = cv && one(`SELECT * FROM assets WHERE owner_type='version' AND owner_id=? AND mime LIKE 'image/%' ORDER BY id LIMIT 1`, cv.id);
  return { id: i.id, name: i.name, kind: i.kind, description: i.description, locked: !!la, locked_label: la?.label || null, cover: assetOut(img) };
}
function findMatch(name, kind) {
  const n = name.toLowerCase().trim();
  const group = kind === 'character' ? ['character'] : ['location', 'prop'];
  const cands = all(`SELECT id, name FROM items WHERE kind IN (${group.map(() => '?').join(',')})`, ...group);
  const words = (s) => s.toLowerCase().split(/[\s/]+/).filter((w) => w.length > 2);
  return cands.find((c) => c.name.toLowerCase() === n)
    || cands.find((c) => words(c.name).some((w) => words(n).includes(w)));
}
function createItem({ kind, name, description = '' }) {
  const id = Number(run('INSERT INTO items(kind,name,description) VALUES(?,?,?)', kind, name.trim(), description).lastInsertRowid);
  run(`INSERT INTO item_versions(item_id,label,spec) VALUES(?, 'Draft 1', ?)`, id, JSON.stringify(description ? { description } : {}));
  return id;
}
// ---- World style: the guide text + locked designs, used for every new design/image ----
const latestLockedId = `(SELECT id FROM item_versions WHERE item_id=i.id AND status='approved' ORDER BY id DESC LIMIT 1)`;
function worldContext(excludeItemId = 0) {
  const rows = all(`SELECT i.name, i.kind, v.spec FROM items i JOIN item_versions v ON v.id=${latestLockedId} WHERE i.id != ?`, excludeItemId);
  return {
    guide: channel().world_style || DEFAULT_CHANNEL.world_style,
    locked: rows.map((x) => { const s = JSON.parse(x.spec || '{}'); return `${x.name} (${x.kind}): ${s.look || s.description || ''}`.slice(0, 280); }),
  };
}
const toBufs = async (paths) => (await Promise.all(paths.map((p) => imageForAI(path.join(MEDIA_DIR, p)).catch(() => null)))).filter(Boolean);
/** One image from each locked design (characters first) — visual style references. */
const styleImages = (excludeItemId = 0, max = 4) => toBufs(all(`
  SELECT (SELECT a.file_path FROM assets a WHERE a.owner_type='version' AND a.owner_id=${latestLockedId} AND a.mime LIKE 'image/%' ORDER BY a.id LIMIT 1) AS fp
  FROM items i WHERE i.id != ? AND ${latestLockedId} IS NOT NULL
  ORDER BY CASE i.kind WHEN 'character' THEN 0 ELSE 1 END, i.id`, excludeItemId).map((r) => r.fp).filter(Boolean).slice(0, max));
/** The item's own reference images (latest version). */
const itemImages = (itemId, max = 6) => {
  const v = one('SELECT id FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', itemId);
  return v ? toBufs(all(`SELECT file_path FROM assets WHERE owner_type='version' AND owner_id=? AND mime LIKE 'image/%' AND source != 'generated:meshy-3d' ORDER BY id DESC LIMIT ?`, v.id, max).map((r) => r.file_path).reverse()) : Promise.resolve([]);
};
app.get('/api/world', h(() => ({ guide: worldContext().guide, locked: all(`SELECT i.id FROM items i WHERE ${latestLockedId} IS NOT NULL`).map((r) => itemCard(r.id)) })));

const castSuggestions = (epId) =>
  all(`SELECT * FROM cast_suggestions WHERE episode_id=? AND status!='dismissed' ORDER BY CASE kind WHEN 'character' THEN 0 WHEN 'location' THEN 1 ELSE 2 END, id`, epId)
    .map((s) => ({ ...s, item: s.item_id ? itemCard(s.item_id) : null }));

app.get('/api/episodes/:id/cast/suggestions', h((req) => castSuggestions(+req.params.id)));
app.post('/api/episodes/:id/cast/suggest', h(async (req) => {
  const epId = +req.params.id;
  need(one('SELECT id FROM episodes WHERE id=?', epId), 'Project');
  const lyr = finalOrLatestLyrics(epId);
  if (!lyr) throw new HttpError(400, 'Add lyrics in Stage 1 first.');
  // Finds what the song needs and CREATES it in the project right away:
  // existing library items are reused (locked version pinned); new ones get a first design.
  let list, source;
  if (req.body.mode !== 'offline' && providers.isActive('claude')) {
    const out = await providers.suggestCast({ lyricsText: lyricsText(lyr), world: worldContext(), library: libraryText() });
    list = (out.items || []).filter((x) => x?.name);
    source = 'claude';
  } else { list = scanLyrics(lyricLines(lyr)).map((x) => ({ ...x, spec: null })); source = 'offline'; }
  const created = [], reused = [];
  tx(() => {
    for (const s of list) {
      const kind = ['character', 'location', 'prop'].includes(s.kind) ? s.kind : 'prop';
      const match = (s.reuse && findMatch(s.reuse, kind)) || findMatch(s.name, kind);
      let itemId, vid = null;
      if (match) {
        itemId = match.id;
        vid = one(`SELECT id FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, itemId)?.id ?? null;
      } else {
        itemId = createItem({ kind, name: s.name, description: s.spec?.description || s.description || '' });
        if (s.spec) run('UPDATE item_versions SET spec=? WHERE item_id=?', JSON.stringify(s.spec), itemId);
      }
      if (!one('SELECT 1 x FROM episode_cast WHERE episode_id=? AND item_id=?', epId, itemId)) {
        run('INSERT INTO episode_cast(episode_id,item_id,version_id) VALUES(?,?,?)', epId, itemId, vid);
        (match ? reused : created).push({ item_id: itemId, name: match?.name || s.name, kind });
      }
      run(`INSERT INTO cast_suggestions(episode_id,kind,name,description,appears_in,item_id,status,source) VALUES(?,?,?,?,?,?,'added',?)`,
        epId, kind, s.name, s.spec?.description || s.description || '', s.appears_in || '', itemId, source);
    }
  });
  touchEpisode(epId);
  return { source, created, reused, lyrics_final: lyr.status === 'approved', episode: episodeFull(epId) };
}));
app.post('/api/cast-suggestions/:id/accept', h((req) => {
  const s = need(one('SELECT * FROM cast_suggestions WHERE id=?', +req.params.id), 'Suggestion');
  const fresh = req.body.mode === 'new' || !s.item_id;
  const itemId = fresh ? createItem({ kind: s.kind, name: s.name, description: s.description }) : s.item_id;
  const vid = fresh ? null : one(`SELECT id FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, itemId)?.id ?? null;
  run(`INSERT INTO episode_cast(episode_id,item_id,version_id) VALUES(?,?,?) ON CONFLICT(episode_id,item_id) DO NOTHING`, s.episode_id, itemId, vid);
  run(`UPDATE cast_suggestions SET status='added', item_id=? WHERE id=?`, itemId, s.id);
  touchEpisode(s.episode_id);
  return { episode: episodeFull(s.episode_id), suggestions: castSuggestions(s.episode_id), item_id: itemId };
}));
app.post('/api/cast-suggestions/:id/dismiss', h((req) => {
  const s = need(one('SELECT * FROM cast_suggestions WHERE id=?', +req.params.id), 'Suggestion');
  run(`UPDATE cast_suggestions SET status='dismissed' WHERE id=?`, s.id);
  return castSuggestions(s.episode_id);
}));
app.post('/api/episodes/:id/cast/new', h((req) => {
  const epId = +req.params.id;
  const { kind = 'character', name, description = '' } = req.body;
  if (!name?.trim()) throw new HttpError(400, 'Give it a name.');
  const itemId = createItem({ kind, name, description });
  run('INSERT INTO episode_cast(episode_id,item_id,version_id) VALUES(?,?,NULL)', epId, itemId);
  touchEpisode(epId);
  return { episode: episodeFull(epId), item_id: itemId };
}));

// Character / scenery workshop: the latest DRAFT version is where development happens.
// If the latest version is locked, a new draft is started from it (the locked one never changes).
function ensureDraft(itemId) {
  const v = one('SELECT * FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', itemId);
  if (v && v.status !== 'approved') return v;
  const n = one('SELECT COUNT(*) n FROM item_versions WHERE item_id=?', itemId).n + 1;
  const id = Number(run('INSERT INTO item_versions(item_id,label,spec,notes) VALUES(?,?,?,?)', itemId, `Draft ${n}`, v?.spec || '{}', v ? `Started from ${v.label}` : '').lastInsertRowid);
  if (v) {
    for (const a of all(`SELECT * FROM assets WHERE owner_type='version' AND owner_id=?`, v.id)) {
      run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,width,height,duration,source,status,notes)
           VALUES('version',?,?,?,?,?,?,?,?,?,'draft',?)`, id, a.category, a.label, a.file_path, a.mime, a.width, a.height, a.duration, a.source, a.notes);
    }
  }
  return one('SELECT * FROM item_versions WHERE id=?', id);
}
app.post('/api/items/:id/draft', h((req) => { need(one('SELECT id FROM items WHERE id=?', +req.params.id), 'Item'); ensureDraft(+req.params.id); return itemFull(+req.params.id); }));
app.put('/api/items/:id/spec', h((req) => {
  const item = need(one('SELECT * FROM items WHERE id=?', +req.params.id), 'Item');
  const v = ensureDraft(item.id);
  run('UPDATE item_versions SET spec=? WHERE id=?', JSON.stringify(req.body.spec || {}), v.id);
  if (req.body.spec?.description) run('UPDATE items SET description=? WHERE id=?', req.body.spec.description, item.id);
  return itemFull(item.id);
}));
app.post('/api/items/:id/assistant', h(async (req) => {
  const item = need(one('SELECT * FROM items WHERE id=?', +req.params.id), 'Item');
  const message = String(req.body.message || '').trim();
  if (!message) throw new HttpError(400, 'Type what you want to change.');
  const cur = one('SELECT * FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', item.id);
  const spec = JSON.parse(cur?.spec || '{}');
  const scope = `item:${item.id}`;
  const [refImages, styleImgs] = await Promise.all([itemImages(item.id, 6), styleImages(item.id, 3)]);
  const out = await providers.designAssistant({ item, spec, history: chatFor(scope), message, channel: channel(), world: worldContext(item.id), refImages, styleImages: styleImgs });
  const v = ensureDraft(item.id);
  run('UPDATE item_versions SET spec=? WHERE id=?', JSON.stringify(out.spec || spec), v.id);
  if (out.spec?.description) run('UPDATE items SET description=? WHERE id=?', out.spec.description, item.id);
  addChat(scope, null, 'user', message);
  addChat(scope, null, 'assistant', out.reply || 'Updated the design.', { version_id: v.id });
  return { messages: chatFor(scope), item: itemFull(item.id) };
}));
app.post('/api/items/:id/generate-image', h(async (req) => {
  const item = need(one('SELECT * FROM items WHERE id=?', +req.params.id), 'Item');
  const cur = one('SELECT * FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', item.id);
  const spec = JSON.parse(cur?.spec || '{}');
  const [refs, style] = await Promise.all([itemImages(item.id, 6), styleImages(item.id, 4)]);
  const world = worldContext(item.id);
  const prompt = [
    req.body.prompt || spec.image_prompt || `${item.name}: ${spec.look || item.description}`,
    `Art style (must match exactly): ${world.guide}`,
    refs.length ? `The first ${refs.length} image(s) are reference images of ${item.name}: combine them into ONE single consistent design.` : '',
    style.length ? `The last ${style.length} image(s) are existing characters/places from the same animated world: match their rendering style, materials, proportions and lighting, but do NOT copy them — ${item.name} must look unique.` : '',
    item.kind === 'character' ? `Show only ${item.name}, full body, front 3/4 view, plain light background.` : 'Wide 16:9 establishing shot with no characters.',
  ].filter(Boolean).join('\n');
  const buf = await providers.generateImage({ prompt, wide: item.kind !== 'character', refs: [...refs, ...style] });
  const v = ensureDraft(item.id);
  const rel = `version/${v.id}/generated-${Date.now()}.png`;
  fs.mkdirSync(path.join(MEDIA_DIR, 'version', String(v.id)), { recursive: true });
  fs.writeFileSync(path.join(MEDIA_DIR, rel), buf);
  const meta = probe(path.join(MEDIA_DIR, rel));
  run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,width,height,source,status,notes)
       VALUES('version',?, ?, ?, ?, 'image/png', ?, ?, 'generated:gpt-image', 'draft', ?)`,
    v.id, 'render', `Design image (${refs.length} refs + ${style.length} world style)`, rel, meta.width ?? null, meta.height ?? null, prompt);
  return itemFull(item.id);
}));

// ---------- Stage 3: music direction ----------
app.post('/api/episodes/:id/music/recommend', h(async (req) => {
  const ep = need(one('SELECT * FROM episodes WHERE id=?', +req.params.id), 'Project');
  const lyr = finalOrLatestLyrics(ep.id);
  const message = String(req.body.message || '').trim();
  let options, source;
  if (req.body.mode !== 'offline' && providers.isActive('claude')) {
    if (!lyr) throw new HttpError(400, 'Add lyrics in Stage 1 first.');
    const out = await providers.musicAssistant({ channel: channel(), episode: ep, lyricsText: lyricsText(lyr), brief: JSON.parse(ep.music_brief || '{}'), history: chatFor('music', ep.id), message });
    options = out.options; source = 'claude';
    addChat('music', ep.id, 'user', message || 'Recommend music for this song.');
    addChat('music', ep.id, 'assistant', out.reply || 'Here are some directions.');
  } else { options = musicPresets(ep); source = 'offline'; }
  if (!Array.isArray(options) || !options.length) throw new HttpError(502, 'No music options came back. Try again.');
  run('UPDATE episodes SET music_brief=? WHERE id=?', JSON.stringify({ options, chosen: null, source }), ep.id);
  touchEpisode(ep.id);
  return { episode: episodeFull(ep.id), messages: chatFor('music', ep.id) };
}));
app.put('/api/episodes/:id/music/choose', h((req) => {
  const ep = need(one('SELECT * FROM episodes WHERE id=?', +req.params.id), 'Project');
  const brief = JSON.parse(ep.music_brief || '{}');
  brief.chosen = Number.isInteger(req.body.index) ? req.body.index : null;
  run('UPDATE episodes SET music_brief=? WHERE id=?', JSON.stringify(brief), ep.id);
  touchEpisode(ep.id);
  return episodeFull(ep.id);
}));

// ---------- Stage 4: build storyboard from the final lyrics ----------
app.post('/api/episodes/:id/storyboard/build', h((req) => {
  const ep = need(episodeFull(+req.params.id), 'Project');
  const lyr = ep.lyrics.find((l) => l.id === ep.approved_lyrics_id);
  if (!lyr) throw new HttpError(400, 'Finalize the lyrics in Stage 1 first.');
  if (ep.shots.some((s) => s.approved_clip_id)) throw new HttpError(409, 'This storyboard already has approved clips. Delete those shots first if you really want to rebuild it.');
  const lines = lyricLines(lyr);
  const chars = ep.cast.filter((c) => c.kind === 'character');
  const scenes = [...ep.cast.filter((c) => c.kind === 'location'), ...ep.cast.filter((c) => c.kind === 'prop')];
  const total = ep.master_audio?.duration || ep.target_duration || lines.length * 4;
  const per = total / lines.length;
  const mentions = (c, l) => {
    const t = `${l.en} ${l.ta} ${l.cue}`.toLowerCase();
    return c.name.toLowerCase().split(/[\s/]+/).filter((w) => w.length > 2).some((w) => t.includes(w));
  };
  tx(() => {
    for (const s of ep.shots) run(`DELETE FROM assets WHERE owner_type='shot' AND owner_id=?`, s.id);
    run('DELETE FROM shots WHERE episode_id=?', ep.id);
    lines.forEach((l, i) => {
      const ch = chars.find((c) => mentions(c, l)) || chars[0];
      const loc = scenes.find((c) => mentions(c, l)) || scenes[0];
      const ref = [loc, ch].flatMap((c) => c?.version?.assets || []).find((a) => a.mime.startsWith('image/'));
      run(`INSERT INTO shots(episode_id,position,title,lyric_cue,character_item_id,location_item_id,ref_asset_id,motion_notes,duration) VALUES(?,?,?,?,?,?,?,?,?)`,
        ep.id, i, `Line ${i + 1}: ${(l.en || l.ta).slice(0, 32)}`, l.en || l.ta, ch?.item_id ?? null, loc?.item_id ?? null, ref?.id ?? null, l.cue || '', +per.toFixed(2));
    });
  });
  touchEpisode(ep.id);
  return episodeFull(ep.id);
}));

// ---------- placeholder generators (clearly labelled in the UI) ----------
app.post('/api/generate/music', h(async (req) => providers.generateMusic(req.body)));
app.post('/api/generate/video', h(async (req) => providers.generateVideo(req.body)));

// ---------- Meshy: design images + 3D models (background jobs, results saved into the item's draft) ----------
meshy.setHooks({ ensureDraft });
const itemSpec = (itemId) => JSON.parse(one('SELECT spec FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', itemId)?.spec || '{}');
app.get('/api/meshy/balance', h(async () => meshy.balance()));
app.get('/api/meshy/credits', h(() => meshy.CREDITS));
app.get('/api/meshy/jobs', h((req) => {
  const ids = String(req.query.item_ids || '').split(',').map(Number).filter(Boolean);
  if (!ids.length) return [];
  return all(`SELECT * FROM jobs WHERE type LIKE 'meshy-%' AND json_extract(params,'$.item_id') IN (${ids.map(() => '?').join(',')})
              AND created_at > datetime('now','-2 day') ORDER BY id DESC`, ...ids)
    .map((j) => { const o = jobOut(j); delete o.params.refs; delete o.params.images; return o; });
}));
app.post('/api/items/:id/meshy/image', h(async (req) => {
  const item = need(one('SELECT * FROM items WHERE id=?', +req.params.id), 'Item');
  if (!providers.isActive('meshy')) throw new HttpError(400, 'Meshy is not active. Add your key and switch on paid generation in AI Connections.');
  const spec = itemSpec(item.id);
  const own = req.body.use_refs === false ? [] : await itemImages(item.id, 3);
  const style = await styleImages(item.id, Math.min(3, 5 - own.length)); // Meshy accepts max 5 references
  const world = worldContext(item.id);
  const prompt = [
    req.body.prompt || spec.image_prompt || `${item.name}: ${spec.look || item.description}`,
    `Art style (match exactly): ${world.guide}`,
    own.length ? `The first ${own.length} reference image(s) show ${item.name}: combine them into ONE consistent design.` : '',
    style.length ? `The last ${style.length} reference image(s) are other characters/places from the same animated world: match their rendering style, materials and lighting, but do not copy them — ${item.name} must look unique.` : '',
    item.kind === 'character' ? `Only ${item.name}, full body, clean plain background.` : 'Wide establishing shot, no characters.',
  ].filter(Boolean).join('\n');
  const model = Object.keys(meshy.CREDITS.image).includes(req.body.model) ? req.body.model : 'nano-banana-2';
  const id = meshy.createJob('meshy-image', {
    item_id: item.id, model, prompt, refs: [...own, ...style].map(meshy.dataUri),
    remove_background: item.kind !== 'location', aspect_ratio: item.kind === 'location' ? '16:9' : '1:1',
    multi_view: !!req.body.multi_view && item.kind !== 'location',
  }, `Design image for ${item.name}`);
  return jobOut(one('SELECT * FROM jobs WHERE id=?', id));
}));
app.post('/api/items/:id/meshy/3d', h(async (req) => {
  const item = need(one('SELECT * FROM items WHERE id=?', +req.params.id), 'Item');
  if (!providers.isActive('meshy')) throw new HttpError(400, 'Meshy is not active. Add your key and switch on paid generation in AI Connections.');
  const spec = itemSpec(item.id);
  const source = req.body.source === 'text' ? 'text' : 'images';
  const pose = ['a-pose', 't-pose'].includes(req.body.pose) ? req.body.pose : 'none';
  const prompt = String(req.body.prompt ?? spec.meshy_prompt ?? '').trim();
  const texture_prompt = String(req.body.texture_prompt ?? spec.texture_prompt ?? '').trim();
  let images = [];
  if (source === 'images') {
    const v = one('SELECT id FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', item.id);
    const ids = (req.body.asset_ids || []).map(Number).filter(Boolean);
    let rows;
    if (ids.length) rows = ids.map((aid) => one(`SELECT file_path FROM assets WHERE id=? AND mime LIKE 'image/%'`, aid)).filter(Boolean);
    else {
      // Meshy treats the FIRST image as the front view. Prefer the newest front/side/back design set (in that order);
      // otherwise the newest images. Previews of earlier 3D models are never used as input.
      const cands = all(`SELECT id, file_path, label FROM assets WHERE owner_type='version' AND owner_id=? AND mime LIKE 'image/%'
                         AND source != 'generated:meshy-3d' ORDER BY id DESC LIMIT 8`, v?.id ?? 0);
      const front = cands.find((a) => /\(front\)/.test(a.label));
      rows = front
        ? cands.filter((a) => a.file_path.startsWith(front.file_path.replace(/-\d+\.png$/, '-'))).sort((a, b) => a.id - b.id)
        : cands.slice(0, 4);
    }
    images = (await toBufs(rows.map((r) => r.file_path))).slice(0, 4).map(meshy.dataUri);
    if (!images.length) throw new HttpError(400, 'Add or create at least one image of this design first — or choose “From prompt”.');
  } else if (!prompt) throw new HttpError(400, 'There is no Meshy prompt yet. Click “Write Meshy prompts with Claude” or type one.');
  if (prompt.length > 800 || texture_prompt.length > 800) throw new HttpError(400, 'Meshy prompts must be 800 characters or fewer.');
  const id = meshy.createJob('meshy-3d', { item_id: item.id, source, images, prompt, texture_prompt, budget: req.body.quality === 'budget', pose },
    `3D model for ${item.name}`);
  return jobOut(one('SELECT * FROM jobs WHERE id=?', id));
}));

// ---------- static ----------
app.use('/media', express.static(MEDIA_DIR, { fallthrough: false }));
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^\/(?!api|media).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

await seedIfEmpty();
patchSampleSpecs();
run(`DELETE FROM assets WHERE owner_type='version' AND owner_id NOT IN (SELECT id FROM item_versions)`); // tidy orphans
meshy.resumeJobs();
app.listen(PORT, () => {
  console.log(`\n  Rhymes Automation API on http://localhost:${PORT}`);
  if (fs.existsSync(CLIENT_DIST)) console.log(`  Open the studio:  http://localhost:${PORT}\n`);
  console.log(`  FFmpeg: ${FFMPEG ? 'found' : 'NOT FOUND (export disabled)'}   Paid generation: ${providers.providerStatus().paidGenerationEnabled ? 'ON' : 'off'}`);
});
export { db };
