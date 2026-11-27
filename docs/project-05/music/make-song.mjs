// Project 05 song: "Mira and Mango: Up and Down!" — original tune, synthesised locally.
//  - Instrumental: drums, bass, plucked-string chords (Karplus-Strong) and glockenspiel bells, 100 BPM, 4/4, C major.
//  - Vocals: Windows text-to-speech (Microsoft Zira) word by word, each word pitch-shifted onto its melody note
//    (FFmpeg rubberband, formants preserved) and placed on the beat. A "sung" synthetic vocal, not a human singer.
//  - Output: song.wav / song.mp3 (loudness-normalised), instrumental.wav, vocals.wav, timing.json (exact line times).
// usage: node make-song.mjs <lyrics.json>   (lyrics.json = [{section, text}] in order, 36 lines)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SR = 44100, BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4;
const lines = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

// ---------- song form (bars) ----------
// intro 4 | V1 8 | C1 8 | V2 8 | C2 8 | break 4 | V3 8 | C3 8 | V4 8 | C4 8 | break 4 | C5 8 | outro 4  = 88 bars = 211.2 s
const form = [];
let bar = 0, li = 0;
const inst = (n, kind) => { form.push({ kind, bar, bars: n }); bar += n; };
const sing = (sec) => { for (let k = 0; k < 4; k++) { form.push({ kind: sec, bar, bars: 2, line: li++, k }); bar += 2; } };
inst(4, 'intro'); sing('verse'); sing('chorus'); sing('verse'); sing('chorus'); inst(4, 'break');
sing('verse'); sing('chorus'); sing('verse'); sing('chorus'); inst(4, 'break'); sing('chorus'); inst(4, 'outro');
const TOTAL = bar * BAR + 1.5;
if (li !== lines.length) throw new Error(`form has ${li} lines, lyrics have ${lines.length}`);

// ---------- harmony & melody ----------
const NOTE = (n) => { const m = n.match(/^([A-G])(#?)(\d)$/); const s = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0); return 440 * 2 ** ((s + 12 * (Number(m[3]) + 1) - 69) / 12); };
const CHORD = { C: ['C3', 'E3', 'G3'], F: ['F3', 'A3', 'C4'], G: ['G3', 'B3', 'D4'], Am: ['A3', 'C4', 'E4'] };
const ROOT = { C: 'C2', F: 'F2', G: 'G2', Am: 'A2' };
const PROG = { verse: [['C', 'F'], ['G', 'C'], ['C', 'F'], ['G', 'C']], chorus: [['F', 'G'], ['C', 'Am'], ['F', 'G'], ['C', 'C']], intro: ['F', 'G', 'C', 'C'], break: ['F', 'G', 'Am', 'G'], outro: ['F', 'G', 'C', 'C'] };
// 8 quarter-note melody slots per sung line (2 bars). Word i sings note i; the last word holds.
const MEL = {
  verse: [['E4', 'E4', 'D4', 'C4', 'D4', 'E4', 'G4', 'G4'], ['A4', 'A4', 'G4', 'E4', 'D4', 'E4', 'C4', 'C4'], ['E4', 'G4', 'G4', 'A4', 'G4', 'E4', 'D4', 'D4'], ['D4', 'E4', 'F4', 'E4', 'D4', 'C4', 'C4', 'C4']],
  chorus: [['G4', 'G4', 'A4', 'G4', 'E4', 'G4', 'A4', 'A4'], ['G4', 'G4', 'E4', 'D4', 'C4', 'D4', 'E4', 'E4'], ['G4', 'G4', 'A4', 'G4', 'E4', 'G4', 'A4', 'A4'], ['A4', 'G4', 'E4', 'D4', 'E4', 'D4', 'C4', 'C4']],
};

// ---------- buffers ----------
const N = Math.ceil(TOTAL * SR);
const music = new Float32Array(N), bells = new Float32Array(N), vox = new Float32Array(N);
const add = (buf, t, samples, gain = 1) => { const o = Math.round(t * SR); for (let i = 0; i < samples.length && o + i < N; i++) if (o + i >= 0) buf[o + i] += samples[i] * gain; };
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

const kick = (() => { const n = Math.round(0.3 * SR), a = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; const f = 50 + 90 * Math.exp(-t * 30); ph += 2 * Math.PI * f / SR; a[i] = Math.sin(ph) * Math.exp(-t * 9); } return a; })();
const snare = (() => { const n = Math.round(0.2 * SR), a = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; const w = rnd(); lp += 0.35 * (w - lp); a[i] = ((w - lp) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-t * 22); } return a; })();
const hat = (() => { const n = Math.round(0.05 * SR), a = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const w = rnd(); lp += 0.5 * (w - lp); a[i] = (w - lp) * Math.exp(-(i / SR) * 90); } return a; })();
const shaker = (() => { const n = Math.round(0.09 * SR), a = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; const w = rnd(); lp += 0.6 * (w - lp); a[i] = (w - lp) * Math.sin(Math.PI * t / 0.09); } return a; })();
const pluck = (f, dur, bright = 0.5) => { const n = Math.round(dur * SR), p = Math.max(2, Math.round(SR / f)); const ring = Float32Array.from({ length: p }, () => rnd() * 0.5); const a = new Float32Array(n); let j = 0; for (let i = 0; i < n; i++) { const x = ring[j], y = ring[(j + 1) % p]; ring[j] = (x * (1 - bright) + y * bright) * 0.996; a[i] = x; j = (j + 1) % p; } return a; };
const bass = (f, dur) => { const n = Math.round(dur * SR), a = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; const tri = 2 * Math.abs(2 * ((t * f) % 1) - 1) - 1; a[i] = (tri * 0.8 + Math.sin(2 * Math.PI * f * t) * 0.5) * Math.min(1, t * 200) * Math.exp(-t * 2.2); } return a; };
const bell = (f, dur) => { const n = Math.round(dur * SR), a = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; a[i] = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 6) + 0.15 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 10)) * Math.exp(-t * 3.2) * Math.min(1, t * 400); } return a; };
const swell = (dur) => { const n = Math.round(dur * SR), a = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const w = rnd(); lp += 0.3 * (w - lp); a[i] = (w - lp) * (i / n) ** 2; } return a; };

