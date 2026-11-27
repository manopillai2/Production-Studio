// Everything drawn ON the picture: the song title card, the lyric captions (with karaoke word highlighting) and the
// end card. The preview draws them on a 2D canvas over the 3D view and the export draws them onto every frame with
// the same function, so the MP4 matches the preview exactly. Sizes are proportional to the frame width.

/** The lyric line showing at time t (from the Stage 3 timing), or null. */
export const captionAt = (lines, t) => (lines || []).find((l) => l.start != null && l.end != null && t >= l.start && t < l.end) || null;

const FONT = "'Baloo Thambi 2', 'Fredoka', 'Noto Sans Tamil', 'Nirmala UI', sans-serif";

/** Wait for the caption font so the first exported frames don't use a fallback font. */
export const captionFontReady = (sample = 'அ A') => Promise.all([
  document.fonts?.load(`700 32px ${FONT}`, sample), document.fonts?.load(`800 32px ${FONT}`, sample),
]).catch(() => null);

const DEFAULT_STYLE = { fontSize: 54, color: '#ffffff', outline: '#2b2140', outlineWidth: 4, position: 'bottom', background: false };
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function wrap(ctx, words, maxW) {
  const rows = []; let row = [];
  for (const w of words) {
    const test = [...row, w].map((x) => x.text).join(' ');
    if (row.length && ctx.measureText(test).width > maxW) { rows.push(row); row = [w]; } else row.push(w);
  }
  if (row.length) rows.push(row);
  return rows;
}

/**
 * A lyric line. With karaoke on, words light up in the highlight colour as they are sung (spread across the line's
 * time by word length), and the word being sung gets a small lift.
 */
