import { useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, EditField, Field } from '../ui.jsx';
import { LanguageSelect } from '../langs.jsx';
import StageLyrics from '../stages/StageLyrics.jsx';
import StageCast from '../stages/StageCast.jsx';
import StageMusic from '../stages/StageMusic.jsx';
import StageAssemble from '../stages/StageAssemble.jsx';
import Icon from '../icons.jsx';

export const STAGES = [
  { key: 'lyrics', n: 1, label: 'Lyrics', icon: 'lyrics' },
  { key: 'cast', n: 2, label: 'Characters & Scenery', icon: 'cast' },
  { key: 'music', n: 3, label: 'Music', icon: 'music' },
  { key: 'assemble', n: 4, label: 'Assemble & Export', icon: 'assemble' },
];

export default function Project() {
  const { episode, route, openProject } = useStudio();
  const [showSettings, setShowSettings] = useState(false);
  if (!episode) return <div className="muted">Loading project…</div>;
  const idx = Math.max(0, STAGES.findIndex((s) => s.key === route.stage));
  const stage = STAGES[idx];
  const Stage = { lyrics: StageLyrics, cast: StageCast, music: StageMusic, assemble: StageAssemble }[stage.key];

  return (
    <div className="stack">
      <div className="stepper">
        {STAGES.map((s, i) => {
          const st = episode.progress.stages.find((x) => x.key === s.key);
          return (
            <button key={s.key} className={`step ${i === idx ? 'current' : ''} ${st?.done ? 'done' : ''}`} onClick={() => openProject(episode.id, s.key)}>
              <span className="step-no">{st?.done ? <Icon name="check" size={13} /> : s.n}</span>
              <span className="step-text"><b><Icon name={s.icon} size={13} /> {s.label}</b><small>{st?.detail}</small></span>
              <span className={`step-bar ${st?.done ? 'done' : i === idx ? 'current' : ''}`} />
            </button>
          );
        })}
        <button className={`btn small settings-toggle ${showSettings ? 'on' : ''}`} onClick={() => setShowSettings(!showSettings)}><Icon name="settings" size={13} /> Settings</button>
      </div>
      {showSettings && <ProjectSettings />}

      <Stage key={`${episode.id}-${stage.key}`} />

      <div className="row stage-nav">
        {idx > 0 && <button className="btn" onClick={() => openProject(episode.id, STAGES[idx - 1].key)}>← {STAGES[idx - 1].n}. {STAGES[idx - 1].label}</button>}
        <span className="grow" />
        {idx < STAGES.length - 1 && <button className="btn primary" onClick={() => openProject(episode.id, STAGES[idx + 1].key)}>Next: {STAGES[idx + 1].n}. {STAGES[idx + 1].label} →</button>}
      </div>
    </div>
  );
}

function ProjectSettings() {
  const { episode, setEpisode, refreshEpisodes } = useStudio();
  const [act] = useAction();
  const save = (patch) => act(async () => { setEpisode(await api.put(`/api/episodes/${episode.id}`, patch)); refreshEpisodes(); }, 'Saved');
  return (
    <div className="card">
      <div className="grid2">
        <Field label="Project name"><EditField value={episode.title} onSave={(title) => save({ title })} /></Field>
        <Field label="Language" hint={episode.lyrics.length ? 'Changing the language does not translate existing lyrics — ask the lyrics assistant to rewrite them.' : null}>
          <LanguageSelect value={episode.language} onChange={(language) => save({ language })} />
        </Field>
      </div>
    </div>
  );
}
