import { useCallback, useEffect, useRef, useState } from 'react';
import { askReference } from '../reference.jsx';
import { api, fmtTime } from '../api.js';
import { useStudio, useAction, Confirm, ReviewBanner, Placeholder } from '../ui.jsx';
import ScenePlayer from '../engine/ScenePlayer.jsx';
import { MOTIONS, TRAVEL_MOTIONS, CAMERAS, LIGHTING, SET_SIZE, SHOT_SIZES, SIZE_LABEL, PRESET_SIZE, TRANSITIONS, TRANSITION_LABEL, shotTimes } from '../engine/SceneEngine.js';
import { LOOK_DEFAULTS, LOOK_OPTIONS } from '../engine/Landscape.js';
import { movesFor, moveById, RIG_LABEL } from '../engine/moveCatalog.js';

const MOTION_HELP = {
  none: 'Stands still', rise: 'Rises up into place (e.g. Sunny rising)', float: 'Floats up and away (balloons, bubbles)', drift: 'Drifts sideways with a gentle bob (e.g. a cloud)',
  bounce: 'Hops along a path (e.g. Pip bouncing)', twinkle: 'Pulses in size (e.g. stars)', spin: 'Turns around', sway: 'Rocks gently side to side', path: 'Walks or glides to a target position',
  circle: 'Walks around a point (e.g. circling the group)',
};

