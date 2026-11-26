// SAMPLE DATA (clearly labelled "sample"): the "Look Up at the Sky" project — Sunny rising, a cloud drifting,
// Pip bouncing. Its models are built with the offline procedural generator (Build Locally), saved to My World
// with their editable recipes, so preview and export work with no paid API calls.
import fs from 'node:fs';
import path from 'node:path';
import { one, run, tx, getSetting, setSetting } from './db.js';
import { MEDIA_DIR } from './paths.js';
import { wav, probe } from './media.js';
import { buildFromRecipe, mapDescription, normalizeRecipe } from './procedural.js';

// ---------- song (original sample melody, synthesised) ----------
const RATE = 44100, BEAT = 0.5;
const f = (m) => 440 * 2 ** ((m - 69) / 12);
const LINES = [
  [[64, 1], [67, 1], [67, 0.5], [69, 0.5], [67, 1], [64, 1], [62, 1], [60, 2]],
  [[65, 1], [65, 1], [64, 0.5], [64, 0.5], [62, 1], [64, 1], [67, 1], [67, 2]],
  [[67, 1], [69, 1], [67, 0.5], [65, 0.5], [64, 1], [62, 1], [64, 1], [60, 2]],
  [[60, 0.5], [62, 0.5], [64, 1], [67, 1], [72, 1], [71, 0.5], [69, 0.5], [67, 1], [72, 2]],
];
const CHORDS = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [43, 47, 50]];
export const SONG = { intro: 2, line: 4, outro: 1.5, total: 2 + 16 + 1.5 };
export function synthSong() {
  const out = new Float32Array(Math.round(SONG.total * RATE));
  const add = (t0, d, fn) => { const i0 = Math.round(t0 * RATE); for (let i = 0; i < d * RATE && i0 + i < out.length; i++) out[i0 + i] += fn(i / RATE, d); };
  const env = (t, d, a = 0.02, r = 0.1) => Math.min(1, t / a) * Math.min(1, Math.max(0, (d - t) / r));
  const bar = (t0, chord, beats, accent = true) => {
    for (let b = 0; b < beats; b++) {
      const tb = t0 + b * BEAT;
      add(tb, 0.4, (x, d) => Math.sin(2 * Math.PI * f(chord[0] - 12 + (b % 2 ? 7 : 0)) * x) * env(x, d, 0.005, 0.2) * 0.3);
      for (const m of chord) add(tb, 0.3, (x) => Math.sin(2 * Math.PI * f(m + 12) * x) * Math.exp(-x * 7) * 0.06);
      if (accent) add(tb, 0.12, (x) => Math.sin(2 * Math.PI * (120 - x * 400) * x) * Math.exp(-x * 30) * (b % 2 ? 0 : 0.45));
    }
  };
  bar(0, CHORDS[0], 4, false); // instrumental intro
  LINES.forEach((line, li) => {
    const t0 = SONG.intro + li * SONG.line;
    bar(t0, CHORDS[li], 8);
    let t = t0;
    for (const [m, b] of line) {
      const d = b * BEAT;
      add(t, d * 0.95, (x, dd) => { const ph = 2 * Math.PI * f(m) * x * (1 + Math.sin(2 * Math.PI * 5.5 * x) * (x > 0.15 ? 0.006 : 0)); return (Math.sin(ph) * 0.6 + Math.sin(2 * ph) * 0.25 + Math.sin(3 * ph) * 0.1) * env(x, dd, 0.03, 0.08) * 0.3; });
      t += d;
    }
  });
  bar(SONG.intro + 16, [48, 52, 55, 60], 3, false); // outro
  return wav(out, RATE);
}

export const SKY_LYRICS = [
  { ta: '', en: 'Look up, look up at the sky so blue,', cue: 'Sunny rises over the hill' },
  { ta: '', en: 'Sunny says good morning, how are you?', cue: 'Sunny glows and smiles' },
  { ta: '', en: 'A fluffy cloud goes drifting by,', cue: 'A cloud drifts across the sky' },
  { ta: '', en: 'And Pip goes bouncing, hop and high!', cue: 'Pip bounces along the meadow' },
];
export const PIP_DESCRIPTION = 'Pip the Sky Bunny, a small sky-blue bunny with one crescent-shaped right ear and one golden right front paw. Big friendly eyes, rosy cheeks.';

