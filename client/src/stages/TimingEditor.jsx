import { useEffect, useRef, useState } from 'react';
import { api, fmtTime } from '../api.js';
import { useStudio, useAction } from '../ui.jsx';
import { sungLine } from '../langs.jsx';

/** Mark when each lyric line starts and ends in the approved audio. Gaps = intro / breaks / outro. */
export default function TimingEditor() {
  const { episode, setEpisode, toast } = useStudio();
  const [act, busy] = useAction();
  const audioRef = useRef();
  const lyr = episode.lyrics.find((l) => l.id === episode.approved_lyrics_id);
  const lines = lyr ? lyr.sections.flatMap((s) => s.lines).filter((x) => sungLine(x, episode.language).trim() || x.en?.trim()) : [];
  const t = episode.timing || {};
  const init = () => lines.map((l, i) => { const g = t.lines?.find((x) => x.i === i) || {}; return { i, text: sungLine(l, episode.language) || l.en, start: g.start ?? null, end: g.end ?? null }; });
  const [rows, setRows] = useState(init);
  const [now, setNow] = useState(0);
  const [tap, setTap] = useState(-1); // index of the line whose start comes next
  const [intro, setIntro] = useState(2), [outro, setOutro] = useState(1);
  useEffect(() => { setRows(init()); }, [episode.timing, episode.approved_lyrics_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const master = episode.master_audio;
  const dur = master?.duration || 0;
  const dirty = JSON.stringify(rows.map((r) => [r.start, r.end])) !== JSON.stringify(init().map((r) => [r.start, r.end]));
  const mismatch = t.lines?.length && (t.audio_id !== episode.master_audio_id || t.lyrics_id !== episode.approved_lyrics_id);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    let raf; const loop = () => { setNow(a.currentTime); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [master?.url]);

  const set = (i, k, v) => setRows((rs) => rs.map((r) => (r.i === i ? { ...r, [k]: v === '' || v == null ? null : +Number(v).toFixed(2) } : r)));
  const markStart = () => {
    const a = audioRef.current; const tm = +a.currentTime.toFixed(2);
    const next = tap + 1;
    if (next >= rows.length) return;
    setRows((rs) => rs.map((r) => (r.i === next ? { ...r, start: tm } : r.i === tap && (r.end == null || r.end > tm) ? { ...r, end: +(tm - 0.05).toFixed(2) } : r)));
    setTap(next);
  };
  const markEnd = () => { if (tap < 0) return; const tm = +audioRef.current.currentTime.toFixed(2); set(tap, 'end', tm); };
  useEffect(() => {
    const k = (e) => { if (tap < -1 || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 's' || e.key === 'S') markStart(); if (e.key === 'e' || e.key === 'E') markEnd(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  const playFrom = (s) => { const a = audioRef.current; a.currentTime = s || 0; a.play(); };

  if (!lyr) return <div className="card muted">Approve the lyrics first to mark their timing.</div>;
  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h3>Lyric timing {t.approved && !mismatch ? <span className="pill ok">Approved</span> : <span className="pill muted">Not approved</span>}</h3>
          <p className="muted small">Mark when each line is sung. Leave gaps for instrumental intros, breaks and outros. Stage 4 uses these times to place shots.</p>
        </div>
        <div className="row wrap">
          <label className="small">Intro <input type="number" step="0.5" value={intro} onChange={(e) => setIntro(Number(e.target.value))} /> s</label>
          <label className="small">Outro <input type="number" step="0.5" value={outro} onChange={(e) => setOutro(Number(e.target.value))} /> s</label>
          <button className="btn small" disabled={busy} onClick={() => act(async () => setEpisode(await api.post(`/api/episodes/${episode.id}/timing/auto`, { intro, outro })), 'Spread evenly — fine-tune by ear')}>Auto-spread</button>
        </div>
      </div>
      {mismatch && <div className="alert">The approved lyrics or audio changed since this timing was made. The old times are kept below — check them and approve again.</div>}
      {!master ? <div className="alert">Approve a take and set it as the final audio first.</div> : (
        <>
          <audio ref={audioRef} src={master.url} controls preload="auto" className="timing-audio" />
          <div className="timing-bar" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); playFrom(((e.clientX - r.left) / r.width) * dur); }}>
            {rows.map((r) => r.start != null && r.end != null && (
              <div key={r.i} className={`tseg ${r.i === tap ? 'cur' : ''}`} style={{ left: `${(r.start / dur) * 100}%`, width: `${Math.max(0.5, ((r.end - r.start) / dur) * 100)}%` }} title={r.text}>{r.i + 1}</div>
            ))}
            <div className="tl-playhead" style={{ left: `${(now / Math.max(dur, 0.01)) * 100}%`, height: '100%' }} />
          </div>
          <div className="row wrap">
            <span className="mono small">{fmtTime(now)} / {fmtTime(dur)}</span>
            <span className="grow" />
            <button className="btn small" onClick={() => { setTap(-1); playFrom(0); }}>▶ Tap along from the start</button>
            <button className="btn primary small" disabled={tap >= rows.length - 1} onClick={markStart}>Next line starts now (S)</button>
            <button className="btn small" disabled={tap < 0} onClick={markEnd}>Line {tap + 1} ends now (E)</button>
          </div>
        </>
      )}
      <table className="table timing-table">
        <thead><tr><th>#</th><th>Line</th><th>Start</th><th>End</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.i} className={`${r.i === tap ? 'active' : ''} ${now >= (r.start ?? 1e9) && now < (r.end ?? -1) ? 'playing' : ''}`}>
              <td className="mono">{r.i + 1}</td>
              <td>{r.text}</td>
              <td><input type="number" step="0.05" value={r.start ?? ''} onChange={(e) => set(r.i, 'start', e.target.value)} /></td>
              <td><input type="number" step="0.05" value={r.end ?? ''} onChange={(e) => set(r.i, 'end', e.target.value)} /></td>
              <td className="actions">
                <button className="btn ghost tiny" disabled={r.start == null || !master} onClick={() => playFrom(r.start)}>▶</button>
                {r.end != null && r.start != null && r.end <= r.start && <span className="error-text small">end ≤ start</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row end">
        <button className="btn" disabled={busy || !dirty} onClick={() => act(async () => setEpisode(await api.put(`/api/episodes/${episode.id}/timing`, { lines: rows })), 'Timing saved')}>Save timing</button>
        <button className="btn approve" disabled={busy || dirty || !master} title={dirty ? 'Save first' : ''} onClick={() => act(async () => { setEpisode(await api.post(`/api/episodes/${episode.id}/timing/approve`)); toast('Timing approved — Stage 4 will use it'); })}>✓ Approve timing</button>
      </div>
    </div>
  );
}

export function MixPanel() {
  const { episode, setEpisode } = useStudio();
  const [act, busy] = useAction();
  const inst = episode.audio.filter((a) => a.category === 'instrumental');
  const voc = episode.audio.filter((a) => a.category === 'vocal' || a.category === 'guide');
  const [f, setF] = useState({ instrumental_id: '', vocal_id: '', music_gain: 1, vocal_gain: 1 });
  if (!inst.length || !voc.length) return <p className="muted small">Upload an <b>instrumental</b> and a <b>vocal</b> take separately to mix them here — or upload a finished song.</p>;
  return (
    <div className="card">
      <h3>Mix music + vocals</h3>
      <div className="row wrap">
        <select value={f.instrumental_id} onChange={(e) => setF({ ...f, instrumental_id: Number(e.target.value) })}><option value="">Instrumental…</option>{inst.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        <label className="small">Music level <input type="range" min="0" max="2" step="0.05" value={f.music_gain} onChange={(e) => setF({ ...f, music_gain: Number(e.target.value) })} /></label>
        <select value={f.vocal_id} onChange={(e) => setF({ ...f, vocal_id: Number(e.target.value) })}><option value="">Vocals…</option>{voc.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        <label className="small">Vocal level <input type="range" min="0" max="2" step="0.05" value={f.vocal_gain} onChange={(e) => setF({ ...f, vocal_gain: Number(e.target.value) })} /></label>
        <button className="btn primary" disabled={busy || !f.instrumental_id || !f.vocal_id} onClick={() => act(async () => setEpisode(await api.post(`/api/episodes/${episode.id}/audio/mix`, f)), 'Mixed — review and approve the new take below')}>Mix into a new song take</button>
      </div>
    </div>
  );
}
