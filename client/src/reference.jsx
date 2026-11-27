// "What should Claude use as reference?" — asked before every Claude creation (character design, prompts, shot
// direction, landscape…). Three choices:
//   world       — My World: the World Style description + inspiration brief
//   world+cast  — My World + my existing characters & designs (descriptions and pictures)
//   new         — Something new: only the description pasted in the box
// The last choice for each action is remembered in this browser and pre-selected next time.
import { useEffect, useState } from 'react';

export const REF_LABEL = { world: 'My World', 'world+cast': 'My World + my characters', new: 'Something new' };
const KEY = (k) => `ref:${k}`;
export function getReference(action) {
  try { const r = JSON.parse(localStorage.getItem(KEY(action)) || 'null'); if (r?.mode) return r; } catch { /* private window */ }
  return { mode: 'world+cast', text: '' };
}
const remember = (action, r) => { try { localStorage.setItem(KEY(action), JSON.stringify(r)); } catch { /* private window */ } };

let open = null; // set by <ReferenceHost/>
/**
 * Ask which reference Claude should use for this action. Resolves to { mode, text } or null (cancelled).
 * action: a stable key such as 'cast.analyze'; title: what is about to happen, e.g. "Analyze the lyrics".
 */
export function askReference(action, title) {
  return new Promise((resolve) => {
    if (!open) { resolve(getReference(action)); return; }
    open({ action, title, resolve });
  });
}

/** Mounted once (App). Shows the dialog when askReference() is called. */
export function ReferenceHost() {
  const [req, setReq] = useState(null);
  const [mode, setMode] = useState('world+cast');
  const [text, setText] = useState('');
  useEffect(() => {
    open = (r) => { const last = getReference(r.action); setMode(last.mode); setText(last.text || ''); setReq(r); };
    return () => { open = null; };
  }, []);
  if (!req) return null;
  const close = (value) => { req.resolve(value); setReq(null); };
  const go = () => { const r = { mode, text: mode === 'new' ? text.trim() : '' }; remember(req.action, r); close(r); };
  const options = [
    ['world', '🌍 My World', 'Your World Style description and inspiration brief. Claude creates fresh designs that follow your world, without basing them on your existing characters.'],
    ['world+cast', '🌍 + 👥 My World + my existing characters & designs', 'Also your saved My World characters, scenery and props (their descriptions and pictures), so everything stays consistent with what you already made.'],
    ['new', '✨ Something new', 'Only the description you paste below. Claude ignores the World Style for this request and creates something new.'],
  ];
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div className="modal ref-modal" role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); }}>
        <h3>What should Claude use as reference?</h3>
        <p className="muted small">For: <b>{req.title}</b></p>
        <div className="ref-options">
          {options.map(([k, label, help]) => (
            <label key={k} className={`ref-option ${mode === k ? 'on' : ''}`}>
              <input type="radio" name="ref" checked={mode === k} onChange={() => setMode(k)} autoFocus={mode === k} />
              <span><b>{label}</b><small className="muted">{help}</small></span>
            </label>
          ))}
        </div>
        {mode === 'new' && (
          <label className="field"><span>Describe what you want (Claude follows only this)</span>
            <textarea rows={6} value={text} autoFocus placeholder="e.g. A snowy winter village at night with glowing lanterns; a small penguin with a red scarf as the main character; soft blue and white colours." onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        <div className="row end">
          <button className="btn ghost" onClick={() => close(null)}>Cancel</button>
          <button className="btn primary" disabled={mode === 'new' && !text.trim()} onClick={go}>Continue</button>
        </div>
        <p className="small muted">Your choice is remembered for this action and pre-selected next time.</p>
      </div>
    </div>
  );
}

/** For chat assistants: shows the current reference; click to change it (no request is sent). */
export function ReferenceChip({ action, title }) {
  const [r, setR] = useState(() => getReference(action));
  return (
    <button type="button" className="ref-chip" title="What Claude uses as reference for this assistant. Click to change."
      onClick={async () => { const x = await askReference(action, title); if (x) setR(x); }}>
      Reference: <b>{REF_LABEL[r.mode]}</b>{r.mode === 'new' && r.text ? ` (“${r.text.slice(0, 28)}${r.text.length > 28 ? '…' : ''}”)` : ''} ▾
    </button>
  );
}
