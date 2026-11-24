import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, EditField, Field, Badge, ImportButton, MediaPreview, Confirm, Placeholder } from '../ui.jsx';

const CATS = {
  character: [['reference', 'Reference image'], ['expression', 'Expression'], ['pose', 'Pose'], ['voice', 'Voice reference'], ['animation', 'Reusable animation'], ['render', 'Blender render'], ['blender', 'Blender asset file']],
  location: [['view', 'Reference view'], ['reference', 'Mood / reference'], ['lighting', 'Lighting reference'], ['render', 'Blender render'], ['blender', 'Blender asset file']],
};
const ACCEPT = { voice: 'audio/*', animation: 'video/*,.fbx,.glb,.blend', blender: '.blend,.glb,.gltf,.fbx,.obj,.usd,.usdz,.abc', render: 'image/*,video/*' };

export default function Library({ kind }) {
  const { toast, health } = useStudio();
  const kinds = kind === 'character' ? 'character' : 'location,prop';
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selId, setSelId] = useState(null);
  const [item, setItem] = useState(null);
  const [verId, setVerId] = useState(null);
  const [compare, setCompare] = useState(null); // [idA, idB]
  const [newName, setNewName] = useState('');
  const [act, busy] = useAction();
  const cats = CATS[kind];
  const imageActive = health?.providers?.find((p) => p.id === 'gptImage')?.state === 'active';

  const loadList = useCallback(() => api.get(`/api/items?kind=${kinds}`).then((l) => { setItems(l); return l; }), [kinds]);
  useEffect(() => { loadList().then((l) => l[0] && setSelId((s) => s ?? l[0].id)).catch((e) => toast(e.message, 'error')); }, [loadList, toast]);
  useEffect(() => {
    if (!selId) return setItem(null);
    api.get(`/api/items/${selId}`).then((it) => {
      setItem(it);
      setVerId((v) => (it.versions.some((x) => x.id === v) ? v : it.versions.at(-1)?.id));
    });
  }, [selId]);

  const apply = (it, msg) => { setItem(it); loadList(); if (msg) toast(msg); return it; };
  const version = item?.versions.find((v) => v.id === verId);
  const saveItem = (patch) => act(async () => apply(await api.put(`/api/items/${item.id}`, patch)), 'Saved');

  const create = () => act(async () => {
    const it = await api.post('/api/items', { kind: kind === 'character' ? 'character' : filter === 'prop' ? 'prop' : 'location', name: newName });
    setNewName(''); await loadList(); setSelId(it.id); setVerId(it.versions[0].id);
  }, 'Created with an empty Draft 1 — import reference files next');

  const shown = items.filter((i) => filter === 'all' || i.kind === filter);

  return (
    <div className="split">
      <div className="list-pane">
        {kind !== 'character' && (
          <div className="tabs small">
            {['all', 'location', 'prop'].map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'location' ? 'Locations' : 'Props'}</button>)}
          </div>
        )}
        <div className="row">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={kind === 'character' ? 'New character name' : `New ${filter === 'prop' ? 'prop' : 'location'} name`} onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create()} />
          <button className="btn primary" disabled={!newName.trim() || busy} onClick={create}>+</button>
        </div>
        <ul className="list thumbs">
          {shown.map((i) => (
            <li key={i.id} className={i.id === selId ? 'active' : ''} onClick={() => { setSelId(i.id); setCompare(null); }}>
              {i.cover ? <img src={i.cover.url} alt="" /> : <div className="noimg">?</div>}
              <div><b>{i.name}</b><div className="muted small">{i.kind} · {i.approved_count} locked / {i.versions.length} versions</div></div>
            </li>
          ))}
        </ul>
      </div>

      <div className="detail-pane">
        {!item ? <div className="empty">Create or select an item.</div> : (
          <>
            <div className="card">
              <div className="grid2">
                <Field label="Name"><EditField value={item.name} onSave={(name) => saveItem({ name })} /></Field>
                <Field label="Blender asset link (file path or URL)" hint="Path to the .blend you keep in your Blender library.">
                  <EditField value={item.blender_link} onSave={(blender_link) => saveItem({ blender_link })} placeholder="C:\Blender\RhymesWorld\asset.blend" />
                </Field>
              </div>
              <Field label="Description"><EditField multiline value={item.description} onSave={(description) => saveItem({ description })} /></Field>
              <Field label={kind === 'character' ? 'Personality & design notes' : 'Lighting & continuity notes'}><EditField multiline value={item.notes} onSave={(notes) => saveItem({ notes })} /></Field>
              <div className="usage">
                <b>Used in:</b> {item.usage.length ? item.usage.map((u) => <span key={u.episode_id} className="tag">#{u.number} {u.title} → {u.version_label}</span>) : <span className="muted">no projects yet</span>}
              </div>
            </div>

            <div className="section-head">
              <h3>Versions</h3>
              <div className="row">
                {item.versions.length > 1 && (
                  <button className={`btn ${compare ? 'on' : ''}`} onClick={() => setCompare(compare ? null : [item.versions.at(-2).id, item.versions.at(-1).id])}>⇆ Compare drafts</button>
                )}
                <button className="btn" onClick={() => act(async () => { const it = apply(await api.post(`/api/items/${item.id}/versions`, { copy_from: version?.id })); setVerId(it.versions.at(-1).id); }, 'New draft created — approved versions are untouched')}>+ New draft{version ? ` from ${version.label}` : ''}</button>
              </div>
            </div>

            {compare ? (
              <div className="compare">
                {compare.map((vid, side) => {
                  const v = item.versions.find((x) => x.id === vid);
                  return (
                    <div key={side} className="card">
                      <select value={vid} onChange={(e) => { const n = [...compare]; n[side] = Number(e.target.value); setCompare(n); }}>
                        {item.versions.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.status})</option>)}
                      </select>
                      <div className="row"><Badge status={v?.status} /> <span className="muted small">{v?.notes}</span></div>
                      <div className="media-grid">{v?.assets.map((a) => <MediaPreview key={a.id} asset={a} />)}</div>
                      {v?.status !== 'approved' && <button className="btn approve" onClick={() => act(async () => apply(await api.post(`/api/versions/${v.id}/approve`)), `${v.label} locked`)}>🔒 Lock this version</button>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="tabs">
                  {item.versions.map((v) => (
                    <button key={v.id} className={v.id === verId ? 'on' : ''} onClick={() => setVerId(v.id)}>{v.label} <Badge status={v.status} text={v.status === 'approved' ? 'Locked' : 'Draft'} /></button>
                  ))}
                </div>
                {version && <VersionPanel version={version} cats={cats} act={act} busy={busy} apply={apply} imageActive={imageActive} usage={item.usage} />}
              </>
            )}

            <div className="row end">
              <Confirm text={`Delete ${item.name} from the library?`} onYes={() => act(async () => { await api.del(`/api/items/${item.id}`); setSelId(null); await loadList(); }, 'Deleted')}>Delete {item.kind}…</Confirm>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function VersionPanel({ version, cats, act, busy, apply, imageActive, usage }) {
  const [cat, setCat] = useState(cats[0][0]);
  const locked = version.status === 'approved';
  const pinnedIn = usage.filter((u) => u.version_id === version.id);
  const grouped = cats.map(([k, label]) => [label, version.assets.filter((a) => a.category === k)]).filter(([, l]) => l.length);
  const other = version.assets.filter((a) => !cats.some(([k]) => k === a.category));
  if (other.length) grouped.push(['Other', other]);

  return (
    <div className="card">
      <div className="row wrap">
        <Field label="Version label"><EditField value={version.label} onSave={(label) => act(async () => apply(await api.put(`/api/versions/${version.id}`, { label })), 'Renamed')} /></Field>
        <Field label="Notes"><EditField value={version.notes} onSave={(notes) => act(async () => apply(await api.put(`/api/versions/${version.id}`, { notes })), 'Saved')} /></Field>
      </div>
      {locked ? (
        <div className="locked">
          🔒 Locked {version.approved_at && `on ${version.approved_at.slice(0, 10)}`} for lifetime use. Files can't change, so every project stays consistent.
          {pinnedIn.length > 0 && <> Pinned in {pinnedIn.map((u) => `#${u.number}`).join(', ')}.</>} Use “New draft from {version.label}” to try changes.
          {!pinnedIn.length && <button className="btn ghost small" onClick={() => act(async () => apply(await api.post(`/api/versions/${version.id}/unapprove`)), 'Moved back to Draft')}>Un-approve</button>}
        </div>
      ) : (
        <div className="row wrap import-row">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <ImportButton label={`Import ${cats.find(([k]) => k === cat)[1].toLowerCase()}`} accept={ACCEPT[cat] || 'image/*,video/*,audio/*'} disabled={busy}
            onFiles={(files) => act(async () => { await api.upload(`/api/versions/${version.id}/assets`, files, { category: cat, source: cat === 'blender' || cat === 'render' ? 'blender' : 'import' }); apply(await api.get(`/api/items/${version.item_id}`)); }, `Imported into ${version.label} (Draft)`)} />
          <button className="btn" disabled={!imageActive} title="GPT Image integration point" onClick={() => act(async () => apply(await api.post(`/api/items/${version.item_id}/generate-image`, {})), 'Image generated (draft)')}>✨ Generate image</button>
          {!imageActive && <Placeholder>GPT Image: placeholder</Placeholder>}
          <span className="grow" />
          <button className="btn approve" disabled={busy} onClick={() => act(async () => apply(await api.post(`/api/versions/${version.id}/approve`)), `${version.label} locked`)}>🔒 Lock version</button>
          <Confirm text="Delete this draft and its files?" onYes={() => act(async () => { await api.del(`/api/versions/${version.id}`); apply(await api.get(`/api/items/${version.item_id}`)); }, 'Draft deleted')}>Delete draft</Confirm>
        </div>
      )}
      {!version.assets.length && <p className="muted">No files yet. Import reference images, expressions, poses, voice clips, animations or Blender assets.</p>}
      {grouped.map(([label, list]) => (
        <div key={label}>
          <h4>{label}</h4>
          <div className="media-grid">
            {list.map((a) => (
              <div key={a.id} className="asset-tile">
                <MediaPreview asset={a} />
                {!locked && <Confirm className="btn ghost tiny" text="Remove?" onYes={() => act(async () => { await api.del(`/api/assets/${a.id}`); apply(await api.get(`/api/items/${version.item_id}`)); }, 'Removed')}>✕</Confirm>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
