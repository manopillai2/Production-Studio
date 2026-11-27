import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askReference } from '../reference.jsx';
import LandscapeSection from './LandscapeSection.jsx';
import { api } from '../api.js';
import { useStudio, useAction, Confirm, Placeholder, ReviewBanner } from '../ui.jsx';
import Viewer3D, { Thumb3D } from '../engine/Viewer3D.jsx';
import { thumbnail, modelViews } from '../engine/three-common.js';
import RecipeEditor from './RecipeEditor.jsx';

const KIND_LABEL = { character: 'Characters', location: 'Scenery', prop: 'Props' };
const METHODS = [['procedural', 'Build Locally'], ['local_ai', 'Local AI'], ['import', 'Import Model'], ['meshy', 'Generate in Meshy']];
export function cardStatus(c) {
  if (c.status === 'approved' && !c.saved_at) return ['warn', 'Approved · Not saved to My World'];
  if (c.status === 'approved') return ['ok', c.decision === 'reuse' ? 'Reused from My World' : 'Approved · Saved to My World'];
  return { match: ['info', 'Match in My World — confirm'], draft: ['muted', 'Draft — review the suggestion'], generating: ['running', 'Generating…'], review: ['info', 'Result ready — review'], failed: ['error', 'Failed'] }[c.status] || ['muted', c.status];
}

