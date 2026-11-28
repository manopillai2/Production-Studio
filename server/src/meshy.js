// Meshy API client — the ONLY module that talks to Meshy.
//
// Rules (enforced here, not just in the UI):
//  * Every request needs a permit. Permits are created only by routes that handle an explicit user click
//    ("Generate in Meshy", "Request rig", "Request clip", "Browse Meshy motions", "Check credits"),
//    plus status checks for a job that was already submitted.
//  * Analysing lyrics, searching My World, drafting prompts, opening Stage 2 and confirming reuse never
//    create permits, so they cannot reach Meshy.
//  * A character's "Generate in Meshy" click can include rigging: shape -> texture -> rig run as one generation.
//  * Up to MESHY_MAX_CONCURRENT (default 10) Meshy jobs at once, one per card/item. No batch generation, no automatic retries or regeneration:
//    after a server restart, already-submitted tasks are only polled; anything not yet submitted is
//    marked as stopped and waits for another explicit click.
//  * Every call is written to the meshy_calls table (verifiable audit log).
import fs from 'node:fs';
import path from 'node:path';
import { one, all, run } from './db.js';
import { MEDIA_DIR } from './paths.js';
import { ProviderError, keyFor, isActive } from './providers.js';

const BASE = process.env.MESHY_BASE_URL || 'https://api.meshy.ai'; // override only for local testing
const PURPOSES = new Set(['generate', 'preview', 'rig', 'animate', 'status', 'balance', 'motion-library']);
const PERMIT = Symbol('meshy-permit');

/** Create a permit. Call this ONLY from a route handling an explicit user action (or a status poll). */
export function permit(purpose, { episodeId = null, ref = '' } = {}) {
  if (!PURPOSES.has(purpose)) throw new Error(`Unknown Meshy purpose ${purpose}`);
  return { [PERMIT]: true, purpose, episodeId, ref: String(ref) };
}

async function call(p, method, url, body) {
  if (!p || p[PERMIT] !== true) throw new ProviderError('Blocked: Meshy can only be called from an explicit user action.', 403);
  if (!isActive('meshy')) {
    throw new ProviderError(keyFor('MESHY_API_KEY') ? 'Paid generation is switched off. Turn it on in AI Connections.' : 'Meshy is not connected. Add your Meshy API key in AI Connections — importing a model works without it.', 400);
  }
  run('INSERT INTO meshy_calls(method,path,purpose,episode_id,ref) VALUES(?,?,?,?,?)', method, url, p.purpose, p.episodeId, p.ref);
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
    403: 'Meshy\'s content filter blocked this prompt or model. Try rewording it.',
    404: 'Meshy no longer has this task (Meshy deletes API tasks after 3 days).',
    429: 'Meshy is busy (rate limit). Wait a moment and click again.',
  }[r.status] || `Meshy error ${r.status}${detail ? `: ${detail}` : ''}`;
  const err = new ProviderError(msg, [401, 402, 404].includes(r.status) ? 400 : 502); err.meshyStatus = r.status; err.meshyDetail = detail;
  throw err;
}

export const meshyCallCount = () => one('SELECT COUNT(*) n FROM meshy_calls').n;
export const balance = (p) => call(p, 'GET', '/openapi/v1/balance');
export const motionLibrary = (p, search = '') => call(p, 'GET', `/openapi/v1/animations/library${search ? `?search=${encodeURIComponent(search)}` : ''}`);

// ---------------- jobs ----------------
const KINDS = { t3d: '/openapi/v2/text-to-3d', i3d: '/openapi/v1/image-to-3d', t2i: '/openapi/v1/text-to-image', rig: '/openapi/v1/rigging', anim: '/openapi/v1/animations', retex: '/openapi/v1/retexture' };
const ACTIVE = `status IN ('queued','running')`;
const setJob = (id, f) => {
  const k = Object.keys(f);
  run(`UPDATE jobs SET ${k.map((x) => `${x}=?`).join(',')}, updated_at=datetime('now') WHERE id=?`, ...k.map((x) => (f[x] !== null && typeof f[x] === 'object' ? JSON.stringify(f[x]) : f[x])), id);
};
const getJob = (id) => { const j = one('SELECT * FROM jobs WHERE id=?', id); return { ...j, params: JSON.parse(j.params), output: JSON.parse(j.output || '{}') }; };

