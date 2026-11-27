import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction } from '../ui.jsx';
import { askReference, REF_LABEL } from '../reference.jsx';
import { SceneEngine } from '../engine/SceneEngine.js';
import { LOOK_DEFAULTS, LOOK_OPTIONS } from '../engine/Landscape.js';

const TIMES = ['morning', 'day', 'sunset', 'night'];
const FIELDS = [['sky', 'Sky'], ['clouds', 'Clouds'], ['hills', 'Far hills'], ['trees', 'Trees'], ['dressing', 'Flowers & bushes'], ['river', 'River (flowing water)'], ['houses', 'Colourful houses'], ['wind', 'Wind'], ['birds', 'Birds']];
const SKY_LABEL = { auto: 'From the lighting', clear: 'Clear', soft: 'Soft pastel', storybook: 'Storybook' };

/**
 * Stage 2 · Landscape: where the story happens. Claude (or simple rules) reads the lyrics, cues and scenery cards and
 * designs the landscape of the whole video plus what is different around each place. Each place gets a live 3D preview
 * made with the same engine as Stage 4. Stage 4 uses it automatically: world → project → place → shot.
 */
export default function LandscapeSection({ episode, cards }) {
  const { toast, health, refreshEpisode } = useStudio();
  const claudeOn = health?.providers?.find((p) => p.id === 'claude')?.state === 'active';
  const [act, busy] = useAction();
  const [st, setSt] = useState(null);
  const load = useCallback(() => api.get(`/api/episodes/${episode.id}/landscape`).then(setSt).catch(() => {}), [episode.id]);
  const placesKey = cards.filter((c) => c.kind === 'location').map((c) => `${c.id}:${c.model_url || ''}`).join(',');
  useEffect(() => { load(); }, [load, placesKey]);
  if (!st) return null;

  const design = (mode) => act(async () => {
    const reference = mode === 'ai' ? await askReference('cast.landscape', 'Design the landscape where the story happens') : undefined;
    if (mode === 'ai' && !reference) return;
    setSt(await api.post(`/api/episodes/${episode.id}/landscape/design`, { mode, reference })); refreshEpisode();
  }, mode === 'ai' ? 'Claude designed the landscape. Stage 4 uses it automatically.' : 'Simple landscape made from the lyrics');
  const setProject = (p) => act(async () => { await api.put(`/api/episodes/${episode.id}/look`, p); await load(); refreshEpisode(); });
  const setPlace = (id, p) => act(async () => { setSt(await api.put(`/api/cards/${id}/landscape`, p)); refreshEpisode(); });
  const L = { ...LOOK_DEFAULTS, ...st.look };

  return (
    <div className="card landscape-section">
      <div className="section-head">
        <div>
          <h3>Landscape · where the story happens</h3>
          <p className="muted small">Around each scenery the studio builds a <b>landscape</b> out to the horizon: sky, clouds, far hills, trees, flowers, ground and the time of day. Design it here from your lyrics and places. Stage 4 uses it in every shot (World Style → this project → each place → a single shot).</p>
        </div>
        <div className="row wrap">
          <button className="btn primary" disabled={busy || !claudeOn || !episode.approved_lyrics_id} title={claudeOn ? 'One Claude call' : 'Connect Claude to use this'} onClick={() => design('ai')}>✨ Design the landscape with Claude</button>
          <button className="btn" disabled={busy || !episode.approved_lyrics_id} onClick={() => design('offline')}>Simple landscape (no AI)</button>
        </div>
      </div>
      {st.plan?.plan && (
        <div className="explain">
          <b>The plan</b> <span className="muted small">· {st.plan.source === 'claude' ? `Claude, reference: ${REF_LABEL[st.plan.reference] || 'My World + my characters'}` : 'simple rules'} · {new Date(st.plan.at).toLocaleString()}</span>
          <div>{st.plan.plan}</div>
        </div>
      )}
      <h4>Whole video</h4>
      <div className="param-grid five">
        {FIELDS.map(([k, label]) => (
          <label key={k} className="field"><span>{label}</span>
            <select value={L[k]} onChange={(e) => setProject({ [k]: e.target.value })}>{LOOK_OPTIONS[k].map((o) => <option key={o} value={o}>{k === 'sky' ? SKY_LABEL[o] : o}</option>)}</select>
          </label>
        ))}
      </div>
      <h4>Each place</h4>
      {!st.sceneries.length && <p className="small muted">No scenery cards yet. Analyze the lyrics or add a Scenery card above; each place then gets its own landscape and preview here.</p>}
      <div className="place-grid">
        {st.sceneries.map((p) => <Place key={p.card_id} place={p} look={st.look} roles={st.roles} onChange={(x) => setPlace(p.card_id, x)} />)}
      </div>
    </div>
  );
}

