// Project 07: upload the user's song as master, set + approve the measured line timing, and set who sings each line
// (card usages drive the singing mouths): Mommy on her lines, Leo on his, both on "together" lines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const B = 'http://localhost:5175', EP = 18, MOMMY = 68, LEO = 69;
const call = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const t = JSON.parse(fs.readFileSync(path.join(DIR, 'timing.json'), 'utf8'));
const fd = new FormData();
fd.append('category', 'song'); fd.append('label', 'What Is This? (user-supplied final song)'); fd.append('source', 'import');
fd.append('files', new Blob([fs.readFileSync(path.join(DIR, 'what-is-this.mp3'))], { type: 'audio/mpeg' }), 'What Is This_.mp3');
const up = await (await fetch(`${B}/api/episodes/${EP}/audio`, { method: 'POST', body: fd })).json();
const aid = up[0].id;
await call('POST', `/api/assets/${aid}/approve`);
await call('POST', `/api/episodes/${EP}/master`, { asset_id: aid });
await call('PUT', `/api/episodes/${EP}/timing`, { lines: t.lines.map((l) => ({ i: l.i, start: l.start, end: l.end })) });
const e2 = await call('POST', `/api/episodes/${EP}/timing/approve`);
const who = (w) => t.lines.filter((l) => l.who === w || l.who === 'together').map((l) => l.i);
await call('PUT', `/api/cards/${MOMMY}`, { usages: who('mommy') });
await call('PUT', `/api/cards/${LEO}`, { usages: who('baby') });
console.log(JSON.stringify({ audio_id: aid, duration: up[0].duration, mommy: who('mommy'), leo: who('baby'), stages: e2.progress?.stages?.map((s) => `${s.key}:${s.done}`) }));
