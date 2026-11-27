import { createContext, useContext, useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { getReference, ReferenceChip } from './reference.jsx';
import { api, resLabel, fmtTime } from './api.js';

export const StudioContext = createContext(null);
export const useStudio = () => useContext(StudioContext);

// ---------- toasts ----------
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 2800);
  }, []);
  return { toasts, push };
}
export function Toasts({ toasts }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

/** Wrap an async action: shows busy state, success toast, readable error toast. */
export function useAction() {
  const { toast } = useStudio();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(e.message, 'error'); return undefined; }
    finally { setBusy(false); }
  }, [toast]);
  return [run, busy];
}

export const Badge = ({ status, text }) => {
  const s = status === 'approved' ? 'approved' : status === 'master' ? 'master' : 'draft';
  return <span className={`badge ${s}`}>{text || (s === 'approved' ? 'Approved' : s === 'master' ? 'Master' : 'Draft')}</span>;
};

export function useCopy() {
  const { toast } = useStudio();
  return (txt, what = 'Copied') => navigator.clipboard?.writeText(txt).then(() => toast(what), () => toast('Copy failed — select and copy manually', 'error'));
}

/** Claude-powered chat box used in every stage. `send(message)` must call the API and return {messages}. */
export function Assistant({ scope, episodeId = 0, title = 'Assistant', intro, chips = [], send, renderRef, offline, reloadKey = 0, refAction }) {
  const { toast, health, go } = useStudio();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(null);
  const endRef = useRef();
  const claude = health?.providers?.find((p) => p.id === 'claude');
  const ready = claude?.state === 'active';

  useEffect(() => {
    let alive = true;
    fetch(`/api/chat?scope=${encodeURIComponent(scope)}&episode_id=${episodeId}`).then((r) => r.json()).then((m) => alive && setMsgs(Array.isArray(m) ? m : [])).catch(() => {});
    return () => { alive = false; };
  }, [scope, episodeId, reloadKey]);
  // Scroll only the chat log (scrollIntoView would also scroll the whole page).
  useEffect(() => { const el = endRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, pending]);

  const submit = async (m) => {
    const message = (m ?? text).trim();
    if (!message || pending) return;
    setPending(message);
    try {
      const r = await send(message, refAction ? getReference(refAction) : undefined);
      if (r?.messages) setMsgs(r.messages);
      setText('');
    } catch (e) { toast(e.message, 'error'); }
    finally { setPending(null); }
  };
  const clear = async () => { await fetch(`/api/chat?scope=${encodeURIComponent(scope)}&episode_id=${episodeId}`, { method: 'DELETE' }); setMsgs([]); };

  return (
    <div className="assistant card">
      <div className="assistant-head">
        <b>✨ {title}</b>
        <span className={`dot ${ready ? 'on' : ''}`} title={claude?.state} />
        <small className="muted">{ready ? 'Claude connected' : 'Claude not active'}</small>
        <span className="grow" />
        {msgs.length > 0 && <button className="btn ghost tiny" onClick={clear}>Clear chat</button>}
      </div>
      {refAction && <ReferenceChip action={refAction} title={title} />}
      {!ready && (
        <div className="assistant-off">
          The assistant needs Claude. <button className="btn small primary" onClick={() => go('connections')}>Connect Claude</button>
          {offline && <div className="muted small">{offline}</div>}
        </div>
      )}
      <div className="assistant-log" ref={endRef}>
        {!msgs.length && !pending && <div className="muted small assistant-intro">{intro}</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            <div className="bubble-text">{m.content}</div>
            {renderRef && m.role === 'assistant' && renderRef(m)}
          </div>
        ))}
        {pending && <><div className="bubble user"><div className="bubble-text">{pending}</div></div><div className="bubble assistant thinking">Thinking…</div></>}
      </div>
      {chips.length > 0 && (
        <div className="chips small-chips">
          {chips.map((c) => <button key={c} className="chip" disabled={!ready || !!pending} onClick={() => (c.endsWith('…') ? setText(c.slice(0, -1) + ' ') : submit(c))}>{c}</button>)}
        </div>
      )}
      <div className="assistant-input">
        <textarea rows={2} value={text} disabled={!ready} placeholder={ready ? 'Ask for a change… (Ctrl+Enter to send)' : 'Connect Claude to chat'}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }} />
        <button className="btn primary" disabled={!ready || !text.trim() || !!pending} onClick={() => submit()}>{pending ? '…' : 'Send'}</button>
      </div>
    </div>
  );
}

