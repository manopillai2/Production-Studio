import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, Confirm } from '../ui.jsx';
import { Thumb3D } from '../engine/Viewer3D.jsx';

const ROLE_LABELS = { fur: 'Fur (main body)', fur_support: 'Muzzle, chest & belly', inner_ear: 'Inner ears', iris: 'Eyes (iris)', nose: 'Nose', cheeks: 'Cheeks', accent: 'Focal accent', foliage: 'Foliage', foliage_far: 'Distant foliage', stone: 'Stones', soil: 'Paths & soil', water: 'Water', sun: 'Sun', moon: 'Moon', sky_day: 'Day sky' };
const SWITCHES = [
  ['face', 'iris', 'Coloured irises'], ['face', 'catchlights', 'Eye catchlights'], ['face', 'eyelids', 'Shaped eyelids'], ['face', 'muzzle', 'Sculpted muzzle'],
  ['features', 'tufts', 'Fur tufts'], ['features', 'inset_ears', 'Inset ear interiors'],
  ['scenery', 'leaf_terrain', 'Leaf-shaped terrain'], ['scenery', 'path', 'Winding paths'], ['scenery', 'petal_flowers', 'Folded-petal flowers'], ['scenery', 'leaf_canopies', 'Leaf-cluster trees'], ['scenery', 'stones', 'Landmark stones'],
  ['sky', 'petal_rays', 'Sun with petal rays'], ['sky', 'cloud_lobes', 'Lobed clouds'],
];

/** The structured rules every generator uses — extracted from the document, adjustable by hand. */
function ProfilePanel({ doc, onSaved }) {
  const [act, busy] = useAction();
  const [p, setP] = useState(doc.profile);
  useEffect(() => setP(doc.profile), [doc.profile]);
  if (!p) return null;
  const dirty = JSON.stringify(p) !== JSON.stringify(doc.profile);
  const set = (grp, key, v) => setP({ ...p, [grp]: { ...p[grp], [key]: v } });
  return (
    <div className="card profile-panel">
      <div className="section-head">
        <div>
          <h3>Style Profile <span className="muted small">· what every generator applies</span></h3>
          <p className="muted small">Extracted from your document{p.source === 'edited' ? ' and adjusted by hand' : ''}. <b>Build Locally</b> uses all of it (palette, finish, proportions, face and fur construction, scenery and sky shapes). <b>Local AI</b> checks reference images against the palette and gets the surface finish. <b>Meshy</b> gets the summary, palette and a “clearly different from…” clause. <b>Claude</b> reads the full document.</p>
        </div>
        <div className="row">
          <Confirm className="btn small" text="Re-extract from the document? Hand edits are replaced." onYes={() => act(async () => onSaved(await api.post('/api/world-style/profile/reextract')), 'Re-extracted from the document')}>Re-extract</Confirm>
          <button className="btn primary small" disabled={!dirty || busy} onClick={() => act(async () => onSaved(await api.put('/api/world-style/profile', p)), 'Style Profile saved — new builds use it')}>Save profile</button>
        </div>
      </div>
      <div className="chips">{p.detected?.map((d) => <span key={d} className="chip static">{d}</span>)}</div>
      <h4>Palette roles</h4>
      <div className="swatches">
        {Object.entries(ROLE_LABELS).map(([k, label]) => typeof p.roles[k] === 'string' && (
          <label key={k} className="swatch" title={label}><input type="color" value={p.roles[k]} onChange={(e) => set('roles', k, e.target.value)} /><span>{label}</span></label>
        ))}
        {(p.roles.flowers || []).map((c, i) => (
          <label key={`f${i}`} className="swatch"><input type="color" value={c} onChange={(e) => { const f = [...p.roles.flowers]; f[i] = e.target.value; set('roles', 'flowers', f); }} /><span>Flowers {i + 1}</span></label>
        ))}
      </div>
      <div className="param-grid">
        {[['fur', 'Fur roughness (satin ≈ 0.55)'], ['eyes', 'Eye roughness (gloss ≈ 0.06)'], ['nose', 'Nose roughness (sheen ≈ 0.3)'], ['foliage', 'Foliage roughness'], ['rock', 'Rock roughness']].map(([k, label]) => (
          <label key={k} className="field"><span>{label} <em className="mono muted">{p.finish[k]}</em></span><input type="range" min="0" max="1" step="0.01" value={p.finish[k]} onChange={(e) => set('finish', k, Number(e.target.value))} /></label>
        ))}
        <label className="field"><span>Head size <em className="mono muted">×{p.proportions.head}</em></span><input type="range" min="0.8" max="1.4" step="0.01" value={p.proportions.head} onChange={(e) => set('proportions', 'head', Number(e.target.value))} /></label>
        <label className="field"><span>Torso width <em className="mono muted">×{p.proportions.torso}</em></span><input type="range" min="0.8" max="1.3" step="0.01" value={p.proportions.torso} onChange={(e) => set('proportions', 'torso', Number(e.target.value))} /></label>
        <label className="field"><span>Asymmetry <em className="mono muted">{p.asymmetry}</em></span><input type="range" min="0" max="0.3" step="0.01" value={p.asymmetry} onChange={(e) => setP({ ...p, asymmetry: Number(e.target.value) })} /></label>
      </div>
      <div className="chips">
        {SWITCHES.map(([g, k, label]) => (
          <label key={`${g}.${k}`} className={`chip ${p[g]?.[k] ? 'on' : ''}`}><input type="checkbox" checked={!!p[g]?.[k]} onChange={(e) => set(g, k, e.target.checked)} />{label}</label>
        ))}
      </div>
      <p className="muted small">Saving creates a new style version — cards built with an earlier version are flagged so you can apply the update or keep them as they are.</p>
    </div>
  );
}

