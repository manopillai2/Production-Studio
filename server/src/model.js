// Read-side helpers that assemble full records for the UI and the exporter.
import { one, all, getSetting } from './db.js';

export const DEFAULT_CHANNEL = {
  name: 'My Rhymes Channel',
  tagline: '',
  colors: { primary: '#ff7a59', secondary: '#4cc38a', accent: '#ffd23f', background: '#fff8ec', text: '#2b2140' },
  fonts: { tamil: 'Baloo Thambi 2', english: 'Fredoka' },
  caption_style: { fontSize: 54, color: '#ffffff', outline: '#2b2140', outlineWidth: 4, position: 'bottom', background: false },
  thumbnail_template: { layout: 'title-bottom', titleColor: '#ffffff', stroke: '#2b2140', band: '#ff7a59', showLogo: true },
  description_template: 'Sing along with {title}!\n\n#nurseryrhymes #kidssongs #tamilrhymes',
  // The look every new character/scenery must follow. Locked designs are also sent as visual references.
  world_style: 'Bright, colorful, soft-rounded 3D look like a premium kids animation. Big heads and big shiny eyes for characters, chunky friendly shapes, smooth matte materials with subtle subsurface glow, warm sunny lighting with soft shadows, saturated but gentle colors, clean simple backgrounds. No realistic textures, no scary or sharp features.',
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

/** Four production stages. */
export function progressFor(ep, { cast, shots, captions, exportsDone }) {
  const chars = cast.filter((c) => c.kind === 'character').length;
  const scenes = cast.filter((c) => c.kind !== 'character').length;
  const locked = cast.filter((c) => c.locked).length;
  const approvedShots = shots.filter((s) => s.approved_clip_id).length;
  const stages = [
    { key: 'lyrics', n: 1, label: 'Lyrics', done: !!ep.approved_lyrics_id, detail: ep.approved_lyrics_id ? 'Final lyrics locked' : 'Write or generate, then finalize' },
    { key: 'cast', n: 2, label: 'Characters & Scenery', done: chars > 0 && scenes > 0 && locked === cast.length,
      detail: cast.length ? `${locked}/${cast.length} locked` : 'Nothing picked yet' },
    { key: 'music', n: 3, label: 'Music', done: !!ep.master_audio_id, detail: ep.master_audio_id ? 'Master song selected' : 'Pick a direction, add the song' },
    { key: 'assemble', n: 4, label: 'Assemble & Export', done: exportsDone > 0,
      detail: `${approvedShots}/${shots.length} clips · ${captions.length ? 'captions ✓' : 'no captions'}${exportsDone ? ' · exported' : ''}` },
  ];
  return { stages, steps: stages, percent: Math.round((stages.filter((s) => s.done).length / stages.length) * 100) };
}

export function episodeFull(id) {
  const ep = one('SELECT * FROM episodes WHERE id=?', id);
  if (!ep) return null;
  ep.caption_style = JSON.parse(ep.caption_style || '{}');
  ep.music_brief = JSON.parse(ep.music_brief || '{}');
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
  const exportsDone = jobs.filter((j) => j.type === 'export' && j.status === 'done').length;
  const master = audio.find((a) => a.id === ep.master_audio_id) || null;
  return {
    ...ep,
    thumbnail_url: ep.thumbnail_path ? `/media/${ep.thumbnail_path}?v=${encodeURIComponent(ep.updated_at)}` : null,
    cast, lyrics, audio, master_audio: master, shots, captions, jobs,
    timeline: timeline(shots),
    progress: progressFor(ep, { cast, shots, captions, exportsDone }),
  };
}

export function jobOut(j) {
  return j && { ...j, params: JSON.parse(j.params || '{}'), output: JSON.parse(j.output || '{}') };
}
