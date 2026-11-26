// My World → an item's "Send to Meshy" panel. Every option is one explicit, paid Meshy job, and nothing is
// overwritten: results arrive as a new draft version (new model / new colours) or as a rig on a version.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, Confirm } from '../ui.jsx';

const guessRig = (item) => (/\b(dog|pup|puppy|cat|kitten|horse|pony|cow|sheep|goat|pig|fox|wolf|lion|tiger|bear cub|four[- ]legged|quadruped|on all fours)\b/i.test(`${item.name} ${item.description}`) ? 'quadruped' : 'biped');
const RIG = { biped: 'two-legged', quadruped: 'four-legged' };

/** POST with the header that proves the request came from this button click (the server refuses it otherwise). */
const send = async (url, header, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Action': header }, body: JSON.stringify({ ...body, confirm: true }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`); return j;
};

export default function MeshyPanel({ item, version, onChanged }) {
  const { health } = useStudio();
  const [act, busy] = useAction();
  const meshyOn = health?.providers?.find((p) => p.id === 'meshy')?.state === 'active';
  const isChar = item.kind === 'character';
  const [tab, setTab] = useState(isChar ? 'rig' : 'model');
  const [jobs, setJobs] = useState([]);

  // The version we work from: the selected one if it has a 3D model, else the newest one that does.
  const withModel = (v) => v?.assets?.some((a) => a.category === 'model3d');
  const src = withModel(version) ? version : [...item.versions].reverse().find(withModel);
  const rigOn = (v) => v?.assets?.find((a) => a.category === 'rig');
  const srcRig = rigOn(src);
  const rigType = (() => { try { return JSON.parse(srcRig?.notes || '{}').animation_type; } catch { return null; } })() || guessRig(item);
  const basePrompt = src?.spec?.meshy_prompt || item.description || '';

  const [skeleton, setSkeleton] = useState(rigType);
  const [height, setHeight] = useState('');
  const [rigNote, setRigNote] = useState('');
  const [prompt, setPrompt] = useState(basePrompt);
  const [texture, setTexture] = useState(src?.spec?.texture_prompt || '');
  const [alsoRig, setAlsoRig] = useState(isChar);
  const [retex, setRetex] = useState('');
  useEffect(() => { setPrompt(basePrompt); }, [item.id, src?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadJobs = useCallback(() => api.get(`/api/items/${item.id}/jobs`).then(setJobs).catch(() => {}), [item.id]);
  useEffect(() => { loadJobs(); }, [loadJobs]);
  const running = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(async () => { const before = jobs.filter((j) => j.status === 'running' || j.status === 'queued').map((j) => j.id); const l = await api.get(`/api/items/${item.id}/jobs`); setJobs(l); if (l.some((j) => before.includes(j.id) && !['queued', 'running'].includes(j.status))) onChanged(); }, 4000);
    return () => clearInterval(t);
  }, [running, item.id, jobs, onChanged]);

  const after = async () => { await loadJobs(); };
  const rigOnly = !rigNote.trim();
  const doRig = () => act(async () => {
    if (rigOnly) await send(`/api/items/${item.id}/meshy/rig`, 'request-rig', { animation_type: skeleton, height_meters: height || null, version_id: src.id });
    else await send(`/api/items/${item.id}/meshy/model`, 'item-meshy-model', { prompt: `${basePrompt} ${rigNote.trim()}`.trim(), rig: true, rig_type: skeleton, height_meters: height || null, note: `New model + ${RIG[skeleton]} rig. Instructions: ${rigNote.trim()}` });
    await after();
  }, rigOnly ? 'Sent to Meshy for rigging. The rig appears on this version when it is ready.' : 'Sent to Meshy: new model with your instructions, then the rig. It arrives as a new draft version.');
  const doModel = () => act(async () => { await send(`/api/items/${item.id}/meshy/model`, 'item-meshy-model', { prompt, texture_prompt: texture, rig: isChar && alsoRig, rig_type: skeleton, height_meters: height || null }); await after(); }, 'Sent to Meshy. The new model arrives as a draft version.');
  const doRetex = () => act(async () => { await send(`/api/items/${item.id}/meshy/retexture`, 'item-meshy-retexture', { prompt: retex, version_id: src.id }); await after(); }, 'Sent to Meshy. The recoloured model arrives as a draft version.');

  const tabs = [...(isChar ? [['rig', '🦴 Rig it']] : []), ['model', '✏️ Change the model'], ['retex', '🎨 Colours & materials']];
  return (
    <div className="card meshy-panel">
      <div className="section-head">
        <h3 style={{ margin: 0 }}>Send to Meshy</h3>
        <span className="small muted">
          {src ? `Works from ${src.label}` : 'No 3D model yet'}
          {isChar && <> · {srcRig ? `${RIG[rigType]} rig${srcRig.status === 'approved' ? '' : ' (waiting for your approval below)'}` : 'no rig yet'}</>}
        </span>
      </div>
      {!meshyOn && <p className="small warn">Meshy isn’t connected or paid generation is off. Turn it on in AI Connections.</p>}
      <div className="tabs small">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'rig' && (
        <div className="stack-sm">
          <div className="row wrap">
            <label className="small">Skeleton <select value={skeleton} onChange={(e) => setSkeleton(e.target.value)}><option value="biped">Two-legged (walks upright)</option><option value="quadruped">Four-legged (dog, cat, horse…)</option></select></label>
            <label className="small">Height in metres <input type="number" step="0.1" min="0.1" placeholder="auto" value={height} onChange={(e) => setHeight(e.target.value)} style={{ width: 80 }} /></label>
          </div>
          <label className="field"><span>Special instructions <em className="muted">— optional</em></span>
            <textarea rows={2} value={rigNote} placeholder='e.g. "legs further apart, arms held away from the body, tail clear of the legs"' onChange={(e) => setRigNote(e.target.value)} />
          </label>
          <p className="small muted">
            Meshy’s rigging step only takes the skeleton type and height, so it can’t read instructions.
            {rigOnly
              ? <> With no instructions, Meshy rigs the <b>current model</b> of {src?.label || 'this item'} as it is, and adds walk and run clips. About 5 credits.</>
              : <> Because you wrote instructions, Meshy first <b>makes a new model</b> with them (they fix the stance the rig needs), then rigs it with walk and run clips. It arrives as a new draft version. About 35 credits.</>}
          </p>
          <Confirm className="btn primary" disabled={busy || !meshyOn || !src}
            text={rigOnly ? `Send ${item.name} (${src?.label}) to Meshy for a ${RIG[skeleton]} rig? One paid job, about 5 credits.` : `Make a new model of ${item.name} with your instructions and rig it (${RIG[skeleton]})? One paid job, about 35 credits.`}
            onYes={doRig}>Send to Meshy…</Confirm>
        </div>
      )}

      {tab === 'model' && (
        <div className="stack-sm">
          <label className="field"><span>Prompt for the new model <em className="muted">— edit what should change</em></span>
            <textarea rows={5} maxLength={760} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <label className="field"><span>Colours & textures <em className="muted">— optional</em></span>
            <input value={texture} maxLength={700} onChange={(e) => setTexture(e.target.value)} placeholder="e.g. soft lilac fur, cherry-red bandana" />
          </label>
          {isChar && (
            <div className="row wrap">
              <label className="row small"><input type="checkbox" checked={alsoRig} onChange={(e) => setAlsoRig(e.target.checked)} /> Also rig it, with walk and run clips</label>
              {alsoRig && <select value={skeleton} onChange={(e) => setSkeleton(e.target.value)}><option value="biped">two-legged</option><option value="quadruped">four-legged</option></select>}
            </div>
          )}
          <p className="small muted">Your World Style is added automatically.{isChar && alsoRig ? ' The stance the rig needs is added too.' : ''} The result is a new draft version: check it, then lock it. Nothing that is already locked changes.</p>
          <Confirm className="btn primary" disabled={busy || !meshyOn || prompt.trim().length < 10}
            text={`Make a new model of ${item.name}${isChar && alsoRig ? ` with a ${RIG[skeleton]} rig` : ''}? One paid job, about ${isChar && alsoRig ? 35 : 30} credits.`}
            onYes={doModel}>Send to Meshy…</Confirm>
        </div>
      )}

      {tab === 'retex' && (
        <div className="stack-sm">
          <label className="field"><span>New colours & materials <em className="muted">— the shape stays the same</em></span>
            <textarea rows={3} maxLength={600} value={retex} placeholder="e.g. sky-blue fur with a white belly, cherry-red bandana, glossy black nose" onChange={(e) => setRetex(e.target.value)} />
          </label>
          <p className="small muted">Works from {src?.label || '—'}. The result is a new draft version without a rig. Rig it afterwards if it should move.</p>
          <Confirm className="btn primary" disabled={busy || !meshyOn || !src || retex.trim().length < 5}
            text={`Send ${item.name} (${src?.label}) to Meshy for new colours & materials? One paid job; the credits used are shown when it finishes.`}
            onYes={doRetex}>Send to Meshy…</Confirm>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="meshy-jobs">
          <b className="small">Meshy work for {item.name}</b>
          <ul className="small">
            {jobs.slice(0, 6).map((j) => (
              <li key={j.id} className={j.status}>
                {j.status === 'done' ? '✓' : j.status === 'error' ? '✗' : '⏳'} <b>#{j.id}</b> {j.status === 'running' || j.status === 'queued' ? `${Math.round((j.progress || 0) * 100)}% · ` : ''}{j.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