function sampleModels() {
  const pip = mapDescription({ name: 'Pip the Sky Bunny', description: PIP_DESCRIPTION, kind: 'character' }).recipe;
  return [
    { key: 'pip', kind: 'character', name: 'Pip the Sky Bunny', usages: [3], recipe: pip, description: PIP_DESCRIPTION, signature: 'One crescent-shaped ear and one golden front paw.' },
    { key: 'sunny', kind: 'character', name: 'Sunny', usages: [0, 1], recipe: normalizeRecipe({ template: 'sun', params: { rays: 12, face: true } }), description: 'Sunny, the smiling morning sun with soft rounded rays and rosy cheeks.', signature: 'Rosy cheeks and twelve rounded golden rays.' },
    { key: 'cloud', kind: 'prop', name: 'Fluffy Cloud', usages: [2], recipe: normalizeRecipe({ template: 'cloud', params: { size: 1.2, puffs: 7 } }), description: 'A soft, puffy white cloud.', signature: '' },
    { key: 'meadow', kind: 'location', name: 'Sky Meadow', usages: [0, 1, 2, 3], recipe: mapDescription({ name: 'Sky Meadow', description: 'a sunny meadow with trees and rolling hills' }).recipe, description: 'Rolling green meadow with trees and hills under an open sky.', signature: '' },
  ];
}

const writeMedia = (rel, buf) => { fs.mkdirSync(path.dirname(path.join(MEDIA_DIR, rel)), { recursive: true }); fs.writeFileSync(path.join(MEDIA_DIR, rel), buf); return rel; };

