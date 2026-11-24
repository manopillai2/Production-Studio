import { useState } from 'react';
import { api, fmtTime, resLabel } from '../api.js';
import { useStudio, useAction, Badge, ImportButton, NeedEpisode, EditField, Confirm, Placeholder, useCopy } from '../ui.jsx';

const LOOKS = ['Bright colorful 3D', 'Soft pastel 3D', 'Blender render', '2D storybook'];

export default function Animation() { return <NeedEpisode><AnimationInner /></NeedEpisode>; }

/** Ready-to-paste prompt for any animation AI, built from the locked designs. */
export function animationPrompt(episode, shot) {
  const c = episode.cast.find((x) => x.item_id === shot.character_item_id);
  const l = episode.cast.find((x) => x.item_id === shot.location_item_id);
  const desc = (x) => x && [x.name, x.version?.spec?.look || x.version?.spec?.description || x.description].filter(Boolean).join(': ');
  return [
    `${shot.look || 'Bright colorful 3D'} animation for a children's nursery rhyme, 16:9, ${Math.round(shot.duration || 4)} seconds, smooth gentle motion, consistent character design.`,
    c && `Character — ${desc(c)}.`,
    l && `Setting — ${desc(l)}${l.version?.spec?.lighting ? `. Lighting: ${l.version.spec.lighting}` : ''}.`,
    shot.motion_notes && `Action: ${shot.motion_notes}.`,
    shot.lyric_cue && `Lyric being sung: "${shot.lyric_cue}".`,
  ].filter(Boolean).join('\n');
}

export function AnimationInner() {
  const { episode, refreshEpisode, setEpisode, health } = useStudio();
  const [act, busy] = useAction();
  const lyr = episode.lyrics.find((l) => l.id === episode.approved_lyrics_id);
  const cueOptions = lyr ? lyr.sections.flatMap((s) => s.lines.map((l) => l.en || l.ta).filter(Boolean)) : [];
  const videoActive = health?.providers?.some((p) => (p.id === 'kling' || p.id === 'veo') && p.state === 'active');
  const approved = episode.shots.filter((s) => s.approved_clip_id).length;

  return (
    <div className="stack">
      <div className="row wrap">
        <span className="muted">{episode.shots.length} shots · {approved} with approved clips · total {fmtTime(episode.timeline.at(-1)?.end || 0)}</span>
        <span className="grow" />
        {!videoActive && <Placeholder>Kling / Veo: placeholder</Placeholder>}
        <button className="btn primary" disabled={busy} onClick={() => act(async () => setEpisode(await api.post(`/api/episodes/${episode.id}/shots`, {
          character_item_id: episode.cast.find((c) => c.kind === 'character')?.item_id,
          location_item_id: episode.cast.find((c) => c.kind === 'location')?.item_id,
        })), 'Shot added')}>+ Add shot</button>
      </div>
      {!lyr && <div className="alert">Approve lyrics first to pick lyric cues from a list.</div>}
      <div className="storyboard">
        {episode.shots.map((s, i) => <ShotCard key={s.id} shot={s} index={i} cueOptions={cueOptions} videoActive={videoActive} act={act} refresh={refreshEpisode} />)}
      </div>
      {!episode.shots.length && <div className="empty">No shots yet. Add one card per shot.</div>}
    </div>
  );
}