export default function StageAnimate() {
  const { episode, refreshEpisode, toast, health } = useStudio();
  const claudeOn = health?.providers?.find((p) => p.id === 'claude')?.state === 'active';
  const [scene, setScene] = useState(null);
  const [sel, setSel] = useState(null);
  const [act, busy] = useAction();
  const player = useRef();
  const [note, setNote] = useState('');
  const [doctor, setDoctor] = useState(null); // { issues, thumbs } from the last preview build
  const [panel, setPanel] = useState(null);   // which top panel is open: 'direct' | 'look' | null
  const follow = useRef(true);
  const load = useCallback(() => api.get(`/api/episodes/${episode.id}/scene`).then((s) => { setScene(s); return s; }), [episode.id]);
  useEffect(() => { load().then((s) => { setSel((x) => x ?? s.shots[0]?.id ?? null); setNote((n) => n || s.director?.message || ''); if (!s.shots.length) setPanel('direct'); }); }, [load]);

  const saveTimer = useRef({});
  const patchShot = (id, patch) => {
    setScene((s) => ({ ...s, shots: s.shots.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    clearTimeout(saveTimer.current[id]);
    saveTimer.current[id] = setTimeout(() => api.put(`/api/scene-shots/${id}`, patch).then(() => refreshEpisode()).catch((e) => toast(e.message, 'error')), 400);
  };
  const replaceShots = (shots) => { setScene((s) => ({ ...s, shots })); refreshEpisode(); };
  const lookTimer = useRef(); const lookPending = useRef({});
  const setLook = (p) => {
    setScene((s) => ({ ...s, look: { ...(s.look || {}), ...p } }));
    lookPending.current = { ...lookPending.current, ...p };
    clearTimeout(lookTimer.current);
    lookTimer.current = setTimeout(() => { const body = lookPending.current; lookPending.current = {}; api.put(`/api/episodes/${episode.id}/look`, body).then(() => refreshEpisode()).catch((e) => toast(e.message, 'error')); }, 500);
  };
  /** Apply Shot Doctor fixes (one or many). Several fixes for the same shot are merged. */
  const applyFixes = (list) => {
    const byShot = new Map();
    for (const it of list) {
      if (!it.fix) continue;
      const cur = byShot.get(it.shot_id) || {};
      byShot.set(it.shot_id, { ...cur, ...it.fix, ...(cur.camera && it.fix.camera ? { camera: { ...cur.camera, ...it.fix.camera } } : {}) });
    }
    for (const [id, p] of byShot) patchShot(id, p);
    toast(`${list.length} fix${list.length === 1 ? '' : 'es'} applied. The preview rebuilds and Shot Doctor checks again.`);
  };

  if (!scene) return <div className="muted">Loading…</div>;
  const times = shotTimes(scene.shots, scene.timing, scene.audio?.duration);
  const shot = scene.shots.find((s) => s.id === sel);
  const idx = scene.shots.findIndex((s) => s.id === sel);
  const timingOk = scene.timing?.approved && scene.timing?.audio_id === episode.master_audio_id;
  const issues = doctor?.issues || [];
  const warnCount = (id) => issues.filter((x) => x.shot_id === id && x.level === 'warn').length;
  const infoCount = (id) => issues.filter((x) => x.shot_id === id && x.level !== 'warn').length;
  const toggle = (p) => setPanel((x) => (x === p ? null : p));
  const simplePlan = () => act(async () => { const r = await api.post(`/api/episodes/${episode.id}/scene/propose`, { mode: 'offline', replace: scene.shots.length > 0 }); replaceShots(r.shots); setSel(r.shots[0]?.id); }, 'Simple shot plan made (no AI)');

  return (
    <div className="stack">
      <ReviewBanner flagKey="shots" />
      {!timingOk && <div className="alert">Lyric timing isn't approved in Stage 3 yet — shots use provisional times until it is.</div>}
      {!scene.assets.length && <div className="alert">No approved assets yet — approve characters and scenery in Stage 2.</div>}
      <div className="card animate-top">
        <div className="section-head">
          <div><h3>Shot plan</h3><p className="muted small">{scene.shots.length} shot{scene.shots.length === 1 ? '' : 's'} · plan them with Claude or by hand, set the look of the whole video, then watch the preview and let Shot Doctor check it.</p></div>
          <div className="row wrap">
            <button className={`btn ${panel === 'direct' ? 'primary' : ''}`} onClick={() => toggle('direct')}>🎬 Direct with Claude</button>
            <button className={`btn ${panel === 'look' ? 'primary' : ''}`} onClick={() => toggle('look')}>🎨 Look: landscape & on-screen text</button>
            {scene.shots.length
              ? <Confirm className="btn" disabled={busy} title="Rule-based, no AI: one shot per lyric line" text="Replace the current shot plan with a simple automatic one (no AI)?" onYes={simplePlan}>↻ Simple plan (no AI)…</Confirm>
              : <button className="btn" disabled={busy} onClick={simplePlan}>Simple plan (no AI)</button>}
            <button className="btn" disabled={busy} onClick={() => act(async () => { const s = await api.post(`/api/episodes/${episode.id}/scene-shots`, {}); await load(); setSel(s.id); }, 'Shot added')}>+ Add shot</button>
          </div>
        </div>
        {panel === 'direct' && <DirectorPanel scene={scene} episode={episode} note={note} setNote={setNote} claudeOn={claudeOn} busy={busy} reload={load}
          send={(revise) => act(async () => {
            const reference = await askReference('animate.direct', revise ? 'Change the shot plan from your direction' : 'Make a new shot plan from your direction');
            if (!reference) return;
            const r = await api.post(`/api/episodes/${episode.id}/scene/propose`, { mode: 'ai', revise, replace: true, message: note.trim(), reference });
            replaceShots(r.shots); setSel((cur) => (r.shots.some((x) => x.id === cur) ? cur : r.shots[0]?.id));
            await load();
          }, revise ? 'Claude changed the shot plan — see its response, then watch the preview' : 'Claude made a new shot plan — see its response, then watch the preview')} />}
        {panel === 'look' && <LookPanel look={scene.look || {}} title={scene.title} setLook={setLook} />}
      </div>

      <div className="animate-work">
        <div className="animate-left">
          <div className="card">
            <ScenePlayer ref={player} scene={scene} lines={scene.timing?.lines || []} onBuilt={setDoctor}
              onShot={(k) => { const s = times[k]?.shot; if (s && follow.current) setSel(s.id); }} />
            <div className="row wrap between">
              <label className="check small"><input type="checkbox" defaultChecked onChange={(e) => { follow.current = e.target.checked; }} /> Select the shot that is playing</label>
              <span className="small muted kbd-hint"><kbd>Space</kbd> play / pause · <kbd>←</kbd> <kbd>→</kbd> previous / next shot · <kbd>F</kbd> full screen</span>
            </div>
          </div>
          <div className="shot-strip thumbs">
            {times.map((x, i) => (
              <button key={x.shot.id} className={`shot-chip ${x.shot.id === sel ? 'sel' : ''}`} onClick={() => { setSel(x.shot.id); player.current?.seek(x.start + 0.01); }} title={x.shot.title}>
                {doctor?.thumbs?.[x.shot.id] ? <img src={doctor.thumbs[x.shot.id]} alt="" /> : <span className="thumb-empty">{i + 1}</span>}
                <b>{i + 1}. {x.shot.title}</b>
                <small className="mono">{fmtTime(x.start)} · {x.length.toFixed(1)} s</small>
                {warnCount(x.shot.id) > 0 && <span className="badge warn" title="Shot Doctor problems">{warnCount(x.shot.id)}</span>}
                {!warnCount(x.shot.id) && infoCount(x.shot.id) > 0 && <span className="badge info" title="Shot Doctor tips">{infoCount(x.shot.id)}</span>}
              </button>
            ))}
          </div>
          <ShotDoctor doctor={doctor} times={times} onFix={applyFixes} onSelect={(id) => { setSel(id); const t = times.find((x) => x.shot.id === id); if (t) player.current?.seek(t.start + t.length / 2); }} />
        </div>
        {shot ? (
          <ShotEditor key={shot.id} shot={shot} index={idx} total={scene.shots.length} scene={scene} times={times[idx]} patch={(p) => patchShot(shot.id, p)}
            issues={issues.filter((x) => x.shot_id === shot.id)} onFix={applyFixes}
            onMerge={() => act(async () => replaceShots(await api.post(`/api/scene-shots/${shot.id}/merge-next`)), 'Merged with the next shot')}
            onSplit={() => act(async () => replaceShots(await api.post(`/api/scene-shots/${shot.id}/split`)), 'Shot split')}
            onDelete={() => act(async () => { const r = await api.del(`/api/scene-shots/${shot.id}`); replaceShots(r); setSel(r[0]?.id ?? null); }, 'Shot deleted')}
            onMove={(d) => act(async () => { const ids = scene.shots.map((s) => s.id); const j = idx + d; [ids[idx], ids[j]] = [ids[j], ids[idx]]; replaceShots(await api.post(`/api/episodes/${episode.id}/scene-shots/reorder`, { ids })); })}
            reloadScene={load} />
        ) : <div className="card muted">Select or add a shot.</div>}
      </div>
    </div>
  );
}

/**
 * Shot Doctor: after each preview build the engine checks every shot like a director would (characters too small,
 * cut off, hidden, back to the camera, mostly empty sky, the same framing twice, long still shots) and offers fixes.
 */
export function ShotDoctor({ doctor, times, onFix, onSelect, compact = false }) {
  if (!doctor) return <div className="card doctor muted small">🩺 <b>Shot Doctor</b> checks every shot after you click <b>Generate Preview</b>.</div>;
  const list = doctor.issues || [];
  const warns = list.filter((x) => x.level === 'warn'); const tips = list.filter((x) => x.level !== 'warn');
  const num = (id) => times.findIndex((x) => x.shot.id === id) + 1;
  return (
    <div className="card doctor">
      <div className="section-head">
        <div><h4 style={{ margin: 0 }}>🩺 Shot Doctor</h4>
          <span className="small muted">{list.length ? `${warns.length} problem${warns.length === 1 ? '' : 's'} · ${tips.length} tip${tips.length === 1 ? '' : 's'}` : 'Every shot looks good.'}</span></div>
        {onFix && warns.some((x) => x.fix) && <button className="btn small primary" onClick={() => onFix(warns.filter((x) => x.fix))}>Fix all problems ({warns.filter((x) => x.fix).length})</button>}
      </div>
      {list.length > 0 && (
        <ul className={`doctor-list ${compact ? 'compact' : ''}`}>
          {[...warns, ...tips].map((x, i) => (
            <li key={i} className={x.level}>
              {onSelect ? <button className="link" onClick={() => onSelect(x.shot_id)}>Shot {num(x.shot_id)}</button> : <b>Shot {num(x.shot_id)}</b>}
              <span>{x.text}</span>
              {onFix && x.fix && <button className="btn tiny" onClick={() => onFix([x])}>{x.fixLabel || 'Fix'}</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The look of the whole video: the landscape around the scenery, and what is written on the picture. */
function LookPanel({ look, title, setLook }) {
  const L = { ...LOOK_DEFAULTS, ...look };
  const sel = (k, label, labels = {}) => (
    <label className="field"><span>{label}</span>
      <select value={L[k]} onChange={(e) => setLook({ [k]: e.target.value })}>{LOOK_OPTIONS[k].map((o) => <option key={o} value={o}>{labels[o] || o}</option>)}</select>
    </label>
  );
  return (
    <div className="look-panel">
      <div className="explain">
        <b>Scenery</b> is the set your characters stand on (a meadow, a lane, a bedroom), made in Stage 2.
        The <b>landscape</b> is everything around it out to the horizon: sky, clouds, far hills, trees, flowers and the ground.
        The app builds the landscape for every shot from your World Style colours, so a small scenery model never floats in empty space.
        These settings apply to the whole video and start from <b>World Style → Landscape for every video</b>; any shot can override them (shot editor → Landscape for this shot).
      </div>
      <div className="look-grid">
        <div>
          <div className="row between"><h4 style={{ margin: 0 }}>Landscape</h4><button className="btn tiny ghost" title="Forget this project's landscape choices and use the World Style defaults" onClick={() => setLook({ sky: '', clouds: '', hills: '', trees: '', dressing: '', ground: '', hill_tint: '', transition: '' })}>Use world defaults</button></div>
          <div className="param-grid">
            {sel('sky', 'Sky', { auto: 'From the lighting', clear: 'Clear', soft: 'Soft pastel', storybook: 'Storybook (lilac & pink)' })}
            {sel('clouds', 'Clouds')}
            {sel('hills', 'Far hills')}
            {sel('trees', 'Trees on the hills')}
            {sel('dressing', 'Flowers & bushes around the scenery')}
            {sel('river', 'River (flowing water)', { none: 'None', behind: 'Behind the play area', winding: 'Winding' })}
            {sel('houses', 'Colourful houses')}
            {sel('wind', 'Wind (swaying trees & flowers)')}
            {sel('birds', 'Birds in the sky')}
            {sel('detail', 'Extra detail (flower beds, bunting, rainbow, balloons, butterflies)')}
            <label className="field"><span>Ground colour</span><div className="row"><input type="color" value={L.ground || '#8CCB6E'} onChange={(e) => setLook({ ground: e.target.value })} />{L.ground ? <button className="btn tiny ghost" onClick={() => setLook({ ground: '' })}>Auto</button> : <span className="small muted">auto (World Style)</span>}</div></label>
            <label className="field"><span>Hill colour</span><div className="row"><input type="color" value={L.hill_tint || '#6CC45E'} onChange={(e) => setLook({ hill_tint: e.target.value })} />{L.hill_tint ? <button className="btn tiny ghost" onClick={() => setLook({ hill_tint: '' })}>Auto</button> : <span className="small muted">auto (World Style)</span>}</div></label>
          </div>
        </div>
        <div>
          <h4>On the picture</h4>
          <label className="check"><input type="checkbox" checked={L.title_card} onChange={(e) => setLook({ title_card: e.target.checked })} /> Title card during the intro</label>
          {L.title_card && <label className="field"><span>Title text</span><input value={look.title_text ?? ''} placeholder={title} onChange={(e) => setLook({ title_text: e.target.value })} /></label>}
          <label className="check"><input type="checkbox" checked={L.end_card} onChange={(e) => setLook({ end_card: e.target.checked })} /> End card during the outro</label>
          {L.end_card && <label className="field"><span>End card text</span><input value={L.end_text} onChange={(e) => setLook({ end_text: e.target.value })} /></label>}
          <label className="check"><input type="checkbox" checked={L.karaoke} onChange={(e) => setLook({ karaoke: e.target.checked })} /> Karaoke lyrics (words light up as they are sung)</label>
          <label className="check"><input type="checkbox" checked={L.fade_in_out} onChange={(e) => setLook({ fade_in_out: e.target.checked })} /> Fade in at the start, fade out at the end</label>
          {sel('transition', 'Transitions between shots', TRANSITION_LABEL)}
          <p className="small muted">Auto: a dissolve when the song moves to a new section (verse → chorus), an iris when the place changes, a cut otherwise. The title and end cards need an instrumental intro / outro of at least 1.2 s (Stage 3 timing). Caption font, size and colours: Channel Identity.</p>
        </div>
      </div>
    </div>
  );
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
function Slider({ label, value, min, max, step = 0.1, onChange, fmt = (v) => v.toFixed(1) }) {
  return <label className="field slider"><span>{label} <em className="mono muted">{fmt(num(value))}</em></span><input type="range" min={min} max={max} step={step} value={num(value)} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

/**
 * Direction for Claude. Claude reads it and REWRITES the shot plan (cast per shot, where they go, body actions,
 * looking/turning at each other, camera, lighting). Nothing is animated until you click Generate Preview.
 * The direction is saved with the project, and Claude's response (what it did / couldn't do) stays visible.
 */
/**
 * Claude's proposed fixes in earlier stages. Nothing runs until you tick items and click Approve.
 * Approved new characters/props are generated (paid Meshy), approved and saved to My World, then Claude re-plans.
 */
function Proposals({ episode, director, reload }) {
  const { health } = useStudio();
  const [act, busy] = useAction();
  const props = director?.last?.proposals || [];
  const open = props.filter((p) => p.state === 'proposed');
  const [picked, setPicked] = useState(() => new Set(open.map((p) => p.id)));
  const [replan, setReplan] = useState(true);
  if (!props.length) return null;
  const meshyOn = health?.providers?.find((p) => p.id === 'meshy')?.state === 'active';
  const paid = open.filter((p) => picked.has(p.id) && p.type !== 'manual');
  const running = director?.followup?.status === 'running';
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const approve = () => act(async () => {
    const r = await fetch(`/api/episodes/${episode.id}/director/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Action': 'approve-director-fixes' }, body: JSON.stringify({ ids: [...picked], replan, confirm: true }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error); await reload();
  }, 'Approved. The fixes are being carried out; progress is shown below.');
  const STAGE = { 1: 'Stage 1 · Lyrics', 2: 'Stage 2 · Characters & Scenery', 3: 'Stage 3 · Music & Vocals' };
  return (
    <div className="proposals">
      <b className="small">Claude asks: may I fix these in earlier stages?</b>
      <ul className="small">
        {props.map((p) => (
          <li key={p.id} className={`proposal ${p.state}`}>
            <label className="row">
              <input type="checkbox" disabled={p.state !== 'proposed' || running} checked={p.state === 'proposed' ? picked.has(p.id) : true} onChange={() => toggle(p.id)} />
              <span>
                <b>{p.type === 'new_character' ? `New character: ${p.name}` : p.type === 'new_prop' ? `New prop: ${p.name}` : p.title}</b>
                {p.type === 'new_character' && <em className="muted"> ({p.rig === 'quadruped' ? 'four-legged' : 'two-legged'})</em>}
                {p.state !== 'proposed' && <em className="muted"> · approved</em>}
                {p.why && <div className="muted">{p.why}</div>}
                {p.description && <div>“{p.description}”</div>}
                {p.type === 'manual' && <div>{STAGE[p.stage]}: {p.steps}</div>}
                <div className={p.type === 'manual' ? 'muted' : 'warn'}>{p.cost}</div>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {open.length > 0 && <>
        <label className="row small"><input type="checkbox" checked={replan} onChange={(e) => setReplan(e.target.checked)} /> When the new assets are ready, have Claude plan the shots again with my direction (one more Claude call)</label>
        {paid.length > 0 && !meshyOn && <p className="small warn">Meshy isn’t connected or paid generation is off (AI Connections), so new assets can’t be generated.</p>}
        <div className="row wrap">
          <Confirm className="btn primary" disabled={busy || running || !picked.size || (paid.length > 0 && !meshyOn)}
            text={paid.length ? `Approve ${picked.size} fix(es)? This starts ${paid.length} paid Meshy generation(s), about ${paid.reduce((s, p) => s + (p.type === 'new_character' ? 35 : 30), 0)} credits in total. New assets are approved and saved to My World automatically; you can review or replace them in Stage 2.` : `Approve ${picked.size} step(s)? They are listed as your to-do below.`}
            onYes={approve}>✓ Approve selected ({picked.size})…</Confirm>
          <span className="small muted">Untick anything you don’t want. Nothing is changed or paid for until you approve.</span>
        </div>
      </>}
    </div>
  );
}

/** Progress of approved fixes: Meshy jobs, auto-approve + save, then Claude re-planning. Refreshes itself while running. */
function FollowUp({ episode, director, reload }) {
  const f = director?.followup;
  const { openProject } = useStudio();
  useEffect(() => { if (f?.status !== 'running') return undefined; const t = setInterval(reload, 4000); return () => clearInterval(t); }, [f?.status, reload]);
  if (!f) return null;
  const icon = { done: '✓', failed: '✗', queued: '…', generating: '⏳', todo: '☐' };
  const STAGE_KEY = { 1: 'lyrics', 2: 'cast', 3: 'music' };
  return (
    <div className={`followup ${f.status}`}>
      <div className="row wrap"><b className="small">Approved fixes · {f.status === 'running' ? 'in progress' : f.status === 'waiting' ? 'your steps' : f.status}</b>
        {f.status !== 'running' && <button className="btn ghost tiny" onClick={() => api.post(`/api/episodes/${episode.id}/director/followup/clear`).then(reload)}>Dismiss</button>}
      </div>
      {f.message && <div className="small">{f.message}</div>}
      <ul className="small">
        {f.tasks.map((t) => (
          <li key={t.id}>{icon[t.state] || '•'} <b>{t.type === 'manual' ? t.title : `${t.type === 'new_prop' ? 'Prop' : 'Character'}: ${t.name}`}</b> — {t.message}
            {t.type === 'manual' && <> {t.steps} <button className="btn tiny" onClick={() => openProject(episode.id, STAGE_KEY[t.stage])}>Go to Stage {t.stage}</button></>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DirectorPanel({ scene, episode, note, setNote, claudeOn, busy, send, reload }) {
  const timer = useRef();
  const change = (v) => { setNote(v); clearTimeout(timer.current); timer.current = setTimeout(() => api.put(`/api/episodes/${episode.id}/director`, { message: v }).catch(() => {}), 600); };
  const last = scene.director?.last;
  const hasPlan = scene.shots.length > 0;
  const off = busy || !claudeOn || !note.trim() || scene.director?.followup?.status === 'running';
  const tip = claudeOn ? 'Uses Claude (paid). Never Meshy.' : 'Connect Claude in AI Connections to use this';
  const cast = scene.assets.filter((a) => a.kind === 'character');
  const dur = scene.audio?.duration;
  return (
    <div className="director-note">
      <label className="field"><span>Animation direction for Claude <em className="muted">— saved with this project</em></span>
        <textarea rows={6} value={note} placeholder='e.g. "Milo walks along the path, stops and waves at Wren. Wren wags his tail, raises a paw, then they play together. Wide shot to start, group shot at the end."' onChange={(e) => change(e.target.value)} />
      </label>
      <p className="small muted">
        Claude can use: {cast.length ? cast.map((a) => `${a.name} (${a.body_rig ? (a.body_rig === 'quadruped' ? 'four-legged rig' : 'two-legged rig') : 'no rig: moves but can’t bend'})`).join(', ') : 'no characters yet'}
        {' · '}{scene.lines.length} lyric line{scene.lines.length === 1 ? '' : 's'}{dur ? `, ${dur.toFixed(1)} s` : ''}. Add characters in Stage 2 and lines in Stage 1 for a longer story.
      </p>
      <div className="row wrap">
        {hasPlan
          ? <Confirm className="btn primary" disabled={off} title={tip} text="Throw away the current shot plan and make a new one from this direction?" onYes={() => send(false)}>✨ Make a new plan from this direction…</Confirm>
          : <button className="btn primary" disabled={off} title={tip} onClick={() => send(false)}>✨ Make a plan from this direction</button>}
        {hasPlan && <button className="btn" disabled={off} title={tip} onClick={() => send(true)}>✨ Change the current plan</button>}
      </div>
      <p className="small muted">
        <b>New plan</b>: Claude rewrites every shot from your direction. <b>Change</b>: Claude keeps the current shots and changes only what your direction mentions.
        Either way only the shot plan changes. Then click <b>Generate Preview</b> below to watch it.
      </p>
      {busy && <div className="hint">Claude is reading your direction and planning the shots…</div>}
      {last && (
        <details className="director-result" open={Date.now() - new Date(last.at).getTime() < 10 * 60 * 1000}>
          <summary className="small muted">Claude’s response · {last.mode === 'change' ? 'changed the plan' : 'new plan'} · {new Date(last.at).toLocaleString()} <em>(click to show / hide)</em></summary>
          {last.reply && <p>{last.reply}</p>}
          {last.did?.length > 0 && <><b className="small">Put into the plan</b><ul className="small">{last.did.map((x, i) => <li key={i}>✓ {x}</li>)}</ul></>}
          {last.cannot?.length > 0 && <><b className="small warn">Couldn’t do</b><ul className="small warn">{last.cannot.map((x, i) => <li key={i}>✗ {x}</li>)}</ul></>}
          <Proposals key={last.at} episode={episode} director={scene.director} reload={reload} />
        </details>
      )}
      <FollowUp episode={episode} director={scene.director} reload={reload} />
    </div>
  );
}

function ShotEditor({ shot, index, total, scene, times, patch, onMerge, onSplit, onDelete, onMove, reloadScene, issues = [], onFix }) {
  const lines = scene.lines || [];
  const settings = scene.assets.filter((a) => a.kind === 'location');
  const actorsAvail = scene.assets.filter((a) => a.kind !== 'location');
  const [ai, setAi] = useState(0);
  const actors = shot.actors || [];
  const setActor = (i, p) => patch({ actors: actors.map((a, k) => (k === i ? { ...a, ...p } : a)) });
  const setMotion = (i, p) => setActor(i, { motion: { ...(actors[i].motion || {}), ...p } });
  const a = actors[ai];
  const asset = a && scene.assets.find((x) => x.card_id === a.card_id);
  const cam = shot.camera || {};

  return (
    <div className="card shot-editor">
      <div className="section-head">
        <div className="row"><span className="shot-no">{index + 1}</span><input className="title-input" value={shot.title} onChange={(e) => patch({ title: e.target.value })} /></div>
        <div className="row wrap">
          <button className="btn tiny" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button className="btn tiny" disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button className="btn tiny" disabled={index === total - 1} onClick={onMerge} title="Combine with the next shot">Merge next</button>
          <button className="btn tiny" disabled={(shot.line_to ?? 0) <= (shot.line_from ?? 0)} onClick={onSplit}>Split</button>
          <Confirm className="btn ghost tiny" text="Delete shot?" onYes={onDelete}>✕</Confirm>
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="doctor-list compact">
          {issues.map((x, i) => <li key={i} className={x.level}><span>🩺 {x.text}</span>{x.fix && onFix && <button className="btn tiny" onClick={() => onFix([x])}>{x.fixLabel || 'Fix'}</button>}</li>)}
        </ul>
      )}
      {lines[shot.line_from ?? 0] && <p className="small muted shot-lyric">♪ {lines.slice(shot.line_from ?? 0, (shot.line_to ?? shot.line_from ?? 0) + 1).map((l) => l.text).join(' / ')}</p>}
      <div className="grid2">
        <label className="field"><span>Lyric lines</span>
          <div className="row">
            <select value={shot.line_from ?? 0} onChange={(e) => patch({ line_from: Number(e.target.value), line_to: Math.max(Number(e.target.value), shot.line_to ?? 0) })}>{lines.map((l, i) => <option key={i} value={i}>{i + 1}. {l.text.slice(0, 28)}</option>)}</select>
            <span>to</span>
            <select value={shot.line_to ?? 0} onChange={(e) => patch({ line_to: Number(e.target.value) })}>{lines.map((l, i) => i >= (shot.line_from ?? 0) && <option key={i} value={i}>{i + 1}</option>)}</select>
          </div>
        </label>
        <label className="field"><span>Timing <em className="muted mono">{fmtTime(times?.start)}–{fmtTime(times?.end)}</em></span>
          <div className="row">
            <input type="number" step="0.1" placeholder="auto start" value={shot.start_override ?? ''} onChange={(e) => patch({ start_override: e.target.value === '' ? null : Number(e.target.value) })} />
            <input type="number" step="0.1" placeholder="auto end" value={shot.end_override ?? ''} onChange={(e) => patch({ end_override: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
        </label>
        <label className="field"><span>Setting (scenery)</span>
          <select value={shot.setting?.card_id || ''} onChange={(e) => patch({ setting: e.target.value ? { ...shot.setting, card_id: Number(e.target.value) } : {} })}>
            <option value="">Plain ground</option>{settings.map((s) => <option key={s.card_id} value={s.card_id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Lighting</span>
          <select value={shot.lighting?.preset || 'day'} onChange={(e) => patch({ lighting: { ...(shot.lighting || {}), preset: e.target.value } })}>{Object.keys(LIGHTING).map((k) => <option key={k}>{k}</option>)}</select>
        </label>
      </div>

      {shot.setting?.card_id && <>
        <h4>Scenery placement <em className="muted small">— characters stand on its surface automatically</em></h4>
        <div className="param-grid">
          <Slider label="Scenery size" value={shot.setting.scale ?? 1} min={0.4} max={3} step={0.05} fmt={(v) => `${Math.round(v * SET_SIZE)} m`} onChange={(v) => patch({ setting: { ...shot.setting, scale: v } })} />
          <Slider label="Turn scenery" value={shot.setting.rot_y ?? 0} min={-3.14} max={3.14} step={0.05} fmt={(v) => `${Math.round(v * 57.3)}°`} onChange={(v) => patch({ setting: { ...shot.setting, rot_y: v } })} />
          {['Shift X', 'Sink / raise', 'Shift Z'].map((L, i) => <Slider key={L} label={L} value={shot.setting.offset?.[i] ?? 0} min={i === 1 ? -6 : -10} max={i === 1 ? 2 : 10} onChange={(v) => { const o = [...(shot.setting.offset || [0, 0, 0])]; o[i] = v; patch({ setting: { ...shot.setting, offset: o } }); }} />)}
        </div>
      </>}

      <ShotLandscape shot={shot} scene={scene} patch={patch} />

      <h4>Camera</h4>
      <div className="param-grid">
        <label className="field"><span>Camera move</span><select value={cam.preset || 'wide'} onChange={(e) => patch({ camera: { ...cam, preset: e.target.value } })}>{CAMERAS.map((c) => <option key={c} value={c}>{CAMERA_LABEL[c] || c}</option>)}</select></label>
        <label className="field"><span>Shot size</span><select value={cam.size || 'auto'} onChange={(e) => patch({ camera: { ...cam, size: e.target.value } })}>{SHOT_SIZES.map((z) => <option key={z} value={z}>{z === 'auto' ? `Auto (${PRESET_SIZE[cam.preset || 'wide']})` : SIZE_LABEL[z]}</option>)}</select></label>
        <label className="field"><span>Transition into this shot</span><select value={cam.transition || 'auto'} disabled={index === 0} onChange={(e) => patch({ camera: { ...cam, transition: e.target.value } })}>{TRANSITIONS.map((z) => <option key={z} value={z}>{z === 'auto' ? 'Project default' : TRANSITION_LABEL[z]}</option>)}</select></label>
        {(['closeup', 'follow'].includes(cam.preset) || ['medium', 'closeup'].includes(cam.size)) && <label className="field"><span>Who the camera is on</span><select value={cam.target ?? 0} onChange={(e) => patch({ camera: { ...cam, target: Number(e.target.value) } })}>{actors.map((x, i) => <option key={i} value={i}>{scene.assets.find((s) => s.card_id === x.card_id)?.name || `Actor ${i + 1}`}</option>)}</select></label>}
        <Slider label="Lens (FOV)" value={cam.fov ?? 40} min={20} max={70} step={1} fmt={(v) => `${v}°`} onChange={(v) => patch({ camera: { ...cam, fov: v } })} />
        <Slider label="Distance" value={cam.distance ?? 1} min={0.5} max={2} step={0.05} fmt={(v) => `×${v.toFixed(2)}`} onChange={(v) => patch({ camera: { ...cam, distance: v } })} />
        <Slider label="Camera height" value={cam.height ?? 0} min={-1} max={4} onChange={(v) => patch({ camera: { ...cam, height: v } })} />
        {cam.preset === 'pan' && <Slider label="Pan amount" value={cam.amount ?? 1.5} min={0} max={6} onChange={(v) => patch({ camera: { ...cam, amount: v } })} />}
      </div>

      <div className="section-head">
        <h4 style={{ margin: 0 }}>Characters & props in this shot</h4>
        <select value="" onChange={(e) => { if (!e.target.value) return; patch({ actors: [...actors, { card_id: Number(e.target.value), pos: [0, 0, 0.5], rot: [0, 0, 0], scale: 1, motion: { type: 'none' } }] }); setAi(actors.length); }}>
          <option value="">+ Add…</option>{actorsAvail.map((x) => <option key={x.card_id} value={x.card_id}>{x.name}</option>)}
        </select>
      </div>
      <div className="obj-chips">{actors.map((x, i) => <button key={i} className={`chip ${i === ai ? 'on' : ''}`} onClick={() => setAi(i)}>{scene.assets.find((s) => s.card_id === x.card_id)?.name || 'Missing asset'}</button>)}</div>
      {a && (
        <div className="obj-editor">
          <div className="row wrap quick-place">
            <span className="small muted">Quick:</span>
            {[['◀ Left', -2.5], ['Centre', 0], ['Right ▶', 2.5]].map(([L, x]) => <button key={L} className="btn tiny" onClick={() => setActor(ai, { pos: [x, a.pos?.[1] ?? 0, a.pos?.[2] ?? 0.5] })}>{L}</button>)}
            <button className="btn tiny" onClick={() => setActor(ai, { pos: [a.pos?.[0] ?? 0, a.pos?.[1] ?? 0, 1.2] })}>Front</button>
            <button className="btn tiny" onClick={() => setActor(ai, { pos: [a.pos?.[0] ?? 0, a.pos?.[1] ?? 0, -2] })}>Back</button>
            <button className="btn tiny" title="Turn toward the camera" onClick={() => setActor(ai, { rot: [0, 0, 0] })}>☺ Face camera</button>
            <button className="btn tiny" title="Put it in the sky (sun, moon, kite, balloons)" onClick={() => setActor(ai, { pos: [a.pos?.[0] ?? 2, 3.2, -4] })}>☁ In the sky</button>
            <button className="btn tiny" title="Put it back on the ground" onClick={() => setActor(ai, { pos: [a.pos?.[0] ?? 0, 0, Math.min(1.2, a.pos?.[2] ?? 0.5)] })}>⬇ On the ground</button>
          </div>
          <div className="param-grid">
            {['X', 'Y', 'Z'].map((L, i) => <Slider key={L} label={i === 1 ? 'Height above ground (2+ = in the sky)' : `Position ${L}`} value={a.pos?.[i] ?? 0} min={i === 1 ? -2 : -10} max={i === 1 ? 8 : 10} onChange={(v) => { const p = [...(a.pos || [0, 0, 0])]; p[i] = v; setActor(ai, { pos: p }); }} />)}
            <Slider label="Turn" value={a.rot?.[1] ?? 0} min={-3.14} max={3.14} step={0.05} fmt={(v) => `${Math.round(v * 57.3)}°`} onChange={(v) => setActor(ai, { rot: [0, v, 0] })} />
            <Slider label="Scale" value={a.scale ?? 1} min={0.2} max={4} step={0.05} onChange={(v) => setActor(ai, { scale: v })} />
          </div>
          <div className="param-grid">
            <label className="field"><span>Movement</span>
              <select value={a.motion?.type || 'none'} onChange={(e) => setMotion(ai, { type: e.target.value })}>{MOTIONS.map((m) => <option key={m} value={m}>{m} — {MOTION_HELP[m]}</option>)}</select>
            </label>
            {a.motion?.type === 'float' && <><Slider label="Float height" value={a.motion.amount ?? 3} min={0.5} max={8} onChange={(v) => setMotion(ai, { amount: v })} /><Slider label="Float time (s)" value={a.motion.duration ?? 4} min={0.5} max={12} onChange={(v) => setMotion(ai, { duration: v })} /><Slider label="Lift off after (s)" value={a.motion.delay ?? 0} min={0} max={10} onChange={(v) => setMotion(ai, { delay: v })} /></>}
            {a.motion?.type === 'rise' && <><Slider label="Rise height" value={a.motion.amount ?? 3} min={0.5} max={8} onChange={(v) => setMotion(ai, { amount: v })} /><Slider label="Rise time (s)" value={a.motion.duration ?? 4} min={0.5} max={12} onChange={(v) => setMotion(ai, { duration: v })} /><Slider label="Delay (s)" value={a.motion.delay ?? 0} min={0} max={6} onChange={(v) => setMotion(ai, { delay: v })} /></>}
            {a.motion?.type === 'drift' && <><Slider label="Distance" value={a.motion.dx ?? 4} min={-15} max={15} onChange={(v) => setMotion(ai, { dx: v })} /><Slider label="Bob" value={a.motion.bob ?? 0.1} min={0} max={0.6} step={0.02} onChange={(v) => setMotion(ai, { bob: v })} /></>}
            {a.motion?.type === 'bounce' && <><Slider label="Ends at X" value={a.motion.to?.[0] ?? 3} min={-10} max={10} onChange={(v) => setMotion(ai, { to: [v, a.motion.to?.[1] ?? a.pos?.[1] ?? 0, a.motion.to?.[2] ?? a.pos?.[2] ?? 0] })} /><Slider label="Hop height" value={a.motion.height ?? 0.7} min={0.1} max={3} onChange={(v) => setMotion(ai, { height: v })} /><Slider label="Hops" value={a.motion.hops ?? 4} min={1} max={16} step={1} fmt={(v) => v} onChange={(v) => setMotion(ai, { hops: v })} /></>}
            {a.motion?.type === 'twinkle' && <><Slider label="Amount" value={a.motion.amount ?? 0.12} min={0.02} max={0.5} step={0.01} onChange={(v) => setMotion(ai, { amount: v })} /><Slider label="Speed" value={a.motion.speed ?? 3} min={0.2} max={8} onChange={(v) => setMotion(ai, { speed: v })} /></>}
            {(a.motion?.type === 'spin' || a.motion?.type === 'sway') && <Slider label="Speed" value={a.motion.speed ?? 1} min={0.1} max={6} onChange={(v) => setMotion(ai, { speed: v })} />}
            {a.motion?.type === 'path' && ['X', 'Y', 'Z'].map((L, i) => <Slider key={L} label={`Target ${L}`} value={a.motion.to?.[i] ?? a.pos?.[i] ?? 0} min={i === 1 ? -2 : -10} max={i === 1 ? 8 : 10} onChange={(v) => { const t = [...(a.motion.to || a.pos || [0, 0, 0])]; t[i] = v; setMotion(ai, { to: t }); }} />)}
            {a.motion?.type === 'circle' && <>
              {['X', 'Z'].map((L, j) => { const i = j * 2; const c = a.motion.center || [(a.pos?.[0] ?? 0) + 1.5, 0, a.pos?.[2] ?? 0]; return <Slider key={L} label={`Circle centre ${L}`} value={c[i]} min={-10} max={10} onChange={(v) => { const n = [...c]; n[i] = v; setMotion(ai, { center: n }); }} />; })}
              <Slider label="Turns" value={a.motion.turns ?? 1} min={0.25} max={3} step={0.25} fmt={(v) => v.toFixed(2)} onChange={(v) => setMotion(ai, { turns: v })} />
            </>}
          </div>
          {TRAVEL_MOTIONS.includes(a.motion?.type) && <label className="check small"><input type="checkbox" checked={a.face_travel !== false} onChange={(e) => setActor(ai, { face_travel: e.target.checked ? undefined : false })} /> Turns to face where it goes <em className="muted">(untick for riders and vehicles that should keep facing the camera)</em></label>}
          {TRAVEL_MOTIONS.includes(a.motion?.type) && <div className="param-grid"><Slider label="Set off after (s)" value={a.motion.start ?? 0} min={0} max={Math.max(1, Math.floor(times?.length || 10))} step={0.1} onChange={(v) => setMotion(ai, { start: v })} /></div>}
          <BodyActions actor={a} index={ai} actors={actors} asset={asset} scene={scene} length={times?.length || 0} onChange={(p) => setActor(ai, p)} />
          <ClipPicker actor={a} asset={asset} onChange={(clip) => setActor(ai, { clip })} reloadScene={reloadScene} />
          <div className="row end"><button className="btn ghost small" onClick={() => { patch({ actors: actors.filter((_, k) => k !== ai) }); setAi(0); }}>Remove from shot</button></div>
        </div>
      )}
    </div>
  );
}

/** Timed body actions (wave, clap, tail wag…), plus who this character looks at and turns to face. Rigged characters only. */
function BodyActions({ actor, index, actors, asset, scene, length, onChange }) {
  if (!asset || asset.kind !== 'character') return null;
  const moves = movesFor(asset.body_rig);
  const list = actor.actions || [];
  const nameOf = (k) => scene.assets.find((s) => s.card_id === actors[k]?.card_id)?.name || `Actor ${k + 1}`;
  const others = actors.map((_, k) => k).filter((k) => k !== index);
  const setList = (l) => onChange({ actions: l.length ? [...l].sort((p, q) => p.at - q.at) : undefined });
  const fixedClip = !!actor.clip?.asset_id || !!actor.clip?.none;
  return (
    <div className="body-actions">
      <h4>Body actions <em className="muted small">— {asset.body_rig ? `${RIG_LABEL[asset.body_rig]} rig: walks when travelling, idles when standing, plus these actions` : 'no rig: this model can move around but can’t bend'}</em></h4>
      {asset.body_rig && fixedClip && <p className="small warn">A fixed clip is chosen under Body movement below, so these actions are not played. Set it back to “Auto” to use them.</p>}
      {asset.body_rig && <>
        {list.map((x, k) => (
          <div key={k} className="row wrap action-row">
            <select value={x.move} onChange={(e) => setList(list.map((y, j) => (j === k ? { ...y, move: e.target.value, seconds: moveById(e.target.value)?.seconds ?? y.seconds } : y)))}>
              {moves.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <label className="small">at <input type="number" step="0.1" min="0" value={x.at} onChange={(e) => setList(list.map((y, j) => (j === k ? { ...y, at: Math.max(0, Number(e.target.value)) } : y)))} /> s</label>
            <label className="small">for <input type="number" step="0.1" min="0.5" value={x.seconds} onChange={(e) => setList(list.map((y, j) => (j === k ? { ...y, seconds: Math.max(0.5, Number(e.target.value)) } : y)))} /> s</label>
            {/hand|paw/i.test(moveById(x.move)?.desc || '') && <select value={x.hand || 'right'} onChange={(e) => setList(list.map((y, j) => (j === k ? { ...y, hand: e.target.value } : y)))}><option value="right">right</option><option value="left">left</option></select>}
            <button className="btn ghost tiny" onClick={() => setList(list.filter((_, j) => j !== k))}>✕</button>
          </div>
        ))}
        <div className="row wrap">
          <select value="" onChange={(e) => { const m = moveById(e.target.value); if (m) setList([...list, { move: m.id, at: Math.round(Math.min(Math.max(0, length - m.seconds), (list.at(-1)?.at ?? 0) + (list.at(-1)?.seconds ?? 0)) * 10) / 10, seconds: m.seconds }]); }}>
            <option value="">+ Add action…</option>{moves.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>)}
          </select>
          {length > 0 && <span className="small muted">shot is {length.toFixed(1)} s long</span>}
        </div>
      </>}
      {others.length > 0 && (
        <div className="row wrap">
          {asset.body_rig && <label className="small">Looks at <select value={actor.look_at ?? ''} onChange={(e) => onChange({ look_at: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">—</option>{others.map((k) => <option key={k} value={k}>{nameOf(k)}</option>)}</select></label>}
          <label className="small">Turns to face <select value={actor.turn_to ?? ''} onChange={(e) => onChange({ turn_to: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">—</option>{others.map((k) => <option key={k} value={k}>{nameOf(k)}</option>)}</select></label>
        </div>
      )}
    </div>
  );
}

/** Body-bending movement = an animation clip on a rigged model. My World first; import; explicit Meshy request. */
function ClipPicker({ actor, asset, onChange, reloadScene }) {
  const { episode, health, toast } = useStudio();
  const [act, busy] = useAction();
  const [motions, setMotions] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [reqKind, setReqKind] = useState(asset?.rig_type === 'quadruped' ? 'quadruped' : 'biped');
  if (!asset) return null;
  const clips = asset.clips.filter((c) => c.category === 'clip');
  const rigs = asset.clips.filter((c) => c.category === 'rig');
  const meshyOn = health?.providers?.find((p) => p.id === 'meshy')?.state === 'active';
  const c = actor.clip || {};
  const metaRig = rigs.find((r) => { try { return JSON.parse(r.notes || '{}').meshy_rig_task_id; } catch { return false; } });
  const rigKind = (() => { try { return JSON.parse(metaRig?.notes || '{}').animation_type || 'biped'; } catch { return 'biped'; } })();
  const post = async (url, body, header) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Action': header }, body: JSON.stringify({ ...body, confirm: true, episode_id: episode.id }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };

  return (
    <details className="tool" open={!!c.asset_id}>
      <summary>Body movement {c.asset_id ? '· clip' : c.none ? '· static model' : rigs.some((r) => r.status === 'approved') ? '· auto (rig)' : ''} <span className="muted small">(walk, wave… needs a rigged model)</span></summary>
      {!asset.item_id ? <p className="small warn">Save this asset to My World in Stage 2 first — rigs and clips are stored with the My World asset so they can be reused.</p> : (
        <>
          <div className="row wrap">
            <select value={c.none ? 'none' : c.asset_id || ''} onChange={(e) => onChange(e.target.value === 'none' ? { none: true } : e.target.value ? { asset_id: Number(e.target.value), name: '', speed: c.speed ?? 1, offset: 0 } : null)}>
              <option value="">{rigs.some((r) => r.status === 'approved') ? 'Auto — use the rig (walk when moving, idle when standing)' : 'No clip'}</option>
              {rigs.length > 0 && <option value="none">Static model (don’t use the rig)</option>}
              {clips.map((x) => <option key={x.id} value={x.id}>{x.label}{x.status !== 'approved' ? ' (draft — approve to keep)' : ''}</option>)}
            </select>
            {c.asset_id && <><label className="small">Speed <input type="number" step="0.1" min="0.1" value={c.speed ?? 1} onChange={(e) => onChange({ ...c, speed: Number(e.target.value) })} /></label>
              <label className="small">Offset (s) <input type="number" step="0.1" value={c.offset ?? 0} onChange={(e) => onChange({ ...c, offset: Number(e.target.value) })} /></label></>}
          </div>
          <p className="small muted">My World has {clips.length} clip(s) and {rigs.length} rig(s) for this asset.</p>
          <div className="row wrap">
            {[...clips, ...rigs].filter((x) => x.status !== 'approved').map((x) => <button key={x.id} className="btn tiny approve" onClick={() => act(async () => { await api.post(`/api/assets/${x.id}/approve`); await reloadScene(); }, `${x.label} approved and kept in My World`)}>Approve “{x.label}”</button>)}
            <label className="btn small">Import clip (.glb)<input type="file" accept=".glb" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) act(async () => { await api.upload(`/api/items/${asset.item_id}/motion`, [f], { category: 'clip' }); await reloadScene(); }, 'Clip saved to My World'); }} /></label>
            <label className="btn small">Import rigged model (.glb)<input type="file" accept=".glb" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) act(async () => { await api.upload(`/api/items/${asset.item_id}/motion`, [f], { category: 'rig' }); await reloadScene(); }, 'Rig saved to My World'); }} /></label>
          </div>
          <div className="meshy-row">
            {!meshyOn ? <Placeholder>Meshy rig/clip requests need a Meshy key (imports work without it)</Placeholder> : (
              <div className="row wrap">
                {confirm === 'rig' ? (
                  <span className="confirm">Submit one paid Meshy rigging job (~5 credits) for {asset.name} as
                    <select value={reqKind} onChange={(e) => setReqKind(e.target.value)}><option value="quadruped">four-legged animal</option><option value="biped">two-legged</option></select>?
                    <button className="btn danger small" disabled={busy} onClick={() => { setConfirm(null); act(async () => { await post(`/api/items/${asset.item_id}/meshy/rig`, { animation_type: reqKind }, 'request-rig'); toast('Rig requested — it appears here as a draft when done'); }); }}>Yes</button>
                    <button className="btn ghost small" onClick={() => setConfirm(null)}>No</button></span>
                ) : <button className="btn small" disabled={busy} onClick={() => setConfirm('rig')}>Request rig in Meshy…</button>}
                {metaRig && <button className="btn small" disabled={busy} onClick={() => act(async () => setMotions(await post('/api/meshy/motions', {}, 'browse')))}>Browse Meshy motions</button>}
              </div>
            )}
            {motions && metaRig && (
              <div className="motion-list">
                {(Array.isArray(motions) ? motions : motions.result || []).filter((m) => (m.rig_type || 'biped') === rigKind).slice(0, 40).map((m) => (
                  <button key={m.action_id} className="chip" onClick={() => setConfirm({ action_id: m.action_id, name: m.name })}>{m.name}</button>
                ))}
              </div>
            )}
            {confirm && typeof confirm === 'object' && (
              <span className="confirm">Submit one paid Meshy clip job (~3 credits): “{confirm.name}”?
                <button className="btn danger small" disabled={busy} onClick={() => { const cf = confirm; setConfirm(null); act(async () => { await post(`/api/items/${asset.item_id}/meshy/clip`, { rig_asset_id: metaRig.id, action_id: cf.action_id, action_name: cf.name }, 'request-clip'); toast('Clip requested — it appears here as a draft when done'); }); }}>Yes</button>
                <button className="btn ghost small" onClick={() => setConfirm(null)}>No</button></span>
            )}
          </div>
        </>
      )}
    </details>
  );
}

const CAMERA_LABEL = { crane: 'Crane down (establishing)', wide: 'Still (wide)', 'tilt-up': 'Tilt up (look up)', pan: 'Pan (slide sideways)', 'dolly-in': 'Dolly in (move closer)', closeup: 'Close-up (on one)', follow: 'Follow (track one)', orbit: 'Orbit (circle around)', group: 'Group (keep everyone in)' };

/** This shot's landscape: the project look, or this shot's own sky / clouds / hills / trees / dressing. Stored in lighting.look. */
function ShotLandscape({ shot, scene, patch }) {
  const own = shot.lighting?.look || {};
  const base = { ...LOOK_DEFAULTS, ...(scene.look || {}) };
  const set = (k, v) => { const n = { ...own }; if (v === 'project') delete n[k]; else n[k] = v; patch({ lighting: { ...(shot.lighting || { preset: 'day' }), look: n } }); };
  const keys = [['sky', 'Sky'], ['clouds', 'Clouds'], ['hills', 'Far hills'], ['trees', 'Trees'], ['dressing', 'Flowers & bushes'], ['river', 'River'], ['houses', 'Houses'], ['wind', 'Wind'], ['birds', 'Birds'], ['detail', 'Extra detail']];
  const changed = keys.filter(([k]) => own[k]).length;
  return (
    <details className="tool">
      <summary>Landscape for this shot {changed ? `· ${changed} change${changed === 1 ? '' : 's'}` : '· same as the project'} <span className="muted small">(sky, clouds, hills… around the scenery)</span></summary>
      <div className="param-grid">
        {keys.map(([k, label]) => (
          <label key={k} className="field"><span>{label}</span>
            <select value={own[k] || 'project'} onChange={(e) => set(k, e.target.value)}>
              <option value="project">Project ({base[k]})</option>{LOOK_OPTIONS[k].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>
    </details>
  );
}
