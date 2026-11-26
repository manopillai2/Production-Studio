// Deterministic 3D scene engine: renderAt(t) always produces the same frame for the same time, so the
// browser preview (driven by the audio clock) and the MP4 export (frame by frame) match exactly.
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGLTF, measureBox } from './three-common.js';
import { analyseRig, buildClip, MOVES } from './MoveMaker.js';
import { addFace, vocalEnvelope, mouthOpen } from './FaceRig.js';

/** Shot start/end times from lyric timestamps (Stage 3). Gaps (instrumental breaks) belong to the shot before. */
export function shotTimes(shots, timing, duration) {
  const lines = timing?.lines || [];
  const n = shots.length;
  if (!n) return [];
  const lineStart = (i) => (Number.isInteger(i) ? lines[i]?.start : null);
  // Manual times beyond the audio were made for an older, longer track: ignore them so the video follows the audio.
  const inAudio = (v, isEnd) => (v == null || !duration ? v : (isEnd ? v <= duration + 0.05 : v < duration) ? v : null);
  const starts = shots.map((s, k) => (inAudio(s.start_override, false) ?? (k === 0 ? 0 : lineStart(s.line_from)) ?? null));
  const total = duration || (lines.at(-1)?.end ?? n * 4);
  for (let k = 0; k < n; k++) if (starts[k] == null) starts[k] = k === 0 ? 0 : starts[k - 1] + Math.max(0.5, (total - starts[k - 1]) / (n - k + 1));
  return shots.map((s, k) => {
    let end = inAudio(s.end_override, true) ?? (k < n - 1 ? starts[k + 1] : total);
    if (!(end > starts[k] + 0.2)) end = starts[k] + Math.max(0.5, (total - starts[k]) / Math.max(1, n - k));
    return { shot: s, start: starts[k], end, length: end - starts[k] };
  });
}
export const timelineEnd = (times, duration) => Math.max(duration || 0, times.at(-1)?.end || 0);

export const LIGHTING = {
  morning: { sky: '#FFD9B8', fog: '#FFE4CC', hemiSky: '#FFE9CF', hemiGround: '#9BC98A', hemi: 1.2, sun: '#FFC791', sunI: 2.0, sunPos: [-6, 3, 5] },
  day: { sky: '#9AD7FF', fog: '#CDEBFF', hemiSky: '#FFFFFF', hemiGround: '#A6D49A', hemi: 1.35, sun: '#FFF4E0', sunI: 2.3, sunPos: [4, 8, 6] },
  sunset: { sky: '#FFA98A', fog: '#FFC6A8', hemiSky: '#FFD2B8', hemiGround: '#8F9A72', hemi: 1.0, sun: '#FF9A62', sunI: 1.8, sunPos: [7, 2.5, 3] },
  night: { sky: '#1E2752', fog: '#2A346A', hemiSky: '#8FA4FF', hemiGround: '#24304F', hemi: 0.55, sun: '#AFC2FF', sunI: 0.7, sunPos: [-3, 6, 4] },
};
export const MOTIONS = ['none', 'rise', 'drift', 'bounce', 'twinkle', 'spin', 'sway', 'path', 'circle'];
/** Motions that carry a character across the ground (a rigged character walks or runs during them). */
export const TRAVEL_MOTIONS = ['path', 'drift', 'bounce', 'circle'];
export const CAMERAS = ['wide', 'tilt-up', 'pan', 'dolly-in', 'closeup', 'follow', 'orbit', 'group'];

const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return 1 - (1 - c) ** 3; };
const lerp = (a, b, k) => a + (b - a) * k;

// ---- Placement: generated models arrive at arbitrary sizes, centred on their middle. ----
/** A setting at scale 1 is a landscape this many metres across. */
export const SET_SIZE = 16;
/** Normal sizes (metres): character height, prop / sky-object largest side. Actor "scale" multiplies these. */
export const ACTOR_SIZE = { character: 1.5, prop: 0.9, sky: 1.4 };
/** Actors placed 2 m or more above the ground are sky objects (sun, moon, stars, clouds…): they float, the rest stand on the landscape. */
export const isSky = (a) => Number(a?.pos?.[1] ?? 0) >= 2;

/** Scale a setting into a landscape, sit it on y=0, and build a height map of its walkable top surface. */
function fitSetting(obj, st = {}) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.y -= box.min.y; obj.position.z -= c.z;
  const holder = new THREE.Group(); holder.add(obj);
  holder.scale.setScalar((SET_SIZE * Number(st.scale || 1)) / Math.max(size.x, size.z, 1e-3));
  holder.rotation.y = Number(st.rot_y || 0);
  const off = st.offset || [];
  holder.position.set(Number(off[0] || 0), Number(off[1] || 0), Number(off[2] || 0));
  holder.updateMatrixWorld(true);
  return { obj: holder, surface: () => heightField(holder) };
}

