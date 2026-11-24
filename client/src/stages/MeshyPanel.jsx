import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useStudio, Placeholder } from '../ui.jsx';

// Credit estimates — keep in sync with server/src/meshy.js (from docs.meshy.ai/en/api/pricing)
const IMAGE_MODELS = [['nano-banana', 'Fast', 3], ['nano-banana-2', 'Balanced', 6], ['gpt-image-2', 'Highest detail', 9]];
const COST_3D = { best: 30, budget: 15 };
const active = (j) => j.status === 'queued' || j.status === 'running';

/** Polls Meshy jobs for the given items; calls onFinished when a job completes or fails. */
export function useMeshyJobs(itemIds, onFinished) {
  const [jobs, setJobs] = useState([]);
  const seen = useRef({});
  const cb = useRef(onFinished);
  cb.current = onFinished;
  const key = itemIds.join(',');
  const load = useCallback(async () => {
    if (!key) { setJobs([]); return []; }
    const list = await api.get(`/api/meshy/jobs?item_ids=${key}`).catch(() => null);
    if (!list) return [];
    for (const j of list) {
      const prev = seen.current[j.id];
      if (prev && active({ status: prev }) && !active(j)) cb.current?.(j);
      seen.current[j.id] = j.status;
    }
    setJobs(list);
    return list;
  }, [key]);
  useEffect(() => { load(); }, [load]);
  const anyActive = jobs.some(active);
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [anyActive, load]);
  return { jobs, refresh: load };
}

export function JobProgress({ jobs }) {
  if (!jobs.length) return null;
  return (
    <ul className="jobs">
      {jobs.slice(0, 4).map((j) => (
        <li key={j.id} className={`job ${j.status}`}>
          <div className="job-head">
            <b>{j.type === 'meshy-3d' ? '3D model' : 'Design image'}</b>
            <span className={`pill ${j.status}`}>{j.status}</span>
            {j.output?.credits != null && <span className="muted small">{j.output.credits} credits</span>}
            <span className="muted small">{j.created_at?.slice(11, 16)}</span>
          </div>
          {active(j) && <progress value={j.progress} max="1" />}
          <div className={j.status === 'error' ? 'error-text' : 'muted'}>{j.message}</div>
        </li>
      ))}
    </ul>
  );
}

