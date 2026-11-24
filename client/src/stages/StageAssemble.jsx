import { api } from '../api.js';
import { useStudio, useAction, Confirm, Placeholder, mmss } from '../ui.jsx';
import { AnimationInner } from '../pages/Animation.jsx';
import { StudioInner } from '../pages/Studio.jsx';

export default function StageAssemble() {
  const { episode, setEpisode, openProject, health, go } = useStudio();
  const [act, busy] = useAction();
  const lyr = episode.lyrics.find((l) => l.id === episode.approved_lyrics_id);
  const brief = episode.music_brief || {};
  const chosen = Number.isInteger(brief.chosen) ? brief.options?.[brief.chosen] : null;
  const unlocked = episode.cast.filter((c) => !c.locked);
  const animTools = health?.providers?.filter((p) => p.stage === 'animation') || [];
  const hasClips = episode.shots.some((s) => s.approved_clip_id);
  const build = () => act(async () => setEpisode(await api.post(`/api/episodes/${episode.id}/storyboard/build`)), 'Storyboard built — one shot per lyric line');

  return (
    <div className="stack">
      <div className="summary-grid">
        <button className={`summary ${lyr ? 'ok' : ''}`} onClick={() => openProject(episode.id, 'lyrics')}>
          <b>1 · Lyrics</b>
          {lyr ? <><span>🔒 {lyr.title}</span><small>{lyr.sections.flatMap((s) => s.lines).length} lines</small></> : <span className="warn">Not finalized</span>}
        </button>
        <button className={`summary ${episode.cast.length && !unlocked.length ? 'ok' : ''}`} onClick={() => openProject(episode.id, 'cast')}>
          <b>2 · Characters & Scenery</b>
          <span className="summary-thumbs">
            {episode.cast.map((c) => { const img = c.version?.assets.find((a) => a.mime.startsWith('image/')); return img ? <img key={c.item_id} src={img.url} title={c.name} alt="" /> : <span key={c.item_id} className="tag">{c.name}</span>; })}
          </span>
          {unlocked.length > 0 ? <small className="warn">{unlocked.map((c) => c.name).join(', ')} not locked yet</small> : <small>{episode.cast.length} locked</small>}
        </button>
        <button className={`summary ${episode.master_audio ? 'ok' : ''}`} onClick={() => openProject(episode.id, 'music')}>
          <b>3 · Music</b>
          <span>{chosen ? chosen.title : 'No direction chosen'}</span>
          {episode.master_audio ? <small>★ {episode.master_audio.label} · {mmss(episode.master_audio.duration)}</small> : <small className="warn">No master song yet</small>}
        </button>
        <div className={`summary ${episode.shots.length && episode.shots.every((s) => s.approved_clip_id) ? 'ok' : ''}`}>
          <b>4 · Storyboard</b>
          <span>{episode.shots.length} shots · {episode.shots.filter((s) => s.approved_clip_id).length} clips approved</span>
          {hasClips
            ? <small>Built — edit shots below</small>
            : episode.shots.length
              ? <Confirm className="btn small" text="Replace the current shots with one shot per lyric line?" onYes={build}>↻ Rebuild from lyrics</Confirm>
              : <button className="btn small primary" disabled={busy || !lyr} onClick={build}>✨ Build from final lyrics</button>}
        </div>
      </div>

      <div className="card">
        <div className="row wrap">
          <b>Animation tools</b>
          {animTools.map((t) => <span key={t.id} className="row small">{t.label} {t.state === 'active' ? <span className="ok">● connected</span> : <Placeholder>{t.state === 'placeholder' ? 'placeholder' : 'not connected'}</Placeholder>}</span>)}
          <span className="grow" />
          <button className="btn ghost small" onClick={() => go('connections')}>Manage connections</button>
        </div>
        <p className="muted small">For each shot: copy its animation prompt (built from your locked character & scenery designs) into Kling, Veo, Runway or Blender, then import the clip and approve it. Approved clips flow straight into the timeline and export below.</p>
      </div>

      <h3>🎞️ Storyboard</h3>
      <AnimationInner />

      <h3>📺 Preview, captions & export</h3>
      <StudioInner />
    </div>
  );
}
