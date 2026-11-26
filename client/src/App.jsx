import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { StudioContext, Toasts, useToasts } from './ui.jsx';
import Projects from './pages/Projects.jsx';
import Project, { STAGES } from './pages/Project.jsx';
import Channel from './pages/Channel.jsx';
import Library from './pages/Library.jsx';
import Connections from './pages/Connections.jsx';
import MotionLibrary from './pages/MotionLibrary.jsx';
import AnimationStudio from './pages/AnimationStudio.jsx';
import WorldStyle from './pages/WorldStyle.jsx';
import Icon, { AppMark } from './icons.jsx';

const parseRoute = () => {
  const parts = window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  if (parts[0] === 'project' && parts[1]) return { page: 'project', projectId: Number(parts[1]), stage: parts[2] || 'lyrics' };
  return { page: parts[0] || 'projects' };
};

export default function App() {
  const [route, setRoute] = useState(parseRoute());
  const [episodes, setEpisodes] = useState([]);
  const [episode, setEpisode] = useState(null);
  const [channel, setChannel] = useState(null);
  const [health, setHealth] = useState(null);
  const { toasts, push } = useToasts();
  const episodeId = route.page === 'project' ? route.projectId : null;

  useEffect(() => {
    const on = () => setRoute(parseRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = useCallback((p) => { window.location.hash = `/${p}`; }, []);
  const openProject = useCallback((id, stage = 'lyrics') => go(`project/${id}/${stage}`), [go]);
  const setEpisodeId = useCallback((id) => { if (id) openProject(id); }, [openProject]);

  const refreshEpisodes = useCallback(async () => { const l = await api.get('/api/episodes'); setEpisodes(l); return l; }, []);
  const refreshEpisode = useCallback(async (id = episodeId) => {
    if (!id) { setEpisode(null); return null; }
    try { const e = await api.get(`/api/episodes/${id}`); setEpisode(e); return e; }
    catch (err) { push(err.message, 'error'); setEpisode(null); return null; }
  }, [episodeId, push]);
  const refreshChannel = useCallback(async () => setChannel(await api.get('/api/channel')), []);
  const refreshHealth = useCallback(async () => setHealth(await api.get('/api/health')), []);

  useEffect(() => {
    Promise.all([refreshHealth(), refreshEpisodes(), refreshChannel()]).catch((e) => push(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (episode?.id !== episodeId) setEpisode(null); refreshEpisode(episodeId); }, [episodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo(() => ({
    toast: push, go, openProject, episodes, episodeId, episode, setEpisode, setEpisodeId,
    refreshEpisode, refreshEpisodes, channel, refreshChannel, health, refreshHealth, route,
  }), [push, go, openProject, episodes, episodeId, episode, setEpisodeId, refreshEpisode, refreshEpisodes, channel, refreshChannel, health, refreshHealth, route]);

  let pageEl, title;
  switch (route.page) {
    case 'project': pageEl = <Project />; title = episode ? episode.title : 'Project'; break;
    case 'characters': pageEl = <Library key="character" kind="character" />; title = 'My World · Characters'; break;
    case 'rigged': pageEl = <Library key="rigged" kind="character" rigged />; title = 'My World · Characters with rig'; break;
    case 'props': pageEl = <Library key="prop" kind="prop" />; title = 'My World · Props'; break;
    case 'locations': pageEl = <Library key="location" kind="location" />; title = 'My World · Scenery'; break;
    case 'motion': pageEl = <MotionLibrary />; title = 'My World · Rigs & Clips'; break;
    case 'animstudio': pageEl = <AnimationStudio />; title = 'My World · Animation Studio'; break;
    case 'world': pageEl = <WorldStyle />; title = 'My World · World Style'; break;
    case 'channel': pageEl = <Channel />; title = 'Channel Identity'; break;
    case 'connections': pageEl = <Connections />; title = 'AI Connections'; break;
    default: pageEl = <Projects />; title = 'Projects';
  }
  const navLink = (id, icon, label) => <a href={`#/${id}`} className={route.page === id ? 'active' : ''}><Icon name={icon} />{label}</a>;
  const claude = health?.providers?.find((p) => p.id === 'claude');

  return (
    <StudioContext.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <AppMark />
            <div><b className="wordmark">Rhymes Automation</b><small>{channel?.name}</small></div>
          </div>
          <nav>
            <a href="#/projects" className={route.page === 'projects' ? 'active' : ''}><Icon name="projects" />Projects<span className="count">{episodes.length}</span></a>
            {route.page === 'project' && episode && (
              <div className="nav-project">
                <div className="nav-project-title">#{episode.number} {episode.title}</div>
                {STAGES.map((s) => {
                  const st = episode.progress.stages.find((x) => x.key === s.key);
                  return (
                    <a key={s.key} href={`#/project/${episode.id}/${s.key}`} className={route.stage === s.key ? 'active' : ''}>
                      <span className={`stage-dot ${st?.done ? 'done' : ''}`}>{st?.done ? <Icon name="check" size={10} /> : s.n}</span>{s.label}
                    </a>
                  );
                })}
              </div>
            )}
            <div className="nav-group">My World (locked library)</div>
            {navLink('world', 'palette', 'World Style')}
            {navLink('characters', 'cast', 'Characters')}
            {navLink('rigged', 'assemble', 'Characters with rig')}
            {navLink('props', 'sparkle', 'Props')}
            {navLink('locations', 'scenery', 'Scenery')}
            {navLink('motion', 'assemble', 'Rigs & Clips')}
            {navLink('animstudio', 'sparkle', 'Animation Studio')}
            <div className="nav-group">Settings</div>
            {navLink('channel', 'palette', 'Channel Identity')}
            {navLink('connections', 'plug', 'AI Connections')}
          </nav>
          <div className="sidebar-foot">
            {health && (
              <>
                <div className="sys-row"><span className={`sys-dot ${claude?.state === 'active' ? 'ok' : ''}`} />Assistant<b>{claude?.state === 'active' ? 'On' : 'Off'}</b></div>
                <div className="sys-row"><span className={`sys-dot ${health.ffmpeg ? 'ok' : 'bad'}`} />FFmpeg<b>{health.ffmpeg ? 'Ready' : 'Missing'}</b></div>
                <div className="sys-row"><span className={`sys-dot ${health.paidGenerationEnabled ? 'warn' : ''}`} />Paid generation<b>{health.paidGenerationEnabled ? 'On' : 'Off'}</b></div>
              </>
            )}
          </div>
        </aside>
        <main>
          <header className="topbar">
            <h1>{title}</h1>
            {route.page === 'project' && episode && <span className="progress-mini" title="Project progress">
              <span className="segbar">{episode.progress.stages.map((s) => <i key={s.key} className={s.done ? 'done' : ''} />)}</span>
              {episode.progress.stages.filter((s) => s.done).length}/4 stages
            </span>}
          </header>
          <section className="content">{pageEl}</section>
        </main>
        <Toasts toasts={toasts} />
      </div>
    </StudioContext.Provider>
  );
}
