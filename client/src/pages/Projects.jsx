import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, JobList, Field, Confirm } from '../ui.jsx';
import { LanguageSelect, langName } from '../langs.jsx';
import Icon from '../icons.jsx';

export default function Projects() {
  const { openProject, toast, refreshEpisodes } = useStudio();
  const [data, setData] = useState(null);
  const [creating, setCreating] = useState(false);
  const [act] = useAction();

  const load = useCallback(() => api.get('/api/dashboard').then(setData).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  if (!data) return <div className="muted">Loading…</div>;

  return (
    <div className="stack">
      <div className="projects-head">
        <button className="new-project" onClick={() => setCreating(true)}>
          <span className="plus"><Icon name="plus" size={20} /></span>
          <span><b>New project</b><small>Lyrics → Characters & Scenery → Music → Assemble</small></span>
        </button>
        <div className="stats">
          <a className="stat" href="#/characters"><b>{data.counts.character || 0}</b>Characters</a>
          <a className="stat" href="#/locations"><b>{(data.counts.location || 0) + (data.counts.prop || 0)}</b>Scenery & props</a>
        </div>
      </div>

      {creating && <NewProject onCancel={() => setCreating(false)} onCreated={async (ep) => { await refreshEpisodes(); openProject(ep.id, 'lyrics'); }} />}

      <h3>Your projects</h3>
      <div className="episode-grid">
        {data.episodes.map((e) => {
          const next = e.progress.stages.find((s) => !s.done);
          return (
            <div className="card episode-card" key={e.id}>
              {e.thumbnail_url ? <img className="thumb" src={e.thumbnail_url} alt="" /> : <div className="thumb empty-thumb">#{e.number}</div>}
              <div className="card-body">
                <h4>#{e.number} {e.title}</h4>
                <div className="muted small"><span className="tag">{langName(e.language)}</span>{e.cast.join(' · ') || 'No characters yet'}</div>
                <div className="stage-strip">
                  {e.progress.stages.map((s) => (
                    <button key={s.key} className={`stage-pill ${s.done ? 'done' : ''}`} title={s.detail} onClick={() => openProject(e.id, s.key)}>
                      <span>{s.done ? '✓' : s.n}</span>{s.label}
                    </button>
                  ))}
                </div>
                <div className="row wrap">
                  <button className="btn primary small" onClick={() => openProject(e.id, next?.key || 'assemble')}>{next ? `Continue: ${next.n}. ${next.label} →` : 'Open (finished) →'}</button>
                  <span className="grow" />
                  <Confirm text="Delete this project? Locked characters stay in My World." onYes={() => act(async () => { await api.del(`/api/episodes/${e.id}`); await refreshEpisodes(); load(); }, 'Project deleted')}>Delete…</Confirm>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!data.episodes.length && <div className="empty">No projects yet. Click <b>New project</b> to start with lyrics.</div>}

      <h3>Recent renders</h3>
      <JobList jobs={data.jobs} />
    </div>
  );
}

function NewProject({ onCancel, onCreated }) {
  const [act, busy] = useAction();
  const [f, setF] = useState({ title: '', language: 'ta' });
  const create = () => act(async () => onCreated(await api.post('/api/episodes', f)), 'Project created — start with the lyrics');
  return (
    <div className="card new-project-form">
      <h3>New project</h3>
      <div className="grid2">
        <Field label="Project name"><input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Elephant and Monkey at the River" onKeyDown={(e) => e.key === 'Enter' && f.title.trim() && create()} /></Field>
        <Field label="Language" hint={f.language === 'en' ? 'Lyrics in English only.' : `Lyrics sung in ${langName(f.language)}, with an English meaning line for you (not sung).`}>
          <LanguageSelect value={f.language} onChange={(language) => setF({ ...f, language })} />
        </Field>
      </div>
      <div className="row end">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={!f.title.trim() || busy} onClick={create}>Create & go to Stage 1: Lyrics →</button>
      </div>
    </div>
  );
}
