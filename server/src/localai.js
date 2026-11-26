// LOCAL AI (optional, hardware-dependent): adapter for a self-hosted Hunyuan3D-2 API server
// (github.com/Tencent-Hunyuan/Hunyuan3D-2, api_server.py: POST /send, GET /status/{uid}).
//
// Evaluated facts (from the project's README / api_server.py / LICENSE, Nov 2026):
//  * Needs an NVIDIA CUDA GPU: ~6 GB VRAM for shape, ~16 GB for shape + texture. CPU mode is not
//    documented, so it is NOT offered here.
//  * api_server.py supports image-to-3D (input "image"); its text-to-image path is commented out, so
//    text-to-3D is not offered. Texturing an existing mesh = {"mesh", "image", "texture": true} and
//    requires the server to run with --enable_tex.
//  * License: Tencent Hunyuan 3D 2.0 Community License — excludes the EU, UK and South Korea; outputs may
//    not be used to improve other AI models; machine-generated content must be identified when published.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { one, all, run } from './db.js';
import { MEDIA_DIR } from './paths.js';

const URL_ = () => (process.env.LOCAL_AI_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const TEX_ENABLED = () => String(process.env.LOCAL_AI_TEXTURE || '').toLowerCase() === 'true';
const MIN_SHAPE_VRAM_GB = 6, MIN_TEXTURE_VRAM_GB = 16;

function detectGpu() {
  const r = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || !r.stdout?.trim()) return { nvidia: false, gpus: [] };
  const gpus = r.stdout.trim().split(/\r?\n/).map((l) => { const [name, mb] = l.split(',').map((s) => s.trim()); return { name, vram_gb: Math.round((Number(mb) / 1024) * 10) / 10 }; });
  return { nvidia: true, gpus };
}
let gpuCache = null;

async function serverReachable() {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`${URL_()}/status/healthcheck`, { signal: ctrl.signal }); clearTimeout(t);
    let device = null; try { device = (await r.json())?.device || null; } catch { /* stock api_server.py replies without a device */ }
    return { reachable: true, http: r.status, device };
  } catch { return { reachable: false }; }
}

/** Free, local status check — shown before any job is offered. */
export async function status() {
  gpuCache ??= detectGpu();
  // If the AI server runs on ANOTHER computer (e.g. a desktop with an NVIDIA card on your network), its hardware
  // is what matters — this laptop's graphics are irrelevant. Trust the server's own start-up checks then.
  const host = (() => { try { return new URL(URL_()).hostname; } catch { return '127.0.0.1'; } })();
  const remote = !['127.0.0.1', 'localhost', '::1'].includes(host);
  const vram = Math.max(0, ...gpuCache.gpus.map((g) => g.vram_gb));
  const srv = await serverReachable();
  const cpu = srv.device === 'cpu'; // tools/hunyuan3d_cpu_server.py — shape-only, no NVIDIA GPU needed
  const checks = cpu ? [
    { key: 'cpu', label: 'CPU mode (no NVIDIA GPU needed)', ok: true, detail: 'Hunyuan3D-2mini shape-only on the CPU — very slow (can take over an hour with 8 GB RAM); no texturing' },
    { key: 'server', label: 'Hunyuan3D CPU server running', ok: true, detail: `${URL_()} responded` },
  ] : remote ? [
    { key: 'gpu', label: 'NVIDIA GPU on the AI server computer', ok: true, detail: `Runs on ${host} — that computer needs an NVIDIA GPU with ≥ ${MIN_SHAPE_VRAM_GB} GB (not checked from here)` },
    { key: 'server', label: 'Hunyuan3D API server reachable', ok: srv.reachable, detail: srv.reachable ? `${URL_()} responded` : `Nothing answering at ${URL_()} — is api_server.py running there with --host 0.0.0.0, and is the port allowed through its firewall?` },
  ] : [
    { key: 'gpu', label: 'NVIDIA GPU (CUDA)', ok: gpuCache.nvidia, detail: gpuCache.nvidia ? gpuCache.gpus.map((g) => `${g.name} · ${g.vram_gb} GB`).join(', ') : 'No NVIDIA GPU on this computer. Intel/AMD integrated graphics can’t run Hunyuan3D (it needs CUDA), and it has no CPU mode. Option: run it on another PC with an NVIDIA card and set LOCAL_AI_URL to that PC.' },
    { key: 'vram', label: `Video memory ≥ ${MIN_SHAPE_VRAM_GB} GB (shape)`, ok: vram >= MIN_SHAPE_VRAM_GB, detail: gpuCache.nvidia ? `${vram} GB available` : 'Shared graphics memory (e.g. Intel Iris Xe) does not count — it is borrowed system RAM' },
    { key: 'server', label: 'Hunyuan3D API server running', ok: srv.reachable, detail: srv.reachable ? `${URL_()} responded` : `Nothing answering at ${URL_()} (start api_server.py — see README)` },
  ];
  const shapeReady = checks.every((c) => c.ok);
  const textureReady = shapeReady && !cpu && TEX_ENABLED() && (remote || vram >= MIN_TEXTURE_VRAM_GB);
  return {
    model: cpu ? 'Hunyuan3D-2mini (CPU, shape only)' : 'Hunyuan3D-2 (mini by default)', url: URL_(), device: cpu ? 'cpu' : 'gpu', checks, ready: shapeReady,
    capabilities: [
      { key: 'image_to_3d', label: 'Image → 3D shape (preview geometry)', available: shapeReady },
      { key: 'texture', label: 'Texture refinement (separate step)', available: textureReady, note: textureReady ? '' : `Needs api_server.py --enable_tex, LOCAL_AI_TEXTURE=true and ≥ ${MIN_TEXTURE_VRAM_GB} GB VRAM` },
      { key: 'text_to_3d', label: 'Text → 3D', available: false, note: 'Not supported by the stock api_server.py (text-to-image path is disabled)' },
      { key: 'multi_image', label: 'Multi-image → 3D', available: false, note: 'Needs the Hunyuan3D-2mv model and a custom server; not wired up' },
      { key: 'cpu', label: 'CPU mode', available: cpu, note: cpu ? 'Shape only, slow' : 'Run tools/hunyuan3d_cpu_server.py (see README)' },
    ],
    license: 'Tencent Hunyuan 3D 2.0 Community License — not licensed in the EU, UK or South Korea; identify AI-generated content when publishing.',
  };
}