export function MeshyPanel({ item, spec, images, jobs, act, busy, onSpecSaved, askClaude, onJobStarted }) {
  const { health, go } = useStudio();
  const st = (id) => health?.providers?.find((p) => p.id === id)?.state;
  const meshyOn = st('meshy') === 'active';
  const claudeOn = st('claude') === 'active';
  const isChar = item.kind !== 'location';
  const [bal, setBal] = useState(null);
  const [pr, setPr] = useState({ meshy_prompt: spec.meshy_prompt || '', texture_prompt: spec.texture_prompt || '' });
  const [imgModel, setImgModel] = useState('nano-banana-2');
  const [multi, setMulti] = useState(item.kind === 'character');
  const [src, setSrc] = useState(images.length ? 'images' : 'text');
  const [quality, setQuality] = useState('best');
  const [pose, setPose] = useState(item.kind === 'character' ? 'a-pose' : 'none');
  const running = jobs.filter(active).length;

  useEffect(() => { setPr({ meshy_prompt: spec.meshy_prompt || '', texture_prompt: spec.texture_prompt || '' }); }, [spec.meshy_prompt, spec.texture_prompt]);
  useEffect(() => { if (images.length && src === 'text' && !pr.meshy_prompt) setSrc('images'); }, [images.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!meshyOn) return;
    api.get('/api/meshy/balance').then(setBal).catch(() => setBal(null));
  }, [meshyOn, running]);

  const dirty = pr.meshy_prompt !== (spec.meshy_prompt || '') || pr.texture_prompt !== (spec.texture_prompt || '');
  const imgCost = IMAGE_MODELS.find((m) => m[0] === imgModel)[2];
  const start = (url, body, msg) => act(async () => { await api.post(url, body); onJobStarted(); }, msg);

  return (
    <div className="card meshy">
      <div className="section-head">
        <h3>🧊 Meshy · images & 3D model</h3>
        {meshyOn
          ? <span className="pill ok">{bal ? `${bal.balance} credits left${bal.monthly_resets_at ? ` · resets ${new Date(bal.monthly_resets_at).toLocaleDateString()}` : ''}` : 'Connected'}</span>
          : <button className="btn small primary" onClick={() => go('connections')}>Connect Meshy</button>}
      </div>

      <div className="meshy-block">
        <div className="row">
          <b className="grow">Prompts for Meshy</b>
          <button className="btn small" disabled={busy || !claudeOn} title={claudeOn ? '' : 'Connect Claude'} onClick={() => askClaude(
            `Write the Meshy prompts for ${item.name}: "meshy_prompt" (the 3D shape) and "texture_prompt" (colors and materials). Each under 700 characters. Make ${item.name} match my world style and locked designs in rendering, but give it a unique silhouette, colors and details so it can't be confused with my other ${isChar ? 'characters' : 'places'}.`)}>
            ✨ Write Meshy prompts with Claude
          </button>
        </div>
        <label className="field"><span>3D shape prompt <em className={pr.meshy_prompt.length > 800 ? 'error-text' : 'muted'}>{pr.meshy_prompt.length}/800</em></span>
          <textarea rows={3} value={pr.meshy_prompt} placeholder="Used for “From prompt” 3D models. Ask Claude to write it from the design and your world style." onChange={(e) => setPr({ ...pr, meshy_prompt: e.target.value })} />
        </label>
        <label className="field"><span>Texture prompt <em className={pr.texture_prompt.length > 800 ? 'error-text' : 'muted'}>{pr.texture_prompt.length}/800</em></span>
          <textarea rows={2} value={pr.texture_prompt} placeholder="Colors and materials (optional, used by Best quality)." onChange={(e) => setPr({ ...pr, texture_prompt: e.target.value })} />
        </label>
        {dirty && <div className="row end"><button className="btn primary small" disabled={busy} onClick={() => act(async () => onSpecSaved(await api.put(`/api/items/${item.id}/spec`, { spec: { ...spec, ...pr } })), 'Meshy prompts saved')}>Save prompts</button></div>}
      </div>

      <div className="meshy-block">
        <b>1 · Design image</b>
        <p className="muted small">Uses the design's image prompt + up to {Math.min(3, images.length)} of its images + your locked designs as style references (max 5 images).</p>
        <div className="row wrap">
          <select value={imgModel} onChange={(e) => setImgModel(e.target.value)}>
            {IMAGE_MODELS.map(([k, label, c]) => <option key={k} value={k}>{label} ({k}) · {c} credits</option>)}
          </select>
          {isChar && <label className="check"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Front / side / back views (best input for 3D)</label>}
          <span className="grow" />
          <button className="btn primary" disabled={!meshyOn || busy} onClick={() => start(`/api/items/${item.id}/meshy/image`, { model: imgModel, multi_view: multi }, 'Meshy is creating the design image…')}>
            Create design image · ≈{imgCost} cr
          </button>
        </div>
      </div>

      <div className="meshy-block">
        <b>2 · 3D model</b>
        <div className="row wrap">
          <div className="seg mini">
            <button className={src === 'images' ? 'on' : ''} onClick={() => setSrc('images')}>From images<small>{Math.min(4, images.length)} newest image(s)</small></button>
            <button className={src === 'text' ? 'on' : ''} onClick={() => setSrc('text')}>From prompt<small>3D shape prompt</small></button>
          </div>
          <select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="best">Best quality (Meshy 7.1) · ≈{COST_3D.best} cr</option>
            <option value="budget">Budget (Meshy 6 lite) · ≈{COST_3D.budget} cr</option>
          </select>
          {isChar && (
            <select value={pose} onChange={(e) => setPose(e.target.value)} title="A-pose makes rigging/animating in Blender easier">
              <option value="a-pose">A-pose (best for animating)</option><option value="t-pose">T-pose</option><option value="none">Natural pose</option>
            </select>
          )}
          <span className="grow" />
          <button className="btn approve" disabled={!meshyOn || busy || (src === 'images' && !images.length) || (src === 'text' && !pr.meshy_prompt.trim()) || dirty}
            title={dirty ? 'Save the prompts first' : ''}
            onClick={() => start(`/api/items/${item.id}/meshy/3d`, { source: src, quality, pose }, 'Meshy is building the 3D model (usually 2–6 minutes)…')}>
            Make 3D model · ≈{COST_3D[quality]} cr
          </button>
        </div>
        <p className="muted small">The .glb (and .fbx for Blender) is downloaded into this design automatically — Meshy deletes API results after 3 days. Credits shown are estimates; failed tasks are refunded.</p>
      </div>

      {!meshyOn && <Placeholder>Add your Meshy API key and switch on paid generation in AI Connections</Placeholder>}
      <JobProgress jobs={jobs} />
    </div>
  );
}