function ShotCard({ shot, index, cueOptions, videoActive, act, refresh }) {
  const { episode } = useStudio();
  const copy = useCopy();
  const [pickRef, setPickRef] = useState(false);
  const save = (patch, msg = 'Saved') => act(async () => { await api.put(`/api/shots/${shot.id}`, patch); await refresh(); }, msg);
  const chars = episode.cast.filter((c) => c.kind === 'character');
  const locs = episode.cast.filter((c) => c.kind !== 'character');
  // Reference frames come from the episode's pinned (approved) versions only.
  const refPool = episode.cast
    .filter((c) => [shot.character_item_id, shot.location_item_id].includes(c.item_id) || c.kind === 'prop')
    .flatMap((c) => (c.version?.assets || []).filter((a) => a.mime.startsWith('image/')).map((a) => ({ ...a, from: c.name })));
  const extraRefs = shot.clips.filter((a) => a.mime.startsWith('image/'));
  const clips = shot.clips.filter((a) => a.mime.startsWith('video/'));
  const seg = episode.timeline[index];

  return (
    <div className={`card shot-card ${shot.approved_clip ? 'has-clip' : ''}`}>
      <div className="shot-head">
        <span className="shot-no">{index + 1}</span>
        <EditField value={shot.title} onSave={(title) => save({ title })} />
        <Confirm className="btn ghost tiny" text="Delete shot?" onYes={() => act(async () => { await api.del(`/api/shots/${shot.id}`); await refresh(); }, 'Shot deleted')}>✕</Confirm>
      </div>

      <div className="shot-preview">
        {shot.approved_clip ? <video src={shot.approved_clip.url} controls muted preload="metadata" />
          : shot.ref_asset ? <img src={shot.ref_asset.url} alt="reference" /> : <div className="media-empty">No clip yet</div>}
        {shot.approved_clip && <span className="res-tag">{resLabel(shot.approved_clip) || 'resolution unknown'}</span>}
      </div>

      <label className="field"><span>Lyric cue</span>
        <input list={`cues-${shot.id}`} defaultValue={shot.lyric_cue} key={shot.lyric_cue} onBlur={(e) => e.target.value !== shot.lyric_cue && save({ lyric_cue: e.target.value })} />
        <datalist id={`cues-${shot.id}`}>{cueOptions.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <div className="grid2">
        <label className="field"><span>Character</span>
          <select value={shot.character_item_id || ''} onChange={(e) => save({ character_item_id: Number(e.target.value) || null })}>
            <option value="">—</option>{chars.map((c) => <option key={c.item_id} value={c.item_id}>{c.name} ({c.version_label})</option>)}
          </select>
        </label>
        <label className="field"><span>Location</span>
          <select value={shot.location_item_id || ''} onChange={(e) => save({ location_item_id: Number(e.target.value) || null })}>
            <option value="">—</option>{locs.map((c) => <option key={c.item_id} value={c.item_id}>{c.name} ({c.version_label})</option>)}
          </select>
        </label>
      </div>

      <div className="field"><span>Reference frame</span>
        <div className="row">
          {shot.ref_asset ? <img className="ref-thumb" src={shot.ref_asset.url} alt="" /> : <span className="muted small">none</span>}
          <button className="btn small" onClick={() => setPickRef(!pickRef)}>Choose…</button>
          <ImportButton className="btn small" label="Import" accept="image/*" multiple={false}
            onFiles={(f) => act(async () => { const s = await api.upload(`/api/shots/${shot.id}/clips`, f, { category: 'reference' }); await api.put(`/api/shots/${shot.id}`, { ref_asset_id: s.clips.at(-1).id }); await refresh(); }, 'Reference frame imported')} />
        </div>
        {pickRef && (
          <div className="ref-picker">
            {[...refPool, ...extraRefs].map((a) => (
              <button key={a.id} className={a.id === shot.ref_asset_id ? 'on' : ''} title={`${a.from || 'shot'} · ${a.label}`} onClick={() => { setPickRef(false); save({ ref_asset_id: a.id }, 'Reference frame set'); }}>
                <img src={a.url} alt="" />
              </button>
            ))}
            {!refPool.length && !extraRefs.length && <span className="muted small">Pinned character/location versions have no images.</span>}
          </div>
        )}
      </div>

      <label className="field"><span>Motion notes</span><EditField multiline value={shot.motion_notes} onSave={(motion_notes) => save({ motion_notes })} /></label>
      <div className="grid2">
        <label className="field"><span>Look</span>
          <select value={shot.look} onChange={(e) => save({ look: e.target.value })}>{LOOKS.map((l) => <option key={l}>{l}</option>)}</select>
        </label>
        <label className="field"><span>{shot.approved_clip ? 'On timeline' : 'Planned duration (s)'}</span>
          {shot.approved_clip ? <div className="muted">{fmtTime(seg?.length)} (trim in Studio)</div>
            : <EditField type="number" value={shot.duration} onSave={(duration) => save({ duration })} />}
        </label>
      </div>

      <div className="clips">
        <div className="row">
          <b className="grow">Clips ({clips.length})</b>
          <ImportButton className="btn small" label="Import clip" accept="video/*" onFiles={(f) => act(async () => { await api.upload(`/api/shots/${shot.id}/clips`, f, { category: 'clip' }); await refresh(); }, 'Clip imported as Draft')} />
          <button className="btn small" title="Copy a prompt for Kling / Veo / Runway / any animation AI" onClick={() => copy(animationPrompt(episode, shot), 'Animation prompt copied')}>📋 Prompt</button>
          <button className="btn small" disabled={!videoActive} title="Kling / Veo integration point" onClick={() => act(() => api.post('/api/generate/video', { shot_id: shot.id, provider: 'kling' }))}>✨ Generate</button>
        </div>
        {clips.map((c) => (
          <div key={c.id} className={`clip-row ${c.id === shot.approved_clip_id ? 'approved' : ''}`}>
            <video src={c.url} muted preload="metadata" onMouseEnter={(e) => e.target.play()} onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }} />
            <div className="grow">
              <div className="small">{c.label}</div>
              <div className="muted small">{resLabel(c) || 'resolution unknown'} · {fmtTime(c.duration)}</div>
            </div>
            {c.id === shot.approved_clip_id ? <Badge status="approved" />
              : <button className="btn approve tiny" onClick={() => act(async () => { await api.post(`/api/shots/${shot.id}/approve-clip`, { asset_id: c.id }); await refresh(); }, 'Clip approved for the timeline')}>✔ Approve</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