/** Seconds → "1:30". */
export const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.round((s || 0) % 60)).padStart(2, '0')}`;

export function DurationPicker({ value, onChange }) {
  const presets = [30, 60, 90, 120, 180];
  return (
    <div className="duration-picker">
      {presets.map((p) => <button key={p} className={`chip ${value === p ? 'on' : ''}`} onClick={() => onChange(p)}>{mmss(p)}</button>)}
      <label className="muted small">custom <EditField type="number" value={value} onSave={(v) => v > 0 && onChange(v)} /> s</label>
    </div>
  );
}

export const Placeholder = ({ children = 'Placeholder' }) => <span className="badge placeholder" title="Integration point only — not active in this version">{children}</span>;

export function ImportButton({ onFiles, accept, label = 'Import', multiple = true, disabled, className = 'btn' }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  return (
    <>
      <button type="button" className={`${className} ${drag ? 'drag' : ''}`} disabled={disabled}
        onClick={() => ref.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}
        title="Click or drop files here">
        ⤓ {label}
      </button>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { if (e.target.files.length) onFiles(e.target.files); e.target.value = ''; }} />
    </>
  );
}

export function MediaPreview({ asset, compact, controls = true }) {
  if (!asset) return <div className="media-empty">No file</div>;
  const mime = asset.mime || '';
  let body;
  if (mime.startsWith('image/')) body = <img src={asset.url} alt={asset.label} loading="lazy" />;
  else if (mime.startsWith('video/')) body = <video src={asset.url} controls={controls} preload="metadata" muted={compact} />;
  else if (mime.startsWith('audio/')) body = <audio src={asset.url} controls preload="metadata" />;
  else if (mime === 'model/gltf-binary' || /\.glb$/i.test(asset.file_path || '')) body = <Model3D url={asset.url} />;
  else body = <a className="file-link" href={asset.url} target="_blank" rel="noreferrer">📦 {asset.label}<br /><small>{asset.source === 'blender' ? 'Blender asset' : mime || 'file'}</small></a>;
  return (
    <figure className={`media ${compact ? 'compact' : ''} ${mime.split('/')[0]}`}>
      {body}
      {!compact && (
        <figcaption>
          <span className="label">{asset.label}</span>
          <span className="meta">
            {resLabel(asset) && <span className="res">{resLabel(asset)}</span>}
            {asset.duration ? <span>{fmtTime(asset.duration)}</span> : null}
            {asset.source && asset.source !== 'import' && <span className="src">{asset.source}</span>}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/** Rotatable 3D preview (.glb) — the three.js viewer is loaded only when a 3D file is shown. */
const Viewer3DLazy = lazy(() => import('./engine/Viewer3D.jsx'));
export function Model3D({ url, height = 200, autoPlay = false }) {
  return <Suspense fallback={<div className="media-empty">Loading 3D viewer…</div>}><Viewer3DLazy url={url} height={height} autoPlay={autoPlay} /></Suspense>;
}

/** "Needs review" banner: an approved upstream change affected this stage. Saved work is kept. */
export function ReviewBanner({ flagKey }) {
  const { episode, setEpisode } = useStudio();
  const [act, busy] = useAction();
  const f = episode?.review_flags?.[flagKey];
  if (!f) return null;
  return (
    <div className="review-banner">
      <b>Needs review:</b> {f.reason}. Everything saved here is kept — check it, then mark it reviewed.
      <button className="btn small" disabled={busy} onClick={() => act(async () => setEpisode(await api.post(`/api/episodes/${episode.id}/review/${flagKey}/clear`)), 'Marked as reviewed')}>Mark as reviewed</button>
    </div>
  );
}

/** Text input that saves on blur / Enter, giving immediate local feedback. */
export function EditField({ value, onSave, multiline, placeholder, type = 'text', disabled, ...rest }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => { if (String(v) !== String(value ?? '')) onSave(type === 'number' ? (v === '' ? null : Number(v)) : v); };
  const props = {
    value: v, placeholder, disabled,
    onChange: (e) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => { if (e.key === 'Enter' && !multiline) e.currentTarget.blur(); },
    className: String(v) !== String(value ?? '') ? 'dirty' : '',
    ...rest,
  };
  return multiline ? <textarea rows={3} {...props} /> : <input type={type} {...props} />;
}

export function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="hint">{hint}</small>}</label>;
}

export function NeedEpisode({ children }) {
  const { episode } = useStudio();
  if (!episode) return <div className="empty">Pick or create an episode first (Series Planning).</div>;
  return children;
}

export function Confirm({ text, onYes, children, className = 'btn ghost small', disabled = false, title }) {
  const [ask, setAsk] = useState(false);
  if (!ask || disabled) return <button className={className} disabled={disabled} title={title} onClick={() => setAsk(true)}>{children}</button>;
  return (
    <span className="confirm">{text} <button className="btn danger small" onClick={() => { setAsk(false); onYes(); }}>Yes</button>
      <button className="btn ghost small" onClick={() => setAsk(false)}>No</button></span>
  );
}

export function JobList({ jobs }) {
  if (!jobs?.length) return <p className="muted">No render jobs yet.</p>;
  return (
    <ul className="jobs">
      {jobs.map((j) => (
        <li key={j.id} className={`job ${j.status}`}>
          <div className="job-head">
            <b>#{j.id} {j.type}</b> {j.episode_title && <span className="muted">· {j.episode_title}</span>}
            <span className={`pill ${j.status}`}>{j.status}</span>
            {j.params?.resolution && <span className="muted">{j.params.resolution}{j.params.burn_captions ? ' · burned captions' : ''}</span>}
          </div>
          {(j.status === 'running' || j.status === 'queued') && <progress value={j.progress} max="1" />}
          <div className={j.status === 'error' ? 'error-text' : 'muted'}>{j.message}</div>
          {j.output?.mp4 && (
            <div className="row">
              <a className="btn small" href={j.output.mp4} download>⬇ MP4</a>
              <a className="btn small ghost" href={j.output.srt} download>⬇ SRT</a>
              <a className="btn small ghost" href={j.output.mp4} target="_blank" rel="noreferrer">▶ Open</a>
              <code className="path" title="Folder on disk">{j.output.folder}</code>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