/** Height of the upward-facing surface, sampled on a grid; narrow spikes (trees, poles) are removed so actors stand on the ground, not on top of them. */
function heightField(root, N = 64) {
  const box = new THREE.Box3().setFromObject(root);
  const x0 = box.min.x, z0 = box.min.z, dx = (box.max.x - x0) / N || 1, dz = (box.max.z - z0) / N || 1, W = N + 1;
  let H = new Float32Array(W * W).fill(-Infinity);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse((m) => {
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const p = m.geometry.attributes.position, nr = m.geometry.attributes.normal;
    nm.getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < p.count; i++) {
      if (nr) { n.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize(); if (n.y < 0.35) continue; }
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      const j = Math.round((v.z - z0) / dz) * W + Math.round((v.x - x0) / dx);
      if (v.y > H[j]) H[j] = v.y;
    }
  });
  // Fill holes from known neighbours.
  for (let pass = 0; pass < N; pass++) {
    let missing = 0; const P = H.slice();
    for (let iz = 0; iz < W; iz++) for (let ix = 0; ix < W; ix++) {
      const j = iz * W + ix; if (P[j] !== -Infinity) continue;
      let s = 0, k = 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = ix + a, z = iz + b; if (x >= 0 && z >= 0 && x < W && z < W && P[z * W + x] !== -Infinity) { s += P[z * W + x]; k++; } }
      if (k) H[j] = s / k; else missing++;
    }
    if (!missing) break;
  }
  for (let j = 0; j < H.length; j++) if (H[j] === -Infinity) H[j] = 0;
  H = walkable(H, W, Math.max(0.3, 1.2 * Math.max(dx, dz)));
  // Morphological opening (erode then dilate, radius 2 cells).
  const pass = (src, pick) => { const out = new Float32Array(src.length); for (let iz = 0; iz < W; iz++) for (let ix = 0; ix < W; ix++) { let r = src[iz * W + ix]; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const x = ix + a, z = iz + b; if (x >= 0 && z >= 0 && x < W && z < W) r = pick(r, src[z * W + x]); } out[iz * W + ix] = r; } return out; };
  H = pass(pass(H, Math.min), Math.max);
  return (x, z) => {
    const fx = (x - x0) / dx, fz = (z - z0) / dz;
    if (fx < 0 || fz < 0 || fx > N || fz > N) return 0;
    const ix = Math.min(N - 1, Math.floor(fx)), iz = Math.min(N - 1, Math.floor(fz)), tx = fx - ix, tz = fz - iz;
    const h = (a, b) => H[(iz + b) * W + ix + a];
    return lerp(lerp(h(0, 0), h(1, 0), tx), lerp(h(0, 1), h(1, 1), tx), tz);
  };
}

/**
 * Keep only the ground you can walk onto from the low ground: start from the lowest cells and spread to neighbours
 * whose height differs by at most maxStep (a slope of about 50°). Raised surfaces that are only reached by a sheer
 * jump (a giant flower head, a table top, a roof) are not ground; they are filled from the walkable cells around them.
 */
function walkable(H, W, maxStep) {
  const sorted = Float32Array.from(H).sort(); const low = sorted[Math.floor(sorted.length * 0.2)];
  const ok = new Uint8Array(H.length); const queue = [];
  for (let j = 0; j < H.length; j++) if (H[j] <= low + maxStep) { ok[j] = 1; queue.push(j); }
  while (queue.length) {
    const j = queue.pop(); const ix = j % W, iz = (j - ix) / W;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = ix + a, z = iz + b; if (x < 0 || z < 0 || x >= W || z >= W) continue;
      const k = z * W + x; if (!ok[k] && Math.abs(H[k] - H[j]) <= maxStep) { ok[k] = 1; queue.push(k); }
    }
  }
  const out = Float32Array.from(H, (h, j) => (ok[j] ? h : -Infinity));
  for (let pass = 0; pass < W; pass++) { // fill the removed cells from walkable neighbours
    let missing = 0; const P = out.slice();
    for (let j = 0; j < out.length; j++) {
      if (P[j] !== -Infinity) continue;
      const ix = j % W, iz = (j - ix) / W; let s = 0, k = 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = ix + a, z = iz + b; if (x >= 0 && z >= 0 && x < W && z < W && P[z * W + x] !== -Infinity) { s += P[z * W + x]; k++; } }
      if (k) out[j] = s / k; else missing++;
    }
    if (!missing) break;
  }
  for (let j = 0; j < out.length; j++) if (out[j] === -Infinity) out[j] = low;
  return out;
}

