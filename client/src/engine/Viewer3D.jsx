// Interactive 3D inspector: rotate (drag), zoom (wheel), pan (right-drag). Renders only when something changes,
// so it stays light on integrated graphics.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadGLTF, parseGLB, frame, modelInfo, studioLights, thumbnail, measureBox, cloneScene } from './three-common.js';

/** Camera directions (from the model's centre). Side views make walk cycles easy to read. */
const VIEWS = { front: new THREE.Vector3(0, 0.12, 1), 'side 3/4': new THREE.Vector3(0.85, 0.15, 0.6), side: new THREE.Vector3(1, 0.1, 0), '3/4': new THREE.Vector3(0.6, 0.45, 1), top: new THREE.Vector3(0.01, 1, 0.25) };

export default function Viewer3D({ url, buffer, height = 320, onInfo, background = '#eef2f5', wireframe = false, autoPlay = false }) {
  const host = useRef();
  const state = useRef({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clips, setClips] = useState([]);   // animation names in this file
  const [clipIdx, setClipIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState('3/4');
  const [bones, setBones] = useState(false);
  const [time, setTime] = useState(0);      // shown on the scrubber
  const [length, setLength] = useState(0);

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(background);
    studioLights(scene);
    const grid = new THREE.GridHelper(10, 20, '#c5cbd3', '#dfe4ea'); scene.add(grid);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    const resize = () => { const w = el.clientWidth || 300; renderer.setSize(w, height, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = `${height}px`; camera.aspect = w / height; camera.updateProjectionMatrix(); render(); };
    const ro = new ResizeObserver(resize); ro.observe(el);
    state.current = { renderer, scene, camera, controls, render, grid, resize };
    resize();
    return () => { cancelAnimationFrame(state.current.raf); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); el.innerHTML = ''; state.current = {}; };
  }, [height, background]);

  useEffect(() => {
    const s = state.current;
    if (!s.scene || (!url && !buffer)) return;
    let alive = true;
    setLoading(true); setError(null);
    (buffer ? parseGLB(buffer) : loadGLTF(url)).then((gltf) => {
      if (!alive || !state.current.scene) return;
      if (s.model) s.scene.remove(s.model);
      cancelAnimationFrame(s.raf); s.mixer = null;
      // Rigged models need a skeleton-aware clone, or the skin stays frozen.
      const obj = cloneScene(gltf);
      if (gltf.animations.length) { s.mixer = new THREE.AnimationMixer(obj); s.anims = gltf.animations; }
      if (wireframe) obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.wireframe = true; } });
      s.scene.add(obj); s.model = obj;
      // Animated models get extra room: a walk or run reaches further than the rest pose.
      s.pad = gltf.animations.length ? 1.25 : 1.05;
      const center = frame(s.camera, obj, { from: VIEWS[gltf.animations.length ? 'side 3/4' : '3/4'], padding: s.pad });
      setView(gltf.animations.length ? 'side 3/4' : '3/4');
      if (s.helper) { s.scene.remove(s.helper); s.helper = null; } setBones(false);
      const box = measureBox(obj);
      s.grid.position.y = box.min.y;
      // Grid and controls scaled to the model, so tiny or huge files are equally easy to inspect.
      const span = Math.max(...box.getSize(new THREE.Vector3()).toArray()) || 1;
      s.grid.scale.setScalar(Math.max(0.2, span / 3));
      s.controls.minDistance = span * 0.2; s.controls.maxDistance = span * 20;
      s.controls.target.copy(center); s.controls.update();
      s.render();
      onInfo?.({ ...modelInfo(obj), animations: gltf.animations.map((a) => a.name) });
      setClips(gltf.animations.map((a) => a.name));
      setClipIdx(0); setPlaying(autoPlay && gltf.animations.length > 0);
      setLoading(false);
    }).catch((e) => { if (alive) { setError(`Could not open this model: ${e.message || e}`); setLoading(false); } });
    return () => { alive = false; };
  }, [url, buffer, wireframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choose the clip (keeps the current time when only play/pause or speed changes).
  useEffect(() => {
    const s = state.current;
    if (!s.mixer || !s.anims?.length) return;
    s.mixer.stopAllAction();
    const clip = s.anims[clipIdx] || s.anims[0];
    s.action = s.mixer.clipAction(clip); s.action.reset().play();
    s.mixer.setTime(0); setTime(0); setLength(clip.duration || 0); s.render();
  }, [clipIdx, clips]);
  // Play / pause at the chosen speed. Only loops while playing, so idle viewers cost nothing.
  useEffect(() => {
    const s = state.current;
    if (!s.mixer || !playing) return;
    s.mixer.timeScale = speed;
    const clock = new THREE.Clock(); let shown = 0;
    const tick = () => {
      s.mixer.update(clock.getDelta()); s.render();
      const t = s.action ? s.action.time : 0; if (Math.abs(t - shown) > 0.05) { shown = t; setTime(t); }
      s.raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(s.raf);
  }, [playing, speed, clipIdx, clips]);
  const scrub = (t) => { const s = state.current; if (!s.mixer || !s.action) return; setPlaying(false); s.action.time = t; s.mixer.update(0); setTime(t); s.render(); };
  const look = (v) => {
    const s = state.current; if (!s.model) return; setView(v);
    const c = frame(s.camera, s.model, { from: VIEWS[v], padding: s.pad || 1.1 }); s.controls.target.copy(c); s.controls.update(); s.render();
  };
  const toggleBones = () => {
    const s = state.current; if (!s.model) return;
    if (s.helper) { s.scene.remove(s.helper); s.helper = null; setBones(false); }
    else { s.helper = new THREE.SkeletonHelper(s.model); s.helper.material.depthTest = false; s.helper.material.linewidth = 2; s.scene.add(s.helper); setBones(true); }
    s.render();
  };

  const clipLabel = (n) => String(n || '').split('|').filter((x) => x && !/^(armature|baselayer)$/i.test(x)).join(' ').replace(/_/g, ' ') || 'Animation';
  return (
    <div className="viewer3d" style={{ height }}>
      <div ref={host} className="viewer3d-canvas" />
      {loading && !error && <div className="viewer3d-msg">Loading 3D…</div>}
      {error && <div className="viewer3d-msg error-text">{error}</div>}
      {clips.length > 0 && !loading && (
        <div className="viewer3d-anim">
          <button className="btn tiny primary" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
          {clips.length > 1 ? <select value={clipIdx} onChange={(e) => { setClipIdx(Number(e.target.value)); setPlaying(true); }}>{clips.map((n, i) => <option key={i} value={i}>{clipLabel(n)}</option>)}</select>
            : <span className="small muted">{clipLabel(clips[0])}</span>}
          <select value={speed} title="Playback speed" onChange={(e) => setSpeed(Number(e.target.value))}>{[0.25, 0.5, 1, 1.5].map((v) => <option key={v} value={v}>{v === 1 ? 'Normal speed' : `${v}× speed`}</option>)}</select>
          <input type="range" min={0} max={length || 1} step={0.01} value={Math.min(time, length || 1)} title="Scrub frame by frame" onChange={(e) => scrub(Number(e.target.value))} />
          <span className="mono small muted">{time.toFixed(2)}s / {length.toFixed(2)}s</span>
        </div>
      )}
      {!loading && !error && (
        <div className="viewer3d-views">
          {Object.keys(VIEWS).map((v) => <button key={v} className={`btn tiny ${view === v ? 'primary' : ''}`} onClick={() => look(v)}>{v}</button>)}
          {clips.length > 0 && <button className={`btn tiny ${bones ? 'primary' : ''}`} title="Show the skeleton the animation moves" onClick={toggleBones}>🦴 Bones</button>}
        </div>
      )}
      <div className="viewer3d-hint">Drag to rotate · scroll to zoom · right-drag to pan</div>
    </div>
  );
}

/** Lightweight thumbnail (one shared renderer for the whole page). */
export function Thumb3D({ url, size = 160, className = '' }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let alive = true; setSrc(null); setErr(false); if (url) thumbnail(url, 256).then((d) => alive && setSrc(d)).catch(() => alive && setErr(true)); return () => { alive = false; }; }, [url]);
  if (!url) return <div className={`thumb3d empty ${className}`} style={{ height: size }}>No model yet</div>;
  if (err) return <div className={`thumb3d empty ${className}`} style={{ height: size }}>Preview failed</div>;
  return src ? <img className={`thumb3d ${className}`} src={src} alt="3D preview" style={{ height: size }} /> : <div className={`thumb3d empty ${className}`} style={{ height: size }}>Rendering…</div>;
}
