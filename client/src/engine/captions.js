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

/** A big rounded card that pops in and fades out (title and end cards). */
function card(ctx, w, h, { text, sub, k, out, colors }) {
  const pop = easeOutBack(clamp01(k / 0.5)); const alpha = clamp01(k / 0.25) * (1 - clamp01(out));
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  const size = Math.round(h * 0.1); ctx.font = `800 ${size}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const lines = []; let row = '';
  for (const word of String(text).split(/\s+/)) { const t = row ? `${row} ${word}` : word; if (row && ctx.measureText(t).width > w * 0.72) { lines.push(row); row = word; } else row = t; }
  if (row) lines.push(row);
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const subSize = Math.round(size * 0.38);
  const cw = tw + size * 1.4, ch = lines.length * size * 1.15 + size * 0.9 + (sub ? subSize * 1.6 : 0);
  ctx.translate(w / 2, h * 0.27); ctx.scale(pop, pop); // upper third: over the sky, not the characters
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = size * 0.4; ctx.shadowOffsetY = size * 0.12;
  ctx.fillStyle = colors.primary || '#FF7A59'; roundRect(ctx, -cw / 2, -ch / 2, cw, ch, size * 0.5); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = size * 0.08; ctx.strokeStyle = colors.accent || '#FFD23F'; roundRect(ctx, -cw / 2 + size * 0.15, -ch / 2 + size * 0.15, cw - size * 0.3, ch - size * 0.3, size * 0.4); ctx.stroke();
  const top = -ch / 2 + size * 0.45 + size * 0.575;
  lines.forEach((l, i) => {
    const y = top + i * size * 1.15;
    ctx.lineWidth = size * 0.16; ctx.lineJoin = 'round'; ctx.strokeStyle = colors.text || '#2B2140'; ctx.strokeText(l, 0, y);
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(l, 0, y);
  });
  if (sub) { ctx.font = `700 ${subSize}px ${FONT}`; ctx.fillStyle = colors.text || '#2B2140'; ctx.fillText(sub, 0, top + lines.length * size * 1.15 - size * 0.25 + subSize * 0.6); }
  ctx.restore();
}

/**
 * Draw everything that sits on top of the 3D picture at song time t.
 * opts: { lines (timed lyric lines), look (project look), title, channel: {name, colors, caption_style}, duration }
 */
export function drawOverlay(ctx, w, h, t, { lines = [], look = {}, title = '', channel = {}, duration = 0 } = {}) {
  const colors = channel.colors || {};
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
