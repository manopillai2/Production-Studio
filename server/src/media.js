// FFmpeg discovery + probing, and tiny procedural PNG/WAV generators for sample data.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';

// ---------- FFmpeg ----------
function findBinary(name) {
  const envKey = name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
  if (process.env[envKey] && fs.existsSync(process.env[envKey])) return process.env[envKey];
  const r = spawnSync(name, ['-version'], { windowsHide: true });
  if (r.status === 0) return name;
  // winget installs FFmpeg here; new terminals get it on PATH, old ones may not.
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const pkg of fs.readdirSync(base).filter((d) => d.toLowerCase().includes('ffmpeg'))) {
      for (const sub of fs.readdirSync(path.join(base, pkg))) {
        const p = path.join(base, pkg, sub, 'bin', `${name}.exe`);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* not installed via winget */ }
  return null;
}
export const FFMPEG = findBinary('ffmpeg');
export const FFPROBE = findBinary('ffprobe');

export function runFfmpeg(args, { cwd, onProgress, totalSeconds } = {}) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error('FFmpeg was not found. Install it with: winget install Gyan.FFmpeg  (then open a new PowerShell window)'));
    const p = spawn(FFMPEG, ['-hide_banner', '-y', ...args], { cwd, windowsHide: true });
    let tail = '';
    p.stderr.on('data', (d) => {
      const s = d.toString();
      tail = (tail + s).slice(-4000);
      const m = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(s);
      if (m && onProgress && totalSeconds) {
        const t = +m[1] * 3600 + +m[2] * 60 + +m[3];
        onProgress(Math.min(1, t / totalSeconds));
      }
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) return resolve();
      const lines = tail.trim().split(/\r?\n/).filter((l) => !/^\s*(frame=|size=)/.test(l));
      reject(new Error(`FFmpeg failed (exit ${code}): ${lines.slice(-4).join(' | ')}`));
    });
  });
}

/** Downscale any image to ≤1024px PNG (keeps transparency) for sending to AI tools. */
export function imageForAI(file) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return resolve(fs.readFileSync(file));
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1',
      '-vf', 'scale=w=1024:h=1024:force_original_aspect_ratio=decrease', '-f', 'image2pipe', '-vcodec', 'png', '-'], { windowsHide: true });
    const chunks = [];
    let err = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 && chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error(`Could not read image ${path.basename(file)}: ${err.slice(-200)}`))));
  });
}

export function probe(file) {
  if (!FFPROBE) return {};
  const r = spawnSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { windowsHide: true, encoding: 'utf8' });
  if (r.status !== 0) return {};
  try {
    const j = JSON.parse(r.stdout);
    const v = (j.streams || []).find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
    const dur = parseFloat(j.format?.duration);
    return {
      width: v?.width ?? null,
      height: v?.height ?? null,
      duration: Number.isFinite(dur) && dur > 0.05 ? dur : null,
    };
  } catch { return {}; }
}

// ---------- PNG (procedural drawing for sample art) ----------
export class Canvas {
  constructor(w, h, bg = [0, 0, 0, 0]) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) this.d.set(bg, i * 4);
  }
  blend(x, y, c, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const sa = (c[3] ?? 255) / 255 * a;
    const da = this.d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) this.d[i + k] = (c[k] * sa + this.d[i + k] * da * (1 - sa)) / oa;
    this.d[i + 3] = oa * 255;
  }
  rect(x0, y0, w, h, c) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, y0 + h); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, x0 + w); x++) this.blend(x, y, c);
  }
  vgradient(top, bottom, y0 = 0, y1 = this.h) {
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0 - 1);
      const c = top.map((v, k) => v + (bottom[k] - v) * t);
      for (let x = 0; x < this.w; x++) this.blend(x, y, c);
    }
  }
  // Filled ellipse with optional rotation and soft "3D" shading (lighter top-left, darker rim).
  ellipse(cx, cy, rx, ry, c, { rot = 0, shade = 0.35, alpha = 1 } = {}) {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const R = Math.max(rx, ry) + 2;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) {
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const dx = x - cx, dy = y - cy;
        const u = (dx * cos + dy * sin) / rx, v = (-dx * sin + dy * cos) / ry;
        const r2 = u * u + v * v;
        if (r2 > 1.04) continue;
        const edge = r2 > 0.96 ? (1.04 - r2) / 0.08 : 1; // anti-aliased rim
        let k = 1;
        if (shade) {
          const hl = Math.hypot(u + 0.35, v + 0.4);       // highlight offset
          k = 1 + shade * (0.55 - hl * 0.6) - shade * 0.35 * Math.max(0, r2 - 0.6);
        }
        this.blend(x, y, [c[0] * k, c[1] * k, c[2] * k, c[3] ?? 255], edge * alpha);
      }
    }
  }
  circle(cx, cy, r, c, o) { this.ellipse(cx, cy, r, r, c, o); }
  png() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      Buffer.from(this.d.buffer, y * this.w * 4, this.w * 4).copy(raw, y * (this.w * 4 + 1) + 1);
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// ---------- WAV synthesis ----------
export function wav(samples, rate = 44100) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-1, Math.min(1, samples[i])) * 32000 | 0, 44 + i * 2);
  return buf;
}