function Place({ place, look, roles, onChange }) {
  const own = place.landscape || {};
  const base = { ...LOOK_DEFAULTS, ...look };
  return (
    <div className="place">
      <LandscapePreview place={place} look={look} roles={roles} />
      <div className="row wrap between"><b>{place.name}</b>{place.usages?.length > 0 && <span className="small muted">lines {place.usages.map((i) => i + 1).join(', ')}</span>}</div>
      {own.why && <p className="small muted place-why">{own.why}</p>}
      <div className="param-grid">
        <label className="field"><span>Time of day</span>
          <select value={own.time_of_day || 'day'} onChange={(e) => onChange({ time_of_day: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        {FIELDS.map(([k, label]) => (
          <label key={k} className="field"><span>{label}</span>
            <select value={own[k] || ''} onChange={(e) => onChange({ [k]: e.target.value })}>
              <option value="">Whole video ({k === 'sky' ? SKY_LABEL[base[k]] : base[k]})</option>{LOOK_OPTIONS[k].map((o) => <option key={o} value={o}>{k === 'sky' ? SKY_LABEL[o] : o}</option>)}
            </select>
          </label>
        ))}
        <label className="field"><span>Ground colour</span><div className="row"><input type="color" value={own.ground || base.ground || '#8CCB6E'} onChange={(e) => onChange({ ground: e.target.value })} />{own.ground ? <button className="btn tiny ghost" onClick={() => onChange({ ground: '' })}>Auto</button> : <span className="small muted">whole video</span>}</div></label>
        <label className="field"><span>Hill colour</span><div className="row"><input type="color" value={own.hill_tint || base.hill_tint || '#6CC45E'} onChange={(e) => onChange({ hill_tint: e.target.value })} />{own.hill_tint ? <button className="btn tiny ghost" onClick={() => onChange({ hill_tint: '' })}>Auto</button> : <span className="small muted">whole video</span>}</div></label>
      </div>
    </div>
  );
}

/** A wide 3D view of one place with its landscape, made by the Stage 4 engine (so it looks exactly like the video). */
function LandscapePreview({ place, look, roles }) {
  const canvas = useRef(); const engine = useRef(null);
  const [state, setState] = useState('idle');
  const key = JSON.stringify([place.model_url, place.landscape, look]);
  useEffect(() => {
    if (!place.model_url) { setState('none'); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        setState('loading');
        const w = canvas.current.parentElement.clientWidth || 360; const h = Math.round((w * 9) / 16);
        if (!engine.current) engine.current = new SceneEngine(canvas.current, { width: w, height: h, pixelRatio: 1 });
        else engine.current.setSize(w, h);
        await engine.current.load({
          shots: [{ id: -place.card_id, title: place.name, line_from: 0, line_to: 0, setting: { card_id: place.card_id }, actors: [], camera: { preset: 'orbit', size: 'extreme-wide' }, lighting: { preset: place.landscape?.time_of_day || 'day' } }],
          assets: [{ card_id: place.card_id, name: place.name, kind: 'location', model_url: place.model_url, clips: [], landscape: place.landscape || {} }],
          timing: null, duration: 8, audio: null, look: { ...(look || {}), fade_in_out: false }, roles, sections: [],
        });
        if (!alive) return;
        engine.current.renderAt(3.2);
        setState('ready');
      } catch (e) { if (alive) setState(`error: ${e.message}`); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  return (
    <div className="place-preview">
      <canvas ref={canvas} />
      {state === 'none' && <div className="place-overlay">Make or import this scenery's model to see its landscape.</div>}
      {state === 'loading' && <div className="place-overlay">Building the preview…</div>}
      {state.startsWith('error') && <div className="place-overlay">{state}</div>}
    </div>
  );
}