export function drawCaption(ctx, text, w, h, { style, karaoke = false, progress = 0, highlight = '#FFD23F' } = {}) {
  if (!text) return;
  const st = { ...DEFAULT_STYLE, ...(style || {}) };
  const size = Math.round((st.fontSize / 1080) * h); const lineH = size * 1.22; const maxW = w * 0.9;
  ctx.save();
  ctx.font = `700 ${size}px ${FONT}`; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const words = String(text).split(/\s+/).filter(Boolean).map((t) => ({ text: t }));
  // Karaoke timing: each word gets time in proportion to its length (+1 for the gap).
  const total = words.reduce((s, x) => s + x.text.length + 1, 0); let acc = 0;
  for (const x of words) { x.a = acc / total; acc += x.text.length + 1; x.b = acc / total; }
  const rows = wrap(ctx, words, maxW);
  const block = rows.length * lineH;
  const baseY = st.position === 'top' ? h * 0.06 + size : st.position === 'middle' ? h / 2 - block / 2 + size : h * 0.94 - (rows.length - 1) * lineH - size * 0.2;
  const space = ctx.measureText(' ').width;
  rows.forEach((row, r) => {
    const widths = row.map((x) => ctx.measureText(x.text).width);
    const rowW = widths.reduce((s, x) => s + x, 0) + space * (row.length - 1);
    let x = w / 2 - rowW / 2; const y = baseY + r * lineH;
    if (st.background) { ctx.fillStyle = 'rgba(20,16,40,0.55)'; const pad = size * 0.3; roundRect(ctx, x - pad, y - size * 0.95, rowW + pad * 2, size * 1.3, size * 0.3); ctx.fill(); }
    row.forEach((word, i) => {
      const sung = karaoke && progress >= word.b; const now = karaoke && progress >= word.a && progress < word.b;
      const lift = now ? Math.sin(clamp01((progress - word.a) / (word.b - word.a)) * Math.PI) * size * 0.12 : 0;
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.05;
      ctx.lineWidth = Math.max(2, (st.outlineWidth / 54) * size * 1.6); ctx.strokeStyle = st.outline;
      ctx.strokeText(word.text, x, y - lift);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = sung || now ? highlight : st.color;
      ctx.fillText(word.text, x, y - lift);
      x += widths[i] + space;
    });
  });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/**
 * Title and end text, cartoon style, with no box: big bubbly letters, each in a bright colour, with a thick white
 * outline, a dark edge and a soft shadow. The letters pop in one after another, then float gently like a wave;
 * a few sparkles twinkle around them. k = seconds since it started, out = 0→1 while it leaves.
 */
const RAINBOW = ['#FF5A5F', '#FF9F1C', '#FFD23F', '#3DDC84', '#2EC4F1', '#7B6CF6', '#FF66C4'];
function card(ctx, w, h, { text, sub, k, out, colors }) {
  const leave = clamp01(out); const alpha = 1 - leave;
  if (alpha <= 0 || k < 0) return;
  ctx.save();
  const size = Math.round(h * 0.115); ctx.font = `800 ${size}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const lines = []; let row = '';
  for (const word of String(text).split(/\s+/)) { const t = row ? `${row} ${word}` : word; if (row && ctx.measureText(t).width * 1.08 > w * 0.82) { lines.push(row); row = word; } else row = t; }
  if (row) lines.push(row);
  const palette = [colors.primary, colors.accent, ...RAINBOW].filter((c, i, a) => c && a.indexOf(c) === i);
  const lineH = size * 1.12; const cy = h * 0.25 - ((lines.length - 1) * lineH) / 2; // upper third: over the sky, not the characters
  let n = 0;
  const glyphs = [];
  lines.forEach((l, r) => {
    const gap = size * 0.035; // a little air between the bubbly letters, more between words
    const chars = [...l]; const widths = chars.map((c) => ctx.measureText(c).width + (c === ' ' ? size * 0.12 : gap)); const total = widths.reduce((a, b) => a + b, 0);
    let x = w / 2 - total / 2;
    chars.forEach((c, i) => { glyphs.push({ c, x: x + widths[i] / 2, y: cy + r * lineH, i: n++ }); x += widths[i]; });
  });
  // sparkles behind the letters
  const spark = (sx, sy, s, rot) => { ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot); ctx.beginPath(); for (let j = 0; j < 8; j++) { const rr = j % 2 ? s * 0.32 : s; const a = (j * Math.PI) / 4; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.restore(); };
  const S = [[-0.36, -0.13], [0.37, -0.1], [-0.3, 0.09], [0.31, 0.11], [-0.08, -0.17], [0.12, 0.15], [0.43, 0.02], [-0.44, 0.0]];
  ctx.globalAlpha = alpha;
  S.forEach(([sx, sy], j) => {
    const tw = clamp01((k - 0.3 - j * 0.12) / 0.3) * (0.55 + 0.45 * Math.sin(k * 3 + j * 1.7));
    if (tw <= 0) return;
    ctx.fillStyle = j % 2 ? '#FFF6B0' : '#FFFFFF'; ctx.globalAlpha = alpha * tw;
    spark(w / 2 + sx * w, h * 0.25 + sy * h + (lines.length - 1) * lineH * Math.sign(sy) * 0.5, size * (0.18 + 0.1 * (j % 3)), k * 0.8 + j);
  });
  ctx.globalAlpha = alpha;
  for (const g of glyphs) {
    if (g.c === ' ') continue;
    const kk = k - g.i * 0.045; // one letter after another
    if (kk <= 0) continue;
    const pop = easeOutBack(clamp01(kk / 0.45));
    const fly = leave > 0 ? clamp01(leave * 1.6 - (g.i % 7) * 0.05) : 0; // letters hop away at the end
    const bob = Math.sin(k * 2.4 - g.i * 0.45) * size * 0.07;
    const rot = Math.sin(k * 1.7 - g.i * 0.6) * 0.06;
    ctx.save();
    ctx.translate(g.x, g.y + bob - fly * size * 0.8);
    ctx.rotate(rot); ctx.scale(pop * (1 - fly * 0.4), pop * (1 - fly * 0.4));
    ctx.globalAlpha = alpha * clamp01(kk / 0.12);
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(40,20,60,0.35)'; ctx.shadowBlur = size * 0.14; ctx.shadowOffsetY = size * 0.08;
    ctx.lineWidth = size * 0.3; ctx.strokeStyle = colors.text || '#3A2350'; ctx.strokeText(g.c, 0, 0); // dark edge
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = size * 0.17; ctx.strokeStyle = '#FFFFFF'; ctx.strokeText(g.c, 0, 0); // white outline
    const fill = palette[g.i % palette.length];
    const grad = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
    grad.addColorStop(0, mixHex(fill, '#FFFFFF', 0.35)); grad.addColorStop(0.55, fill); grad.addColorStop(1, mixHex(fill, '#000000', 0.12));
    ctx.fillStyle = grad; ctx.fillText(g.c, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; // a little shine on each letter
    ctx.beginPath(); ctx.ellipse(-size * 0.1, -size * 0.2, size * 0.09, size * 0.045, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (sub) {
    const kk = k - glyphs.length * 0.045 - 0.1;
    if (kk > 0) {
      const subSize = Math.round(size * 0.36);
      ctx.save(); ctx.globalAlpha = alpha * clamp01(kk / 0.3);
      ctx.font = `700 ${subSize}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      const y = cy + (lines.length - 1) * lineH + size * 0.95 + (1 - clamp01(kk / 0.3)) * subSize * 0.5;
      ctx.lineWidth = subSize * 0.32; ctx.strokeStyle = colors.text || '#3A2350'; ctx.strokeText(sub, w / 2, y);
      ctx.fillStyle = '#FFFFFF'; ctx.fillText(sub, w / 2, y);
      ctx.restore();
    }
  }
  ctx.restore();
}
function mixHex(a, b, k) {
  const p = (c) => { const m = String(c).replace('#', ''); const v = m.length === 3 ? m.split('').map((x) => x + x).join('') : m; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0); };
  const A = p(a), B = p(b); return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * k)).join(',')})`;
}

/**
 * Draw everything that sits on top of the 3D picture at song time t.
 * opts: { lines (timed lyric lines), look (project look), title, channel: {name, colors, caption_style}, duration }
 */
export function drawOverlay(ctx, w, h, t, { lines = [], look = {}, title = '', channel = {}, duration = 0 } = {}) {
  const colors = channel.colors || {};
  if (look.vignette !== false) { // a soft darkening at the edges draws the eye to the middle, like a film
    const g = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.42, w / 2, h * 0.52, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(30,15,40,0)'); g.addColorStop(1, 'rgba(30,15,40,0.32)'); ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  const timed = lines.filter((l) => l.start != null && l.end != null);
  const first = timed[0]?.start ?? 0; const last = timed.at(-1)?.end ?? duration;
  // Title card over the instrumental intro (or a short banner if the singing starts right away).
  if (look.title_card !== false && (look.title_text || title)) {
    const T = Math.min(5, first);
    if (T >= 1.2 && t < T) card(ctx, w, h, { text: look.title_text || title, sub: channel.name, k: t, out: (t - (T - 0.45)) / 0.45, colors });
  }
  // End card over the instrumental outro.
  if (look.end_card !== false && duration && duration - last >= 1.2 && t > last + 0.15) {
    card(ctx, w, h, { text: look.end_text || 'Bye-bye! Sing again soon!', sub: channel.name, k: t - (last + 0.15), out: (t - (duration - 0.6)) / 0.6, colors });
  }
  const line = captionAt(timed, t);
  if (line) drawCaption(ctx, line.text, w, h, { style: channel.caption_style, karaoke: look.karaoke !== false, progress: (t - line.start) / Math.max(0.1, line.end - line.start), highlight: colors.accent || '#FFD23F' });
}