// ---------- instrumental ----------
for (const sec of form) {
  const t0 = sec.bar * BAR;
  const chords = sec.line != null ? PROG[sec.kind][sec.k] : null;
  for (let b = 0; b < sec.bars; b++) {
    const tb = t0 + b * BAR;
    const ch = chords ? chords[b] : PROG[sec.kind][b % 4];
    const last = sec.kind === 'outro' && b === sec.bars - 1;
    // drums (lighter in intro/outro)
    const soft = sec.kind === 'intro' || sec.kind === 'outro' ? 0.6 : 1;
    if (!last) {
      for (const k of [0, 2]) add(music, tb + k * BEAT, kick, 0.9 * soft);
      for (const k of [1, 3]) add(music, tb + k * BEAT, snare, 0.45 * soft);
      for (let k = 0; k < 8; k++) add(music, tb + k * BEAT / 2, k % 2 ? shaker : hat, (k % 2 ? 0.12 : 0.16) * soft);
    } else add(music, tb, kick, 0.8);
    // bass: root on 1 and 3, a passing note on 2.5
    const rf = NOTE(ROOT[ch]);
    if (!last) { add(music, tb, bass(rf, BEAT * 1.6), 0.5); add(music, tb + 2 * BEAT, bass(rf, BEAT * 1.4), 0.45); add(music, tb + 3.5 * BEAT, bass(rf * 1.5, BEAT * 0.5), 0.3); }
    else add(music, tb, bass(rf, BAR * 1.5), 0.55);
    // strummed chords (ukulele-like): down-strums on 1, 2&, 3, 4
    const strums = last ? [0] : [0, 1.5, 2, 3];
    for (const s of strums) CHORD[ch].forEach((nn, q) => add(music, tb + s * BEAT + q * 0.012, pluck(NOTE(nn) * 2, last ? BAR * 1.5 : BEAT * 1.4, 0.48), last ? 0.32 : 0.2));
  }
  // bells: double the vocal tune; in instrumental parts, play the chorus tune
  if (sec.line != null) MEL[sec.kind][sec.k].forEach((nn, k) => add(bells, t0 + k * BEAT, bell(NOTE(nn) * 2, BEAT * 1.2), 0.13));
  else {
    const tune = [...MEL.chorus[0], ...MEL.chorus[3]];
    for (let k = 0; k < Math.min(tune.length, sec.bars * 4); k++) add(bells, t0 + k * BEAT, bell(NOTE(tune[k]) * 2, BEAT * 1.3), sec.kind === 'outro' && k > 11 ? 0.12 : 0.22);
  }
  // swell into every chorus and after the breaks (smooth transitions)
  if (sec.kind === 'chorus' && sec.k === 0) add(music, t0 - BAR / 2, swell(BAR / 2), 0.18);
}