/** One shared World Style document that every new character, scenery and prop follows. */
export default function WorldStyle() {
  const { toast, refreshChannel } = useStudio();
  const [doc, setDoc] = useState(null);
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [locked, setLocked] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [act, busy] = useAction();
  const load = async () => {
    const [d, w] = await Promise.all([api.get('/api/world-style'), api.get('/api/world')]);
    setDoc(d); setText(d.text); setSummary(d.summary); setLocked(w.locked || []);
  };
  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!doc) return <div className="muted">Loading…</div>;
  const dirty = text !== doc.text || summary !== doc.summary;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const save = () => act(async () => { const d = await api.put('/api/world-style', { text, summary }); setDoc(d); refreshChannel(); }, 'World Style saved — new designs will follow it');

  return (
    <div className="stack world-style">
      <div className="sticky-actions">
        <span className={dirty ? 'warn' : 'muted'}>{dirty ? 'Unsaved changes' : doc.updated_at ? `Saved ${new Date(doc.updated_at).toLocaleString()}` : 'Saved'}</span>
        {dirty && <button className="btn ghost" onClick={() => { setText(doc.text); setSummary(doc.summary); }}>Discard</button>}
        <button className="btn primary" disabled={!dirty || busy || !text.trim()} onClick={save}>Save World Style</button>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h3>World Style</h3>
            <p className="muted small">The single place for your channel's visual rules: world, characters, faces, scenery, colour, light and 3D quality. Write it once; every new creation follows it.</p>
          </div>
          <span className="mono small muted">{words.toLocaleString()} words · {text.length.toLocaleString()} characters</span>
        </div>
        <textarea className="style-doc" value={text} onChange={(e) => setText(e.target.value)} spellCheck
          placeholder={'WORLD STYLE — SKYLEAF MEADOW\n\nDescribe your world, character shapes and proportions, faces and fur, recurring characters, scenery, colours, materials, light and 3D quality…'} />
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Short summary for prompts</h3>
          <p className="muted small">Meshy prompts are limited to 800 characters, so offline prompt drafts add this summary instead of the whole document. (Claude reads the full document and condenses it itself.)</p>
          <textarea rows={4} value={summary} maxLength={400} onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Original 3D storybook world for preschoolers: lovingly sculpted soft creatures, oversized heads, glossy eyes with catchlights, grouped fur tufts, satin finish; oat cream, moss green, dusty teal, soft peach, petal pink, lavender-gray; golden yellow only for focal accents." />
          <div className="row"><span className={`mono small ${summary.length > 380 ? 'warn' : 'muted'}`}>{summary.length}/400</span></div>
        </div>
        <div className="card">
          <h3>Where it's used</h3>
          <ul className="small used-list">
            <li><b>Stage 2 · Analyze with Claude</b> — full document: descriptions, signature features and Meshy prompts for every asset.</li>
            <li><b>Stage 2 · Draft prompt with Claude</b> — full document, condensed into a ≤ 700-character Meshy prompt.</li>
            <li><b>Stage 2 · offline analysis & new cards</b> — the short summary is added to the Meshy prompt draft.</li>
            <li><b>Lyrics assistant & design chat</b> — full document as the world's style rules.</li>
            <li><b>Build Locally</b> — templates already use soft rounded shapes and matte pastel materials; the document's specifics (like Pip's curled ear and golden paw) go in each card's description and recipe.</li>
          </ul>
          <h4>Locked designs used as visual references ({locked.length})</h4>
          <div className="world-refs">
            {locked.map((i) => (
              <span key={i.id} className="world-ref" title={`${i.name} · ${i.locked_label}`}>
                {i.cover ? <img src={i.cover.url} alt="" /> : <Thumb3D url={null} size={56} />}
                <small>{i.name}</small>
              </span>
            ))}
            {!locked.length && <span className="muted small">None yet — the first designs you lock become references for everything after.</span>}
          </div>
        </div>
      </div>

      <ProfilePanel doc={doc} onSaved={(d) => setDoc(d)} />

      <div className="card">
        <div className="section-head">
          <h3>Version history <span className="muted small">· {doc.history.length} earlier version{doc.history.length === 1 ? '' : 's'}</span></h3>
          <button className="btn small" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Hide' : 'Show'}</button>
        </div>
        {showHistory && (
          <ul className="history-list">
            {doc.history.map((h, i) => (
              <li key={i}>
                <div className="row wrap">
                  <b className="mono small">{new Date(h.at).toLocaleString()}</b>
                  <span className="muted small">{h.text.trim().split(/\s+/).length} words — “{h.text.slice(0, 90).replace(/\s+/g, ' ')}…”</span>
                  <span className="grow" />
                  <Confirm className="btn tiny" text="Load this version into the editor? (Save to keep it.)" onYes={() => { setText(h.text); setSummary(h.summary || ''); toast('Loaded into the editor — click Save World Style to keep it'); }}>Restore</Confirm>
                </div>
              </li>
            ))}
            {!doc.history.length && <li className="muted small">No earlier versions yet. Each save keeps the previous version here (last 30).</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
