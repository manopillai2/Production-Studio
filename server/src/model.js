// Read-side helpers that assemble full records for the UI and the exporter.
import { one, all, run, getSetting } from './db.js';

export const DEFAULT_CHANNEL = {
  name: 'My Rhymes Channel',
  tagline: '',
  colors: { primary: '#ff7a59', secondary: '#4cc38a', accent: '#ffd23f', background: '#fff8ec', text: '#2b2140' },
  fonts: { tamil: 'Baloo Thambi 2', english: 'Fredoka' },
  caption_style: { fontSize: 54, color: '#ffffff', outline: '#2b2140', outlineWidth: 4, position: 'bottom', background: false },
  thumbnail_template: { layout: 'title-bottom', titleColor: '#ffffff', stroke: '#2b2140', band: '#ff7a59', showLogo: true },
  description_template: 'Sing along with {title}!\n\n#nurseryrhymes #kidssongs #tamilrhymes',
  // The look every new character/scenery must follow. Locked designs are also sent as visual references.
  world_style: 'Preschool-friendly 3D cartoon: soft, rounded, chunky shapes with simple clean silhouettes; big friendly eyes and gentle smiles; matte clay-like materials; bright but gentle pastel colours; warm sunny lighting with soft shadows. Every recurring character has one or two recognizable signature features that never change (for example, Pip the Sky Bunny has one crescent-shaped ear and one golden front paw). No realistic textures, sharp edges or scary features.',
  logo_asset_id: null,
  signature_sound_ids: [],
};

export const channel = () => ({ ...DEFAULT_CHANNEL, ...(getSetting('channel') || {}) });

export function assetOut(a) {
  if (!a) return null;
  return { ...a, url: `/media/${a.file_path.replace(/\\/g, '/')}` };
}
export const assetsFor = (type, id) =>
  all('SELECT * FROM assets WHERE owner_type=? AND owner_id=? ORDER BY id', type, id).map(assetOut);

export function versionOut(v) {
  return v && { ...v, spec: JSON.parse(v.spec || '{}'), assets: assetsFor('version', v.id) };
}

export function itemFull(id) {
  const item = one('SELECT * FROM items WHERE id=?', id);
  if (!item) return null;
  const versions = all('SELECT * FROM item_versions WHERE item_id=? ORDER BY id', id).map(versionOut);
  const usage = all(`SELECT ec.episode_id, ec.version_id, e.title, e.number, v.label AS version_label
                     FROM episode_cast ec JOIN episodes e ON e.id=ec.episode_id
                     LEFT JOIN item_versions v ON v.id=ec.version_id WHERE ec.item_id=?`, id);
  return { ...item, versions, usage };
}

export function lyricsOut(l) {
  return l && { ...l, sections: JSON.parse(l.sections || '[]') };
}

export function shotOut(s) {
  const clips = assetsFor('shot', s.id);
  const clip = clips.find((c) => c.id === s.approved_clip_id) || null;
  const ref = s.ref_asset_id ? assetOut(one('SELECT * FROM assets WHERE id=?', s.ref_asset_id)) : null;
  return { ...s, clips, approved_clip: clip, ref_asset: ref };
}

/** Sequential timeline built from shot order + trims. */
export function timeline(shots) {
  let t = 0;
  return shots.map((s) => {
    const clip = s.approved_clip;
    const clipDur = clip?.duration ?? s.duration ?? 4;
    const tin = Math.max(0, s.trim_in || 0);
    const tout = s.trim_out != null ? Math.min(s.trim_out, clipDur) : clipDur;
    const len = clip ? Math.max(0.1, tout - tin) : s.duration || 4;
    const seg = { shot_id: s.id, start: t, end: t + len, length: len, trim_in: tin, trim_out: tin + len, clip_url: clip?.url || null };
    t += len;
    return seg;
  });
}

