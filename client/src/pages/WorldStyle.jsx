import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, Confirm } from '../ui.jsx';
import { Thumb3D } from '../engine/Viewer3D.jsx';
import { LOOK_OPTIONS } from '../engine/Landscape.js';

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
  const { toast, refreshChannel, health } = useStudio();
  const claudeOn = health?.providers?.find((p) => p.id === 'claude')?.state === 'active';
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

      <InspirationPanel doc={doc} setDoc={setDoc} claudeOn={claudeOn} />
      <WorldLookPanel doc={doc} setDoc={setDoc} claudeOn={claudeOn} />

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
          <p className="small">Your World Style is used by every Claude call. Before each ✨ action the app asks what Claude should use as reference: <b>My World</b> (this document + inspiration brief), <b>My World + my existing characters & designs</b>, or <b>Something new</b> (only a description you paste for that request). The screenshots themselves go to the calls that design or plan something you will see.</p>
          <ul className="small used-list">
            <li><b>Stage 1 · Lyrics assistant</b>: document + brief (words, places and characters fit your world).</li>
            <li><b>Stage 2 · Analyze with Claude</b>: document + brief, for the descriptions and signature features of every asset.</li>
            <li><b>Stage 2 · Draft prompt / Revise prompt with Claude</b>: document + brief + screenshots, condensed into the Meshy prompt.</li>
            <li><b>Stage 2 · offline analysis & new cards</b>: the short summary is added to the Meshy prompt draft.</li>
            <li><b>Stage 3 · Music assistant</b>: document + brief (the mood of the music).</li>
            <li><b>Stage 4 · Direct with Claude</b>: document + brief + screenshots (framing, shot sizes, landscape per shot).</li>
            <li><b>Stage 4 · Landscape</b>: “Landscape for every video” below; colours from the Style Profile.</li>
            <li><b>My World · design chat</b>: document + brief + screenshots.</li>
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

/**
 * Screenshots from videos you find inspiring. Reference only: Claude reads them with your World Style and writes an
 * inspiration brief (about 80% of the ideas, never copying characters, logos or exact designs). Every Claude call
 * follows the brief; design, prompt and shot-planning calls also see the screenshots.
 */
function InspirationPanel({ doc, setDoc, claudeOn }) {
  const { toast } = useStudio();
  const [act, busy] = useAction();
  const insp = doc.inspiration || {};
  const imgs = insp.images || [];
  const [brief, setBrief] = useState(insp.brief || '');
  const [note, setNote] = useState('');
  useEffect(() => setBrief(insp.brief || ''), [insp.brief]);
  const upload = (files) => act(async () => {
    const list = [...files].filter((f) => /^image\//.test(f.type));
    if (!list.length) throw new Error('Choose PNG, JPG or WebP images.');
    setDoc(await api.upload('/api/world-style/inspiration', list, { note }));
    setNote('');
  }, 'Added. Click “Read the screenshots with Claude” to update the brief.');
  const read = () => act(async () => setDoc(await api.post('/api/world-style/inspiration/brief')), 'Claude wrote the inspiration brief. Every Claude call now follows it.');
  const briefDirty = brief !== (insp.brief || '');
  return (
    <div className="card inspiration">
      <div className="section-head">
        <div>
          <h3>Inspiration screenshots <span className="muted small">· reference only</span></h3>
          <p className="muted small">Add screenshots from videos you like (other channels, films, picture books). Claude takes about <b>80% of the ideas</b> (look and feel, colours, shapes, light, landscape, framing) and makes them fit <b>your</b> description. It never copies their characters, logos, text or exact designs. Your written World Style always wins where they differ.</p>
        </div>
        <span className="muted small">{imgs.length}/12</span>
      </div>
      <div className="insp-grid">
        {imgs.map((im) => <InspirationTile key={im.id} im={im} setDoc={setDoc} />)}
        {imgs.length < 12 && (
          <label className="insp-add" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { const f = e.target.files; e.target.value = ''; if (f?.length) upload(f); }} />
            <b>＋ Add screenshots</b><span className="small muted">click or drop images here</span>
          </label>
        )}
      </div>
      {imgs.length < 12 && <label className="field"><span>Note for the next upload <em className="muted">(optional: what you like about it)</em></span><input value={note} placeholder="e.g. I love the soft pastel sky and the round trees; characters always fill half the frame" onChange={(e) => setNote(e.target.value)} /></label>}

      <div className="brief-box">
        <div className="row wrap between">
          <b>Inspiration brief <span className="muted small">· what Claude follows {insp.at ? `· ${insp.edited ? 'edited by you' : 'written by Claude'} ${new Date(insp.at).toLocaleString()}` : ''}</span></b>
          <div className="row">
            {briefDirty && <button className="btn small" disabled={busy} onClick={() => act(async () => setDoc(await api.put('/api/world-style/inspiration/brief', { brief })), 'Brief saved')}>Save my edits</button>}
            {insp.brief && !briefDirty && <Confirm className="btn ghost small" text="Clear the brief? Claude then follows only your written World Style (the screenshots stay)." onYes={() => act(async () => setDoc(await api.del('/api/world-style/inspiration/brief')), 'Brief cleared')}>Clear</Confirm>}
            <button className="btn small primary" disabled={busy || !claudeOn || !imgs.length} title={claudeOn ? 'One Claude call (reads your World Style + all screenshots)' : 'Connect Claude to use this'} onClick={read}>{busy ? 'Claude is looking…' : insp.brief ? '↻ Read the screenshots again' : '✨ Read the screenshots with Claude'}</button>
          </div>
        </div>
        {insp.stale && <div className="hint warn">The screenshots or notes changed after this brief was written. Read them again to update it.</div>}
        {insp.brief || briefDirty ? <textarea rows={8} value={brief} onChange={(e) => setBrief(e.target.value)} /> : <p className="small muted">No brief yet. Add screenshots, then click “Read the screenshots with Claude”.</p>}
        {insp.palette?.length > 0 && <div className="row wrap small"><span className="muted">Colours it took:</span>{insp.palette.map((c) => <span key={c} className="swatch-dot" style={{ background: c }} title={c} />)}</div>}
        {insp.avoid?.length > 0 && <div className="small"><span className="muted">Never copied:</span> {insp.avoid.join(' · ')}</div>}
      </div>
    </div>
  );
}