export default function StageCast() {
  const { episode, setEpisode, refreshEpisode, health, toast } = useStudio();
  const [cards, setCards] = useState([]);
  const [open, setOpen] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [calls, setCalls] = useState(null);
  const [local, setLocal] = useState(null);
  const [act, busy] = useAction();
  const claudeOn = health?.providers?.find((p) => p.id === 'claude')?.state === 'active';
  const lines = useMemo(() => {
    const l = episode.lyrics.find((x) => x.id === episode.approved_lyrics_id);
    return l ? l.sections.flatMap((s) => s.lines).filter((x) => (x.en || x.ta || '').trim()) : [];
  }, [episode]);

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([api.get(`/api/episodes/${episode.id}/cards`), api.get('/api/meshy/calls')]);
    setCards(c); setCalls(m.count);
    return c;
  }, [episode.id]);
  useEffect(() => { load(); api.get('/api/procedural/templates').then(setTemplates); api.get('/api/localai/status').then(setLocal).catch(() => {}); }, [load]);
  const generating = cards.some((c) => c.status === 'generating' || ['queued', 'running'].includes(c.preview_job?.status));
  useEffect(() => { if (!generating) return; const t = setInterval(() => load().then(() => refreshEpisode()), 3000); return () => clearInterval(t); }, [generating, load, refreshEpisode]);
  const update = (c) => { setCards((cs) => cs.map((x) => (x.id === c.id ? c : x))); refreshEpisode(); };

  const analyze = (mode) => act(async () => {
    const reference = mode === 'ai' ? await askReference('cast.analyze', 'Analyze the lyrics: characters, scenery & props') : undefined;
    if (mode === 'ai' && !reference) return;
    const r = await api.post(`/api/episodes/${episode.id}/cards/analyze`, { mode, reference });
    setCards(r.cards); refreshEpisode(); load();
    toast(`${r.cards.length} asset card(s) · ${r.source === 'claude' ? 'Claude' : 'offline'} analysis · Meshy calls made: ${r.meshy_calls}`);
  });
  const unsaved = cards.filter((c) => c.status === 'approved' && !c.saved_at);
  const checkable = cards.filter((c) => c.model_url);
  const [checking, setChecking] = useState(null);
  /** Claude looks at every model and says whether it matches its name (one Claude call per model). */
  const checkAll = async () => {
    for (let i = 0; i < checkable.length; i++) {
      const c = checkable[i]; setChecking(`${i + 1}/${checkable.length}: ${c.name}`);
      try { const images = await modelViews(c.model_url); update(await api.post(`/api/cards/${c.id}/look-check`, { images })); }
      catch (e) { toast(`${c.name}: ${e.message}`, 'error'); }
    }
    setChecking(null); load();
    toast('Look check done. Cards that don’t match their name are marked ⚠.');
  };

  return (
    <div className="stack">
      <ReviewBanner flagKey="cast" />
      <div className="card">
        <div className="section-head">
          <div>
            <h3>Characters, scenery & props</h3>
            <p className="muted small">Reads the <b>approved</b> lyrics, searches My World first, and drafts an editable suggestion for each missing asset. Nothing is generated until you click a method on a card.</p>
          </div>
          <div className="row wrap">
            <button className="btn primary" disabled={busy || !episode.approved_lyrics_id} onClick={() => analyze('offline')}>Analyze lyrics (offline)</button>
            <button className="btn" disabled={busy || !claudeOn || !episode.approved_lyrics_id} title={claudeOn ? 'Uses Claude (paid) — never Meshy' : 'Connect Claude to use this'} onClick={() => analyze('ai')}>✨ Analyze with Claude</button>
            {checkable.length > 0 && (checking
              ? <span className="pill info">Claude is checking {checking}…</span>
              : <Confirm className="btn" disabled={busy || !claudeOn} title={claudeOn ? 'Claude looks at each model (paid Claude calls, never Meshy)' : 'Connect Claude to use this'} text={`Claude looks at pictures of all ${checkable.length} models and says whether each matches its name and description. That is ${checkable.length} Claude calls (no Meshy). Continue?`} onYes={checkAll}>👁 Check all models with Claude…</Confirm>)}
            <AddAsset onAdd={(b) => act(async () => { const c = await api.post(`/api/episodes/${episode.id}/cards`, b); setCards((cs) => [...cs, c]); setOpen(c.id); }, 'Asset card added')} />
          </div>
        </div>
        {!episode.approved_lyrics_id && <div className="alert">Approve the lyrics in Stage 1 first — Stage 2 analyzes the approved version.</div>}
        <div className="row wrap small muted">
          <span className="pill ok" title="Every Meshy request is logged by the server">Meshy calls logged: {calls ?? '…'}</span>
          <span>Analyzing, searching My World, drafting and opening this stage never contact Meshy.</span>
          {local && <span className={`pill ${local.ready ? 'ok' : 'muted'}`} title={local.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label}: ${c.detail}`).join('\n')}>Local AI: {local.ready ? 'ready' : 'not available on this PC'}</span>}
        </div>
      </div>

      <IdeasPanel episode={episode} setEpisode={setEpisode} />

      {unsaved.length > 0 && <div className="alert warn-strong">{unsaved.length} approved asset{unsaved.length > 1 ? 's are' : ' is'} not saved to My World yet: {unsaved.map((c) => c.name).join(', ')}. Use “Download & Save to My World” on {unsaved.length > 1 ? 'each card' : 'the card'}.</div>}

      {['character', 'location', 'prop'].map((kind) => {
        const list = cards.filter((c) => c.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <h4>{KIND_LABEL[kind]}</h4>
            {kind === 'location' && <p className="small muted kind-help"><b>Scenery</b> is the set the characters stand on (a meadow, a lane, a room). You don't need to model the far distance: in Stage 4 the app puts a <b>landscape</b> around every scenery (sky, clouds, far hills, trees, flowers), and you can change it under <b>Look</b>.</p>}
            {kind === 'prop' && <p className="small muted kind-help"><b>Props</b> are things in the scene (a bicycle, a kite, balloons). Sun, moon, stars and clouds work as props or characters placed in the sky.</p>}
            <div className="asset-grid">
              {list.map((c) => {
                const [cls, label] = cardStatus(c);
                return (
                  <button key={c.id} className={`asset-card ${open === c.id ? 'sel' : ''} ${c.status === 'approved' && !c.saved_at ? 'unsaved' : ''}`} onClick={() => setOpen(open === c.id ? null : c.id)}>
                    <Thumb3D url={c.model_url || c.match?.model?.url} size={130} />
                    <div className="asset-card-body">
                      <b>{c.name}</b>
                      <span className={`pill ${cls}`}>{label}</span>
                      <small className="muted">{c.usages.length ? `Lines ${c.usages.map((i) => i + 1).join(', ')}` : 'Not in current lyrics'} · {METHODS.find((m) => m[0] === c.method)?.[1] || c.method}</small>
                      {c.look_check && !c.look_check.stale && (c.look_check.verdict === 'match'
                        ? <small className="lc ok">✓ Claude: looks right</small>
                        : <small className={`lc ${c.look_check.verdict}`} title={c.look_check.issues.join('\n')}>⚠ Looks like: {c.look_check.looks_like}</small>)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {episode.approved_lyrics_id && <LandscapeSection episode={episode} cards={cards} />}

      {!cards.length && <div className="empty">No asset cards yet. Click <b>Analyze lyrics</b>, or add one manually.</div>}

      {open && cards.find((c) => c.id === open) && (
        <CardEditor key={open} card={cards.find((c) => c.id === open)} lines={lines} templates={templates} local={local} anyGenerating={generating}
          update={update} onDelete={() => { setCards((cs) => cs.filter((x) => x.id !== open)); setOpen(null); }} reload={load} />
      )}
    </div>
  );
}

/** The user's own ideas for characters and scenery. Claude follows them in “Analyze with Claude” and “Draft prompt with Claude”. */
function IdeasPanel({ episode, setEpisode }) {
  const saved = episode.cast_notes || {};
  const [n, setN] = useState({ characters: saved.characters || '', scenery: saved.scenery || '' });
  const [act, busy] = useAction();
  const dirty = n.characters !== (saved.characters || '') || n.scenery !== (saved.scenery || '');
  const save = () => act(async () => {
    const r = await api.put(`/api/episodes/${episode.id}/cast-notes`, n);
    setEpisode((e) => ({ ...e, cast_notes: r }));
  }, 'Your ideas are saved. Claude will follow them');
  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h3>Your ideas for Claude</h3>
          <p className="muted small">Optional. Describe how you picture the characters and scenery. Claude follows your ideas when you click <b>Analyze with Claude</b> or <b>Draft prompt with Claude</b>. Your ideas win wherever they differ from Claude's, but the World Style still applies. Leave a box empty to let Claude decide.</p>
        </div>
        {dirty && <button className="btn primary small" disabled={busy} onClick={save}>Save ideas</button>}
      </div>
      <div className="grid2">
        <label className="field"><span>Characters</span>
          <textarea rows={4} value={n.characters} placeholder="e.g. The mother hen is plump and orange with a tiny blue apron. Add three fluffy yellow chicks, each with a different coloured bow." onChange={(e) => setN({ ...n, characters: e.target.value })} /></label>
        <label className="field"><span>Scenery</span>
          <textarea rows={4} value={n.scenery} placeholder="e.g. A sunny farmyard with a red barn, a wooden fence and a small pond. Later the song moves to a moonlit meadow." onChange={(e) => setN({ ...n, scenery: e.target.value })} /></label>
      </div>
    </div>
  );
}

function AddAsset({ onAdd }) {
  const [f, setF] = useState(null);
  if (!f) return <button className="btn" onClick={() => setF({ kind: 'character', name: '', description: '' })}>+ Add asset</button>;
  return (
    <div className="row wrap add-asset">
      <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="character">Character</option><option value="location">Scenery</option><option value="prop">Prop</option></select>
      <input placeholder="Name, e.g. Pip the Sky Bunny" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className="grow" placeholder="Description, e.g. a sky-blue bunny with one crescent-shaped ear and one golden front paw" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <button className="btn primary small" disabled={!f.name.trim()} onClick={() => { onAdd(f); setF(null); }}>Add</button>
      <button className="btn ghost small" onClick={() => setF(null)}>Cancel</button>
    </div>
  );
}

function CardEditor({ card, lines, templates, local, anyGenerating, update, onDelete, reload }) {
  const { health, toast } = useStudio();
  const [act, busy] = useAction();
  const [f, setF] = useState({ name: card.name, description: card.description, signature: card.signature || '', prompt: card.prompt || '', texture_prompt: card.texture_prompt || '', pose: card.pose || 'none', user_notes: card.user_notes || '' });
  const [method, setMethod] = useState(card.method === 'library' ? 'procedural' : card.method || 'procedural');
  const [recipe, setRecipe] = useState(card.recipe);
  const [previewBuf, setPreviewBuf] = useState(null);
  const [info, setInfo] = useState(null);
  const [meshyConfirm, setMeshyConfirm] = useState(false);
  const [rigIt, setRigIt] = useState(card.kind === 'character' && card.rig_type !== 'none');
  const [rigType, setRigType] = useState(card.rig_type || '');
  const [rigNote, setRigNote] = useState(card.rig_note || '');
  const [checkingRig, setCheckingRig] = useState(false);
  // Ask Claude (or the offline guess) which skeleton this character needs, the first time the Meshy box opens.
  const checkRig = async (mode) => {
    setCheckingRig(true);
    try { const r = await api.post(`/api/cards/${card.id}/rig-type`, { mode }); setRigType(r.rig_type); setRigNote(r.rig_note || ''); setRigIt(r.rig_type !== 'none'); if (r.suggested_height && !rigHeight) setRigHeight(String(r.suggested_height)); }
    catch (e) { toast(e.message, 'error'); } finally { setCheckingRig(false); }
  };
  useEffect(() => { if (meshyConfirm && card.kind === 'character' && !rigType) checkRig(); }, [meshyConfirm]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rigHeight, setRigHeight] = useState('');
  const [fromPreview, setFromPreview] = useState(true);
  const [credits, setCredits] = useState(null);
  const ref = useRef();
  const dirtyText = ['name', 'description', 'signature', 'prompt', 'texture_prompt', 'pose', 'user_notes'].some((k) => (f[k] ?? '') !== (card[k] ?? (k === 'pose' ? 'none' : '')));
  const recipeDirty = JSON.stringify(recipe) !== JSON.stringify(card.recipe);
  const meshyOn = health?.providers?.find((p) => p.id === 'meshy')?.state === 'active';
  const claudeOn = health?.providers?.find((p) => p.id === 'claude')?.state === 'active';
  const [cls, label] = cardStatus(card);

  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);
  useEffect(() => { setRecipe(card.recipe); }, [card.recipe]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live suggestion preview (procedural only, nothing saved). Debounced.
  useEffect(() => {
    if (method !== 'procedural' || !recipe) { setPreviewBuf(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch('/api/procedural/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipe }) });
      if (r.ok) setPreviewBuf(await r.arrayBuffer());
    }, 350);
    return () => clearTimeout(t);
  }, [recipe, method]);

  const save = () => act(async () => update(await api.put(`/api/cards/${card.id}`, f)), 'Saved');
  const call = (fn, msg) => act(async () => { const c = await fn(); update(c.card || c); return c; }, msg);
  const saveToWorld = () => act(async () => {
    const r = await api.post(`/api/cards/${card.id}/save-to-world`);
    update(r.card);
    const a = document.createElement('a'); a.href = r.download_url; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
    toast(`Saved to My World. A .glb download was also offered — your browser decides where it goes.`);
  });
  const showingResult = !!card.model_url;

  return (
    <div className="card card-editor" ref={ref}>
      <div className="section-head">
        <div className="row wrap">
          <h3 style={{ margin: 0 }}>{card.name}</h3>
          <span className={`pill ${cls}`}>{label}</span>
          {card.error && <span className="error-text small">{card.error}</span>}
        </div>
        <div className="row">
          {card.status !== 'approved' && <Confirm text="Delete this card?" onYes={() => act(async () => { await api.del(`/api/cards/${card.id}`); onDelete(); })}>Delete</Confirm>}
        </div>
      </div>

      <StyleBanners card={card} call={call} busy={busy} />

      <div className="grid2">
        <label className="field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>Recognizable features (kept in every version)</span><input value={f.signature} placeholder="e.g. one crescent-shaped ear and one golden front paw" onChange={(e) => setF({ ...f, signature: e.target.value })} /></label>
      </div>
      <label className="field"><span>Description</span><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className="field"><span>Your ideas for Claude about {card.kind === 'location' ? 'this place' : card.kind === 'character' ? 'this character' : 'this prop'} <em className="muted">(Claude follows these when drafting the prompt)</em></span>
        <textarea rows={2} value={f.user_notes} placeholder={card.kind === 'location' ? 'e.g. Make it evening with warm lanterns. Keep the river on the left.' : 'e.g. Make her taller than the others, with round glasses. She walks upright like a person.'} onChange={(e) => setF({ ...f, user_notes: e.target.value })} /></label>
      <div className="row wrap small">
        <span className="muted">Used in:</span>
        {card.usages.length ? card.usages.map((i) => <span key={i} className="tag">{i + 1}. {(lines[i]?.en || lines[i]?.ta || '').slice(0, 48)}</span>) : <span className="muted">not in the current lyrics (kept)</span>}
        <span className="grow" />
        {dirtyText && <button className="btn primary small" disabled={busy} onClick={save}>Save text</button>}
      </div>

      {card.status === 'match' && card.match && (
        <div className="match-panel">
          <div className="match-preview">{card.match.model ? <Viewer3D url={card.match.model.url} height={220} /> : card.match.image ? <img src={card.match.image.url} alt="" /> : <div className="media-empty">No preview</div>}</div>
          <div className="stack">
            <b>Found in My World: “{card.match.name}” ({card.match.version_label})</b>
            <p className="small muted">{card.match.description}</p>
            {!card.match.model && <div className="hint warn">This My World item has no 3D model yet — reuse it only if you will import one later.</div>}
            <div className="row wrap">
              <button className="btn approve" disabled={busy} onClick={() => call(() => api.post(`/api/cards/${card.id}/reuse`), `Reusing “${card.match.name}”`)}>✓ Confirm reuse</button>
              <button className="btn" disabled={busy} onClick={() => call(() => api.post(`/api/cards/${card.id}/new-design`), 'Creating a new design instead')}>Create a new design instead</button>
            </div>
            <small className="muted">Confirming reuse makes no generation call — the saved My World copy is used.</small>
          </div>
        </div>
      )}

      {card.decision === 'reuse' && card.status === 'approved' ? (
        <div className="locked">Reusing “{card.library?.name}” from My World ({card.library?.version_label}).
          <button className="btn small" onClick={() => call(() => api.post(`/api/cards/${card.id}/new-design`), 'Switched to a new design')}>Create a new design instead</button>
        </div>
      ) : card.status !== 'match' && (
        <>
          <div className="tabs">{METHODS.map(([k, l]) => <button key={k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)}>{l}</button>)}</div>
          {method === 'procedural' && (
            <div className="method-panel">
              <div className={`mapping ${card.mapping?.supported === false ? 'bad' : ''}`}>
                <div className="row wrap">
                  <b>Suggestion:</b>
                  <span>{card.mapping?.message || 'Not mapped yet.'}</span>
                  <span className="grow" />
                  <button className="btn small" disabled={busy} onClick={() => call(() => api.post(`/api/cards/${card.id}/map`, { description: f.description }), 'Re-mapped from the description')}>Re-map from description</button>
                  <select value="" onChange={(e) => e.target.value && call(() => api.post(`/api/cards/${card.id}/map`, { template: e.target.value }), 'Template chosen')}>
                    <option value="">Choose template…</option>{templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                {card.mapping?.applied?.length > 0 && <div className="small muted">Applied: {card.mapping.applied.join(' · ')}</div>}
                {card.mapping?.unsupported?.length > 0 && <div className="small warn">Not supported offline: {card.mapping.unsupported.join(', ')} — try Local AI, Import Model or Meshy for these.</div>}
              </div>
              {recipe && (
                <div className="build-grid">
                  <div>
                    <div className="muted small">Template: <b>{templates.find((t) => t.key === recipe.template)?.label}</b> · edit parameters below — the preview updates live (not saved until you build).</div>
                    <RecipeEditor templates={templates} recipe={recipe} onChange={setRecipe} />
                  </div>
                  <div className="stack">
                    <div className="muted small">Suggestion preview</div>
                    {previewBuf ? <Viewer3D buffer={previewBuf} height={300} /> : <div className="media-empty">Rendering preview…</div>}
                    <div className="row wrap">
                      <button className="btn primary" disabled={busy || card.status === 'generating'} onClick={() => call(() => api.post(`/api/cards/${card.id}/build`, { recipe }), 'Built locally — review the result below')}>⚒ Build Locally</button>
                      {recipeDirty && <button className="btn small" onClick={() => call(() => api.put(`/api/cards/${card.id}/recipe`, { recipe }), 'Recipe saved')}>Save recipe only</button>}
                      {recipeDirty && <button className="btn ghost small" onClick={() => setRecipe(card.recipe)}>Undo edits</button>}
                    </div>
                    <small className="muted">Offline · no GPU or internet needed · free</small>
                  </div>
                </div>
              )}
            </div>
          )}
          {method === 'local_ai' && <LocalAiPanel card={card} local={local} busy={busy || anyGenerating} call={call} />}
          {method === 'import' && (
            <div className="method-panel">
              <p className="small">Import a static <b>.glb</b> you already have — for example a model downloaded from Meshy's website, or exported from Blender (File → Export → glTF Binary).</p>
              <input type="file" accept=".glb" onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; if (file) call(() => api.upload(`/api/cards/${card.id}/import`, [file].map((x) => Object.assign(x)), {}).then((c) => c), 'Model imported — review it below'); }} />
            </div>
          )}
          {method === 'meshy' && (
            <div className="method-panel">
              <label className="field"><span>Meshy prompt <em className={f.prompt.length > 800 ? 'error-text' : 'muted'}>{f.prompt.length}/800</em></span><textarea rows={3} value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></label>
              <label className="field"><span>Texture prompt <em className="muted">{f.texture_prompt.length}/800</em></span><textarea rows={2} value={f.texture_prompt} onChange={(e) => setF({ ...f, texture_prompt: e.target.value })} /></label>
              <div className="row wrap">
                <select value={f.pose} onChange={(e) => setF({ ...f, pose: e.target.value })}><option value="none">Natural pose</option><option value="a-pose">A-pose (if you'll rig it in Stage 4)</option><option value="t-pose">T-pose</option></select>
                <button className="btn small" disabled={busy || !claudeOn} title={claudeOn ? 'Claude only — no Meshy call' : 'Connect Claude'} onClick={() => act(async () => {
                  if (dirtyText) await api.put(`/api/cards/${card.id}`, f);
                  const reference = await askReference('cast.prompt', `Draft the Meshy prompt for “${card.name}”`); if (!reference) return;
                  const r = await api.post(`/api/cards/${card.id}/draft-prompt`, { reference }); update(r); setF((x) => ({ ...x, prompt: r.prompt, texture_prompt: r.texture_prompt, signature: r.signature || x.signature }));
                }, 'Claude drafted the Meshy prompt (no Meshy call)')}>✨ Draft prompt with Claude</button>
                <button className="btn small" disabled={!meshyOn} title="Makes one free Meshy request" onClick={() => act(async () => setCredits(await api.post('/api/meshy/balance', {})))}>Check Meshy credits</button>
                {credits && <span className="small muted">{credits.balance} credits left</span>}
                {dirtyText && <button className="btn small" onClick={save}>Save prompt</button>}
              </div>
              <MeshyFinalPrompt card={card} />
              {meshyOn && <MeshyPreview card={card} busy={busy} dirtyText={dirtyText} rigBody={{ rig: card.kind === 'character' && rigIt && rigType !== 'none', rig_type: rigType || undefined }} update={update} />}
              {!meshyOn && <Placeholder>Meshy not connected — add your key in AI Connections (Build Locally and Import work without it)</Placeholder>}
              {meshyOn && !meshyConfirm && (
                <button className="btn meshy-btn" disabled={busy || card.status === 'generating' || dirtyText || !f.prompt.trim()} title={dirtyText ? 'Save the prompt first' : card.status === 'generating' ? 'This card is already generating' : ''} onClick={() => setMeshyConfirm(true)}>Generate in Meshy…</button>
              )}
              {meshyConfirm && (
                <div className="confirm-box">
                  {card.preview?.image_path && (
                    <div className="row wrap preview-choice">
                      <label className="check"><input type="radio" checked={fromPreview} onChange={() => setFromPreview(true)} /> Build from the preview image (the model follows that picture)</label>
                      <label className="check"><input type="radio" checked={!fromPreview} onChange={() => setFromPreview(false)} /> Build from the prompt (Meshy text to 3D; may differ from the preview)</label>
                    </div>
                  )}
                  This submits <b>one paid Meshy job</b> for “{card.name}”: shape + texture (about 30 credits){card.kind === 'character' && rigIt && rigType !== 'none' ? <> + <b>{rigType === 'quadruped' ? 'four-legged' : 'two-legged'} rigging</b> (about 5 credits more)</> : ''}. Continue?
                  {card.kind === 'character' && (
                    <div className="rig-choice">
                      <div className="row wrap">
                        <b className="small">Body type for the rig:</b>
                        {checkingRig ? <span className="small muted">Claude is checking what kind of character this is…</span> : (
                          <select value={rigType || 'biped'} onChange={(e) => { setRigType(e.target.value); setRigNote('Chosen by you'); setRigIt(e.target.value !== 'none'); api.put(`/api/cards/${card.id}`, { rig_type: e.target.value }).catch(() => {}); }}>
                            <option value="quadruped">🐾 Four-legged animal (walks on 4 legs)</option>
                            <option value="biped">🧍 Two-legged (stands & walks upright)</option>
                            <option value="none">✨ No rig (no legs — sun, star, cloud…)</option>
                          </select>)}
                        {!checkingRig && <button className="btn ghost tiny" disabled={busy} onClick={() => checkRig()} title="Ask Claude again">↻ Ask Claude</button>}
                      </div>
                      {rigNote && !checkingRig && <div className="small muted">{rigNote}</div>}
                      {rigType !== 'none' && (
                        <div className="row wrap">
                          <label className="check"><input type="checkbox" checked={rigIt} onChange={(e) => setRigIt(e.target.checked)} /> Also rig it for animation (skeleton + walking/running clips for Stage 4)</label>
                          {rigIt && <label className="small">Height (m{rigType === 'quadruped' ? ', optional — blank keeps its own size' : ', optional'}) <input type="number" min="0.1" max="20" step="0.1" style={{ width: 70 }} value={rigHeight} onChange={(e) => setRigHeight(e.target.value)} /></label>}
                        </div>
                      )}
                    </div>
                  )}
                  {card.kind === 'character' && rigIt && rigType === 'biped' && <div className="hint">For a two-legged rig it is modelled <b>standing upright</b>{(!f.pose || f.pose === 'none') ? <> in A-pose (arms slightly out)</> : ''}, so walking and running look clean.</div>}
                  {card.kind === 'character' && rigIt && rigType === 'quadruped' && <div className="hint">For a four-legged rig it is modelled <b>standing on all four legs</b> with clear gaps between them, so Meshy's animal walk and run fit it.</div>}
                  <div className="row">
                    <button className="btn danger" disabled={busy} onClick={() => { setMeshyConfirm(false); act(async () => {
                      const r = await fetch(`/api/cards/${card.id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Action': 'generate-in-meshy' }, body: JSON.stringify({ confirm: true, from_preview: !!(fromPreview && card.preview?.image_path), rig: card.kind === 'character' && rigIt && rigType !== 'none', rig_type: rigType || 'biped', ...(rigIt && rigHeight ? { height_meters: Number(rigHeight) } : {}) }) });
                      const j = await r.json(); if (!r.ok) throw new Error(j.error); update(j); reload();
                    }, card.kind === 'character' && rigIt ? 'Submitted to Meshy — model + rig' : 'Submitted to Meshy — one job'); }}>Yes, generate in Meshy</button>
                    <button className="btn ghost" onClick={() => setMeshyConfirm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {card.rig && <div className="hint ok">🦴 Rigged for animation ({card.rig.animation_type === 'quadruped' ? 'four-legged' : 'two-legged'}) — movement clips: {card.rig.clips.join(', ') || 'none'}. Saving to My World keeps the rig and clips with this character for Stage 4.</div>}
      {card.status === 'generating' && <div className="hint">Generating… this card updates automatically. Up to 10 Meshy generations can run at once.</div>}

      {showingResult && card.decision !== 'reuse' && (
        <div className="result-panel">
          <div className="section-head"><h4 style={{ margin: 0 }}>Result {card.revisions?.[0] ? `· revision ${card.revisions[0].n} (${card.revisions[0].method})` : ''}</h4>
            {info && <span className="muted small mono">{info.triangles.toLocaleString()} triangles · {info.materials} materials{info.textured ? ' · textured' : ''} · {info.size.join(' × ')} m</span>}</div>
          <div className="build-grid">
            <Viewer3D url={card.model_url} height={340} onInfo={setInfo} />
            <div className="stack">
              <div className="row wrap">
                {card.status !== 'approved'
                  ? <button className="btn approve" disabled={busy || card.status === 'generating'} onClick={() => call(() => api.post(`/api/cards/${card.id}/approve`), 'Approved')}>✓ Approve</button>
                  : <button className="btn ghost small" onClick={() => call(() => api.post(`/api/cards/${card.id}/unapprove`), 'Back to review')}>Un-approve</button>}
                {card.status === 'approved' && (
                  <button className={`btn ${card.saved_at ? '' : 'primary'}`} disabled={busy} onClick={saveToWorld}>{card.saved_at ? '⬇ Download .glb again' : '⬇ Download & Save to My World'}</button>
                )}
              </div>
              {card.status === 'approved' && !card.saved_at && <div className="hint warn">Approved · Not saved to My World — this clears only after the library copy is saved.</div>}
              {card.saved_at && <div className="hint ok">Saved in My World as “{card.library?.name}” {card.library?.version_label} — reusable in any project without regenerating.</div>}
              <LookCheck card={card} update={update} claudeOn={claudeOn} />
              <PartColors card={card} call={call} busy={busy} />
              <Revisions card={card} call={call} busy={busy} />
              <FutureTools />
            </div>
          </div>
          <ReviewFeedback card={card} claudeOn={claudeOn} update={update} onRevised={(c) => { setF((x) => ({ ...x, prompt: c.prompt || '', texture_prompt: c.texture_prompt || '', signature: c.signature || x.signature })); setMethod('meshy'); }} />
        </div>
      )}
    </div>
  );
}

