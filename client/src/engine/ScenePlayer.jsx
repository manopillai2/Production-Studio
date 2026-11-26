// 3D preview synced to the approved audio. The audio element is the clock: every animation frame renders the
// scene at audio.currentTime, so picture and sound stay together (also after seeking).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { SceneEngine, shotTimes, timelineEnd } from './SceneEngine.js';
import { fmtTime } from '../api.js';
import { captionAt } from './captions.js';

const ScenePlayer = forwardRef(function ScenePlayer({ scene, autoBuild = false, onTime, onShot, height = 380, lines = [] }, ref) {
  const canvas = useRef(); const engine = useRef(null); const audio = useRef();
  const [built, setBuilt] = useState(false);
  const [building, setBuilding] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shotIdx, setShotIdx] = useState(0);
  const clock = useRef({ start: 0, offset: 0 });
  const raf = useRef();
  const duration = scene ? timelineEnd(shotTimes(scene.shots, scene.timing, scene.audio?.duration), scene.audio?.duration) : 0;
  const times = scene ? shotTimes(scene.shots, scene.timing, scene.audio?.duration) : [];

  const draw = useCallback((tt) => {
    if (!engine.current) return;
    const k = engine.current.renderAt(tt);
    // Exposed for diagnostics/tests: the audio clock and the rendered scene time should match while playing.
    window.__sceneDebug = { sceneTime: +tt.toFixed(3), audioTime: audio.current ? +audio.current.currentTime.toFixed(3) : null, shot: k, playing: audio.current ? !audio.current.paused : null };
    setT(tt); onTime?.(tt);
    setShotIdx((p) => { if (p !== k) onShot?.(k); return k; });
  }, [onTime, onShot]);

  const build = useCallback(async () => {
    if (!scene || !canvas.current) return;
    setBuilding(0);
    const w = canvas.current.parentElement?.clientWidth || canvas.current.clientWidth || 640;
    if (!engine.current) engine.current = new SceneEngine(canvas.current, { width: w, height: Math.round((w * 9) / 16) });
    else engine.current.setSize(w, Math.round((w * 9) / 16));
    const r = await engine.current.load({ shots: scene.shots, assets: scene.assets, timing: scene.timing, duration: scene.audio?.duration, audio: scene.audio }, (p) => setBuilding(p));
    setWarnings(r.warnings); setBuilding(null); setBuilt(true);
    window.__sceneEngine = engine.current; // for inspecting the preview from the browser console
    draw(Math.min(t, duration));
  }, [scene, draw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild when the shot data changes (after the first explicit build).
  useEffect(() => { if (built || autoBuild) build(); }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { cancelAnimationFrame(raf.current); engine.current?.dispose(); engine.current = null; }, []);

  const loop = useCallback(() => {
    const a = audio.current;
    const now = a && !a.paused ? a.currentTime : clock.current.offset + (performance.now() - clock.current.start) / 1000;
    if (now >= duration) { pause(); draw(duration); return; }
    draw(now);
    raf.current = requestAnimationFrame(loop);
  }, [duration, draw]); // eslint-disable-line react-hooks/exhaustive-deps
  const play = async () => {
    if (!built) await build();
    const from = t >= duration - 0.05 ? 0 : t;
    const a = audio.current;
    if (a && from < (scene.audio?.duration || 0)) { a.currentTime = from; await a.play().catch(() => {}); }
    clock.current = { start: performance.now(), offset: from };
    setPlaying(true);
    cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(loop);
  };
  const pause = () => { cancelAnimationFrame(raf.current); audio.current?.pause(); setPlaying(false); };
  const seek = (x, andPlay = false) => {
    const nt = Math.max(0, Math.min(duration, x));
    if (audio.current) audio.current.currentTime = Math.min(nt, scene?.audio?.duration || nt);
    clock.current = { start: performance.now(), offset: nt };
    draw(nt);
    if (andPlay && !playing) play();
  };
  useImperativeHandle(ref, () => ({ seek, play, pause, build, get time() { return t; }, times }));

  // Fullscreen: the whole player (picture + controls) fills the screen; the 3D view re-renders at the new size.
  const root = useRef(); const frame = useRef(); const tRef = useRef(0); tRef.current = t;
  const [fs, setFs] = useState(false);
  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen?.())?.catch?.(() => {});
  useEffect(() => {
    const on = () => {
      setFs(document.fullscreenElement === root.current);
      requestAnimationFrame(() => {
        if (!engine.current || !frame.current) return;
        const w = frame.current.clientWidth || 640; engine.current.setSize(w, Math.round((w * 9) / 16)); draw(tRef.current);
      });
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [draw]);
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFs(); }
    else if (e.key === ' ' && fs) { e.preventDefault(); playing ? pause() : play(); }
  };

  const caption = captionAt(lines, t);
  return (
    <div className="scene-player" ref={root} tabIndex={-1} onKeyDown={onKey}>
      <div className="scene-stage">
        <div className="scene-frame" ref={frame} style={fs ? undefined : { maxWidth: (height * 16) / 9 }}
          onClick={() => { if (fs && built) (playing ? pause() : play()); }} onDoubleClick={toggleFs}>
        <canvas ref={canvas} className="scene-canvas" />
        {!built && (
          <div className="scene-overlay">
            {building == null
              ? <button className="btn primary" onClick={build} disabled={!scene?.shots?.length}>▶ Generate Preview</button>
              : <span>Loading models… {Math.round(building * 100)}%</span>}
            {!scene?.shots?.length && <small>Add or propose shots first.</small>}
          </div>
        )}
        {built && caption && <div className="scene-caption">{caption.text}</div>}
        </div>
      </div>
      <div className="transport">
        <button className="btn primary" onClick={playing ? pause : play} disabled={!scene?.shots?.length}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button className="btn ghost" onClick={() => seek(0)}>⏮</button>
        <div className="scrub">
          <input type="range" min="0" max={duration || 0} step="0.01" value={t} onChange={(e) => seek(Number(e.target.value))} />
          <div className="scrub-shots">{times.map((x, i) => <span key={x.shot.id} className={i === shotIdx ? 'on' : ''} style={{ left: `${(x.start / Math.max(duration, 0.01)) * 100}%`, width: `${(x.length / Math.max(duration, 0.01)) * 100}%` }} title={x.shot.title} />)}</div>
        </div>
        <span className="mono small">{fmtTime(t)} / {fmtTime(duration)}</span>
        {built && <button className="btn ghost small" onClick={build} title="Reload models">↻</button>}
        <button className="btn ghost small" onClick={toggleFs} title={fs ? 'Exit full screen (Esc)' : 'Full screen (F, or double-click the picture)'}>{fs ? '⤡ Exit' : '⛶ Full screen'}</button>
      </div>
      {scene?.audio ? <audio ref={audio} src={scene.audio.url} preload="auto" /> : <div className="hint warn">No approved audio — the preview is silent (Stage 3).</div>}
      {warnings.length > 0 && <ul className="small warn">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    </div>
  );
});
export default ScenePlayer;