// ---------- jobs (one at a time per project — shared check with Meshy in studio.js) ----------
const setJob = (id, f) => { const k = Object.keys(f); run(`UPDATE jobs SET ${k.map((x) => `${x}=?`).join(',')}, updated_at=datetime('now') WHERE id=?`, ...k.map((x) => (f[x] !== null && typeof f[x] === 'object' ? JSON.stringify(f[x]) : f[x])), id); };
let onResult = null; let onFailed = null;
export const setHooks = (h) => { onResult = h.onResult; onFailed = h.onFailed; };

export function startJob(type, episodeId, params, message) {
  const id = Number(run(`INSERT INTO jobs(type,episode_id,status,message,params) VALUES(?,?, 'queued', ?, ?)`, type, episodeId, message, JSON.stringify(params)).lastInsertRowid);
  setImmediate(() => runJob(id));
  return id;
}

async function runJob(jobId) {
  const job = one('SELECT * FROM jobs WHERE id=?', jobId);
  const p = JSON.parse(job.params);
  try {
    const body = { seed: 1234, octree_resolution: 256, num_inference_steps: 30, guidance_scale: 5.0, type: 'glb' };
    body.image = fs.readFileSync(path.join(MEDIA_DIR, p.image_path)).toString('base64');
    if (job.type === 'localai-texture') { body.mesh = fs.readFileSync(path.join(MEDIA_DIR, p.mesh_path)).toString('base64'); body.texture = true; }
    else body.texture = false;
    setJob(jobId, { status: 'running', progress: 0.05, message: 'Sent to local Hunyuan3D server…' });
    const r = await fetch(`${URL_()}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Local AI server error ${r.status}`);
    const { uid } = await r.json();
    const started = Date.now();
    for (;;) {
      await new Promise((res) => setTimeout(res, 3000));
      const s = await (await fetch(`${URL_()}/status/${uid}`)).json();
      if (s.status === 'error') throw new Error(`Local AI failed: ${s.message || 'unknown error'}`);
      if (s.status === 'completed' && s.model_base64) {
        const rel = `cards/${p.card_id}/localai-${job.type === 'localai-texture' ? 'textured' : 'shape'}-${Date.now()}.glb`;
        fs.mkdirSync(path.dirname(path.join(MEDIA_DIR, rel)), { recursive: true });
        fs.writeFileSync(path.join(MEDIA_DIR, rel), Buffer.from(s.model_base64, 'base64'));
        onResult?.(p.card_id, { model_path: rel, method: 'local_ai', note: job.type === 'localai-texture' ? 'Local AI texture refinement' : 'Local AI shape (preview geometry)' });
        setJob(jobId, { status: 'done', progress: 1, message: 'Local AI model ready for review.' });
        return;
      }
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      setJob(jobId, typeof s.progress === 'number'
        ? { progress: Math.min(0.95, Math.max(0.05, s.progress)), message: `Local AI: ${s.message || 'working'}… ${mins} min` }
        : { progress: Math.min(0.9, 0.05 + (Date.now() - started) / 600000), message: `Local AI working… ${mins} min` });
      if (Date.now() - started > 60 * 60 * 1000) throw new Error('Local AI took more than 60 minutes.');
    }
  } catch (e) {
    setJob(jobId, { status: 'error', message: e.message || String(e) });
    onFailed?.(p.card_id, e.message || String(e));
  }
}

/** Local jobs can't be resumed after a restart (the local server's state is unknown) — mark them stopped. */
export function stopStaleJobs() {
  for (const j of all(`SELECT id FROM jobs WHERE type LIKE 'localai-%' AND status IN ('queued','running')`)) setJob(j.id, { status: 'error', message: 'Stopped because the app restarted. Click the button again to run it.' });
}