/** Position/rotation/scale of an actor at local shot time u (seconds) for a shot of length D. */
export function motionAt(actor, u, D) {
  const m = actor.motion || { type: 'none' };
  // Travelling moves can start later in the shot (motion.start seconds): the character waits, then sets off.
  if (TRAVEL_MOTIONS.includes(m.type) && Number(m.start) > 0) { const st = Math.min(Number(m.start), Math.max(0, D - 0.5)); u = Math.max(0, u - st); D = Math.max(0.1, D - st); }
  // A rigged walker covers the distance at walking pace (actor.travel seconds), then stands where it arrived.
  if (actor.travel && actor.travel < D) { u = Math.min(u, actor.travel); D = actor.travel; }
  const base = actor.pos || [0, 0, 0];
  const pos = [...base]; const rot = [...(actor.rot || [0, 0, 0])]; let s = Number(actor.scale ?? 1); let sy = 1;
  switch (m.type) {
    case 'rise': { const p = ease((u - (m.delay || 0)) / Math.max(0.1, m.duration || D)); pos[1] = base[1] - (m.amount ?? 3) * (1 - p); break; }
    case 'drift': pos[0] = base[0] + (m.dx ?? 4) * (u / D); pos[1] = base[1] + Math.sin(u * 1.3) * (m.bob ?? 0.1); break;
    case 'bounce': {
      const k = u / D; const to = m.to || [base[0] + 4, base[1], base[2]];
      pos[0] = lerp(base[0], to[0], k); pos[2] = lerp(base[2], to[2], k);
      const phase = Math.PI * (m.hops ?? 4) * k;
      pos[1] = lerp(base[1], to[1], k) + Math.abs(Math.sin(phase)) * (m.height ?? 0.7);
      sy = 1 + 0.08 * Math.cos(2 * phase); // squash & stretch
      break;
    }
    case 'twinkle': s *= 1 + (m.amount ?? 0.12) * Math.sin(u * (m.speed ?? 3) * Math.PI * 2); break;
    case 'spin': rot[1] += (m.speed ?? 1) * u; break;
    case 'sway': rot[2] += Math.sin(u * (m.speed ?? 1.5) * Math.PI) * (m.amount ?? 0.08); break;
    case 'path': { const k = ease(u / D); const to = m.to || base; for (let i = 0; i < 3; i++) pos[i] = lerp(base[i], to[i], k); break; }
    case 'circle': { // walk around a centre point, facing the way it goes (counter-clockwise seen from above)
      const c = m.center || [base[0] + 1.5, 0, base[2]]; const r = Math.hypot(base[0] - c[0], base[2] - c[2]) || 1.5;
      const a0 = Math.atan2(base[0] - c[0], base[2] - c[2]); const ang = a0 + 2 * Math.PI * Number(m.turns ?? 1) * Math.min(1, Math.max(0, u / D));
      pos[0] = c[0] + r * Math.sin(ang); pos[2] = c[2] + r * Math.cos(ang);
      if (u > 0) rot[1] = Math.atan2(Math.cos(ang), -Math.sin(ang));
      break;
    }
    default: break;
  }
  return { pos, rot, scale: [s, s * sy, s] };
}

/**
 * Procedural "life" for static (unrigged) models, deterministic in u so preview and export match.
 * Travelling: turn to face the direction of travel, hop-step and waddle. Standing: breathe, glance around, tilt the head.
 * Sky actors: float gently. Modifies the motionAt() result in place.
 */
/** Rigged actors: their clip moves the body; just turn them to face where they travel (eased in, no snap back). */
function faceTravel(a, m, u, D) {
  if (!['path', 'bounce', 'drift'].includes(a.motionActor.motion?.type)) return;
  const baseYaw = Number(a.actor.rot?.[1] || 0);
  const end = motionAt(a.motionActor, D, D); const p0 = a.actor.pos || [0, 0, 0];
  const tx = end.pos[0] - p0[0], tz = end.pos[2] - p0[2];
  if (Math.hypot(tx, tz) > 0.2) { let d = Math.atan2(tx, tz) - baseYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); m.rot[1] = baseYaw + d * ease(u / 0.6); }
}

function life(a, m, u, D, seed) {
  const TAU = Math.PI * 2; const ph = seed * 1.7;
  const character = a.kind === 'character';
  if (a.sky) { // floating: slow bob and rock
    m.pos[1] += Math.sin(u * TAU * 0.25 + ph) * 0.12;
    m.rot[2] += Math.sin(u * TAU * 0.18 + ph) * (character ? 0.08 : 0.04);
    return;
  }
  // Velocity from the planned motion (sample just ahead).
  const dt = 0.08; const ahead = motionAt(a.motionActor, Math.min(D, u + dt), D);
  const speed = Math.hypot(ahead.pos[0] - m.pos[0], ahead.pos[2] - m.pos[2]) / dt;
  const baseYaw = Number(a.actor.rot?.[1] || 0);
  // Travelling moves: face the overall direction of travel for the whole shot (eased in, no snap back at the end).
  if (['path', 'bounce', 'drift'].includes(a.motionActor.motion?.type)) {
    const end = motionAt(a.motionActor, D, D); const p0 = a.actor.pos || [0, 0, 0];
    const tx = end.pos[0] - p0[0], tz = end.pos[2] - p0[2];
    if (Math.hypot(tx, tz) > 0.2) { let d = Math.atan2(tx, tz) - baseYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); m.rot[1] = baseYaw + d * ease(u / 0.6); }
  }
  const w = Math.min(1, Math.max(0, (speed - 0.05) / 0.4)); // 0 = standing, 1 = walking
  if (w > 0 && a.motionActor.motion?.type !== 'bounce') { // bounce already hops
    const f = Math.min(3, Math.max(1.4, speed * 1.4)); const p = u * TAU * f;
    m.pos[1] += Math.abs(Math.sin(p)) * (character ? 0.09 : 0.04) * w;   // step bob
    m.rot[2] += Math.sin(p) * (character ? 0.12 : 0.05) * w;             // waddle side to side
    m.rot[0] += (character ? 0.08 : 0) * w;                              // lean into the walk
    m.scale[1] *= 1 - 0.05 * Math.cos(2 * p) * w;                        // squash on each landing
  }
  if (!character || w >= 1) return;
  // Idle (fades in as the walk ends): breathe, glance around, small head tilt, weight shift.
  const k = 1 - w;
  m.scale[1] *= 1 + 0.025 * Math.sin(u * TAU * 0.35 + ph) * k;
  m.rot[1] += (Math.sin(u * TAU * 0.09 + ph) * 0.35 + Math.sin(u * TAU * 0.23 + ph * 2) * 0.08) * k;
  m.rot[2] += Math.sin(u * TAU * 0.15 + ph) * 0.05 * k;
  m.pos[1] += Math.max(0, Math.sin(u * TAU * 0.35 + ph)) * 0.02 * k;
}

