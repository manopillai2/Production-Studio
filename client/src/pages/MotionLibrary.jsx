import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, Badge, Model3D } from '../ui.jsx';
import { Thumb3D } from '../engine/Viewer3D.jsx';

/** My World · Rigs & movement clips (created in Stage 4, reusable in every project). */
export default function MotionLibrary() {
  const { toast } = useStudio();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [act, busy] = useAction();
  const load = () => Promise.all([api.get('/api/world/motion').then(setList), api.get('/api/items?kind=character,prop').then(setItems)]);
  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [target, setTarget] = useState('');
  const [open, setOpen] = useState(null); // asset shown in the animated viewer
  if (!list) return <div className="muted">Loading…</div>;
  const groups = list.reduce((m, a) => { (m[a.item_name] ||= []).push(a); return m; }, {});
  return (
    <div className="stack">
      <div className="card">
        <h3>Rigs & movement clips</h3>
        <p className="muted small">Rigged models and animation clips (walk, wave, hop…) for your My World characters. Stage 4 searches here first. Add them by importing a .glb, or request them from Meshy inside Stage 4 (explicit, paid).</p>
        <div className="row wrap">
          <select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Import for…</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          {['clip', 'rig'].map((cat) => (
            <label key={cat} className={`btn small ${!target ? 'disabled' : ''}`}>Import {cat === 'rig' ? 'rigged model' : 'clip'} (.glb)
              <input type="file" accept=".glb" hidden disabled={!target || busy} onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) act(async () => { await api.upload(`/api/items/${target}/motion`, [f], { category: cat }); await load(); }, 'Saved to My World'); }} />
            </label>
          ))}
        </div>
      </div>
      {Object.entries(groups).map(([name, arr]) => (
        <div className="card" key={name}>
          <h4>{name}</h4>
          <div className="asset-grid">
            {arr.map((a) => (
              <div className={`asset-card static ${open === a.id ? 'sel' : ''}`} key={a.id}>
                <button className="thumb-btn" title="Click to watch it move" onClick={() => setOpen(open === a.id ? null : a.id)}><Thumb3D url={a.url} size={110} /><span className="thumb-play">{open === a.id ? '✕' : '▶'}</span></button>
                <div className="asset-card-body">
                  <b>{a.label}</b>
                  <span className="row"><span className="tag">{a.category}</span><Badge status={a.status} /></span>
                  {a.status !== 'approved' && <button className="btn tiny approve" onClick={() => act(async () => { await api.post(`/api/assets/${a.id}/approve`); await load(); }, 'Approved')}>Approve & keep</button>}
                </div>
              </div>
            ))}
          </div>
          {arr.some((a) => a.id === open) && (() => { const a = arr.find((x) => x.id === open); return (
            <div className="motion-viewer"><div className="row"><b className="grow">{a.label}</b><button className="btn ghost tiny" onClick={() => setOpen(null)}>Close</button></div><Model3D key={a.id} url={a.url} height={560} autoPlay /></div>
          ); })()}
        </div>
      ))}
      {!list.length && <div className="empty">No rigs or clips yet. The sample “Pip the Sky Bunny” includes a built-in ear-wiggle clip.</div>}
    </div>
  );
}
