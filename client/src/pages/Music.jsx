import { useRef, useState } from 'react';
import { api, fmtTime } from '../api.js';
import { useStudio, useAction, Badge, ImportButton, NeedEpisode, EditField, Confirm, Placeholder } from '../ui.jsx';

const CATS = [['hum', 'Hummed melody'], ['guide', 'Sung guide'], ['instrumental', 'Instrumental'], ['vocal', 'Vocal track'], ['song', 'Finished song / mix']];

export default function Music() { return <NeedEpisode><MusicInner /></NeedEpisode>; }

export function MusicInner() {
  const { episode, refreshEpisode, health } = useStudio();
  const [cat, setCat] = useState('song');
  const [ab, setAb] = useState([]);
  const [act, busy] = useAction();
  const toggleAb = (id) => setAb(ab.includes(id) ? ab.filter((x) => x !== id) : [...ab, id].slice(-2));

  return (
    <div className="stack">
      <div className="card master-card">
        <h3>🎚️ Master audio track</h3>
        {episode.master_audio ? (
          <div className="row wrap">
            <b>{episode.master_audio.label}</b><Badge status="master" /><span className="muted">{fmtTime(episode.master_audio.duration)}</span>
            <audio src={episode.master_audio.url} controls preload="metadata" />
          </div>
        ) : <p className="muted">No master yet. Approve a take, then “Set as master”. Importing new takes never changes the master.</p>}
      </div>

      <div className="card">
        <div className="row wrap">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <ImportButton label="Import audio" accept="audio/*,video/mp4" disabled={busy}
            onFiles={(files) => act(async () => { await api.upload(`/api/episodes/${episode.id}/audio`, files, { category: cat }); await refreshEpisode(); }, 'Imported as Draft take')} />
          <span className="muted small">Hummed melody, sung guide, instrumental, vocal stem or the finished song from your music AI.</span>
        </div>
      </div>

      {ab.length === 2 && <AB a={episode.audio.find((x) => x.id === ab[0])} b={episode.audio.find((x) => x.id === ab[1])} onClose={() => setAb([])} />}

      {CATS.map(([k, label]) => {
        const takes = episode.audio.filter((a) => a.category === k);
        if (!takes.length) return null;
        return (
          <div className="card" key={k}>
            <h3>{label}</h3>
            <table className="table takes">
              <tbody>
                {takes.map((t) => {
                  const isMaster = t.id === episode.master_audio_id;
                  return (
                    <tr key={t.id} className={isMaster ? 'is-master' : ''}>
                      <td><label className="check" title="Select two takes to A/B compare"><input type="checkbox" checked={ab.includes(t.id)} onChange={() => toggleAb(t.id)} /> A/B</label></td>
                      <td className="grow-cell"><EditField value={t.label} onSave={(label) => act(async () => { await api.put(`/api/assets/${t.id}`, { label }); await refreshEpisode(); }, 'Renamed')} />
                        <div className="muted small">{fmtTime(t.duration)} · {t.source}</div></td>
                      <td><audio src={t.url} controls preload="metadata" /></td>
                      <td>{isMaster ? <Badge status="master" /> : <Badge status={t.status} />}</td>
                      <td className="actions">
                        {t.status !== 'approved'
                          ? <button className="btn approve small" onClick={() => act(async () => { await api.post(`/api/assets/${t.id}/approve`); await refreshEpisode(); }, 'Take approved')}>✔ Approve</button>
                          : !isMaster && <button className="btn primary small" onClick={() => act(async () => { await api.post(`/api/episodes/${episode.id}/master`, { asset_id: t.id }); await refreshEpisode(); }, 'Master track set')}>★ Set as master</button>}
                        {!isMaster && t.status === 'approved' && <button className="btn ghost small" onClick={() => act(async () => { await api.post(`/api/assets/${t.id}/approve`, { status: 'draft' }); await refreshEpisode(); })}>Back to draft</button>}
                        {t.status !== 'approved' && <Confirm text="Delete take?" onYes={() => act(async () => { await api.del(`/api/assets/${t.id}`); await refreshEpisode(); }, 'Deleted')}>✕</Confirm>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** A/B compare: switch between two takes at the same playhead position. */
function AB({ a, b, onClose }) {
  const refs = [useRef(), useRef()];
  const [cur, setCur] = useState(null);
  const play = (i) => {
    const other = refs[1 - i].current, me = refs[i].current;
    const t = cur === null ? 0 : (refs[cur].current.currentTime || 0);
    other.pause();
    me.currentTime = Math.min(t, (me.duration || t) - 0.05);
    me.play();
    setCur(i);
  };
  const stop = () => { refs.forEach((r) => r.current.pause()); setCur(null); };
  return (
    <div className="card ab">
      <h3>A/B compare</h3>
      <div className="row wrap">
        {[a, b].map((t, i) => (
          <button key={t.id} className={`btn ${cur === i ? 'primary' : ''}`} onClick={() => play(i)}>{i ? 'B' : 'A'}: {t.label}</button>
        ))}
        <button className="btn ghost" onClick={stop}>■ Stop</button>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <p className="muted small">Switching keeps the same position in the song so you can hear the difference instantly.</p>
      <audio ref={refs[0]} src={a.url} preload="auto" />
      <audio ref={refs[1]} src={b.url} preload="auto" />
    </div>
  );
}