export class SceneEngine {
  constructor(canvas, { width = 1280, height = 720, preserveDrawingBuffer = false, pixelRatio } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer });
    this.renderer.setPixelRatio(pixelRatio ?? Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 400);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#88aa77', 1.2);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 90 });
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog('#cdebff', 25, 90);
    this.groups = []; this.times = []; this.setSize(width, height);
  }
  setSize(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  dispose() { this.renderer.dispose(); this.renderer.forceContextLoss?.(); }

  /** Load every model used by the shots. Reports progress; problems become warnings, not crashes. */
  async load({ shots, assets, timing, duration, audio }, onProgress) {
    this.warnings = [];
    // Faces: the song's vocal loudness drives the mouths; lyric timing decides who is singing when.
    this.lines = timing?.lines || [];
    this.env = await vocalEnvelope(audio?.url).catch(() => null);
    for (const g of this.groups) this.scene.remove(g.group);
    this.groups = [];
    this.times = shotTimes(shots, timing, duration);
    const byCard = Object.fromEntries(assets.map((a) => [a.card_id, a]));
    const urls = new Set();
    for (const s of shots) { const st = byCard[s.setting?.card_id]; if (st) urls.add(st.model_url); for (const a of s.actors || []) { if (byCard[a.card_id]) urls.add(byCard[a.card_id].model_url); const c = byCard[a.card_id]?.clips.find((x) => x.id === a.clip?.asset_id); if (c) urls.add(c.url); } }
    let done = 0;
    await Promise.all([...urls].map((u) => loadGLTF(u).catch((e) => this.warnings.push(`Could not load ${u}: ${e.message}`)).finally(() => onProgress?.(++done / urls.size))));
    const fields = new Map(); // height maps are reused by shots that place the same setting the same way
    for (const s of shots) {
      const group = new THREE.Group(); group.visible = false;
      const setting = byCard[s.setting?.card_id];
      let surface = () => 0; let settingObj = null;
      if (setting) {
        const g = await loadGLTF(setting.model_url).catch(() => null);
        if (g) {
          const o = g.scene.clone(true); o.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; } });
          const key = JSON.stringify([setting.card_id, s.setting.scale || 1, s.setting.rot_y || 0, s.setting.offset || []]);
          const fit = fitSetting(o, s.setting);
          if (!fields.has(key)) fields.set(key, fit.surface());
          surface = fields.get(key);
          group.add(fit.obj); settingObj = fit.obj;
        } else this.warnings.push(`Shot “${s.title}”: could not load the setting ${setting.name}.`);
      } else if (s.setting?.card_id) this.warnings.push(`Shot “${s.title}”: its setting is no longer approved in Stage 2.`);
      // Ground that continues past the landscape to the horizon.
      const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 64), new THREE.MeshStandardMaterial({ color: setting ? '#78b36a' : '#8fd07f', roughness: 0.95 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; group.add(ground);
      const actors = [];
      for (const a of s.actors || []) {
        const asset = byCard[a.card_id];
        if (!asset) { this.warnings.push(`Shot “${s.title}”: an asset is no longer approved in Stage 2.`); continue; }
        const g = await loadGLTF(asset.model_url).catch(() => null);
        if (!g) continue;
        let source = g; let mixer = null; let clipDur = 0;
        const clipAsset = a.clip?.asset_id && asset.clips.find((x) => x.id === a.clip.asset_id);
        if (clipAsset) {
          const cg = await loadGLTF(clipAsset.url).catch(() => null);
          if (cg?.animations?.length) {
            let hasMesh = false; cg.scene.traverse((o) => { if (o.isMesh && clipAsset.url !== asset.model_url) hasMesh = true; });
            if (hasMesh) source = cg; // a rigged model + its clip (e.g. from Meshy): use that model
            const obj0 = skeletonClone(source.scene);
            const r0 = asset.kind === 'character' && a.face !== false ? analyseRig(obj0) : null;
            const face = r0 ? addFace(obj0, r0.map.head, `${asset.card_id}:${clipAsset.url}`, Number(a.card_id || 0) * 5 + actors.length, { quad: r0.quad }) : null;
            const clip = cg.animations.find((x) => x.name === a.clip.name) || cg.animations[0];
            mixer = new THREE.AnimationMixer(obj0); mixer.clipAction(clip).play(); clipDur = clip.duration || 1;
            const w = this._wrap(group, obj0, a, mixer, clipDur, asset.kind);
            if (face) { w.face = face; w.usages = asset.usages || []; }
            actors.push(w);
            continue;
          }
          this.warnings.push(`Shot “${s.title}”: clip for ${asset.name} has no animation; using the static model.`);
        }
        // Auto: a character with an approved rig uses it — its walk/run clip when it travels, an in-app idle when it stands.
        const rigAsset = !clipAsset && !a.clip?.none && asset.kind === 'character' && asset.clips.find((x) => x.category === 'rig' && x.status === 'approved');
        if (rigAsset) {
          const seed = Number(a.card_id || 0) * 7 + shots.indexOf(s) * 3 + actors.length;
          const body = await this._body(a, asset, rigAsset, this.times[shots.indexOf(s)]?.length || 4, seed, s.title).catch((e) => { this.warnings.push(`Shot “${s.title}”: ${asset.name}'s rig could not be animated (${e.message}).`); return null; });
          if (body) {
            const face = a.face !== false ? addFace(body.obj, body.head, `${asset.card_id}:${body.key}`, seed, { quad: body.rig.quad }) : null; // before posing: needs the rest pose
            const w = this._wrap(group, body.obj, a, body.mixer, 1, asset.kind);
            if (face) { w.face = face; w.usages = asset.usages || []; }
            w.body = body; w.autoLabel = body.label;
            if (body.travel) w.motionActor = { ...w.motionActor, travel: body.travel };
            actors.push(w); continue;
          }
        }
        actors.push(this._wrap(group, skeletonClone(source.scene), a, mixer, clipDur, asset.kind));
      }
      // Camera and sun follow the landscape: aim at where the ground actors stand.
      const standing = actors.filter((x) => !x.sky);
      const focusY = standing.length ? standing.reduce((t, x) => t + surface(x.actor.pos?.[0] || 0, x.actor.pos?.[2] || 0), 0) / standing.length : surface(0, 0.5);
      for (const x of actors) if (x.sky) x.skyBase = Math.max(focusY, surface(x.actor.pos?.[0] || 0, x.actor.pos?.[2] || 0));
      this.scene.add(group);
      this.groups.push({ group, actors, shot: s, surface, focusY, settingObj, camAdjust: { dy: 0, toward: 0, yaw: 0 } });
    }
    // Make sure the scenery never hides the characters: test each shot's camera and adjust it if needed.
    this.groups.forEach((g, k) => { try { this._fitCamera(k); } catch { /* keep the planned camera */ } });
    return { warnings: this.warnings, times: this.times };
  }
  /**
   * Body controller for a rigged character with no fixed clip chosen. Each character gets its own mixer and timeline:
   *  - walk/run clip while it travels (at a natural pace, then it stops), an in-app idle while it stands,
   *  - timed actions from the shot (wave, clap, tail wag…) that take over the body and blend back,
   *  - small per-character differences (walk speed, idle length and phase) so no two characters move in lockstep.
   */
  async _body(a, asset, rigAsset, D, seed, shotTitle) {
    const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }; // deterministic 0..1
    const ok = (x) => x.category === 'clip' && x.status === 'approved';
    const m = a.motion || {}; const start = TRAVEL_MOTIONS.includes(m.type) ? Math.min(Math.max(0, Number(m.start || 0)), Math.max(0, D - 0.5)) : 0;
    const avail = Math.max(0.1, D - start);
    const end = motionAt(a, D, D); const p0 = a.pos || [0, 0, 0];
    // Distance walked: straight line for path/drift/bounce, the arc length for circle.
    const dist = m.type === 'circle' ? 2 * Math.PI * Math.hypot(p0[0] - (m.center?.[0] ?? p0[0] + 1.5), p0[2] - (m.center?.[2] ?? p0[2])) * Number(m.turns ?? 1)
      : Math.hypot(end.pos[0] - p0[0], end.pos[2] - p0[2]);
    const speed = dist / avail;
    let src = null; let walkClip = null; let walkLabel = ''; let running = false;
    if (TRAVEL_MOTIONS.includes(m.type) && dist > 0.3) {
      const c = asset.clips.find((x) => ok(x) && (speed > 1.8 ? /run/i : /walk/i).test(x.label)) || asset.clips.find((x) => ok(x) && /walk|run/i.test(x.label));
      if (c) { const cg = await loadGLTF(c.url).catch(() => null); if (cg?.animations?.length) { src = cg; walkClip = cg.animations[0]; walkLabel = c.label; running = /run/i.test(c.label); } }
    }
    if (!src) src = await loadGLTF(rigAsset.url).catch(() => null);
    if (!src) return null;
    const key = walkClip ? `walk:${src.scene.uuid}` : rigAsset.url;
    this._rigs ||= new Map();
    let rig = this._rigs.get(key);
    if (!rig) { rig = analyseRig(skeletonClone(src.scene)); this._rigs.set(key, rig); }
    if (!rig.biped && !rig.quad && !walkClip) return null; // unknown skeleton: keep the static model
    const obj = skeletonClone(src.scene); const mixer = new THREE.AnimationMixer(obj);
    const body = { key, obj, mixer, rig, start, travel: null, walk: null, idle: null, actions: [], phase: rnd(1) * 10, head: rig.map.head ? obj.getObjectByName(rig.map.head.name) : null };
    const labels = [];
    if (walkClip) {
      const pace = (running ? 2.6 : 1.1) * Number(a.scale || 1) * (0.94 + 0.12 * rnd(2)); // each character walks at its own pace
      let clipSpeed = Math.min(2.2, Math.max(0.5, speed / pace)); let travel = avail;
      if (speed < pace * 0.7) { travel = dist / pace; clipSpeed = 1; } // natural pace, then stop
      body.walk = { action: mixer.clipAction(walkClip), dur: walkClip.duration || 1, speed: clipSpeed * (0.96 + 0.08 * rnd(3)) };
      body.walk.action.play();
      body.travel = travel;
      labels.push(walkLabel);
    }
    const idleId = rig.biped ? 'idle' : rig.quad ? 'dogIdle' : null;
    if (idleId) {
      const clip = buildClip(rig, idleId, { seconds: 3.6 + 1.2 * rnd(4), repeats: 1 }, 'Idle (auto)');
      body.idle = { action: mixer.clipAction(clip), dur: clip.duration };
      body.idle.action.play();
      labels.push('idle');
    }
    const usable = (id) => MOVES[id] && (MOVES[id].biped ? rig.biped : MOVES[id].quad ? rig.quad : true);
    for (const act of Array.isArray(a.actions) ? a.actions : []) {
      if (!usable(act.move)) { this.warnings.push(`Shot “${shotTitle}”: ${asset.name} can't do “${act.move}” with a ${rig.quad ? 'four-legged' : rig.biped ? 'two-legged' : 'basic'} rig; skipped.`); continue; }
      const params = {};
      if (act.seconds) { const one = Number(act.seconds) / Math.max(1, Number(act.repeats || 1)); params.seconds = one; }
      if (act.repeats) params.repeats = Number(act.repeats);
      if (act.hand) { params.hand = act.hand; params.side = act.hand; }
      const clip = buildClip(rig, act.move, params, act.move);
      const action = mixer.clipAction(clip); action.play(); action.setEffectiveWeight(0);
      body.actions.push({ action, at: Math.max(0, Number(act.at || 0)), dur: clip.duration, move: act.move });
      labels.push(act.move);
    }
    body.label = labels.join(' → ') || 'rig';
    return body;
  }

  /** Blend this character's layers for shot time u: walk while travelling, idle when standing, actions on top. */
  _poseBody(a, u) {
    const B = a.body; const fade = (x, w) => Math.min(1, Math.max(0, x / w));
    let walkW = 0;
    if (B.walk) {
      if (B.travel != null) { const t0 = B.start, t1 = B.start + B.travel; walkW = Math.min(fade(u - t0 + 0.15, 0.3), fade(t1 - u + 0.15, 0.4)); }
      else walkW = 1;
      if (!B.idle) walkW = 1; // nothing else to stand with
      const wt = Math.max(0, u - B.start) * B.walk.speed + B.phase;
      B.walk.action.time = (wt % B.walk.dur + B.walk.dur) % B.walk.dur;
    }
    let actW = 0;
    for (const x of B.actions) {
      const w = u >= x.at && u <= x.at + x.dur ? Math.min(fade(u - x.at, 0.25), fade(x.at + x.dur - u, 0.3)) : 0;
      x.action.time = Math.min(x.dur, Math.max(0, u - x.at));
      x.action.setEffectiveWeight(w * (1 - actW)); actW = Math.min(1, actW + w);
    }
    const base = 1 - actW;
    if (B.walk) B.walk.action.setEffectiveWeight(base * walkW);
    if (B.idle) { B.idle.action.setEffectiveWeight(base * (1 - (B.walk ? walkW : 0))); B.idle.action.time = ((u + B.phase) % B.idle.dur + B.idle.dur) % B.idle.dur; }
    B.mixer.update(0);
  }

  /** Normalise an actor: standing actors get their feet at y=0, sky objects are centred; then sized by kind. */
  _wrap(group, obj, a, mixer, clipDur, kind) {
    obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const sky = isSky(a);
    const box = measureBox(obj); // correct for rigged models (bones in cm) too
    const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= sky ? c.y : box.min.y;
    const dim = !sky && kind === 'character' ? size.y : Math.max(size.x, size.y, size.z);
    const fit = new THREE.Group(); fit.add(obj);
    if (dim > 0 && Number.isFinite(dim)) fit.scale.setScalar((sky ? ACTOR_SIZE.sky : ACTOR_SIZE[kind] || ACTOR_SIZE.prop) / dim);
    const holder = new THREE.Group(); holder.rotation.order = 'YXZ'; holder.add(fit); group.add(holder); // yaw first, so lean/waddle follow the facing
    // A character "twinkling" pulses its whole body; soften it to a gentle glow. Stars/props keep a calmer twinkle too.
    let motionActor = a;
    if (a.motion?.type === 'twinkle') {
      const cap = kind === 'character' ? { amount: 0.04, speed: 0.6 } : { amount: 0.15, speed: 1.6 };
      motionActor = { ...a, motion: { ...a.motion, amount: Math.min(Number(a.motion.amount ?? 0.12), cap.amount), speed: Math.min(Number(a.motion.speed ?? 3), cap.speed) } };
    }
    return { holder, actor: a, motionActor, mixer, clipDur, sky, skyBase: 0, kind };
  }

  shotIndexAt(t) { const i = this.times.findIndex((x) => t >= x.start && t < x.end); return i >= 0 ? i : t >= (this.times.at(-1)?.end ?? 0) ? this.times.length - 1 : 0; }

  renderAt(t) {
    if (!this.groups.length) { this.renderer.render(this.scene, this.camera); return -1; }
    const k = this.shotIndexAt(t);
    this.groups.forEach((g, i) => { g.group.visible = i === k; });
    const { start, length: D } = this.times[k]; const u = Math.max(0, t - start);
    const g = this.groups[k];
    this._poseActors(g, u, D);
    this._poseFaces(g, t);
    this._camera(g.shot.camera || {}, u, D, g.actors, g.focusY, g.surface, g.camAdjust);
    this._light(g.shot.lighting?.preset || 'day', g.focusY);
    this.renderer.render(this.scene, this.camera);
    return k;
  }
  /**
   * Blinks always; mouths move while a lyric line is sung. The characters the line belongs to (Stage 2 usage) sing it;
   * if none of them is in this shot, everyone in the shot sings along.
   */
  _poseFaces(g, t) {
    const withFace = g.actors.filter((a) => a.face);
    if (!withFace.length) return;
    const line = this.lines.find((l) => t >= l.start && t < l.end) || null;
    const own = line ? withFace.filter((a) => a.usages?.includes(line.i)) : [];
    const singers = new Set(own.length ? own : withFace);
    withFace.forEach((a, k) => a.face.pose(t, line && singers.has(a) ? mouthOpen(this.env, t, line, k * 1.3) : 0));
  }
  _poseActors(g, u, D, withClips = true) {
    const travelling = (x) => TRAVEL_MOTIONS.includes(x.motionActor.motion?.type);
    g.actors.forEach((a, i) => {
      const m = motionAt(a.motionActor, u, D);
      if (!a.mixer) life(a, m, u, D, i); // static models: procedural walk / idle so they don't look like sliding statues
      else faceTravel(a, m, u, D);
      // "Turn to face" another character once standing (after arriving, or from the start if it doesn't travel).
      const tt = a.actor.turn_to; const other = Number.isInteger(tt) && tt !== i ? g.actors[tt] : null;
      if (other) {
        const from = a.body?.travel != null ? a.body.start + a.body.travel : travelling(a) ? D : 0;
        const p = motionAt(other.motionActor, u, D).pos; let d = Math.atan2(p[0] - m.pos[0], p[2] - m.pos[2]) - m.rot[1]; d = Math.atan2(Math.sin(d), Math.cos(d));
        m.rot[1] += d * ease((u - from) / 0.8);
      }
      m.pos[1] += a.sky ? a.skyBase : g.surface(m.pos[0], m.pos[2]); // stand on the landscape
      a.holder.position.set(...m.pos); a.holder.rotation.set(...m.rot); a.holder.scale.set(...m.scale);
      if (a.body && withClips) this._poseBody(a, u);
      else if (a.mixer && withClips) { const sp = Number(a.actor.clip?.speed ?? a.autoSpeed ?? 1); a.mixer.setTime(((u * sp + Number(a.actor.clip?.offset || 0)) % (a.clipDur || 1) + (a.clipDur || 1)) % (a.clipDur || 1)); }
    });
    if (!withClips) return;
    // Heads turn toward the character they're looking at (on top of whatever the body is doing), up to ~50°.
    g.actors.forEach((a, i) => {
      const la = a.actor.look_at; const head = a.body?.head; const other = Number.isInteger(la) && la !== i ? g.actors[la] : null;
      if (!head || !other) return;
      a.holder.updateMatrixWorld(true);
      const hp = head.getWorldPosition(new THREE.Vector3()); const tp = other.holder.position;
      let d = Math.atan2(tp.x - hp.x, tp.z - hp.z) - a.holder.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      d = Math.max(-0.9, Math.min(0.9, d)) * ease(u / 0.6);
      const pq = head.parent.getWorldQuaternion(new THREE.Quaternion());
      const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d);
      head.quaternion.premultiply(pq.clone().invert().multiply(r).multiply(pq));
    });
  }

  /**
   * Check the planned camera at a few moments of the shot. If the landscape (a giant flower, a hill, a wall) blocks
   * the view of a standing character, raise the camera and bring it closer until every character is visible.
   */
  _fitCamera(k) {
    const g = this.groups[k]; const D = this.times[k]?.length || 4;
    const targets = g.actors.filter((a) => !a.sky);
    if (!g.settingObj || !targets.length) return;
    g.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(); const from = new THREE.Vector3(); const to = new THREE.Vector3();
    // Score a camera adjustment: rays to 5 points on each character (must be visible) and 4 points around it
    // (foreground scenery filling the frame next to the character also counts, at half weight).
    const samples = [0.1, 0.3, 0.5, 0.7, 0.9];
    const score = (adj, limit) => {
      let bad = 0;
      for (const f of samples) {
        const u = f * D;
        this._poseActors(g, u, D, false);
        this._camera(g.shot.camera || {}, u, D, g.actors, g.focusY, g.surface, adj);
        from.copy(this.camera.position);
        for (const a of targets) {
          const tall = (ACTOR_SIZE[a.kind] || ACTOR_SIZE.prop) * Number(a.actor.scale || 1);
          const side = new THREE.Vector3().subVectors(a.holder.position, from).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(tall);
          const at = (sx, fy) => a.holder.position.clone().addScaledVector(side, sx).setY(a.holder.position.y + tall * fy);
          const body = [at(0, 0.95), at(0, 0.6), at(0, 0.12), at(0.25, 0.5), at(-0.25, 0.5)];
          const around = [at(0.9, 0.5), at(-0.9, 0.5), at(0.6, 1.3), at(-0.6, 1.3)];
          for (const [pts, w] of [[body, 1], [around, 0.5]]) for (const p of pts) {
            to.copy(p); const dir = to.clone().sub(from); const dist = dir.length(); if (dist < 0.01) continue;
            ray.set(from, dir.normalize()); ray.far = dist - 0.2;
            if (ray.intersectObject(g.settingObj, true).length) { bad += w; if (bad > limit) return bad; }
          }
        }
      }
      return bad;
    };
    const ok = 1.0 * samples.length; // a little foreground is fine
    let best = { dy: 0, toward: 0, yaw: 0 }, bestScore = score(best, Infinity);
    if (bestScore > ok) {
      // Try other viewpoints around the character first (keeps eye level), then moving in, then a little higher.
      const tries = [];
      for (const toward of [0, 0.3, 0.55]) for (const yaw of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) tries.push({ yaw, toward, dy: toward ? 0.4 : 0 });
      tries.push({ yaw: 0, toward: 0.3, dy: 0.4 }, { yaw: 0, toward: 0.55, dy: 0.8 });
      for (const t of tries) {
        const sc = score(t, bestScore);
        if (sc < bestScore) { best = t; bestScore = sc; }
        if (bestScore <= ok) break;
      }
    }
    const adj = best;
    g.camAdjust = adj;
  }

  _camera(c, u, D, actors, baseY = 0, surface = () => 0, adj = { dy: 0, toward: 0, yaw: 0 }) {
    const k = ease(u / D); const cam = this.camera;
    cam.fov = Number(c.fov || 40); cam.updateProjectionMatrix();
    const dist = Number(c.distance || 1); const h = Number(c.height ?? 0);
    const tgt = actors[c.target ?? 0]?.holder.position;
    let pos = [0, 1.8 + h, 9 * dist], look = [0, 1.2 + h, 0];
    const lift = (p) => [p[0], p[1] + baseY, p[2]];
    switch (c.preset) {
      case 'tilt-up': pos = [0, 1.2 + h, 8.5 * dist]; look = [0, lerp(0.6, 3.2, k) + h, 0]; break;
      case 'pan': { const a = Number(c.amount ?? 1.5); const x = lerp(-a, a, u / D); pos = [x, 1.8 + h, 9 * dist]; look = [x, 1.3 + h, 0]; break; }
      case 'dolly-in': pos = [0, 1.6 + h, lerp(10, 5.5, k) * dist]; look = [0, 1.1 + h, 0]; break;
      case 'closeup': if (tgt) { pos = [tgt.x, tgt.y + 1 + h, tgt.z + 3.2 * dist]; look = [tgt.x, tgt.y + 0.8, tgt.z]; } break;
      case 'follow': if (tgt) { pos = [tgt.x * 0.8, tgt.y + 1.7 + h, tgt.z + 6.5 * dist]; look = [tgt.x, tgt.y + 0.9 + h * 0.3, tgt.z]; } break;
      case 'orbit': { const ang = lerp(-0.35, 0.35, u / D); pos = [Math.sin(ang) * 9 * dist, 2 + h, Math.cos(ang) * 9 * dist]; look = [0, 1.2 + h, 0]; break; }
      case 'group': { // tracks the middle of everyone standing and backs off far enough to keep them all in frame
        const st = actors.filter((x) => !x.sky).map((x) => x.holder.position);
        if (st.length) {
          const cx = st.reduce((s, p) => s + p.x, 0) / st.length, cy = st.reduce((s, p) => s + p.y, 0) / st.length, cz = st.reduce((s, p) => s + p.z, 0) / st.length;
          const spread = Math.max(1.5, ...st.map((p) => Math.hypot(p.x - cx, p.z - cz)));
          const back = Math.max(5, spread * 2.6 + 3) * dist;
          pos = [cx, cy + 1.9 + h, cz + back]; look = [cx, cy + 0.8 + h * 0.3, cz];
        }
        break;
      }
      default: break;
    }
    if (!['closeup', 'follow', 'group'].includes(c.preset) || (!tgt && c.preset !== 'group')) { pos = lift(pos); look = lift(look); }
    if (adj.yaw) { const dx = pos[0] - look[0], dz = pos[2] - look[2], c = Math.cos(adj.yaw), sn = Math.sin(adj.yaw); pos[0] = look[0] + dx * c + dz * sn; pos[2] = look[2] - dx * sn + dz * c; }
    if (adj.toward || adj.dy) { for (let i = 0; i < 3; i++) pos[i] = look[i] + (pos[i] - look[i]) * (1 - adj.toward); pos[1] += adj.dy; } // clear view (see _fitCamera)
    pos[1] = Math.max(pos[1], surface(pos[0], pos[2]) + 0.6); // never inside the hill
    cam.position.set(...pos); cam.lookAt(...look);
  }
  _light(preset, baseY = 0) {
    const L = LIGHTING[preset] || LIGHTING.day;
    this.sun.target.position.set(0, baseY, 0); this.sun.target.updateMatrixWorld();
    this.sun.position.set(L.sunPos[0] * 2.5, L.sunPos[1] * 2.5 + baseY, L.sunPos[2] * 2.5);
    if (this._lightPreset === preset) return;
    this._lightPreset = preset;
    this.scene.background = new THREE.Color(L.sky);
    this.scene.fog.color.set(L.fog);
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = L.hemi;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI;
  }
}
