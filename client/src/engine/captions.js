// Lyrics on the picture. The preview shows them as an overlay (.scene-caption); the export draws them onto every
// frame with the same proportions (font 3.4% of the width, 6% from the bottom, 92% wide), so the MP4 matches the preview.

/** The lyric line showing at time t (from the Stage 3 timing), or null. */
export const captionAt = (lines, t) => (lines || []).find((l) => l.start != null && l.end != null && t >= l.start && t < l.end) || null;

const FONT = "'Baloo Thambi 2', 'Noto Sans Tamil', 'Nirmala UI', sans-serif";

/** Wait for the caption font so the first exported frames don't use a fallback font. */
export const captionFontReady = (sample = 'அ A') => document.fonts?.load(`700 32px ${FONT}`, sample).catch(() => null);

/** Draw a lyric line onto a 2D canvas context of size w×h (wraps to several lines, bottom-centred). */
export function drawCaption(ctx, text, w, h) {
  if (!text) return;
  const size = Math.round(w * 0.034); const lineH = size * 1.25; const maxW = w * 0.92;
  ctx.save();
  ctx.font = `700 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const rows = []; let row = '';
  for (const word of String(text).split(/\s+/)) {
    const next = row ? `${row} ${word}` : word;
    if (row && ctx.measureText(next).width > maxW) { rows.push(row); row = word; } else row = next;
  }
  if (row) rows.push(row);
  const bottom = h * 0.94; // 6% from the bottom
  rows.forEach((r, i) => {
    const y = bottom - (rows.length - 1 - i) * lineH - size * 0.25;
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = size * 0.09; ctx.shadowOffsetY = size * 0.045;
    ctx.lineWidth = Math.max(2, size * 0.09); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineJoin = 'round';
    ctx.strokeText(r, w / 2, y);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff'; ctx.fillText(r, w / 2, y);
  });
  ctx.restore();
}
