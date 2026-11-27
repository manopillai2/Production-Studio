import { api } from '../api.js';
import { askReference } from '../reference.jsx';
import { useStudio, useAction, Assistant, Placeholder, useCopy, ReviewBanner, mmss } from '../ui.jsx';
import { fmtTime } from '../api.js';
import { MusicInner } from '../pages/Music.jsx';
import TimingEditor, { MixPanel } from './TimingEditor.jsx';

export default function StageMusic() {
  const { episode, setEpisode, health, go } = useStudio();
  const [act, busy] = useAction();
  const copy = useCopy();
  const brief = episode.music_brief || {};
  const options = brief.options || [];
  const chosen = Number.isInteger(brief.chosen) ? options[brief.chosen] : null;
  const claudeOn = health?.providers?.find((p) => p.id === 'claude')?.state === 'active';
  const lyr = episode.lyrics.find((l) => l.id === episode.approved_lyrics_id) || episode.lyrics.at(-1);
  const lyricsText = lyr ? lyr.sections.map((s) => `[${s.label}]\n${s.lines.map((l) => [l.ta, l.en].filter(Boolean).join('\n')).join('\n')}`).join('\n\n') : '';
  const musicTools = health?.providers?.filter((p) => p.stage === 'music') || [];

  const recommend = (mode) => act(async () => {
    const reference = mode === 'offline' ? undefined : await askReference('music.recommend', 'Recommend music for these lyrics');
    if (mode !== 'offline' && !reference) return;
    setEpisode((await api.post(`/api/episodes/${episode.id}/music/recommend`, { mode, reference })).episode);
  }, 'Music directions ready');

  const master = episode.master_audio;
  return (
    <div className="stack">
      <ReviewBanner flagKey="timing" />
      <div className="card duration-card">
        <div className="row wrap">
          <b>Final audio:</b>
          {master ? <><span className="mono">{fmtTime(master.duration)}</span><span className="muted small">“{master.label}” · this is now the real length (the {mmss(episode.target_duration)} target in Stage 1 was only for planning)</span></>
            : <span className="muted">none approved yet — planning target {mmss(episode.target_duration)}. Upload a finished song, or music and vocals separately, below.</span>}
        </div>
      </div>
      <div className="stage-grid">
        <div className="stack">
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Music direction</h3>
                <p className="muted small">{brief.source === 'claude' ? 'Recommended by Claude from your lyrics.' : brief.source === 'offline' ? 'Starter presets (offline). Connect Claude for recommendations tailored to your lyrics.' : 'Get recommendations, pick one, then create or import the song.'}</p>
              </div>
              <div className="row wrap">
                <button className="btn primary" disabled={busy || !claudeOn} onClick={() => recommend('ai')}>✨ Recommend music</button>
                <button className="btn" disabled={busy} onClick={() => recommend('offline')}>Starter presets</button>
              </div>
            </div>
            <div className="music-options">
              {options.map((o, i) => (
                <div key={i} className={`music-opt ${brief.chosen === i ? 'chosen' : ''}`}>
                  <div className="row"><b className="grow">{o.title}</b>{brief.chosen === i && <span className="badge approved">Chosen</span>}</div>
                  <div className="small">{o.style}</div>
                  <div className="kv small">
                    <span>⏱ {o.tempo_bpm} BPM</span><span>🎼 {o.key}</span><span>{o.time_signature}</span><span>😊 {o.mood}</span>
                  </div>
                  <div className="chips">{(o.instruments || []).map((x) => <span key={x} className="chip static">{x}</span>)}</div>
                  <div className="small"><b>Vocal:</b> {o.vocal}</div>
                  <div className="small muted"><b>Structure:</b> {o.structure}</div>
                  <div className="row wrap">
                    {brief.chosen !== i && <button className="btn small approve" onClick={() => act(async () => setEpisode(await api.put(`/api/episodes/${episode.id}/music/choose`, { index: i })), `“${o.title}” chosen`)}>Choose this</button>}
                    <button className="btn small" onClick={() => copy(o.music_ai_prompt, 'Music prompt copied')}>📋 Copy prompt</button>
                    <button className="btn small" onClick={() => copy(`${o.music_ai_prompt}\n\nLyrics:\n${lyricsText}`, 'Prompt + lyrics copied')}>📋 Prompt + lyrics</button>
                  </div>
                </div>
              ))}
            </div>
            {!options.length && <p className="muted">No directions yet.</p>}
          </div>

          <div className="card">
            <h3>Create the song with a music AI</h3>
            <p className="muted small">Send the final lyrics + {chosen ? <>“{chosen.title}”</> : 'the chosen direction'} to a connected tool, or copy the prompt into any tool you like and import the result below.</p>
            <div className="row wrap">
              {musicTools.map((t) => (
                <span key={t.id} className="row">
                  <button className="btn" disabled={t.state !== 'active' || !chosen} onClick={() => act(() => api.post('/api/generate/music', { provider: t.id, episode_id: episode.id }))}>🎤 Sing with {t.label}</button>
                  {t.state !== 'active' && <Placeholder>{t.state === 'placeholder' ? 'placeholder' : 'not connected'}</Placeholder>}
                </span>
              ))}
              <button className="btn ghost small" onClick={() => go('connections')}>Manage connections</button>
            </div>
          </div>
        </div>

        <Assistant
          scope="music" episodeId={episode.id} title="Music assistant"
          intro="Ask for music ideas: “make it a Carnatic-style sing-along”, “faster and bouncier”, “a lullaby version”. I'll update the direction cards."
          chips={['Recommend music for these lyrics', 'More Tamil folk feel', 'Faster and bouncier', 'Make a lullaby version', 'Which one suits toddlers best?']}
          refAction="music.assistant"
          send={async (message, reference) => { const r = await api.post(`/api/episodes/${episode.id}/music/recommend`, { message, reference }); setEpisode(r.episode); return r; }}
        />
      </div>

      <h3>Song takes & final audio</h3>
      <MusicInner />
      <MixPanel />
      <TimingEditor />
    </div>
  );
}
