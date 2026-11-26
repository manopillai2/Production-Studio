import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fmtTime } from '../api.js';
import { useStudio, useAction, ReviewBanner, JobList } from '../ui.jsx';
import ScenePlayer from '../engine/ScenePlayer.jsx';
import { SceneEngine, shotTimes, timelineEnd } from '../engine/SceneEngine.js';
import { captionAt, captionFontReady, drawCaption } from '../engine/captions.js';

const RES = { '720p': [1280, 720], '1080p': [1920, 1080] };

export default function StageExport() {
  const { episode, refreshEpisode, openProject, toast } = useStudio();
  const [scene, setScene] = useState(null);
  const [res, setRes] = useState('720p');
  const [run, setRun] = useState(null); // {phase, done, total, jobId, message}
  const [jobs, setJobs] = useState(episode.renders || []);
  const player = useRef();
  const offscreen = useRef();
  const load = useCallback(() => api.get(`/api/episodes/${episode.id}/scene`).then(setScene), [episode.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => setJobs(episode.renders || []), [episode.renders]);
  const active = jobs.some((j) => j.status === 'running' || j.status === 'queued');
  useEffect(() => {
    if (!active || run) return;
    const t = setInterval(async () => { const e = await refreshEpisode(); if (e) setJobs(e.renders); }, 1500);
    return () => clearInterval(t);
  }, [active, run, refreshEpisode]);

  if (!scene) return <div className="muted">Loading…</div>;
  const times = shotTimes(scene.shots, scene.timing, scene.audio?.duration);
  const duration = timelineEnd(times, scene.audio?.duration);
  const problems = [
    !scene.audio && 'No approved audio (Stage 3).',
    !scene.shots.length && 'No shots yet (Stage 4).',
  ].filter(Boolean);

  /** Render every frame with the same engine as the preview, upload in batches, then encode on the server. */
  const exportMp4 = async () => {
    const [w, h] = RES[res]; const fps = 30;
    let jobId = null;
    try {
      setRun({ phase: 'Loading models…', done: 0, total: 1 });
      const job = await api.post(`/api/episodes/${episode.id}/render/start`, { width: w, height: h, fps, duration });
      jobId = job.id;
      const canvas = offscreen.current; canvas.width = w; canvas.height = h;
      const engine = new SceneEngine(canvas, { width: w, height: h, preserveDrawingBuffer: true, pixelRatio: 1 });
      await engine.load({ shots: scene.shots, assets: scene.assets, timing: scene.timing, duration: scene.audio?.duration, audio: scene.audio });
      const total = Math.ceil(duration * fps);
      // Each frame = the 3D picture + the lyric line on top (same look as the preview).
      const lyricLines = scene.timing?.lines || [];
      await captionFontReady(lyricLines.map((l) => l.text).join(' ') || undefined);
      const comp = document.createElement('canvas'); comp.width = w; comp.height = h; const ctx = comp.getContext('2d');
      let batch = new FormData(); let n = 0;
      const flush = async () => { if (!n) return; const r = await fetch(`/api/render/${jobId}/frames`, { method: 'POST', body: batch }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Upload failed (${r.status})`); batch = new FormData(); n = 0; };
      for (let f = 0; f < total; f++) {
        engine.renderAt(f / fps);
        ctx.drawImage(canvas, 0, 0, w, h);
        drawCaption(ctx, captionAt(lyricLines, f / fps)?.text, w, h);
        const blob = await new Promise((r) => comp.toBlob(r, 'image/jpeg', 0.92));
        batch.append('frames', blob, `f${String(f).padStart(6, '0')}.jpg`); n++;
        if (n >= 30) await flush();
        if (f % 5 === 0) setRun({ phase: 'Rendering frames', done: f + 1, total, jobId });
      }
      await flush();
      engine.dispose();
      setRun({ phase: 'Encoding MP4 with the approved audio…', done: total, total, jobId });
      await api.post(`/api/render/${jobId}/finish`);
      for (;;) {
        await new Promise((r) => setTimeout(r, 1000));
        const e = await refreshEpisode(); const j = e?.renders.find((x) => x.id === jobId);
        if (e) setJobs(e.renders);
        if (!j || j.status === 'done' || j.status === 'error') { if (j?.status === 'error') throw new Error(j.message); break; }
      }
      toast('MP4 exported — download it below');
    } catch (e) {
      if (jobId) await api.post(`/api/render/${jobId}/fail`, { message: e.message }).catch(() => {});
      toast(`Export failed: ${e.message}`, 'error');
      refreshEpisode();
    } finally { setRun(null); }
  };

  return (
    <div className="stack">
      <ReviewBanner flagKey="export" />
      <div className="export-grid">
        <div className="card">
          <ScenePlayer ref={player} scene={scene} lines={scene.timing?.lines || []} height={520} />
          <h4>Shots</h4>
          <div className="shot-strip">
            {times.map((x, i) => (
              <button key={x.shot.id} className="shot-chip" style={{ flex: Math.max(0.6, x.length) }} onClick={() => player.current?.seek(x.start, true)}>
                <b>{i + 1}. {x.shot.title}</b><small className="mono">{fmtTime(x.start)}–{fmtTime(x.end)}</small>
              </button>
            ))}
          </div>
          <div className="row"><button className="btn" onClick={() => openProject(episode.id, 'animate')}>← Back to the timeline (Stage 4) to fix timing or visuals</button></div>
        </div>
        <div className="card export">
          <h3>Export MP4</h3>
          <div className="seg">
            {Object.keys(RES).map((k) => <button key={k} className={res === k ? 'on' : ''} onClick={() => setRes(k)}>{k}<small>{RES[k].join('×')} · 30 fps</small></button>)}
          </div>
          <p className="muted small">The video is rendered frame by frame from the same 3D scene as the preview, then encoded with the approved audio ({fmtTime(duration)}). The lyrics appear on the picture, as in the preview; a captions .srt from your lyric timing is also included. The project stays editable afterwards.</p>
          {problems.length > 0 && <ul className="error-text small">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <button className="btn primary block" disabled={!!run || active || problems.length > 0} onClick={exportMp4}>{run ? 'Exporting…' : `Export MP4 (${res})`}</button>
          {run && (
            <div className="export-progress">
              <div className="small">{run.phase}{run.total > 1 ? ` · ${run.done}/${run.total} frames` : ''}</div>
              <progress value={run.done} max={run.total} />
              <small className="muted">Keep this tab open while frames render.</small>
            </div>
          )}
          <h4>Exports</h4>
          <JobList jobs={jobs} />
        </div>
      </div>
      <canvas ref={offscreen} className="offscreen-canvas" />
    </div>
  );
}
