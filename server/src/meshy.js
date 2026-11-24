// Meshy API (https://docs.meshy.ai): design images (text/image-to-image) and 3D models
// (multi-image-to-3d, text-to-3d preview+refine). Jobs run in the background and survive restarts;
// results are DOWNLOADED immediately because Meshy deletes API outputs after 3 days.
import fs from 'node:fs';
import path from 'node:path';
import { one, all, run } from './db.js';
import { MEDIA_DIR } from './paths.js';
import { probe } from './media.js';
import { ProviderError, keyFor, isActive } from './providers.js';

const BASE = process.env.MESHY_BASE_URL || 'https://api.meshy.ai'; // override only for local testing
const PATHS = {
  'text-to-image': '/openapi/v1/text-to-image',
  'image-to-image': '/openapi/v1/image-to-image',
  'multi-image-to-3d': '/openapi/v1/multi-image-to-3d',
  'text-to-3d': '/openapi/v2/text-to-3d',
};
const MAX_PROMPT = 800;

/** Credit estimates from https://docs.meshy.ai/en/api/pricing (shown to the user before running). */
export const CREDITS = {
  image: { 'nano-banana': 3, 'nano-banana-2': 6, 'gpt-image-2': 9 },
  model3d: { images: { best: 30, budget: 15 }, text: { best: 30, budget: 15 } },
};

