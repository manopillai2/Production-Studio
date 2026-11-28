// Align the known lyrics (in the order the song sings them) to the transcribed words, giving every line an exact
// start and end in the real song. Sequence alignment (Needleman-Wunsch) on normalised words; lines the recogniser
// missed are interpolated between their neighbours.  usage: node align.mjs <words.json> <out-timing.json>
import fs from 'node:fs';

const [wordsFile, outFile] = process.argv.slice(2);
const { words, duration } = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
// Project 07: the lyrics in the order the song sings them (checked against the transcription: one pass, no repeats).
const SEC = (type, label, who, ls) => [type, label, ls.map((t, k) => [t, who[k]])];
const sections = [
  SEC('intro', 'Opening Chorus', ['baby', 'baby'], ['Mommy, Mommy, what is this?', 'Tell me, tell me, what is this?']),
  SEC('verse', 'Learning 1 – Sofa', ['mommy', 'baby', 'together'], ['This is a sofa, soft and wide!', 'Oh, a sofa! Sofa, sofa!', 'Sit, sit, sit by my side!']),
  SEC('verse', 'Learning 2 – Television', ['mommy', 'baby', 'together'], ['This is a TV, look and see!', 'Oh, a TV! TV, TV!', 'Sing a little song with me!']),
  SEC('verse', 'Learning 3 – Bed', ['mommy', 'baby', 'together'], ['This is a bed, soft and sweet!', 'Oh, a bed! Bed, bed!', 'Rest your head and go to sleep!']),
  SEC('verse', 'Learning 4 – Fan', ['mommy', 'baby', 'together'], ['This is a fan, round and round!', 'Oh, a fan! Fan, fan!', 'Round and round and round it goes!']),
  SEC('verse', 'Learning 5 – Refrigerator', ['mommy', 'baby', 'together'], ['This is a fridge, nice and cold!', 'Oh, a fridge! Fridge, fridge!', 'Cold, cold, cold inside!']),
  SEC('verse', 'Learning 6 – Cup', ['mommy', 'baby', 'together'], ['This is a cup, take a sip!', 'Oh, a cup! Cup, cup!', 'Sip, sip, sip, sip, sip!']),
  SEC('outro', 'Ending Chorus', ['baby', 'baby', 'baby', 'together', 'together'], ['Mommy, Mommy, now I know!', 'Sofa, TV, bed and fan,', 'Fridge and cup — yes, I can!', 'Learn and play, every day,', 'Hip, hip, hip, hooray!']),
];
const lines = sections.flatMap(([type, label, ls], si) => ls.map(([text, who]) => ({ type, label, section: si, text, who })));
const norm = (w) => { const x = w.toLowerCase().replace(/[^a-z0-9']/g, '').replace(/'/g, ''); return x === 'tv' || x === 'teevee' ? 'tv' : x; };
const exp = []; lines.forEach((l, i) => l.text.split(/\s+/).map(norm).filter(Boolean).forEach((w) => exp.push({ w, line: i })));
const got = words.map((x) => ({ ...x, n: norm(x.w) })).filter((x) => x.n);
const sim = (a, b) => (a === b ? 3 : (a.length > 3 && b.length > 3 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4)))) ? 1.5 : -1);
const G = -1;
const n = exp.length, m = got.length;
const S = Array.from({ length: n + 1 }, () => new Float32Array(m + 1)); const T = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
for (let i = 1; i <= n; i++) { S[i][0] = i * G; T[i][0] = 1; }
for (let j = 1; j <= m; j++) { S[0][j] = j * G; T[0][j] = 2; }
for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
  const d = S[i - 1][j - 1] + sim(exp[i - 1].w, got[j - 1].n), u = S[i - 1][j] + G, l = S[i][j - 1] + G;
  if (d >= u && d >= l) { S[i][j] = d; T[i][j] = 0; } else if (u >= l) { S[i][j] = u; T[i][j] = 1; } else { S[i][j] = l; T[i][j] = 2; }
}
const match = new Array(n).fill(null);
for (let i = n, j = m; i > 0 || j > 0;) {
  const t = T[i][j];
  if (i > 0 && j > 0 && t === 0) { if (sim(exp[i - 1].w, got[j - 1].n) > 0) match[i - 1] = got[j - 1]; i--; j--; } else if (i > 0 && (t === 1 || j === 0)) i--; else j--;
}
const out = lines.map((l, i) => {
  const ws = exp.map((e, k) => (e.line === i ? match[k] : null)).filter(Boolean);
  return { i, ...l, matched: ws.length, total: exp.filter((e) => e.line === i).length, start: ws.length ? ws[0].start : null, end: ws.length ? ws.at(-1).end : null, words: exp.map((e, k) => (e.line === i ? { w: e.w, start: match[k]?.start ?? null, end: match[k]?.end ?? null } : null)).filter(Boolean) };
});
// Interpolate missing lines; make every line end before the next one starts.
for (let i = 0; i < out.length; i++) if (out[i].start == null) {
  const prev = out.slice(0, i).reverse().find((x) => x.start != null), next = out.slice(i + 1).find((x) => x.start != null);
  const a = prev ? prev.end : 0, b = next ? next.start : duration; const gap = out.slice(i).findIndex((x) => x.start != null); const k = gap < 0 ? out.length - i : gap;
  out[i].start = +(a + (b - a) * (1 / (k + 1))).toFixed(2); out[i].end = +(out[i].start + Math.min(2.4, (b - a) / (k + 1))).toFixed(2); out[i].interpolated = true;
}
for (let i = 0; i < out.length; i++) {
  out[i].start = +Math.max(0, out[i].start - 0.08).toFixed(2); // tiny lead so the caption appears as the word starts
  const nextStart = out[i + 1]?.start ?? duration;
  out[i].end = +Math.min(Math.max(out[i].end + 0.25, out[i].start + 0.6), nextStart - 0.02).toFixed(2);
}
fs.writeFileSync(outFile, JSON.stringify({ duration, sections: sections.map(([type, label, ls]) => ({ type, label, n: ls.length })), lines: out }, null, 1));
for (const l of out) console.log(String(l.i + 1).padStart(2), l.start.toFixed(2).padStart(7), l.end.toFixed(2).padStart(7), `${l.matched}/${l.total}${l.interpolated ? ' INTERP' : ''}`.padEnd(10), l.text);