function InspirationTile({ im, setDoc }) {
  const [act] = useAction();
  const [note, setNote] = useState(im.note || '');
  return (
    <div className="insp-tile">
      <a href={im.url} target="_blank" rel="noreferrer"><img src={im.url} alt="Inspiration screenshot" /></a>
      <textarea rows={2} value={note} placeholder="What do you like here?" onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (im.note || '') && act(async () => setDoc(await api.put(`/api/world-style/inspiration/${im.id}`, { note })), 'Note saved')} />
      <Confirm className="btn ghost tiny" text="Remove this screenshot?" onYes={() => act(async () => setDoc(await api.del(`/api/world-style/inspiration/${im.id}`)), 'Removed')}>Remove</Confirm>
    </div>
  );
}

/** The landscape every video starts with (Stage 4 → Look can change it per project, and the shot editor per shot). */
function WorldLookPanel({ doc, setDoc, claudeOn }) {
  const { toast } = useStudio();
  const [act, busy] = useAction();
  const L = doc.world_look || {};
  const set = (p) => act(async () => setDoc(await api.put('/api/world-style/look', p)));
  const pick = (k, label, labels = {}) => (
    <label className="field"><span>{label}</span>
      <select value={L[k] || ''} onChange={(e) => set({ [k]: e.target.value })}>
        <option value="">App default</option>{LOOK_OPTIONS[k].map((o) => <option key={o} value={o}>{labels[o] || o}</option>)}
      </select>
    </label>
  );
  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h3>Landscape for every video</h3>
          <p className="muted small">Around every scenery the studio builds a <b>landscape</b>: sky, clouds, far hills, trees, flowers and ground. These are your world's defaults. Each project can change them in <b>Stage 4 → 🎨 Look</b>, and each shot in the shot editor.</p>
        </div>
        <button className="btn small primary" disabled={busy || !claudeOn} title={claudeOn ? 'One Claude call (World Style + brief + screenshots)' : 'Connect Claude to use this'}
          onClick={() => act(async () => { const r = await api.post('/api/world-style/look/suggest'); setDoc(r); if (r.why) toast(r.why); })}>✨ Suggest from my World Style</button>
      </div>
      <div className="param-grid">
        {pick('sky', 'Sky', { auto: 'From the lighting', clear: 'Clear', soft: 'Soft pastel', storybook: 'Storybook (lilac & pink)' })}
        {pick('clouds', 'Clouds')}
        {pick('hills', 'Far hills')}
        {pick('trees', 'Trees on the hills')}
        {pick('dressing', 'Flowers & bushes')}
        {pick('river', 'River (flowing water)')}
        {pick('houses', 'Colourful houses')}
        {pick('wind', 'Wind')}
        {pick('birds', 'Birds')}
        {pick('detail', 'Extra detail')}
        {pick('transition', 'Transitions')}
        <label className="field"><span>Ground colour</span><div className="row"><input type="color" value={L.ground || '#8CCB6E'} onChange={(e) => set({ ground: e.target.value })} />{L.ground ? <button className="btn tiny ghost" onClick={() => set({ ground: '' })}>Auto</button> : <span className="small muted">auto (palette)</span>}</div></label>
        <label className="field"><span>Hill colour</span><div className="row"><input type="color" value={L.hill_tint || '#6CC45E'} onChange={(e) => set({ hill_tint: e.target.value })} />{L.hill_tint ? <button className="btn tiny ghost" onClick={() => set({ hill_tint: '' })}>Auto</button> : <span className="small muted">auto (palette)</span>}</div></label>
      </div>
    </div>
  );
}