async function call(method, url, body) {
  if (!isActive('meshy')) {
    throw new ProviderError(keyFor('MESHY_API_KEY') ? 'Paid generation is switched off. Turn it on in AI Connections.' : 'Meshy is not connected. Add your Meshy API key in AI Connections.', 400);
  }
  const r = await fetch(BASE + url, {
    method,
    headers: { Authorization: `Bearer ${keyFor('MESHY_API_KEY')}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  const detail = j?.message || j?.error || '';
  const msg = {
    400: `Meshy rejected the request: ${detail || 'invalid input'}`,
    401: 'Meshy rejected the API key. Check it in AI Connections.',
    402: 'Not enough Meshy credits — or the Meshy account is on the free plan (the API needs a paid plan).',
    403: 'Meshy\'s content filter blocked this prompt or image. Try rewording it.',
    429: 'Meshy is busy (rate limit). Wait a moment and try again.',
  }[r.status] || `Meshy error ${r.status}${detail ? `: ${detail}` : ''}`;
  throw new ProviderError(msg, r.status === 401 || r.status === 402 ? 400 : 502);
}

export const balance = () => call('GET', '/openapi/v1/balance');
const createTask = async (kind, body) => (await call('POST', PATHS[kind], body)).result;
const getTask = (kind, id) => call('GET', `${PATHS[kind]}/${id}`);
const clip = (s) => String(s || '').slice(0, MAX_PROMPT);
export const dataUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

// ---------- jobs ----------
const setJob = (id, f) => {
  const k = Object.keys(f);
  run(`UPDATE jobs SET ${k.map((x) => `${x}=?`).join(',')}, updated_at=datetime('now') WHERE id=?`, ...k.map((x) => (typeof f[x] === 'object' ? JSON.stringify(f[x]) : f[x])), id);
};
const getJob = (id) => { const j = one('SELECT * FROM jobs WHERE id=?', id); return { ...j, params: JSON.parse(j.params), output: JSON.parse(j.output || '{}') }; };

export function createJob(type, params, message) {
  const id = Number(run(`INSERT INTO jobs(type,status,message,params) VALUES(?, 'queued', ?, ?)`, type, message, JSON.stringify(params)).lastInsertRowid);
  setImmediate(() => runJob(id));
  return id;
}

async function poll(jobId, kind, taskId, label, pFrom, pTo) {
  const started = Date.now();
  for (;;) {
    const t = await getTask(kind, taskId);
    const p = (t.progress || 0) / 100;
    const queue = t.status === 'PENDING' && t.preceding_tasks ? ` (queue: ${t.preceding_tasks} ahead)` : '';
    setJob(jobId, { status: 'running', progress: pFrom + (pTo - pFrom) * p, message: `${label} — ${t.status.toLowerCase().replace('_', ' ')} ${t.progress || 0}%${queue}` });
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`Meshy ${t.status.toLowerCase()}: ${t.task_error?.message || 'no details'} (credits are refunded for failed tasks)`);
    if (Date.now() - started > 45 * 60 * 1000) throw new Error('Meshy took longer than 45 minutes. Check the task in your Meshy dashboard.');
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function download(url, rel) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed (${r.status}) — Meshy links expire, run it again.`);
  const abs = path.join(MEDIA_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(await r.arrayBuffer()));
  return abs;
}

/** Hooks set by index.js: where results go (a draft version of the item). */
let hooks = { ensureDraft: null };
export const setHooks = (h) => { hooks = h; };

function saveAsset(versionId, rel, { category, label, mime, notes, source }) {
  const m = mime.startsWith('image/') ? probe(path.join(MEDIA_DIR, rel)) : {};
  run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,width,height,source,status,notes) VALUES('version',?,?,?,?,?,?,?,?,'draft',?)`,
    versionId, category, label, rel, mime, m.width ?? null, m.height ?? null, source, notes || '');
}

export async function runJob(jobId) {
  const job = getJob(jobId);
  const p = job.params;
  const out = job.output || {};
  try {
    const item = one('SELECT * FROM items WHERE id=?', p.item_id);
    if (!item) throw new Error('The character/scenery was deleted.');
    const stamp = Date.now();

    if (job.type === 'meshy-image') {
      const kind = p.refs?.length ? 'image-to-image' : 'text-to-image';
      if (!out.task_id) {
        const body = { ai_model: p.model, prompt: p.prompt, remove_background: !!p.remove_background };
        if (p.multi_view) body.generate_multi_view = true; else body.aspect_ratio = p.aspect_ratio;
        if (kind === 'image-to-image') body.reference_image_urls = p.refs;
        out.task_id = await createTask(kind, body);
        setJob(jobId, { output: out, status: 'running', message: 'Sent to Meshy…' });
      }
      const t = await poll(jobId, kind, out.task_id, 'Design image', 0.02, 0.9);
      const v = hooks.ensureDraft(item.id);
      const views = ['front', 'side', 'back'];
      for (const [i, url] of (t.image_urls || []).entries()) {
        const rel = `version/${v.id}/meshy-image-${stamp}-${i}.png`;
        await download(url, rel);
        saveAsset(v.id, rel, { category: 'render', label: `Meshy design${t.image_urls.length > 1 ? ` (${views[i] || i + 1})` : ''}`, mime: 'image/png', source: 'generated:meshy-image', notes: p.prompt });
      }
      setJob(jobId, { status: 'done', progress: 1, message: `${t.image_urls?.length || 0} image(s) saved to ${item.name} (${t.consumed_credits ?? '?'} credits).`, output: { ...out, credits: t.consumed_credits } });
      return;
    }

    if (job.type === 'meshy-3d') {
      let t;
      if (p.source === 'images') {
        if (!out.task_id) {
          // best = Meshy 7.1 (≈30 credits). budget = meshy-6-lite mesh + meshy-n1 texture (≈15 credits);
          // that combination rejects image_enhancement, remove_lighting and texture_prompt, so they're switched off.
          out.task_id = await createTask('multi-image-to-3d', {
            image_urls: p.images, should_texture: true, texture_resolution: '2k', target_formats: ['glb', 'fbx', 'usdz'],
            ...(p.pose !== 'none' ? { pose_mode: p.pose } : {}),
            ...(p.budget
              ? { ai_model: 'meshy-6-lite', texture_model: 'meshy-n1', image_enhancement: false, remove_lighting: false }
              : { ai_model: 'latest', ...(p.texture_prompt ? { texture_prompt: clip(p.texture_prompt) } : {}) }),
          });
          setJob(jobId, { output: out, status: 'running', message: 'Sent to Meshy…' });
        }
        t = await poll(jobId, 'multi-image-to-3d', out.task_id, '3D model from images', 0.02, 0.92);
      } else {
        if (!out.preview_id) {
          out.preview_id = await createTask('text-to-3d', {
            mode: 'preview', prompt: clip(p.prompt), ai_model: p.budget ? 'meshy-6-lite' : 'latest',
            ...(p.pose !== 'none' ? { pose_mode: p.pose } : {}), target_formats: ['glb', 'fbx', 'usdz'],
          });
          setJob(jobId, { output: out, status: 'running', message: 'Sent to Meshy…' });
        }
        await poll(jobId, 'text-to-3d', out.preview_id, 'Step 1/2: shape', 0.02, 0.5);
        if (!out.refine_id) {
          out.refine_id = await createTask('text-to-3d', {
            mode: 'refine', preview_task_id: out.preview_id, texture_resolution: '2k', target_formats: ['glb', 'fbx', 'usdz'],
            ...(p.texture_prompt ? { texture_prompt: clip(p.texture_prompt) } : {}),
            ...(p.budget ? { remove_lighting: false } : {}), // meshy-6-lite rejects remove_lighting=true (the default)
          });
          setJob(jobId, { output: out });
        }
        t = await poll(jobId, 'text-to-3d', out.refine_id, 'Step 2/2: colors & textures', 0.5, 0.92);
      }
      setJob(jobId, { message: 'Downloading the 3D model…', progress: 0.94 });
      const v = hooks.ensureDraft(item.id);
      const base = `version/${v.id}/meshy-3d-${stamp}`;
      if (!t.model_urls?.glb) throw new Error('Meshy finished but returned no GLB file.');
      await download(t.model_urls.glb, `${base}.glb`);
      saveAsset(v.id, `${base}.glb`, { category: 'model3d', label: `3D model (Meshy, ${p.source === 'images' ? 'from images' : 'from prompt'})`, mime: 'model/gltf-binary', source: 'generated:meshy-3d', notes: p.prompt || p.texture_prompt || '' });
      if (t.model_urls.fbx) { await download(t.model_urls.fbx, `${base}.fbx`); saveAsset(v.id, `${base}.fbx`, { category: 'blender', label: '3D model (FBX for Blender)', mime: 'model/x-blender-asset', source: 'generated:meshy-3d' }); }
      if (t.thumbnail_url) { await download(t.thumbnail_url, `${base}-thumb.png`); saveAsset(v.id, `${base}-thumb.png`, { category: 'render', label: '3D model preview', mime: 'image/png', source: 'generated:meshy-3d' }); }
      setJob(jobId, { status: 'done', progress: 1, message: `3D model saved to ${item.name} (${t.consumed_credits ?? '?'} credits).`, output: { ...out, credits: t.consumed_credits } });
    }
  } catch (e) {
    setJob(jobId, { status: 'error', message: e.message || String(e), output: out });
  }
}

/** Continue Meshy jobs that were running when the server stopped (Meshy keeps tasks for 3 days). */
export function resumeJobs() {
  for (const j of all(`SELECT id FROM jobs WHERE type LIKE 'meshy-%' AND status IN ('queued','running')`)) {
    setJob(j.id, { message: 'Resuming after restart…' });
    setImmediate(() => runJob(j.id));
  }
}