// ---------- My World previews & asset cards ----------
const url = (p) => (p ? `/media/${String(p).replace(/\\/g, '/')}` : null);
export function libraryPreview(itemId) {
  const i = one('SELECT * FROM items WHERE id=?', itemId);
  if (!i) return null;
  const v = one(`SELECT * FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, itemId)
    || one('SELECT * FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', itemId);
  const assets = v ? assetsFor('version', v.id) : [];
  const model = assets.find((a) => a.category === 'model3d' && a.status === 'approved') || assets.find((a) => a.category === 'model3d');
  const image = [...assets].reverse().find((a) => a.mime?.startsWith('image/'));
  return {
    id: i.id, name: i.name, kind: i.kind, description: i.description, locked: v?.status === 'approved', version_id: v?.id ?? null, version_label: v?.label,
    spec: JSON.parse(v?.spec || '{}'), model, image,
    clips: assets.filter((a) => a.category === 'clip' || a.category === 'rig'),
  };
}
export function cardOut(c) {
  if (!c) return null;
  return {
    ...c, usages: JSON.parse(c.usages || '[]'), model_url: url(c.model_path), thumb_url: url(c.thumb_path),
    match: c.match_item_id ? libraryPreview(c.match_item_id) : null,
    library: c.item_id ? libraryPreview(c.item_id) : null,
    needs_save: c.status === 'approved' && !c.saved_at,
  };
}
export const cardsFor = (epId) => all(`SELECT * FROM asset_cards WHERE episode_id=? ORDER BY CASE kind WHEN 'character' THEN 0 WHEN 'location' THEN 1 ELSE 2 END, id`, epId).map(cardOut);

export function sceneShotOut(s) {
  return { ...s, setting: JSON.parse(s.setting || '{}'), actors: JSON.parse(s.actors || '[]'), camera: JSON.parse(s.camera || '{}'), lighting: JSON.parse(s.lighting || '{}') };
}
export const sceneShotsFor = (epId) => all('SELECT * FROM scene_shots WHERE episode_id=? ORDER BY position, id', epId).map(sceneShotOut);

// ---------- review flags: an approved upstream change marks later stages for review (work is kept) ----------
const STAGE_HAS_WORK = {
  cast: (id) => one('SELECT COUNT(*) n FROM asset_cards WHERE episode_id=?', id).n > 0,
  timing: (id) => (JSON.parse(one('SELECT timing FROM episodes WHERE id=?', id)?.timing || '{}').lines || []).length > 0,
  shots: (id) => one('SELECT COUNT(*) n FROM scene_shots WHERE episode_id=?', id).n > 0,
  export: (id) => one(`SELECT COUNT(*) n FROM jobs WHERE episode_id=? AND type='render' AND status='done'`, id).n > 0,
};
export function flagStages(epId, entries) {
  const ep = one('SELECT review_flags FROM episodes WHERE id=?', epId);
  if (!ep) return;
  const flags = JSON.parse(ep.review_flags || '{}');
  let changed = false;
  for (const [key, reason] of Object.entries(entries)) {
    if (STAGE_HAS_WORK[key]?.(epId)) { flags[key] = { reason, at: new Date().toISOString() }; changed = true; }
  }
  if (changed) run('UPDATE episodes SET review_flags=? WHERE id=?', JSON.stringify(flags), epId);
}
export function clearFlag(epId, key) {
  const flags = JSON.parse(one('SELECT review_flags FROM episodes WHERE id=?', epId)?.review_flags || '{}');
  delete flags[key];
  run('UPDATE episodes SET review_flags=? WHERE id=?', JSON.stringify(flags), epId);
}

/** Five production stages. `review` = an upstream change needs your review here (saved work is kept). */
export function progressFor(ep, { cards = [], sceneShots = [], renders = [], timing = {}, flags = {} } = {}) {
  const live = cards.filter((c) => c.usages.length || c.status === 'approved');
  const approved = live.filter((c) => c.status === 'approved');
  const unsaved = approved.filter((c) => !c.saved_at).length;
  const timingOk = timing.approved && timing.audio_id === ep.master_audio_id && timing.lyrics_id === ep.approved_lyrics_id;
  const lastRender = renders.find((r) => r.status === 'done');
  const stages = [
    { key: 'lyrics', n: 1, label: 'Lyrics', done: !!ep.approved_lyrics_id, detail: ep.approved_lyrics_id ? 'Lyrics approved' : 'Write, then approve' },
    { key: 'cast', n: 2, label: 'Characters & Scenery', review: flags.cast?.reason,
      done: live.length > 0 && approved.length === live.length && unsaved === 0,
      detail: live.length ? `${approved.length}/${live.length} approved${unsaved ? ` · ${unsaved} not saved` : ''}` : 'Analyze the lyrics' },
    { key: 'music', n: 3, label: 'Music & Vocals', review: flags.timing?.reason, done: !!ep.master_audio_id && !!timingOk,
      detail: !ep.master_audio_id ? 'Add & approve the song' : timingOk ? 'Audio + line timing approved' : 'Mark lyric timing' },
    { key: 'animate', n: 4, label: 'Animate & Assemble', review: flags.shots?.reason, done: sceneShots.length > 0,
      detail: sceneShots.length ? `${sceneShots.length} shot${sceneShots.length === 1 ? '' : 's'}` : 'Propose a shot plan' },
    { key: 'export', n: 5, label: 'Preview & Export', review: flags.export?.reason, done: !!lastRender && !flags.export,
      detail: lastRender ? (flags.export ? 'Exported · changed since' : 'MP4 exported') : 'Preview, then export' },
  ];
  return { stages, steps: stages, percent: Math.round((stages.filter((s) => s.done).length / stages.length) * 100) };
}

export function episodeFull(id) {
  const ep = one('SELECT * FROM episodes WHERE id=?', id);
  if (!ep) return null;
  ep.caption_style = JSON.parse(ep.caption_style || '{}');
  ep.music_brief = JSON.parse(ep.music_brief || '{}');
  try { ep.cast_notes = JSON.parse(ep.cast_notes || '{}'); } catch { ep.cast_notes = {}; }
  // A cast entry is either LOCKED (pinned to an approved version) or IN DEVELOPMENT (version_id NULL,
  // follows the item's latest draft until you lock it).
  const cast = all(`SELECT ec.item_id, ec.version_id, i.kind, i.name, i.description, v.label AS version_label, v.status AS version_status
                    FROM episode_cast ec JOIN items i ON i.id=ec.item_id
                    LEFT JOIN item_versions v ON v.id=ec.version_id
                    WHERE ec.episode_id=? ORDER BY CASE i.kind WHEN 'character' THEN 0 WHEN 'location' THEN 1 ELSE 2 END, i.name`, id).map((c) => {
    const latestApproved = one(`SELECT id,label FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, c.item_id);
    const latest = one('SELECT * FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', c.item_id);
    const pinned = c.version_id ? one('SELECT * FROM item_versions WHERE id=?', c.version_id) : null;
    return {
      ...c,
      locked: !!pinned,
      version_label: pinned ? c.version_label : `${latest?.label || 'Draft'} (in development)`,
      version: versionOut(pinned || latest),
      dev_version: versionOut(latest),
      newer_approved: pinned && latestApproved && latestApproved.id !== pinned.id ? latestApproved : null,
    };
  });
  const lyrics = all('SELECT * FROM lyrics WHERE episode_id=? ORDER BY id', id).map(lyricsOut);
  const audio = assetsFor('episode', id).filter((a) => ['hum', 'guide', 'instrumental', 'vocal', 'song'].includes(a.category));
  const shots = all('SELECT * FROM shots WHERE episode_id=? ORDER BY position, id', id).map(shotOut);
  const captions = all('SELECT * FROM captions WHERE episode_id=? ORDER BY start', id);
  const jobs = all(`SELECT * FROM jobs WHERE episode_id=? ORDER BY id DESC LIMIT 10`, id).map(jobOut);
  const renders = all(`SELECT * FROM jobs WHERE episode_id=? AND type='render' ORDER BY id DESC LIMIT 10`, id).map(jobOut);
  const master = audio.find((a) => a.id === ep.master_audio_id) || null;
  const cards = cardsFor(id);
  const scene_shots = sceneShotsFor(id);
  const timing = JSON.parse(ep.timing || '{}');
  const review_flags = JSON.parse(ep.review_flags || '{}');
  return {
    ...ep, timing, review_flags,
    thumbnail_url: ep.thumbnail_path ? `/media/${ep.thumbnail_path}?v=${encodeURIComponent(ep.updated_at)}` : null,
    cast, lyrics, audio, master_audio: master, shots, captions, jobs, cards, scene_shots, renders,
    timeline: timeline(shots),
    progress: progressFor(ep, { cards, sceneShots: scene_shots, renders, timing, flags: review_flags }),
  };
}

export function jobOut(j) {
  return j && { ...j, params: JSON.parse(j.params || '{}'), output: JSON.parse(j.output || '{}') };
}