/** Max Meshy jobs in flight at once, across all projects (Meshy's limit is per account; Pro = 10). */
export const MAX_CONCURRENT = Math.max(1, Number(process.env.MESHY_MAX_CONCURRENT) || 10);
const TARGET = { 'meshy-3d': 'card_id', 'meshy-preview': 'card_id', 'meshy-item3d': 'item_id', 'meshy-retexture': 'item_id', 'meshy-rig': 'item_id', 'meshy-anim': 'item_id' };

/** Throws 409 when the account is at its Meshy concurrency limit, or this same card/item already has a job running. */
export function assertCapacity(type, params = {}) {
  const n = one(`SELECT COUNT(*) n FROM jobs WHERE type LIKE 'meshy-%' AND ${ACTIVE}`).n;
  if (n >= MAX_CONCURRENT) throw new ProviderError(`${n} Meshy generations are already running (limit ${MAX_CONCURRENT}). Wait for one to finish.`, 409);
  const key = TARGET[type];
  if (key && params[key] != null) {
    const a = one(`SELECT id FROM jobs WHERE type=? AND ${ACTIVE} AND json_extract(params, '$.${key}')=?`, type, params[key]);
    if (a) throw new ProviderError(`This one is already generating in Meshy (job #${a.id}). Wait for it to finish.`, 409);
  }
}

/** Start one job for one explicit click. `submitPermit` must come from that click. */
export function startJob(type, episodeId, params, message, submitPermit) {
  if (!submitPermit || submitPermit[PERMIT] !== true) throw new ProviderError('Blocked: Meshy jobs need an explicit user action.', 403);
  assertCapacity(type, params);
  const id = Number(run(`INSERT INTO jobs(type,episode_id,status,message,params) VALUES(?,?, 'queued', ?, ?)`, type, episodeId, message, JSON.stringify(params)).lastInsertRowid);
  setImmediate(() => runJob(id, submitPermit));
  return id;
}

