// Align the known lyrics (in the order the song sings them) to the transcribed words, giving every line an exact
// start and end in the real song. Sequence alignment (Needleman-Wunsch) on normalised words; lines the recogniser
// missed are interpolated between their neighbours.  usage: node align.mjs <words.json> <out-timing.json>
import fs from 'node:fs';

const [wordsFile, outFile] = process.argv.slice(2);
const { words, duration } = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
const V1 = ['Walking slowly, slow, slow, slow,', 'Past the flowers, here we go!', "Now we're running, fast, fast, fast!", 'Round the garden, zooming past!'];
const C = ['Slow and fast, and up and down,', 'High and low, now spin around!', 'Yes and no, hello, goodbye,', 'Come on, copy, give it a try!'];
const V2 = ['Mira jumps up, up, up, up!', 'Mango wags, a happy pup!', 'Now bow down, down to the ground,', 'Up float balloons, pink and round!'];
const V3 = ['Red kite flying high, so high,', 'Dancing in the big blue sky!', 'Swooping low, low, low it goes,', 'Mango sniffs low with his nose!'];
const V4 = ['Yes, yes, yes, we nod our heads,', 'No, no, no, we shake instead!', 'Wave hello, the day was fun,', 'Wave goodbye to the setting sun!'];
// The order the Suno song actually sings (checked against the transcription).
const sections = [['verse', 'Verse 1 – Slow and Fast', V1], ['chorus', 'Chorus', C], ['verse', 'Verse 2 – Up and Down', V2], ['chorus', 'Chorus', C],
  ['verse', 'Verse 2 (again)', V2], ['chorus', 'Chorus', C], ['verse', 'Verse 3 – High and Low', V3], ['chorus', 'Chorus', C],
  ['verse', 'Verse 4 – Yes and No, Hello and Goodbye', V4], ['chorus', 'Chorus', C], ['chorus', 'Chorus (slow)', C], ['chorus', 'Final Chorus', C]];
const lines = sections.flatMap(([type, label, ls], si) => ls.map((text) => ({ type, label, section: si, text })));
const norm = (w) => w.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
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
  return { i, ...l, matched: ws.length, total: exp.filter((e) => e.line === i).length, start: ws.length ? ws[0].start : null, end: ws.length ? ws.at(-1).end : null };
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