/**
 * Under the result: the direction this version was made from, and a box for your review notes.
 * Notes are kept on the version; with Claude connected they also revise the Meshy prompt (Claude only, no Meshy call).
 * Claude keeps applying all earlier notes in every later draft.
 */
function ReviewFeedback({ card, claudeOn, update, onRevised }) {
  const { toast } = useStudio();
  const [act, busy] = useAction();
  const [text, setText] = useState('');
  const rev = card.revisions?.find((r) => r.id === card.revision_id) || card.revisions?.[0];
  if (!rev) return null;
  const d = rev.direction;
  const send = (revise) => act(async () => {
    const reference = revise ? await askReference('cast.feedback', `Revise the prompt for “${card.name}” from your feedback`) : undefined;
    if (revise && !reference) return;
    const c = await api.post(`/api/cards/${card.id}/feedback`, { feedback: text, revise, reference });
    update(c); setText('');
    if (c.revised) { onRevised(c); toast('Claude revised the Meshy prompt from your notes. Check it in the Meshy tab, then preview or generate.'); }
    else toast('Feedback saved on this version');
  });
  return (
    <div className="review-feedback">
      <h4>Direction for this result · #{rev.n}</h4>
      {d ? (
        <div className="stack small">
          <div className="row wrap">
            <span className="tag">{d.from_preview ? 'Built from the preview image' : 'Built from the prompt'}</span>
            {d.pose && d.pose !== 'none' && <span className="tag">{d.pose}</span>}
            {d.rig && <span className="tag">rig: {d.rig === 'quadruped' ? 'four-legged' : 'two-legged'}</span>}
          </div>
          <div className="row wrap direction-body">
            {d.preview_image && <a href={`/media/${d.preview_image}`} target="_blank" rel="noreferrer"><img className="direction-img" src={`/media/${d.preview_image}`} alt="Preview image this model was built from" /></a>}
            <div className="grow stack">
              <div className="muted">Prompt sent to Meshy{d.from_preview ? ' (it made the preview image)' : ''}</div>
              <pre className="final-prompt">{d.prompt || '—'}</pre>
              {!d.from_preview && <div className="muted">Texture: {d.texture_prompt || '—'}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="small muted">{rev.method === 'meshy' ? 'The exact prompt for this older result was not recorded.' : `${rev.note || rev.method}. Its settings are in the tab above.`}{card.prompt ? <> Current Meshy prompt: <i>{card.prompt}</i></> : ''}</div>
      )}
      {rev.feedback?.length > 0 && (
        <ul className="feedback-list small">{rev.feedback.map((f, i) => <li key={i}><span className="muted mono">{f.at?.slice(5, 16).replace('T', ' ')}</span> {f.text}</li>)}</ul>
      )}
      <label className="field"><span>Your feedback: what should change? <em className="muted">(Claude changes only what you mention and keeps everything else)</em></span>
        <textarea rows={3} value={text} placeholder="e.g. Make the ears longer and floppier. Petals more orange. Remove the extra bud on the left." onChange={(e) => setText(e.target.value)} /></label>
      <div className="row wrap">
        {claudeOn
          ? <button className="btn primary small" disabled={busy || !text.trim()} title="Claude only. No Meshy call, no credits" onClick={() => send(true)}>✨ Revise prompt with Claude</button>
          : <span className="small muted">Connect Claude to have your notes rewrite the prompt.</span>}
        <button className="btn small" disabled={busy || !text.trim()} onClick={() => send(false)}>Save note only</button>
        <span className="small muted">Then preview or generate again. Nothing is sent to Meshy until you click there.</span>
      </div>
    </div>
  );
}

/** World Style compliance on a card: uniqueness against locked designs + style version. */
function StyleBanners({ card, call, busy }) {
  const { toast } = useStudio();
  const u = card.uniqueness;
  return (
    <>
      {card.style_stale && (
        <div className="review-banner">
          Made with an older World Style.
          {card.recipe ? <button className="btn small" disabled={busy} onClick={() => call(() => api.post(`/api/cards/${card.id}/apply-style`), 'Current World Style applied to the recipe — click Build Locally to rebuild')}>Apply current World Style</button>
            : <span>Regenerate it to use the current style (the Meshy prompt is always rebuilt with the latest style).</span>}
        </div>
      )}
      {u && !u.unique && (
        <div className="alert warn-strong row wrap">
          <span><b>Too similar to “{u.closest.name}”</b> ({Math.round(u.closest.score * 100)}% alike). Every character in your world must be recognizable on its own, so approval is blocked until it's more distinct.</span>
          <button className="btn small primary" disabled={busy} onClick={() => call(async () => { const r = await api.post(`/api/cards/${card.id}/make-unique`); toast(`Changed: ${r.changes.join(' · ')} — click Build Locally to rebuild`); return r; })}>✨ Make unique</button>
        </div>
      )}
      {u && <div className="small muted">Signature: <b>{u.signature}</b>{u.closest ? ` · closest locked design: ${u.closest.name} (${Math.round(u.closest.score * 100)}% alike, limit ${Math.round(u.limit * 100)}%)` : ' · no similar locked designs'}</div>}
    </>
  );
}

/**
 * A Meshy concept image made from exactly what “Generate in Meshy” will send (same prompt, pose and body shape),
 * so you can see what to expect before paying for a 3D model. About 3 credits.
 */
function MeshyPreview({ card, busy, dirtyText, rigBody, update }) {
  const { toast } = useStudio();
  const [confirm, setConfirm] = useState(false);
  const [plan, setPlan] = useState(null);
  const [sending, setSending] = useState(false);
  const pv = card.preview; const job = card.preview_job;
  const running = ['queued', 'running'].includes(job?.status);
  const bodyKey = JSON.stringify(rigBody);
  useEffect(() => { api.post(`/api/cards/${card.id}/meshy-plan`, rigBody).then(setPlan).catch(() => setPlan(null)); }, [card.id, card.prompt, card.texture_prompt, card.updated_at, bodyKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale = pv && plan && pv.settings && pv.settings !== plan.settings;
  const start = async () => {
    setConfirm(false); setSending(true);
    try {
      const r = await fetch(`/api/cards/${card.id}/meshy-preview`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Action': 'preview-in-meshy' }, body: JSON.stringify({ confirm: true, ...rigBody }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error); update(j); toast('Preview requested from Meshy');
    } catch (e) { toast(e.message, 'error'); } finally { setSending(false); }
  };
  return (
    <div className="meshy-preview">
      <div className="row wrap">
        <b className="small">Preview before you generate</b>
        {!confirm && <button className="btn small" disabled={busy || sending || running || dirtyText} title={dirtyText ? 'Save the prompt first' : 'Meshy draws a picture from exactly the prompt above (about 3 credits)'} onClick={() => setConfirm(true)}>👁 {pv ? 'New preview' : 'Preview in Meshy'} (~3 credits)</button>}
        {confirm && (
          <span className="row wrap">
            <span className="small">Meshy draws one picture from the prompt above, about <b>3 credits</b>. Continue?</span>
            <button className="btn small primary" onClick={start}>Yes, preview</button>
            <button className="btn small ghost" onClick={() => setConfirm(false)}>Cancel</button>
          </span>
        )}
        {running && <span className="small muted">{job.message || 'Making the preview…'}</span>}
        {job?.status === 'error' && <span className="small error-text">{job.message}</span>}
      </div>
      {pv?.image_path && (
        <div className="row wrap preview-body">
          <a href={`/media/${pv.image_path}`} target="_blank" rel="noreferrer"><img className="preview-img" src={`/media/${pv.image_path}`} alt={`Meshy preview of ${card.name}`} /></a>
          <div className="stack small">
            {stale
              ? <div className="hint warn">The prompt, pose or body type changed after this preview. Make a new preview to see the current version.</div>
              : <div className="hint ok">Matches what will be sent now.</div>}
            <span className="muted">Not happy? Edit the prompt or your ideas, then <b>Draft prompt with Claude</b> and preview again. Happy? <b>Generate in Meshy</b> and choose “Build from the preview image” so the model follows this picture.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Exactly what “Generate in Meshy” will send (prompt + World Style + uniqueness clause). */
function MeshyFinalPrompt({ card }) {
  const [mp, setMp] = useState(null);
  useEffect(() => { api.get(`/api/cards/${card.id}/meshy-prompt`).then(setMp).catch(() => setMp(null)); }, [card.id, card.prompt, card.texture_prompt, card.updated_at]);
  if (!mp) return null;
  return (
    <details className="tool" open>
      <summary>Exactly what will be sent to Meshy ({mp.final.length}/800)</summary>
      <pre className="final-prompt">{mp.final}</pre>
      <div className="small muted">Texture: {mp.texture || '—'}</div>
      <div className="small muted">Your World Style summary is attached automatically (unless the prompt already contains it), even if you rewrite the prompt above.</div>
    </details>
  );
}

function PartColors({ card, call, busy }) {
  const [mats, setMats] = useState([]);
  useEffect(() => { api.get(`/api/cards/${card.id}/materials`).then(setMats).catch(() => setMats([])); }, [card.id, card.model_path]);
  if (!mats.length) return null;
  return (
    <details className="tool">
      <summary>Part colours ({mats.length} materials)</summary>
      <p className="small muted">Changing one part keeps every other part untouched{card.method === 'procedural' ? '. For built-locally assets you can also change colours in the recipe above and rebuild.' : '.'} Textured parts are tinted as a whole until texture masks arrive.</p>
      <div className="swatches">
        {mats.map((m) => (
          <label key={m.index} className="swatch" title={`${m.name}${m.textured ? ' (textured)' : ''}`}>
            <input type="color" defaultValue={m.color} disabled={busy} onChange={(e) => { const v = e.target.value; clearTimeout(window.__rc); window.__rc = setTimeout(() => call(() => api.post(`/api/cards/${card.id}/recolor`, { material_index: m.index, color: v }), `Recoloured ${m.name}`), 500); }} />
            <span>{m.name}{m.textured ? ' ▦' : ''}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function Revisions({ card, call, busy }) {
  if (!card.revisions?.length) return null;
  return (
    <details className="tool" open>
      <summary>Version history ({card.revisions.length})</summary>
      <ul className="revisions">
        {card.revisions.map((r, i) => (
          <li key={r.id} className={i === 0 ? 'current' : ''}>
            <b>#{r.n}</b> <span className="tag">{r.method}</span> <span className="small">{r.note}</span> <span className="muted small mono">{r.created_at?.slice(5, 16)}</span>
            {r.feedback?.length > 0 && <div className="small muted">Your notes: {r.feedback.map((f) => f.text).join(' · ')}</div>}
            {i > 0 && <button className="btn tiny" disabled={busy} onClick={() => call(() => api.post(`/api/cards/${card.id}/revisions/${r.id}/restore`), `Restored revision ${r.n}`)}>Restore</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function FutureTools() {
  return (
    <details className="tool">
      <summary>More editing tools (planned)</summary>
      <ul className="small muted planned">
        <li>Painted texture masks — paint an area; recolouring then only affects the masked area</li>
        <li>Masked retexturing — re-texture just the masked area</li>
        <li>Local geometry edits (push/pull, smooth)</li>
        <li>Remeshing (lower triangle count for animation)</li>
        <li>UV tools (unwrap / pack)</li>
      </ul>
      <p className="small muted">Every edit already creates a revision, so these tools will slot into the same history.</p>
    </details>
  );
}

function LocalAiPanel({ card, local, busy, call }) {
  if (!local) return <div className="method-panel muted">Checking Local AI…</div>;
  const cap = (k) => local.capabilities.find((c) => c.key === k);
  return (
    <div className="method-panel">
      <div className="row wrap"><b>{local.model}</b><span className={`pill ${local.ready ? 'ok' : 'muted'}`}>{local.ready ? 'Ready' : 'Not available'}</span><span className="muted small">{local.url}</span></div>
      <ul className="checks">{local.checks.map((c) => <li key={c.key} className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'} {c.label} — <span className="muted">{c.detail}</span></li>)}</ul>
      <div className="small"><b>Capabilities on this machine:</b> {local.capabilities.map((c) => <span key={c.key} className={`tag ${c.available ? '' : 'off'}`} title={c.note}>{c.available ? '✓' : '✗'} {c.label}</span>)}</div>
      <p className="small muted">{local.license}</p>
      <div className="row wrap">
        <label className="btn small">Upload reference image<input type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; if (file) call(() => api.upload(`/api/cards/${card.id}/ref-image`, [file], {}), 'Reference image added'); }} /></label>
        {card.model_url && card.revisions?.some((r) => r.method === 'procedural') && (
          <button className="btn small" disabled={busy} title="Local AI builds what it sees — starting from your World-Style model keeps it in style" onClick={() => call(async () => {
            const dataUrl = await thumbnail(card.model_url, 768);
            const blob = await (await fetch(dataUrl)).blob();
            return api.upload(`/api/cards/${card.id}/ref-image`, [new File([blob], 'world-style-reference.png', { type: 'image/png' })], {});
          }, 'Reference image made from the World-Style model')}>Use the Build Locally model as reference</button>
        )}
        {card.ref_image_path && <img className="ref-thumb" src={`/media/${card.ref_image_path}`} alt="reference" />}
        {card.mapping?.ref_check && <span className={`pill ${card.mapping.ref_check.verdict === 'fits' ? 'ok' : card.mapping.ref_check.verdict === 'partly' ? 'warn' : 'error'}`} title="Colours of the reference image vs your World Style palette">Reference vs World Style: {card.mapping.ref_check.verdict}</span>}
        <button className="btn primary" disabled={busy || !cap('image_to_3d')?.available || !card.ref_image_path} onClick={() => call(() => api.post(`/api/cards/${card.id}/local-ai`, { action: 'shape' }), 'Local AI shape started')}>Generate shape (image → 3D)</button>
        <button className="btn" disabled={busy || !cap('texture')?.available || !card.model_url} title={cap('texture')?.note} onClick={() => call(() => api.post(`/api/cards/${card.id}/local-ai`, { action: 'texture' }), 'Local AI texture refinement started')}>Refine texture</button>
      </div>
      {!local.ready && <small className="muted">Build Locally, Import Model and My World keep working without Local AI. Setup steps are in the README.</small>}
    </div>
  );
}

/** Claude looks at the model (front and side pictures) and says whether it matches the card's name and description. */
function LookCheck({ card, update, claudeOn }) {
  const { toast } = useStudio();
  const [busy, setBusy] = useState(false);
  const lc = card.look_check;
  const run = async () => {
    setBusy(true);
    try { const images = await modelViews(card.model_url); update(await api.post(`/api/cards/${card.id}/look-check`, { images })); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className={`look-check ${lc && !lc.stale ? lc.verdict : ''}`}>
      <div className="row wrap">
        <b className="small">Does it look like “{card.name}”?</b>
        <button className="btn tiny" disabled={busy || !claudeOn} title={claudeOn ? 'One Claude call (no Meshy)' : 'Connect Claude to use this'} onClick={run}>{busy ? 'Claude is looking…' : lc ? '↻ Check again' : '👁 Check with Claude'}</button>
      </div>
      {lc && (
        <div className="small">
          {lc.stale && <div className="muted">This check was for an earlier model. Check again.</div>}
          <div><b>{lc.verdict === 'match' ? '✓ Matches.' : lc.verdict === 'partly' ? '◐ Partly matches.' : '✗ Does not match.'}</b> It looks like: {lc.looks_like}</div>
          {lc.issues?.length > 0 && <ul>{lc.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {lc.suggestion && <div className="muted">{lc.suggestion}</div>}
        </div>
      )}
    </div>
  );
}
