// My World · Animation Studio — make movement clips for rigged characters inside the app (no Meshy calls).
// Meshy (or an imported file) provides the rig once; every jump, wave, clap… is keyframed here and saved to My World.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { api } from '../api.js';
import { useStudio, useAction } from '../ui.jsx';
import { loadGLTF, frame, studioLights } from '../engine/three-common.js';
import { MOVES, analyseRig, buildClip, retargetClip, moveFromText, defaultParams } from '../engine/MoveMaker.js';

const rigKind = (a) => { try { return JSON.parse(a.notes || '{}').animation_type || null; } catch { return null; } };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'move';

export default function AnimationStudio() {
  const { toast } = useStudio();
  const [act, busy] = useAction();
  const [assets, setAssets] = useState(null);
  const [itemId, setItemId] = useState(null);
  const [rigGltf, setRigGltf] = useState(null);
  const [rig, setRig] = useState(null);           // analysed skeleton (rest pose)
  const [tab, setTab] = useState('make');         // make | copy | saved
  const [move, setMove] = useState('jump');
  const [params, setParams] = useState(defaultParams('jump'));
  const [ask, setAsk] = useState('');
  const [copied, setCopied] = useState(null);     // {clip, from}
  const [savedClip, setSavedClip] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [name, setName] = useState('');

  const load = () => api.get('/api/world/motion').then(setAssets);
  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Characters that have a rig.
  const chars = useMemo(() => {
    const m = new Map();
    for (const a of assets || []) { const c = m.get(a.item_id) || { id: a.item_id, name: a.item_name, rigs: [], clips: [] }; (a.category === 'rig' ? c.rigs : c.clips).push(a); m.set(a.item_id, c); }
    return [...m.values()].filter((c) => c.rigs.length);
  }, [assets]);
  const char = chars.find((c) => c.id === itemId) || null;
  const rigAsset = char ? (char.rigs.find((r) => rigKind(r)) || char.rigs[char.rigs.length - 1]) : null;
  useEffect(() => { if (!itemId && chars.length) setItemId(chars[0].id); }, [chars, itemId]);

  // Load and analyse the rig.
  useEffect(() => {
    if (!rigAsset) return;
    let alive = true; setRig(null); setRigGltf(null); setCopied(null); setSavedClip(null);
    loadGLTF(rigAsset.url).then((g) => { if (!alive) return; setRigGltf(g); setRig(analyseRig(skeletonClone(g.scene))); })
      .catch((e) => toast(`Could not open the rig: ${e.message}`, 'error'));
    return () => { alive = false; };
  }, [rigAsset?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const kind = rigAsset ? (rigKind(rigAsset) || (rig?.biped ? 'biped' : 'quadruped')) : null;
  const usable = (id) => rig && (MOVES[id].biped ? rig.biped : MOVES[id].quad ? rig.quad : (['nod', 'shake', 'look'].includes(id) ? !!rig.map.head : true));
  useEffect(() => { if (rig && !usable(move)) { const first = Object.keys(MOVES).find(usable); if (first) { setMove(first); setParams(defaultParams(first)); } } }, [rig]); // eslint-disable-line react-hooks/exhaustive-deps

  const madeClip = useMemo(() => (rig && usable(move) ? buildClip(rig, move, params, MOVES[move].label) : null), [rig, move, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const clip = tab === 'make' ? madeClip : tab === 'copy' ? copied?.clip : savedClip?.clip;
  useEffect(() => { setName(tab === 'make' ? MOVES[move].label : tab === 'copy' && copied ? `${copied.label}` : ''); }, [tab, move, copied]);

  const pick = (id) => { setMove(id); setParams(defaultParams(id)); setTab('make'); setPlaying(true); };
  const fromText = () => {
    const r = moveFromText(ask);
    if (!r) { toast('No matching move yet — pick one of the moves below.', 'error'); return; }
    if (!usable(r.move)) { toast(`“${MOVES[r.move].label}” needs a two-legged skeleton.`, 'error'); return; }
    const p = defaultParams(r.move); if (r.count) { const k = MOVES[r.move].params.repeats ? 'repeats' : null; if (k) p[k] = r.count; }
    setMove(r.move); setParams(p); setTab('make'); setPlaying(true);
  };

  // Other characters' clips that fit this skeleton.
  const sources = useMemo(() => chars.filter((c) => c.id !== itemId && c.rigs.some((r) => (rigKind(r) || 'biped') === kind)).flatMap((c) => c.clips.map((a) => ({ ...a, from: c.name, rigUrl: (c.rigs.find((r) => rigKind(r)) || c.rigs[0]).url }))), [chars, itemId, kind]);
  const copyFrom = (a) => act(async () => {
    const [cg, rg] = await Promise.all([loadGLTF(a.url), loadGLTF(a.rigUrl)]);
    if (!cg.animations.length) throw new Error('That file has no animation.');
    const src = analyseRig(skeletonClone(rg.scene));
    const c = retargetClip(src, cg.animations[0], rig, a.label);
    if (!c.tracks.length) throw new Error('The bone names don’t match this character’s skeleton.');
    setCopied({ clip: c, label: a.label.replace(/\s*\((Meshy|studio)[^)]*\)/i, ''), from: a.from }); setTab('copy'); setPlaying(true);
  });
  const playSaved = (a) => act(async () => { const g = await loadGLTF(a.url); if (!g.animations.length) throw new Error('No animation in this clip.'); setSavedClip({ clip: g.animations[0], label: a.label }); setTab('saved'); setPlaying(true); });

  const save = () => act(async () => {
    if (!clip || !rigGltf) return;
    const label = (name || 'Move').trim();
    const named = clip.clone(); named.name = label;
    const scene = skeletonClone(rigGltf.scene);
    const buf = await new GLTFExporter().parseAsync(scene, { binary: true, animations: [named] });
    const file = new File([buf], `${slug(label)}.glb`, { type: 'model/gltf-binary' });
    const recipe = tab === 'make' ? { move, params } : tab === 'copy' ? { copied_from: copied?.from } : null;
    await api.upload(`/api/items/${itemId}/motion`, [file], { category: 'clip', label: `${label} (studio)`, ...(recipe ? { recipe: JSON.stringify(recipe) } : {}) });
    await load();
  }, `Saved “${(name || 'Move').trim()}” to My World — use it in Stage 4`);

  if (!assets) return <div className="muted">Loading…</div>;
  if (!chars.length) return <div className="card"><h3>Animation Studio</h3><p className="muted">No rigged characters yet. Generate a character in Stage 2 with “Also rig it for animation”, save it to My World, and it appears here.</p></div>;
  const mv = MOVES[move];

  return (
    <div className="stack">
      <div className="card">
        <div className="section-head">
          <div><h3>Animation Studio</h3><p className="muted small">Make movement clips for rigged characters right here — free and offline. Meshy is only needed once, to rig the character. Saved clips go to My World and can be used in Stage 4.</p></div>
          <label className="field" style={{ minWidth: 260 }}><span>Character</span>
            <select value={itemId || ''} onChange={(e) => { setItemId(Number(e.target.value)); setTab('make'); }}>{chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
        </div>
        {rig && <p className="small muted">Skeleton: {kind === 'quadruped' ? '🐾 four-legged' : '🧍 two-legged'} · {rig.bones.length} bones{!rig.biped && ' · body moves (jump, wave, clap…) need a two-legged skeleton; whole-body moves work on any rig'}</p>}
      </div>

      <div className="anim-studio">
        <div className="card">
          <RigStage gltf={rigGltf} clip={clip} playing={playing} speed={speed} />
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn primary small" disabled={!clip} onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[0.25, 0.5, 1, 1.5].map((v) => <option key={v} value={v}>{v === 1 ? 'Normal speed' : `${v}× speed`}</option>)}</select>
            <span className="small muted">{clip ? `${clip.name} · ${clip.duration.toFixed(1)} s` : 'Choose a move'}</span>
          </div>
          {tab !== 'saved' && clip && (
            <div className="row wrap save-row">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this move" />
              <button className="btn approve" disabled={busy || !clip} onClick={save}>💾 Save to My World</button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="tabs">
            {[['make', 'Make a move'], ['copy', 'Copy from another character'], ['saved', `Saved clips (${char?.clips.length || 0})`]].map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
          </div>

          {tab === 'make' && (
            <>
              <div className="row">
                <input className="grow" value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fromText()} placeholder="What should it do? e.g. “jump twice”, “wave hello”, “ninja kick”, “backflip”" />
                <button className="btn" onClick={fromText}>Go</button>
              </div>
              {[...new Set(Object.values(MOVES).map((m) => m.group || 'Everyday'))].map((g) => (
                <div key={g}>
                  <div className="move-group">{g === 'Ninja' ? '🥷 Ninja moves' : 'Everyday moves'}</div>
                  <div className="move-grid">
                    {Object.entries(MOVES).filter(([, m]) => (m.group || 'Everyday') === g).map(([id, m]) => (
                      <button key={id} className={`move-btn ${move === id ? 'on' : ''}`} disabled={!usable(id)} title={usable(id) ? '' : 'Needs a two-legged skeleton'} onClick={() => pick(id)}><span>{m.icon}</span>{m.label}</button>
                    ))}
                  </div>
                </div>
              ))}
              <h4>{mv.icon} {mv.label}</h4>
              <div className="param-grid">
                {Object.entries(mv.params).map(([k, p]) => p.options ? (
                  <label key={k} className="field"><span>{p.label}</span><select value={params[k]} onChange={(e) => setParams({ ...params, [k]: e.target.value })}>{p.options.map((o) => <option key={o}>{o}</option>)}</select></label>
                ) : (
                  <label key={k} className="field slider"><span>{p.label} <em className="mono muted">{Number(params[k]).toFixed(p.step >= 1 ? 0 : 2)}</em></span>
                    <input type="range" min={p.min} max={p.max} step={p.step} value={params[k]} onChange={(e) => setParams({ ...params, [k]: Number(e.target.value) })} /></label>
                ))}
              </div>
              <button className="btn ghost small" onClick={() => setParams(defaultParams(move))}>Reset sliders</button>
            </>
          )}

          {tab === 'copy' && (
            <>
              <p className="small muted">Moves saved for other {kind === 'quadruped' ? 'four-legged' : 'two-legged'} characters (including Meshy’s walk and run) can be copied onto {char?.name}. It is adjusted to this character’s size; nothing is downloaded or paid.</p>
              {copied && <p className="small ok">Previewing “{copied.label}” from {copied.from}. Name it and save.</p>}
              <div className="clip-list">
                {sources.map((a) => <button key={a.id} className="chip" disabled={busy} onClick={() => copyFrom(a)}>{a.label} <em className="muted">· {a.from}</em></button>)}
                {!sources.length && <p className="muted small">No other characters with the same kind of skeleton have clips yet.</p>}
              </div>
            </>
          )}

          {tab === 'saved' && (
            <div className="clip-list">
              {char?.clips.map((a) => <button key={a.id} className={`chip ${savedClip?.label === a.label ? 'on' : ''}`} disabled={busy} onClick={() => playSaved(a)}>▶ {a.label}</button>)}
              {!char?.clips.length && <p className="muted small">No clips saved for {char?.name} yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Live 3D stage: plays `clip` on a copy of the rig, looping. */
function RigStage({ gltf, clip, playing, speed, height = 480 }) {
  const host = useRef(); const st = useRef({});
  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#eef2f5'); studioLights(scene);
    const grid = new THREE.GridHelper(10, 20, '#c5cbd3', '#dfe4ea'); scene.add(grid);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    const resize = () => { const w = el.clientWidth || 400; renderer.setSize(w, height, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = `${height}px`; camera.aspect = w / height; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const clock = new THREE.Clock();
    const loop = () => { const s = st.current; if (s.mixer && s.playing) s.mixer.update(clock.getDelta() * (s.speed || 1)); else clock.getDelta(); renderer.render(scene, camera); s.raf = requestAnimationFrame(loop); };
    st.current = { renderer, scene, camera, controls, grid, playing: true, speed: 1 };
    loop();
    return () => { cancelAnimationFrame(st.current.raf); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); el.innerHTML = ''; };
  }, [height]);
  useEffect(() => {
    const s = st.current; if (!gltf || !s.scene) return;
    if (s.model) s.scene.remove(s.model);
    const obj = skeletonClone(gltf.scene); s.scene.add(obj); s.model = obj; s.mixer = new THREE.AnimationMixer(obj);
    const c = frame(s.camera, obj, { from: new THREE.Vector3(0.85, 0.2, 0.9), padding: 1.5 });
    const box = new THREE.Box3().setFromObject(obj); s.grid.position.y = box.min.y;
    const span = Math.max(...box.getSize(new THREE.Vector3()).toArray()) || 1; s.grid.scale.setScalar(Math.max(0.2, span / 3));
    s.controls.target.copy(c); s.controls.update();
  }, [gltf]);
  useEffect(() => { const s = st.current; if (!s.mixer) return; s.mixer.stopAllAction(); if (clip) s.mixer.clipAction(clip).reset().play(); }, [clip, gltf]);
  useEffect(() => { st.current.playing = playing; st.current.speed = speed; }, [playing, speed]);
  return <div className="viewer3d" style={{ height }}><div ref={host} className="viewer3d-canvas" /><div className="viewer3d-hint">Drag to rotate · scroll to zoom</div></div>;
}
