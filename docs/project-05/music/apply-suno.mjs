// Project 05: switch to the user's Suno song "Slow and Fast". New lyrics version in the song's real structure
// (48 lines, cues carried over from the approved v1), approve it, upload the song as master, set the measured line
// timing and approve it, and make Mira the singer of every line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const B = 'http://localhost:5175', EP = 16;
const call = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const t = JSON.parse(fs.readFileSync(path.join(DIR, 'timing-suno.json'), 'utf8'));
const ep = await call('GET', `/api/episodes/${EP}`);
const v1 = ep.lyrics.find((l) => l.id === 25);
const cueOf = new Map(); // first cue for each line text, and the second occurrence's cue for repeats
for (const s of v1.sections) for (const x of s.lines) { const k = x.en.trim(); cueOf.set(k, [...(cueOf.get(k) || []), x.cue]); }
const used = new Map();
const sections = t.sections.map((s, si) => ({ type: s.type, label: s.label, lines: t.lines.filter((l) => l.section === si).map((l) => {
  const k = l.text.trim(); const list = cueOf.get(k) || ['']; const n = used.get(k) || 0; used.set(k, n + 1);
  return { ta: '', en: l.text, cue: list[n % list.length] };
}) }));
const ly = await call('POST', `/api/episodes/${EP}/lyrics`, { title: 'Mira and Mango: Up and Down! · v2 (matches the Suno song)', sections, source: 'manual' });
await call('POST', `/api/lyrics/${ly.id}/approve`);
// upload the song (multipart)
const fd = new FormData();
fd.append('category', 'song'); fd.append('label', 'Slow and Fast (Suno, user-supplied final song)'); fd.append('source', 'import');
fd.append('files', new Blob([fs.readFileSync(path.join(DIR, 'slow-and-fast-suno.mp3'))], { type: 'audio/mpeg' }), 'Slow and Fast.mp3');
const up = await (await fetch(`${B}/api/episodes/${EP}/audio`, { method: 'POST', body: fd })).json();
const aid = up[0].id;
await call('POST', `/api/assets/${aid}/approve`);
await call('POST', `/api/episodes/${EP}/master`, { asset_id: aid });
await call('PUT', `/api/episodes/${EP}/timing`, { lines: t.lines.map((l) => ({ i: l.i, start: l.start, end: l.end })) });
const e2 = await call('POST', `/api/episodes/${EP}/timing/approve`);
await call('PUT', '/api/cards/50', { usages: t.lines.map((l) => l.i) });
await call('PUT', '/api/cards/51', { usages: [] });
console.log(JSON.stringify({ lyrics_id: ly.id, lines: sections.reduce((s, x) => s + x.lines.length, 0), audio_id: aid, duration: up[0].duration, stages: e2.progress.stages.map((s) => `${s.key}:${s.done}:${s.detail}`) }, null, 1));