async function poll(jobId, kind, taskId, label, from, to, episodeId) {
  const started = Date.now();
  for (;;) {
    const t = await call(permit('status', { episodeId, ref: `job ${jobId}` }), 'GET', `${KINDS[kind]}/${taskId}`);
    const queue = t.status === 'PENDING' && t.preceding_tasks ? ` (queue: ${t.preceding_tasks} ahead)` : '';
    setJob(jobId, { status: 'running', progress: from + (to - from) * ((t.progress || 0) / 100), message: `${label} — ${String(t.status).toLowerCase().replace('_', ' ')} ${t.progress || 0}%${queue}` });
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`Meshy ${t.status.toLowerCase()}: ${t.task_error?.message || 'no details'} (failed tasks are refunded). Edit the prompt and click Generate again if you want another try.`);
    if (Date.now() - started > 60 * 60 * 1000) throw new Error('Meshy took longer than an hour; check the task in your Meshy dashboard.');
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function download(url, rel) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed (${r.status}). Meshy result links expire — generate again if needed.`);
  const abs = path.join(MEDIA_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(await r.arrayBuffer()));
  return rel;
}

let hooks = { onCardPreview: null, onCardResult: null, onCardRig: null, onRigResult: null, onClipResult: null, onCardFailed: null, onItemModel: null, onItemRig: null };

/** Download a finished rig task: the rigged model plus Meshy's basic clips (walking, running...). */
async function downloadRig(t, base) {
  if (!t.result?.rigged_character_glb_url) throw new Error('Meshy finished rigging but returned no rigged model.');
  const files = { rig: await download(t.result.rigged_character_glb_url, `${base}.glb`), clips: [] };
  // basic_animations is either {walking_glb_url: "...", ...} or {walking: {glb_url: "..."}, ...}; armature-only files are skipped.
  const found = [];
  for (const [k, v] of Object.entries(t.result.basic_animations || {})) {
    if (typeof v === 'string' && v && /_glb_url$/.test(k) && !/armature/.test(k)) found.push([k.replace(/_glb_url$/, ''), v]);
    else if (v && typeof v === 'object' && (v.glb_url || v.animation_glb_url)) found.push([k, v.glb_url || v.animation_glb_url]);
  }
  for (const [name, url] of found) files.clips.push({ name: name.replace(/_/g, ' '), path: await download(url, `${base}-${name}.glb`) });
  return files;
}
export const setHooks = (h) => { hooks = { ...hooks, ...h }; };

/**
 * Runs a job. `submitPermit` is present only right after the user's click; after a restart it is null,
 * so tasks that were never submitted can't be submitted automatically.
 */
export async function runJob(jobId, submitPermit = null) {
  const job = getJob(jobId);
  const p = job.params;
  const out = job.output || {};
  const ep = job.episode_id;
  const canSubmit = submitPermit && submitPermit[PERMIT] === true;
  const notSubmitted = () => { throw new Error('Stopped before it reached Meshy (the server restarted). Nothing was charged — click the button again to submit.'); };
  try {
    // meshy-preview: a concept image of exactly what will be sent (same prompt), so you can check it before paying for 3D.
    if (job.type === 'meshy-preview') {
      if (!out.task_id) {
        if (!canSubmit) notSubmitted();
        out.task_id = (await call(submitPermit, 'POST', KINDS.t2i, {
          ai_model: p.ai_model || 'nano-banana', prompt: p.prompt.slice(0, 800),
          ...(p.pose && p.pose !== 'none' ? { pose_mode: p.pose } : {}),
          ...(p.wide ? { aspect_ratio: '16:9' } : {}),
        })).result;
        setJob(jobId, { output: out, status: 'running', message: 'Submitted to Meshy (preview image)…' });
      }
      const t = await poll(jobId, 't2i', out.task_id, 'Preview image', 0.02, 0.9, ep);
      const url = t.image_urls?.[0];
      if (!url) throw new Error('Meshy finished but returned no image.');
      out.image_path = await download(url, `cards/${p.card_id}/preview-${Date.now()}.png`);
      out.credits = t.consumed_credits;
      hooks.onCardPreview?.(p.card_id, { image_path: out.image_path, task_id: out.task_id, prompt: p.prompt, settings: p.settings });
      setJob(jobId, { status: 'done', progress: 1, message: `Preview image ready (${out.credits ?? '?'} credits).`, output: out });
      return;
    }
    // meshy-3d makes a model for a Stage 2 card; meshy-item3d makes a new draft version of a My World item. Same steps.
    if (job.type === 'meshy-3d' || job.type === 'meshy-item3d') {
      const forItem = job.type === 'meshy-item3d';
      const steps = p.rig ? 3 : 2;
      let t;
      if (p.image_path) {
        // Built from the approved preview image: shape AND colours follow that picture (one Meshy task).
        if (!out.refine_id) {
          if (!canSubmit) notSubmitted();
          const img = fs.readFileSync(path.join(MEDIA_DIR, p.image_path));
          out.refine_id = (await call(submitPermit, 'POST', KINDS.i3d, {
            image_url: `data:image/png;base64,${img.toString('base64')}`, ai_model: 'latest', should_texture: true, texture_resolution: '2k',
            should_remesh: true, target_polycount: 30000, target_formats: ['glb', 'fbx'],
            ...(p.pose && p.pose !== 'none' ? { pose_mode: p.pose } : {}),
          })).result;
          setJob(jobId, { output: out, status: 'running', message: 'Submitted to Meshy (3D from your preview image)…' });
        }
        t = await poll(jobId, 'i3d', out.refine_id, `Step ${p.rig ? '1-2/3' : '1/1'}: 3D model from the preview image`, 0.02, p.rig ? 0.65 : 0.95, ep);
      } else {
      if (!out.preview_id) {
        if (!canSubmit) notSubmitted();
        out.preview_id = (await call(submitPermit, 'POST', KINDS.t3d, {
          mode: 'preview', prompt: p.prompt.slice(0, 800), ai_model: 'latest', should_remesh: true, target_polycount: 30000,
          ...(p.pose && p.pose !== 'none' ? { pose_mode: p.pose } : {}), target_formats: ['glb', 'fbx'],
        })).result;
        setJob(jobId, { output: out, status: 'running', message: 'Submitted to Meshy (shape)…' });
      }
      await poll(jobId, 't3d', out.preview_id, `Step 1/${steps}: shape`, 0.02, p.rig ? 0.35 : 0.5, ep);
      // Step 2 (colours/textures) belongs to the same requested generation — it is not a retry.
      if (!out.refine_id) {
        out.refine_id = (await call(submitPermit || permit('generate', { episodeId: ep, ref: `job ${jobId} refine (same generation)` }), 'POST', KINDS.t3d, {
          mode: 'refine', preview_task_id: out.preview_id, texture_resolution: '2k', target_formats: ['glb', 'fbx'],
          ...(p.texture_prompt ? { texture_prompt: p.texture_prompt.slice(0, 800) } : {}),
        })).result;
        setJob(jobId, { output: out });
      }
      t = await poll(jobId, 't3d', out.refine_id, `Step 2/${steps}: colours & textures`, p.rig ? 0.35 : 0.5, p.rig ? 0.65 : 0.95, ep);
      }
      if (!out.model_path) { // once only, also when the job resumes after a restart
        if (!t.model_urls?.glb) throw new Error('Meshy finished but returned no GLB file.');
        const base = forItem ? `world/${p.item_id}/meshy-${Date.now()}` : `cards/${p.card_id}/meshy-${Date.now()}`;
        await download(t.model_urls.glb, `${base}.glb`);
        let thumb = null;
        if (t.thumbnail_url) thumb = await download(t.thumbnail_url, `${base}.png`).catch(() => null);
        out.model_path = `${base}.glb`; out.credits = t.consumed_credits;
        if (forItem) out.version_id = hooks.onItemModel?.(p.item_id, { model_path: out.model_path, thumb_path: thumb, note: p.note || 'New model from Meshy', spec: { meshy_prompt: p.prompt, texture_prompt: p.texture_prompt || '', method: 'meshy', meshy_task_id: out.refine_id } });
        else hooks.onCardResult?.(p.card_id, { model_path: out.model_path, thumb_path: thumb, job_id: jobId, meshy_task_id: out.refine_id });
        setJob(jobId, { output: out });
      }
      if (!p.rig) {
        setJob(jobId, { status: 'done', progress: 1, message: forItem ? `New draft version ready (${out.credits ?? '?'} credits). Check it, then lock it.` : `3D model ready for review (${out.credits ?? '?'} credits).`, output: out });
        return;
      }
      // Step 3 (rigging) was requested with the same click, for this same model - it is not a retry.
      try {
        if (!out.rig_task_id) {
          const rp = submitPermit || permit('rig', { episodeId: ep, ref: `job ${jobId} rig (same generation)` });
          const type = p.animation_type === 'quadruped' ? 'quadruped' : 'biped';
          const body = { input_task_id: out.refine_id, animation_type: type, ...(p.height_meters ? { height_meters: Number(p.height_meters) } : {}) };
          if (type === 'biped') { // finger bones when the hands allow it (see the meshy-rig job below)
            try { out.rig_task_id = (await call(rp, 'POST', KINDS.rig, { ...body, include_fingers: true })).result; out.fingers = true; }
            catch (e) { if (![400, 422].includes(e.meshyStatus)) throw e; out.fingers = false; out.fingers_note = e.meshyDetail || e.message; }
          }
          if (!out.rig_task_id) out.rig_task_id = (await call(rp, 'POST', KINDS.rig, body)).result;
          setJob(jobId, { output: out, message: `Submitted to Meshy (rigging${out.fingers ? ', with finger bones' : out.fingers === false ? ', without finger bones: the hands can’t take them' : ''})...` });
        }
        const rt = await poll(jobId, 'rig', out.rig_task_id, 'Step 3/3: rigging for animation', 0.65, 0.95, ep);
        const files = await downloadRig(rt, out.model_path.replace(/\.glb$/, '-rig'));
        const rigInfo = { model_path: out.model_path, ...files, meshy_rig_task_id: out.rig_task_id, animation_type: p.animation_type || 'biped', created: Date.now() };
        if (forItem) hooks.onItemRig?.(p.item_id, out.version_id, rigInfo);
        else hooks.onCardRig?.(p.card_id, rigInfo);
        setJob(jobId, { status: 'done', progress: 1, message: `3D model + ${p.animation_type === 'quadruped' ? 'four-legged' : 'two-legged'} rig ready for review (movement clips: ${files.clips.map((c) => c.name).join(', ') || 'none'}).`, output: out });
      } catch (e) {
        // The model itself is fine and already saved; only the rig failed.
        setJob(jobId, { status: 'done', progress: 1, message: `3D model ready for review, but rigging failed: ${e.message || e}. You can request a rig again${forItem ? ' from My World' : ' in Stage 4 after saving it to My World'}.`, output: out });
      }
      return;
    }
    if (job.type === 'meshy-retexture') { // new colours/materials on the same shape → a new draft version
      if (!out.task_id) {
        if (!canSubmit) notSubmitted();
        const glb = fs.readFileSync(path.join(MEDIA_DIR, p.model_path));
        out.task_id = (await call(submitPermit, 'POST', KINDS.retex, {
          model_url: `data:model/gltf-binary;base64,${glb.toString('base64')}`, text_style_prompt: p.prompt.slice(0, 600), enable_original_uv: true, enable_pbr: false,
        })).result;
        setJob(jobId, { output: out, status: 'running', message: 'Submitted to Meshy (new colours & materials)…' });
      }
      const t = await poll(jobId, 'retex', out.task_id, 'Changing colours & materials', 0.02, 0.92, ep);
      if (!out.model_path) {
        if (!t.model_urls?.glb) throw new Error('Meshy finished but returned no GLB file.');
        const base = `world/${p.item_id}/retexture-${Date.now()}`;
        await download(t.model_urls.glb, `${base}.glb`);
        const thumb = t.thumbnail_url ? await download(t.thumbnail_url, `${base}.png`).catch(() => null) : null;
        out.model_path = `${base}.glb`; out.credits = t.consumed_credits;
        out.version_id = hooks.onItemModel?.(p.item_id, { model_path: out.model_path, thumb_path: thumb, note: `New colours & materials: ${p.prompt.slice(0, 200)}`, spec: { texture_prompt: p.prompt, method: 'meshy-retexture', from_version_id: p.version_id } });
      }
      setJob(jobId, { status: 'done', progress: 1, message: `New colours & materials ready as a draft version (${out.credits ?? '?'} credits). It has no rig yet: rig it if it should move.`, output: out });
      return;
    }
    if (job.type === 'meshy-rig') {
      if (!out.task_id) {
        if (!canSubmit) notSubmitted();
        const glb = fs.readFileSync(path.join(MEDIA_DIR, p.model_path));
        const type = p.animation_type || 'biped';
        const body = { model_url: `data:model/gltf-binary;base64,${glb.toString('base64')}`, animation_type: type, ...(p.height_meters ? { height_meters: p.height_meters } : {}) };
        // Everything Meshy's rigging can add: finger bones for two-legged characters (no extra credits). Meshy has no
        // face, eye or jaw bones: expressions are painted by the studio (FaceRig). If a model's hands can't take
        // fingers (mitten hands), Meshy answers 422/400 and the rig is made without them.
        if (type === 'biped') {
          try { out.task_id = (await call(submitPermit, 'POST', KINDS.rig, { ...body, include_fingers: true })).result; out.fingers = true; }
          catch (e) { if (![400, 422].includes(e.meshyStatus)) throw e; out.fingers = false; out.fingers_note = e.meshyDetail || e.message; }
        }
        if (!out.task_id) out.task_id = (await call(submitPermit, 'POST', KINDS.rig, body)).result;
        setJob(jobId, { output: out, status: 'running', message: `Submitted to Meshy (rigging${out.fingers ? ', with finger bones' : out.fingers === false ? ', without finger bones: this model’s hands can’t take them' : ''})…` });
      }
      const t = await poll(jobId, 'rig', out.task_id, 'Rigging', 0.02, 0.9, ep);
      const files = await downloadRig(t, `world/${p.item_id}/rig-${Date.now()}`);
      hooks.onRigResult?.(p.item_id, { ...files, meshy_rig_task_id: out.task_id, animation_type: p.animation_type || 'biped', version_id: p.version_id || null });
      setJob(jobId, { status: 'done', progress: 1, message: `Rig ready (${files.clips.length} basic clip(s)). Review and approve it in Stage 4.`, output: { ...out, credits: t.consumed_credits } });
      return;
    }
    if (job.type === 'meshy-anim') {
      if (!out.task_id) {
        if (!canSubmit) notSubmitted();
        out.task_id = (await call(submitPermit, 'POST', KINDS.anim, { rig_task_id: p.rig_task_id, action_id: Number(p.action_id) })).result;
        setJob(jobId, { output: out, status: 'running', message: 'Submitted to Meshy (animation clip)…' });
      }
      const t = await poll(jobId, 'anim', out.task_id, 'Animation clip', 0.02, 0.9, ep);
      if (!t.result?.animation_glb_url) throw new Error('Meshy finished but returned no animation GLB.');
      const rel = await download(t.result.animation_glb_url, `world/${p.item_id}/clip-${Date.now()}.glb`);
      hooks.onClipResult?.(p.item_id, { path: rel, name: p.action_name || `Action ${p.action_id}` });
      setJob(jobId, { status: 'done', progress: 1, message: `Clip “${p.action_name || p.action_id}” ready. Review and approve it in Stage 4.`, output: { ...out, credits: t.consumed_credits } });
    }
  } catch (e) {
    setJob(jobId, { status: 'error', message: e.message || String(e), output: out });
    if (job.type === 'meshy-3d') hooks.onCardFailed?.(p.card_id, e.message || String(e));
  }
}

/** After a restart: poll tasks that were already submitted; never submit anything new. */
export function resumeJobs() {
  for (const j of all(`SELECT id FROM jobs WHERE type LIKE 'meshy-%' AND ${ACTIVE}`)) setImmediate(() => runJob(j.id, null));
}