// ---------- vocals: TTS words pitched onto the melody ----------
const TTS = path.join(DIR, 'tts'); fs.mkdirSync(TTS, { recursive: true });
const clean = (w) => w.toLowerCase().replace(/[^a-z']/g, '');
const occ = []; // {word, t, note, slot}
for (const sec of form) {
  if (sec.line == null) continue;
  const words = lines[sec.line].text.split(/\s+/).map(clean).filter(Boolean);
  const mel = MEL[sec.kind][sec.k];
  words.forEach((w, i) => {
    const beat = i < 7 ? i : 7; // up to 8 words on the 8 beats
    const next = i === words.length - 1 ? 8 : Math.min(8, i + 1);
    occ.push({ word: w, t: sec.bar * BAR + beat * BEAT, note: mel[Math.min(7, beat)], slot: Math.max(0.3, (next - beat) * BEAT - 0.06) });
  });
}
const unique = [...new Set(occ.map((o) => o.word))].filter((w) => !fs.existsSync(path.join(TTS, `${w}.wav`)));
if (unique.length) {
  const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Zira Desktop'); $s.Rate = 0;
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono);
${unique.map((w) => `$s.SetOutputToWaveFile('${path.join(TTS, `${w}.wav`).replace(/'/g, "''")}', $fmt); $s.Speak('${w.replace(/'/g, "''")}');`).join('\n')}
$s.SetOutputToNull()`;
  const f = path.join(TTS, '_make.ps1'); fs.writeFileSync(f, ps);
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`TTS failed: ${r.stderr}`);
}
const F0 = 205; // typical pitch of the Zira voice (Hz)
const raw = (args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(String(r.stderr)); return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4); };
const cache = new Map();
for (const o of occ) {
  const key = `${o.word}|${o.note}|${o.slot.toFixed(2)}`;
  if (!cache.has(key)) {
    const src = path.join(TTS, `${o.word}.wav`);
    const ratio = NOTE(o.note) / F0 * 1.12; // sung a little above the speaking pitch, child-like
    let a = raw(['-i', src, '-af', `silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=1:stop_threshold=-45dB:stop_duration=0.05,rubberband=pitch=${ratio.toFixed(4)}:formant=preserved`]);
    const dur = a.length / SR;
    if (dur > o.slot) { const tempo = Math.min(2.4, dur / o.slot); const f = path.join(TTS, '_tmp.f32'); fs.writeFileSync(f, Buffer.from(a.buffer, a.byteOffset, a.byteLength)); a = raw(['-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', f, '-af', `rubberband=tempo=${tempo.toFixed(4)}`]); }
    const b = Float32Array.from(a); const fade = Math.min(400, b.length >> 2); for (let i = 0; i < fade; i++) { b[i] *= i / fade; b[b.length - 1 - i] *= i / fade; }
    cache.set(key, b);
  }
  add(vox, o.t + 0.02, cache.get(key), 1);
}

// ---------- mix & write ----------
const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 1e-9);
const vp = peak(vox); for (let i = 0; i < N; i++) vox[i] /= vp;
const mp = peak(music), bp = peak(bells);
const inst2 = new Float32Array(N); for (let i = 0; i < N; i++) inst2[i] = music[i] / mp * 0.8 + bells[i] / bp * 0.35;
const fadeOut = Math.round(1.5 * SR); for (let i = 0; i < fadeOut; i++) inst2[N - 1 - i] *= i / fadeOut;
// light reverb on the vocal (two short echoes) so it sits in the music
const voxWet = new Float32Array(N); for (let i = 0; i < N; i++) voxWet[i] = vox[i] + (i > 3500 ? vox[i - 3500] * 0.18 : 0) + (i > 7700 ? vox[i - 7700] * 0.09 : 0);
const mix = new Float32Array(N); for (let i = 0; i < N; i++) mix[i] = inst2[i] * 0.55 + voxWet[i] * 0.62;
const wav = (file, a) => { const b = Buffer.alloc(44 + a.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + a.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(a.length * 2, 40); const p = peak(a); for (let i = 0; i < a.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(a[i] / p * 0.95 * 32767))), 44 + i * 2); fs.writeFileSync(file, b); };
wav(path.join(DIR, 'instrumental.wav'), inst2); wav(path.join(DIR, 'vocals.wav'), voxWet); wav(path.join(DIR, 'mix-raw.wav'), mix);
// even loudness for the whole song (EBU R128 -16 LUFS), then MP3
const run = (args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); };
run(['-i', path.join(DIR, 'mix-raw.wav'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', path.join(DIR, 'song.wav')]);
run(['-i', path.join(DIR, 'song.wav'), '-codec:a', 'libmp3lame', '-b:a', '192k', path.join(DIR, 'mira-and-mango-up-and-down.mp3')]);
// exact lyric timing (line starts on the beat; ends just before the next line)
const timing = form.filter((s) => s.line != null).map((s) => ({ i: s.line, start: +(s.bar * BAR).toFixed(2), end: +(s.bar * BAR + 2 * BAR - 0.15).toFixed(2), section: s.kind }));
fs.writeFileSync(path.join(DIR, 'timing.json'), JSON.stringify({ bpm: BPM, total: +TOTAL.toFixed(2), form: form.map((f) => ({ kind: f.kind, start: +(f.bar * BAR).toFixed(2), bars: f.bars, line: f.line })), lines: timing }, null, 1));
console.log(JSON.stringify({ total: TOTAL.toFixed(1), words: occ.length, unique_tts: unique.length, lines: timing.length, first: timing[0], last: timing.at(-1) }));
