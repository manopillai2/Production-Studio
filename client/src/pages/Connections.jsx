import { useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction } from '../ui.jsx';

const GROUPS = [
  ['assistant', 'Assistant · every stage'],
  ['cast', 'Stage 2 · Characters & Scenery'],
  ['music', 'Stage 3 · Music'],
  ['animation', 'Stage 4 · Animation'],
];
const STATE = {
  active: ['ok', 'Connected & active'],
  disabled: ['warn', 'Connected — paid generation is off'],
  'not-configured': ['muted', 'Not connected'],
  placeholder: ['placeholder', 'Placeholder — integration not built yet'],
};

export default function Connections() {
  const { health, refreshHealth } = useStudio();
  const [act, busy] = useAction();
  if (!health) return <div className="muted">Loading…</div>;
  const save = (body, msg) => act(async () => { await api.put('/api/connections', body); await refreshHealth(); }, msg);

  return (
    <div className="stack">
      <div className="card paid-switch">
        <div className="grow">
          <h3>Paid generation</h3>
          <p className="muted small">Master switch. While it's off, nothing is ever sent to a paid AI service, even when keys are saved. Keys are stored only on this PC (in <code>storage/studio.sqlite</code>) and never sent to the browser.</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={health.paidGenerationEnabled} disabled={busy} onChange={(e) => save({ paidEnabled: e.target.checked }, e.target.checked ? 'Paid generation ON' : 'Paid generation off')} />
          <span>{health.paidGenerationEnabled ? 'ON' : 'Off'}</span>
        </label>
      </div>

      {GROUPS.map(([stage, label]) => (
        <div key={stage}>
          <h3>{label}</h3>
          <div className="conn-grid">
            {health.providers.filter((p) => p.stage === stage).map((p) => <ToolCard key={p.id} p={p} save={save} busy={busy} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolCard({ p, save, busy }) {
  const [key, setKey] = useState('');
  const [cls, text] = STATE[p.state] || ['muted', p.state];
  return (
    <div className={`card conn ${p.state}`}>
      <div className="row"><b className="grow">{p.label}</b><span className={`pill ${cls}`}>{text}</span></div>
      <p className="small">{p.purpose}</p>
      {p.note && <p className="muted small">{p.note}</p>}
      {p.configured && <p className="small">Key: <code>{p.masked}</code> <span className="muted">(from {p.source})</span></p>}
      <div className="row">
        <input type="password" placeholder={p.configured ? 'Replace key…' : `Paste ${p.envKey}`} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        <button className="btn primary small" disabled={!key.trim() || busy} onClick={() => { save({ id: p.id, key }, `${p.label} key saved`); setKey(''); }}>Save</button>
        {p.source === 'app' && <button className="btn ghost small" onClick={() => save({ id: p.id, key: null }, `${p.label} key removed`)}>Remove</button>}
      </div>
      <a className="small" href={p.signup} target="_blank" rel="noreferrer">Get a key ↗</a>
    </div>
  );
}