/** Adds the sample My World models (once) and the sample project. Safe to call on every start. */
export function seedSkySample({ force = false } = {}) {
  if (getSetting('sample_sky_v2') && !force) return null;
  const MODELS = sampleModels();
  const ids = {};
  const epId = tx(() => {
    const number = one('SELECT COALESCE(MAX(number),0)+1 n FROM episodes').n;
    const ep = Number(run(`INSERT INTO episodes(number,title,language,target_duration,notes,caption_language,youtube_title) VALUES(?, 'Look Up at the Sky (sample)', 'en', 20, 'SAMPLE project built offline (Build Locally): preview and export work without paid API calls.', 'native', 'Look Up at the Sky')`, number).lastInsertRowid);
    for (const m of MODELS) {
      let name = `${m.name}`; let k = 2;
      while (one('SELECT id FROM items WHERE lower(name)=lower(?)', name)) name = `${m.name} ${k++}`;
      const itemId = Number(run('INSERT INTO items(kind,name,description,notes) VALUES(?,?,?,?)', m.kind, name, m.description, `SAMPLE — built offline with the procedural generator. ${m.signature ? `Signature features: ${m.signature}` : ''}`).lastInsertRowid);
      const glb = buildFromRecipe(m.recipe);
      const vid = Number(run(`INSERT INTO item_versions(item_id,label,status,approved_at,spec,notes) VALUES(?, 'v1', 'approved', datetime('now'), ?, 'Sample · Build Locally')`,
        itemId, JSON.stringify({ description: m.description, signature_features: m.signature, method: 'procedural', recipe: m.recipe, source_project: 'Look Up at the Sky (sample)' })).lastInsertRowid);
      const rel = writeMedia(`world/${itemId}/${m.key}-v1.glb`, glb);
      run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?, 'model3d', ?, ?, 'model/gltf-binary', 'procedural', 'approved', 'Sample · editable recipe stored in this version')`, vid, `${m.name} 3D model (v1)`, rel);
      let clipId = null;
      if (m.key === 'pip') {
        clipId = Number(run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?, 'clip', 'Ear wiggle (built-in clip)', ?, 'model/gltf-binary', 'procedural', 'approved', ?)`,
          vid, rel, JSON.stringify({ animations: ['ear-wiggle'], note: 'Node animation on EarLeft/EarRight (not a bone rig).' })).lastInsertRowid);
      }
      ids[m.key] = { itemId, vid, rel, clipId, name };
      const cardId = Number(run(`INSERT INTO asset_cards(episode_id,kind,name,description,usages,signature,decision,status,method,recipe,model_path,model_source,approved_at,item_id,saved_version_id,saved_at,mapping,prompt)
        VALUES(?,?,?,?,?,?, 'new', 'approved', 'procedural', ?, ?, 'procedural', datetime('now'), ?, ?, datetime('now'), ?, '')`,
        ep, m.kind, name, m.description, JSON.stringify(m.usages), m.signature, JSON.stringify(m.recipe), rel, itemId, vid,
        JSON.stringify({ template: m.recipe.template, applied: ['Sample built offline'], unsupported: [], message: 'Sample', supported: true })).lastInsertRowid);
      run('INSERT INTO card_revisions(card_id,n,method,recipe,model_path,note) VALUES(?,1, \'procedural\', ?, ?, \'Sample · built locally\')', cardId, JSON.stringify(m.recipe), rel);
      ids[m.key].card = cardId;
      run('INSERT INTO episode_cast(episode_id,item_id,version_id) VALUES(?,?,?)', ep, itemId, vid);
    }
    const lyr = Number(run(`INSERT INTO lyrics(episode_id,title,sections,status,source) VALUES(?, 'Look Up at the Sky', ?, 'approved', 'sample')`, ep, JSON.stringify([{ type: 'verse', label: 'Verse', lines: SKY_LYRICS }])).lastInsertRowid);
    const songRel = writeMedia(`episode/${ep}/look-up-at-the-sky-sample.wav`, synthSong());
    const meta = probe(path.join(MEDIA_DIR, songRel));
    const audio = Number(run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,duration,source,status) VALUES('episode',?, 'song', 'Look Up at the Sky — sample synth mix', ?, 'audio/wav', ?, 'sample', 'approved')`, ep, songRel, meta.duration ?? SONG.total).lastInsertRowid);
    const timing = { lyrics_id: lyr, audio_id: audio, approved: true, lines: SKY_LYRICS.map((l, i) => ({ i, text: l.en, start: SONG.intro + i * SONG.line, end: SONG.intro + (i + 1) * SONG.line - 0.1 })) };
    run('UPDATE episodes SET approved_lyrics_id=?, master_audio_id=?, timing=? WHERE id=?', lyr, audio, JSON.stringify(timing), ep);
    const card = Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v.card]));
    const shot = (position, title, from, to, extra) => run(`INSERT INTO scene_shots(episode_id,position,title,line_from,line_to,start_override,end_override,setting,actors,camera,lighting) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      ep, position, title, from, to, extra.start ?? null, extra.end ?? null, JSON.stringify({ card_id: card.meadow }), JSON.stringify(extra.actors), JSON.stringify(extra.camera), JSON.stringify(extra.lighting));
    shot(0, 'Sunny rises', 0, 1, {
      start: 0,
      actors: [
        { card_id: card.sunny, pos: [1.8, 3.1, -4], rot: [0, 0, 0], scale: 1, motion: { type: 'rise', amount: 4.2, duration: 5, delay: 0.6 } },
        { card_id: card.cloud, pos: [-3.2, 3.5, -6], rot: [0, 0, 0], scale: 1, motion: { type: 'drift', dx: 1.2, bob: 0.08 } },
      ],
      camera: { preset: 'tilt-up' }, lighting: { preset: 'morning' },
    });
    shot(1, 'A cloud drifts by', 2, 2, {
      actors: [
        { card_id: card.cloud, pos: [-5, 2.7, -2.5], rot: [0, 0, 0], scale: 1.1, motion: { type: 'drift', dx: 10, bob: 0.12 } },
        { card_id: card.sunny, pos: [2.6, 3.4, -5], rot: [0, 0, 0], scale: 0.9, motion: { type: 'twinkle', amount: 0.05, speed: 2 } },
      ],
      camera: { preset: 'pan', amount: 1.5 }, lighting: { preset: 'day' },
    });
    shot(2, 'Pip bounces along', 3, 3, {
      end: SONG.total,
      actors: [
        { card_id: card.pip, pos: [-3.2, 0, 0.5], rot: [0, 0.5, 0], scale: 1, motion: { type: 'bounce', to: [3.2, 0, 0.5], height: 0.75, hops: 5 }, clip: { asset_id: ids.pip.clipId, name: 'ear-wiggle', speed: 1.6 } },
        { card_id: card.cloud, pos: [-2, 3.3, -5], rot: [0, 0, 0], scale: 0.9, motion: { type: 'drift', dx: 2, bob: 0.06 } },
        { card_id: card.sunny, pos: [3.2, 3.6, -6], rot: [0, 0, 0], scale: 0.85, motion: { type: 'twinkle', amount: 0.04, speed: 2 } },
      ],
      camera: { preset: 'follow', target: 0 }, lighting: { preset: 'day' },
    });
    return ep;
  });
  setSetting('sample_sky_v2', true);
  return epId;
}
