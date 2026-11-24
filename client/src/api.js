// Small fetch wrapper that turns server errors into readable messages.
async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); }
  catch { throw new Error('Cannot reach the studio server. Is it running? (npm start)'); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
  /** Upload files with extra fields. Reads video/audio/image metadata in the browser as a fallback. */
  async upload(url, files, fields = {}) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, v);
    const list = [...files];
    if (list.length === 1) {
      const meta = await readMeta(list[0]).catch(() => ({}));
      for (const [k, v] of Object.entries(meta)) if (v) fd.append(k, v);
    }
    list.forEach((f) => fd.append('files', f));
    return request('POST', url, fd);
  },
};

function readMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (m) => { URL.revokeObjectURL(url); resolve(m); };
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => done({});
      img.src = url;
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => done({ width: el.videoWidth || null, height: el.videoHeight || null, duration: el.duration || null });
      el.onerror = () => done({});
      el.src = url;
    } else done({});
  });
}

export const fmtTime = (s) => {
  if (s == null || !isFinite(s)) return '–';
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
export const resLabel = (a) => {
  if (!a?.width || !a?.height) return null;
  const h = Math.min(a.width, a.height);
  const tag = h >= 2160 ? '4K' : h >= 1440 ? '1440p' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : `${h}p`;
  return `${a.width}×${a.height} · ${tag}`;
};
