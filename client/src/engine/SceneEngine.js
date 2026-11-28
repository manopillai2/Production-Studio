// Deterministic 3D scene engine: renderAt(t) always produces the same frame for the same time, so the
// browser preview (driven by the audio clock) and the MP4 export (frame by frame) match exactly.
import * as THREE from 'three';
import { checkClearance, clearLegs, equipSD } from './Clearance.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGLTF, measureBox } from './three-common.js';
import { analyseRig, buildClip, MOVES } from './MoveMaker.js';
import { addFace, vocalEnvelope, mouthOpen, mouthShape } from './FaceRig.js';
import { buildLandscape, blobShadowTexture, lookOf, SKY } from './Landscape.js';
import { buildEquipment } from './Playground.js';

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
export const MOTIONS = ['none', 'rise', 'float', 'drift', 'bounce', 'twinkle', 'spin', 'sway', 'path', 'circle'];
/** Motions that carry a character across the ground (a rigged character walks or runs during them). */
export const TRAVEL_MOTIONS = ['path', 'drift', 'bounce', 'circle'];
export const CAMERAS = ['wide', 'tilt-up', 'pan', 'dolly-in', 'closeup', 'follow', 'orbit', 'group', 'crane'];
/** How much of the frame the subject fills. 'auto' = the camera move's natural size. */
export const SHOT_SIZES = ['auto', 'extreme-wide', 'wide', 'full', 'medium', 'closeup'];
export const SIZE_LABEL = { auto: 'Auto (from the move)', 'extreme-wide': 'Extreme wide: the whole place', wide: 'Wide: place + characters', full: 'Full: whole body fills the frame', medium: 'Medium: waist up', closeup: 'Close-up: face' };
/** Each camera move's natural shot size. */
export const PRESET_SIZE = { wide: 'wide', 'tilt-up': 'full', pan: 'wide', 'dolly-in': 'wide', closeup: 'closeup', follow: 'full', orbit: 'full', group: 'full', crane: 'wide' };
const CLOSER = { 'extreme-wide': 'wide', wide: 'full', full: 'medium', medium: 'closeup', closeup: 'closeup' };
/** Transitions INTO a shot. 'auto' = dissolve at a new section (verse → chorus), a cut inside a section. */
export const TRANSITIONS = ['auto', 'cut', 'dissolve', 'dip-white', 'iris', 'wipe'];
export const TRANSITION_LABEL = { auto: 'Auto', cut: 'Cut', dissolve: 'Dissolve (cross-fade)', 'dip-white': 'Dip to white', iris: 'Iris (circle)', wipe: 'Wipe (curtain)' };

const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return 1 - (1 - c) ** 3; };
/**
 * Fraction of a walk covered at time fraction k (0..1) of a D-second walk: speed up for ~0.4 s, steady, slow down for
 * ~0.4 s. The walk cycle uses the SAME curve, so the feet never slide and never walk on the spot.
 */
export const travelK = (k, D) => { const a = Math.min(0.25, 0.4 / Math.max(0.1, D)); k = Math.min(1, Math.max(0, k)); const v = 1 / (1 - a);
  if (k < a) return (0.5 * v * k * k) / a; if (k > 1 - a) return 1 - (0.5 * v * (1 - k) * (1 - k)) / a; return v * (k - a / 2); };
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
    case 'float': { // hovers on its string (gentle bob and rock), then lifts off and floats up and away, swaying
      const x = Math.max(0, u - (m.delay || 0)) / Math.max(0.1, m.duration || 4); const p = x < 1 ? x * x * (2 - x) : 1 + (x - 1) * 0.9;
      const sway = Math.min(1, x * 2);
      pos[1] = base[1] + (m.amount ?? 3) * p + Math.sin(u * 1.6) * 0.07 + Math.sin(u * 0.7 + 2) * 0.03;
      pos[0] = base[0] + Math.sin(u * 0.9) * (0.05 + 0.2 * sway) + (m.dx ?? 0.6) * Math.min(1, x);
      pos[2] = base[2] + Math.sin(u * 0.75 + 1) * (0.03 + 0.1 * sway);
      rot[2] = (rot[2] || 0) + Math.sin(u * 1.2) * (0.05 + 0.07 * sway); // radians: a few degrees of rocking
      rot[0] = (rot[0] || 0) + Math.sin(u * 0.95 + 1.3) * 0.04;
      break; }
    case 'drift': pos[0] = base[0] + (m.dx ?? 4) * (u / D); pos[1] = base[1] + Math.sin(u * 1.3) * (m.bob ?? 0.1); break;
    case 'bounce': {
      // A real ball: it rests until it is kicked (m.start), flies in gravity arcs that get lower with every bounce
      // (each keeps ~55% of the height), squashes for a moment when it lands, spins as it travels, then rolls to a stop.
      // (It used to float along |sin| arcs spread over the whole shot: a slow, weightless ball.)
      const G = 9.8, e = Number(m.restitution ?? 0.55), t0 = 0; // m.start is already applied above (bounce is a travelling motion)
      const to = m.to || base; const dx = to[0] - base[0], dz = to[2] - base[2]; const dist = Math.hypot(dx, dz);
      const R = Number(m.radius ?? 0.45 * s); // the ball's radius (a prop is ~0.9 m tall at scale 1)
      const n = Math.max(1, Math.round(Number(m.hops ?? 2))); const h0 = Number(m.height ?? 0.5);
      const arcs = []; let tSum = 0; for (let i = 0; i < n; i++) { const h = h0 * e ** (2 * i); const T = 2 * Math.sqrt((2 * h) / G); arcs.push({ t: tSum, T, h }); tSum += T; }
      const roll = Number(m.roll ?? 0.7), airFrac = dist > 0.01 ? 0.85 : 0; // most of the distance in the air, the rest rolling
      const tt = u - t0; let y = 0, k = 0, squash = 0;
      if (tt <= 0) k = 0;
      else if (tt < tSum) {
        const a = arcs.find((q) => tt >= q.t && tt < q.t + q.T) || arcs.at(-1); const lt = tt - a.t; const vy = Math.sqrt(2 * G * a.h);
        y = Math.max(0, vy * lt - 0.5 * G * lt * lt); k = airFrac * (tt / tSum);
        const toContact = Math.min(lt, a.T - lt); if (toContact < 0.05) squash = 1 - toContact / 0.05;
      } else { const r = Math.min(1, (tt - tSum) / roll); k = airFrac + (1 - airFrac) * (1 - (1 - r) * (1 - r)); }
      if (tt > 0 && tt < 0.05) squash = Math.max(squash, 1 - tt / 0.05); // the kick
      pos[0] = base[0] + dx * k; pos[2] = base[2] + dz * k; pos[1] = base[1] + y;
      sy = 1 - 0.16 * squash; // squash on impact (the engine keeps the width)
      if (dist > 0.01) { // rolling spin about the ball's CENTRE (its origin is at the bottom: spinning about that sank it into the ground)
        const a = (dist * k) / R; rot[0] += a;
        pos[1] += R - R * Math.cos(a); pos[0] -= R * Math.sin(a) * (dx / dist); pos[2] -= R * Math.sin(a) * (dz / dist);
      }
      break;
    }
    case 'twinkle': s *= 1 + (m.amount ?? 0.12) * Math.sin(u * (m.speed ?? 3) * Math.PI * 2); break;
    case 'spin': rot[1] += (m.speed ?? 1) * u; break;
    case 'sway': rot[2] += Math.sin(u * (m.speed ?? 1.5) * Math.PI) * (m.amount ?? 0.08); break;
    case 'path': { const k = travelK(u / D, D); const to = m.to || base; for (let i = 0; i < 3; i++) pos[i] = lerp(base[i], to[i], k); break; }
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
  if (!['path', 'bounce', 'drift'].includes(a.motionActor.motion?.type) || a.actor.face_travel === false) return;
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
  if (['path', 'bounce', 'drift'].includes(a.motionActor.motion?.type) && a.actor.face_travel !== false) {
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
    // Neutral tone mapping keeps the World Style colours true (ACES would wash them out) while taming highlights.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 700);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#88aa77', 1.2);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02; this.sun.shadow.radius = 3;
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 120 });
    // Rim light from behind: a bright edge that separates the characters from the background.
    this.rim = new THREE.DirectionalLight('#ffffff', 0.9);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.rim, this.rim.target);
    this.scene.fog = new THREE.Fog('#cdebff', 45, 280);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envCache = new Map();
    // Second pass for transitions: the outgoing shot is drawn into this target, then blended over the incoming one.
    this.overlay = { scene: new THREE.Scene(), camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    this.overlay.mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { tex: { value: null }, useTex: { value: 0 }, color: { value: new THREE.Color('#ffffff') }, alpha: { value: 0 }, mode: { value: 0 }, p: { value: 0 }, aspect: { value: width / height } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // mode 0: flat (dissolve / dip), 1: iris (colour outside a circle of radius p), 2: wipe (colour left of p)
      fragmentShader: `uniform sampler2D tex; uniform float useTex; uniform vec3 color; uniform float alpha; uniform float mode; uniform float p; uniform float aspect; varying vec2 vUv;
        void main(){ vec4 c = useTex > 0.5 ? texture2D(tex, vUv) : vec4(color, 1.0); float a = alpha;
          if (mode > 0.5 && mode < 1.5) { vec2 d = vUv - 0.5; d.x *= aspect; a = smoothstep(p - 0.01, p + 0.01, length(d)); }
          if (mode > 1.5 && mode < 2.5) { a = 1.0 - smoothstep(p - 0.01, p + 0.01, vUv.x); }
          if (mode > 2.5) { a = smoothstep(p - 0.01, p + 0.01, vUv.x); }
          gl_FragColor = vec4(c.rgb, a); }`,
    });
    this.overlay.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.overlay.mat));
    // Depth of field: the subject sharp, the background softly blurred, like a film camera. It keeps young viewers'
    // eyes on the characters (a busy, sharp background competes for attention). Gather blur over a golden-angle
    // disc; each sample counts only as far as its own blur reaches, so the sharp subject never bleeds into the blur.
    this.dof = { scene: new THREE.Scene(), mat: new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, near: { value: 0.1 }, far: { value: 700 }, focus: { value: 8 }, focusFar: { value: 8 }, aperture: { value: 0 }, maxR: { value: 10 }, texel: { value: new THREE.Vector2(1 / width, 1 / height) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `#include <packing>
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform float near; uniform float far; uniform float focus; uniform float focusFar; uniform float aperture; uniform float maxR; uniform vec2 texel; varying vec2 vUv;
        float coc(vec2 uv){ float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
          float dz = z < focus ? focus - z : (z > focusFar ? z - focusFar : 0.0); // sharp across the whole band where the characters are
          float c = aperture * dz / max(z, 0.01);                         // thin-lens blur, in units of maxR
          c *= z < focus ? 0.6 : 1.0;                                     // gentler in front of the subject
          return clamp(c, 0.0, 1.0) * maxR; }
        void main(){
          vec4 base = texture2D(tColor, vUv); float c0 = coc(vUv);
          vec3 acc = base.rgb; float wsum = 1.0;
          if (c0 > 0.6) {
            for (int i = 0; i < 36; i++) {
              float fi = float(i) + 0.5; float r = sqrt(fi / 36.0) * c0; float a = fi * 2.39996;
              vec2 uv = vUv + vec2(cos(a), sin(a)) * r * texel;
              float cs = coc(uv); float w = smoothstep(r - 1.0, r + 0.5, cs);
              acc += texture2D(tColor, uv).rgb * w; wsum += w;
            }
          }
          gl_FragColor = vec4(acc / wsum, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }), camera: this.overlay.camera };
    this.dof.mat.toneMapped = true;
    this.dof.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dof.mat));
    this.groups = []; this.times = []; this.setSize(width, height);
  }
  setSize(w, h) {
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.rt?.dispose(); this.rt = new THREE.WebGLRenderTarget(Math.round(w * pr), Math.round(h * pr), { samples: 4 }); this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.dofRT?.dispose(); this.dofRT = new THREE.WebGLRenderTarget(Math.round(w * pr), Math.round(h * pr), { samples: 4, type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(Math.round(w * pr), Math.round(h * pr), THREE.FloatType) });
    if (this.dof) this.dof.mat.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr));
    if (this.overlay) this.overlay.mat.uniforms.aspect.value = w / h;
  }
  dispose() { this.rt?.dispose(); this.dofRT?.dispose(); this.pmrem?.dispose(); for (const e of this.envCache.values()) e.dispose?.(); this.renderer.dispose(); this.renderer.forceContextLoss?.(); }

  /** Image-based light from this shot's sky and ground, so models get soft colour from their surroundings. */
  _envFor(land, preset) {
    const key = `${preset}|${land.sky.top}|${land.sky.horizon}|${land.groundColor}`;
    if (this.envCache.has(key)) return this.envCache.get(key);
    const s = new THREE.Scene();
    const sky = land.group.children.find((c) => c.renderOrder === -10)?.clone();
    if (sky) s.add(sky);
    const gr = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: land.groundColor, side: THREE.BackSide }));
    s.add(gr);
    const tex = this.pmrem.fromScene(s, 0.04, 0.1, 400).texture;
    this.envCache.set(key, tex);
    return tex;
  }

  /** Load every model used by the shots. Reports progress; problems become warnings, not crashes. */
  async load({ shots, assets, timing, duration, audio, look, roles, sections }, onProgress) {
    this.warnings = [];
    this.look = look || {}; this.roles = roles || {}; this.sections = sections || [];
    // Faces: the song's vocal loudness drives the mouths; lyric timing decides who is singing when.
    this.lines = timing?.lines || [];
    this.env = await vocalEnvelope(audio?.url).catch(() => null);
    for (const g of this.groups) this.scene.remove(g.group);
    this.groups = [];
    this.times = shotTimes(shots, timing, duration);
    const byCard = Object.fromEntries(assets.map((a) => [a.card_id, a]));
    this._names = Object.fromEntries(assets.map((a) => [a.card_id, a.name]));
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
      // Playground equipment with moving parts (seesaw, swings, slide, merry-go-round), standing on the scenery.
      const equip = [];
      for (const e of Array.isArray(s.setting?.equipment) ? s.setting.equipment : []) {
        const eq = buildEquipment(e); if (!eq) { this.warnings.push(`Shot “${s.title}”: unknown equipment “${e.type}”.`); continue; }
        const p = e.pos || [0, 0, 0]; eq.group.position.y = surface(p[0], p[2]) + Number(p[1] || 0);
        eq.group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        group.add(eq.group); equip.push(eq);
      }
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
            w.usages = asset.usages || []; if (face) w.face = face;
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
            w.usages = asset.usages || []; if (face) w.face = face;
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
      actors.forEach((x) => { x.name = byCard[x.actor.card_id]?.name || ''; });
      // Contact shadows: a soft dark patch under everything standing, so nothing looks like it floats.
      for (const x of actors) {
        if (x.sky) continue;
        const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1; group.add(blob); x.blob = blob;
      }
      // The landscape around the scenery (sky, clouds, hills, trees, dressing, ground), per shot: look + lighting.
      const preset = s.lighting?.preset || 'day';
      const placeLook = Object.fromEntries(Object.entries(setting?.landscape || {}).filter(([k, v]) => !['time_of_day', 'why'].includes(k) && v !== '' && v != null));
      const shotLook = lookOf({ ...this.look, ...placeLook }, s.lighting?.look);
      let setRadius = 8;
      if (settingObj) { const b = new THREE.Box3().setFromObject(settingObj); const sz = b.getSize(new THREE.Vector3()); setRadius = Math.max(4, Math.min(20, Math.max(sz.x, sz.z) / 2)); }
      const keepClear = (s.actors || []).flatMap((a) => [a.pos || [0, 0, 0], a.motion?.to, a.motion?.center].filter(Boolean));
      const L = LIGHTING[preset] || LIGHTING.day;
      const land = buildLandscape({ look: shotLook, preset, roles: this.roles, setRadius, seed: (s.setting?.card_id || 1) * 97 + 11, sunDir: new THREE.Vector3(...L.sunPos), keepClear });
      group.add(land.group);
      this.scene.add(group);
      this.groups.push({ group, actors, equip, shot: s, surface, focusY, settingObj, land, look: shotLook, preset, camAdjust: { dy: 0, toward: 0, yaw: 0 } });
    }
    // Section of each shot (verse / chorus …) for automatic transitions.
    this.groups.forEach((g, k) => { g.section = this._sectionOf(g.shot); g.transition = this._transitionInto(k); });
    // Stable framing per shot (where everyone goes during the whole shot), measured once.
    this.groups.forEach((g, k) => { try { this._measureFraming(k); } catch { /* keep defaults */ } });
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
    const body = { key, obj, mixer, rig, start, travel: null, walk: null, idle: null, actions: [], phase: rnd(1) * 10, head: rig.map.head ? obj.getObjectByName(rig.map.head.name) : null, motionType: m.type, life: new Map() };
    // Ground contact: how high the ankles sit above the soles in the rest pose (to keep the standing foot on the floor).
    if (rig.biped || rig.quad) {
      const feet = ['lFoot', 'rFoot'].map((k) => rig.map[k] && obj.getObjectByName(rig.map[k].name)).filter(Boolean);
      if (feet.length < 2 && rig.quad) { // four legs: the paw at the end of each leg (the deepest bone of the chain)
        for (const k of ['lFLwr', 'rFLwr', 'lRHock', 'rRHock']) {
          const kk = rig.map[k] ? k : k.replace('Hock', 'Lwr'); let b = rig.map[kk] && obj.getObjectByName(rig.map[kk].name);
          if (b) feet.push(b); // the hock / wrist joint too: when rolling over it can be the lowest point
          while (b && b.children.find((c) => c.isBone)) b = b.children.find((c) => c.isBone);
          if (b && !feet.includes(b)) feet.push(b);
        }
      }
      if (feet.length >= 2) { obj.updateMatrixWorld(true); const minY = measureBox(obj).min.y; body.feet = feet; body.footRest = Math.min(...feet.map((f) => f.getWorldPosition(new THREE.Vector3()).y)) - minY; }
    }
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
      // Every performance is a little different: energy, tempo and (for waves) the number of waves vary per character and shot.
      const vk = 20 + body.actions.length * 7;
      params.energy = 0.86 + 0.28 * rnd(vk);
      if (act.move === 'wave') params.waves = 2 + Math.floor(rnd(vk + 1) * 3);
      // Rides (hold) keep their exact length so the body stays in step with the equipment; short gestures vary a little.
      if (act.seconds) { const one = Number(act.seconds) / Math.max(1, Number(act.repeats || 1)); params.seconds = act.hold || act.exact ? one : one * (0.95 + 0.1 * rnd(vk + 2)); }
      if (act.repeats) params.repeats = Number(act.repeats);
      if (act.hand) { params.hand = act.hand; params.side = act.hand; }
      // Every other setting the move understands (jump height, crouch, nods, tugs, claps…) — these were silently dropped.
      for (const k of Object.keys(MOVES[act.move].params || {})) if (!['seconds', 'repeats', 'hand'].includes(k) && act[k] != null) params[k] = act[k];
      const clip = buildClip(rig, act.move, params, act.move);
      const action = mixer.clipAction(clip); action.play(); action.setEffectiveWeight(0);
      body.actions.push({ action, at: Math.max(0, Number(act.at || 0)), dur: clip.duration, move: act.move, hold: !!act.hold, offset: Math.max(0, Number(act.offset || 0)) });
      labels.push(act.move);
    }
    body.label = labels.join(' → ') || 'rig';
    return body;
  }

  /** Blend this character's layers for shot time u: walk while travelling, idle when standing, actions on top. */
  /** Where a riding actor is at shot time u: {pos (group space), rot [x,y,z], seat (Object3D)} or null. */
  _rideAt(g, a, u) {
    const r = a.actor.ride; const eq = r && g.equip?.[Number(r.equip ?? 0)];
    if (!eq) return null;
    const inv = new THREE.Matrix4().copy(g.group.matrixWorld).invert();
    if (eq.type === 'slide' && r.climb && u < Number(r.climb.at || 0) + Number(r.climb.dur || 2)) { // climbs the ladder first, standing
      const c = r.climb; const k = (u - Number(c.at || 0)) / Math.max(0.5, Number(c.dur || 2));
      const at = eq.climbAt(k); const w = eq.group.localToWorld(at.pos.clone()).applyMatrix4(inv);
      return { pos: w, rot: [0, eq.group.rotation.y, 0], seat: null, stand: true };
    }
    if (eq.type === 'slide' && r.off !== false && u > Number(r.at ?? 1) + Number(r.dur ?? 1.6) + Number(r.off_after ?? 0.4)) { // steps off the end onto the grass
      const k = Math.min(1, (u - (Number(r.at ?? 1) + Number(r.dur ?? 1.6) + Number(r.off_after ?? 0.4))) / 0.6); const kk = k * k * (3 - 2 * k);
      const end = eq.slideAt(1).pos; const off = new THREE.Vector3(0, 0, eq.endZ + 0.45);
      const w = eq.group.localToWorld(end.clone().lerp(off, kk)).applyMatrix4(inv); w.y = w.y * (1 - kk) + g.surface(w.x, w.z) * kk;
      return { pos: w, rot: [0, eq.group.rotation.y, 0], seat: null, stand: true };
    }
    if (eq.type === 'slide') { // sits at the top, then slides down (ride.at / ride.dur seconds), and stays at the bottom
      const k = Math.min(1, Math.max(0, (u - Number(r.at ?? 1)) / Math.max(0.3, Number(r.dur ?? 1.6)))); const kk = k * k * (2 - k * 0.6) / 1.4;
      const at = eq.slideAt(Math.min(1, kk)); const w = eq.group.localToWorld(at.pos.clone()).applyMatrix4(inv);
      return { pos: w, rot: [at.pitch, eq.group.rotation.y, 0], seat: null, slideK: k };
    }
    const seat = eq.seats[r.seat || 'a']; if (!seat) return null;
    const wp = seat.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const gq = new THREE.Quaternion(); g.group.getWorldQuaternion(gq);
    const q = gq.invert().multiply(seat.getWorldQuaternion(new THREE.Quaternion()));
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    if (r.back) { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.getWorldQuaternion(new THREE.Quaternion())); f.y = 0; f.normalize(); wp.addScaledVector(f, -Number(r.back)); } // further onto the seat (a dog keeps its paws on a merry-go-round)
    return { pos: wp, rot: [e.x, e.y + Number(r.yaw || 0), e.z], seat };
  }
  /** Put the rider's hips exactly on the seat (the sitting pose lowers the hips; this removes any gap or overlap). */
  _seatHips(g, a, ride) {
    const hb = a.body.rig.map.hips && a.body.obj.getObjectByName(a.body.rig.map.hips.name); if (!hb) return;
    a.holder.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.group.matrixWorld).invert();
    const hp = hb.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const lift = Number(a.actor.ride?.lift ?? 0.06) * Number(a.actor.scale ?? 1); // hips sit a little above the seat surface
    a.holder.position.x += ride.pos.x - hp.x; a.holder.position.z += ride.pos.z - hp.z; a.holder.position.y += ride.pos.y + lift - hp.y;
    a.holder.updateMatrixWorld(true);
  }
  /** A four-legged rider sits ON its seat: its paws, legs and tail base never go below the seat's top surface. */
  _onSeat(a, seat, equip) {
    const M = a.body.liveMap || {}; const top = seat.getWorldPosition(new THREE.Vector3()).y - 0.01;
    // Tail up (a happy pup), so it wags above the seat instead of lying on it. Pick the turn direction that raises the tip.
    const t0 = M.tail0, tipB = M.tail3 || M.tail2 || M.tail1;
    if (t0 && tipB) {
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(a.holder.getWorldQuaternion(new THREE.Quaternion()));
      const q0 = t0.quaternion.clone(); (a.body.legUndo || (a.body.legUndo = [])).push([t0, q0.clone()]);
      const tryAng = (ang) => { t0.quaternion.copy(q0); const pq = t0.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); t0.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(side.clone().applyQuaternion(pq).normalize(), ang)); t0.updateMatrixWorld(true); return tipB.getWorldPosition(new THREE.Vector3()).y; };
      const up = tryAng(0.9), down = tryAng(-0.9); tryAng(up >= down ? 0.9 : -0.9);
    }
    // Sit exactly ON the equipment: real skin points (his chubby legs are thicker than the bones suggest) against the
    // equipment's exact shapes. Anything sinking in lifts him; a gap lowers him; he settles a few millimetres above.
    const sk = this._skinPts(a.body); if (!sk.length || !equip?.length) return;
    const v = new THREE.Vector3();
    for (let it = 0; it < 4; it++) {
      let dmin = Infinity;
      for (const [m, i] of sk) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); for (const eq of equip) { const r = equipSD(eq, v); if (!r.thin && r.d < dmin) dmin = r.d; } }
      let dy = 0; if (dmin < 0.002) dy = 0.004 - dmin; else if (dmin > 0.012) dy = -(dmin - 0.005);
      if (Math.abs(dy) < 0.0008) break;
      a.holder.position.y += dy; a.holder.updateMatrixWorld(true);
    }
  }
  /** ~400 skin points of a rigged body (skinned with the current pose when read). */
  _skinPts(B) {
    return B.skinPts || (B.skinPts = (() => { const out = []; let total = 0; B.obj.traverse((m) => { if (m.isSkinnedMesh && !m.userData.mouthLayer) total += m.geometry.attributes.position.count; });
      const stride = Math.max(1, Math.floor(total / 400)); B.obj.traverse((m) => { if (m.isSkinnedMesh && !m.userData.mouthLayer) for (let i = 0; i < m.geometry.attributes.position.count; i += stride) out.push([m, i]); }); return out; })());
  }
  _poseBody(a, u) {
    const B = a.body; const fade = (x, w) => Math.min(1, Math.max(0, x / w));
    // Undo last frame's life-layer turns first: the mixer only rewrites a bone when its animated value changes, so
    // without this the small turns would pile up frame after frame (a head that slowly spins round).
    if (B.life) for (const [bone, r] of B.life) { bone.quaternion.copy(r.base); r.turned = false; }
    if (B.legUndo?.length) { for (let i = B.legUndo.length - 1; i >= 0; i--) B.legUndo[i][0].quaternion.copy(B.legUndo[i][1]); B.legUndo.length = 0; } // undo last frame's leg clearing
    let walkW = 0;
    if (B.walk) {
      if (B.travel != null) { const t0 = B.start, t1 = B.start + B.travel; walkW = Math.min(fade(u - t0 + 0.15, 0.3), fade(t1 - u + 0.15, 0.4)); }
      else walkW = 1;
      if (!B.idle) walkW = 1; // nothing else to stand with
      // The walk cycle advances with the distance covered (same speed curve as the position): no sliding, no walking on the spot.
      const tt = Math.max(0, u - B.start);
      const wt = (B.travel != null && B.motionType === 'path' ? travelK(tt / B.travel, B.travel) * B.travel : tt) * B.walk.speed + B.phase;
      B.walk.action.time = (wt % B.walk.dur + B.walk.dur) % B.walk.dur;
    }
    let actW = 0;
    for (const x of B.actions) {
      const w = u >= x.at && u <= x.at + x.dur ? Math.min(x.at <= 0.01 ? 1 : fade(u - x.at, 0.25), x.hold ? 1 : fade(x.at + x.dur - u, 0.3)) : 0;
      x.action.time = Math.min(x.dur, Math.max(0, u - x.at + (x.offset || 0))); // offset: start part-way into a repeating ride, in step with the lyric
      x.action.setEffectiveWeight(w * (1 - actW)); actW = Math.min(1, actW + w);
    }
    const base = 1 - actW; B.actW = actW; B.walkW = walkW;
    if (B.walk) B.walk.action.setEffectiveWeight(base * walkW);
    if (B.idle) { B.idle.action.setEffectiveWeight(base * (1 - (B.walk ? walkW : 0))); B.idle.action.time = ((u + B.phase) % B.idle.dur + B.idle.dur) % B.idle.dur; }
    B.mixer.update(0);
    // Ground contact: keep the lower foot on the floor (the poses and the walk clip don't know where the floor is).
    // Sinking is always corrected; a small float is pulled down, a real jump (well above the floor) is left alone.
    if (B.feet && B.riding) { if (B.baseY != null) B.obj.position.y = B.baseY; }
    else if (B.feet) {
      if (B.baseY == null) B.baseY = B.obj.position.y;
      B.obj.position.y = B.baseY; B.obj.updateMatrixWorld(true);
      const par = B.obj.parent; const v = new THREE.Vector3();
      const low = Math.min(...B.feet.map((f) => (par ? par.worldToLocal(f.getWorldPosition(v)) : f.getWorldPosition(v)).y));
      const gap = low - B.footRest; const h = B.rig.height || 1;
      const k = Math.min(1, Math.max(0, (gap - 0.025 * h) / (0.05 * h))); const keep = k * k * (3 - 2 * k);
      const dy = gap < 0 ? -gap : -gap * (1 - keep);
      if (Math.abs(dy) > 1e-5) { B.obj.position.y = B.baseY + dy; B.obj.updateMatrixWorld(true); }
      // Skin check: no part of the body (a chubby leg, a tail, a hand during a roll) may be below the floor, even when
      // the joints are above it. ~250 real skin points, skinned with this frame's pose.
      const sk = this._skinPts(B);
      if (sk.length && par) {
        let lowSkin = Infinity; for (const [m, i] of sk) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); par.worldToLocal(v); if (v.y < lowSkin) lowSkin = v.y; }
        if (lowSkin < -0.004 * h) { B.obj.position.y += -lowSkin; B.obj.updateMatrixWorld(true); }
      }
    }
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
    let fs = 1;
    if (dim > 0 && Number.isFinite(dim)) { fs = (sky ? ACTOR_SIZE.sky : ACTOR_SIZE[kind] || ACTOR_SIZE.prop) / dim; fit.scale.setScalar(fs); }
    const h0 = Number.isFinite(size.y * fs) && size.y > 0 ? size.y * fs : (ACTOR_SIZE[kind] || 1); // height at actor scale 1
    const w0 = Number.isFinite(Math.max(size.x, size.z) * fs) ? Math.max(size.x, size.z) * fs : 1;
    const holder = new THREE.Group(); holder.rotation.order = 'YXZ'; holder.add(fit); group.add(holder); // yaw first, so lean/waddle follow the facing
    // A character "twinkling" pulses its whole body; soften it to a gentle glow. Stars/props keep a calmer twinkle too.
    let motionActor = a;
    if (a.motion?.type === 'twinkle') {
      const cap = kind === 'character' ? { amount: 0.04, speed: 0.6 } : { amount: 0.15, speed: 1.6 };
      motionActor = { ...a, motion: { ...a.motion, amount: Math.min(Number(a.motion.amount ?? 0.12), cap.amount), speed: Math.min(Number(a.motion.speed ?? 3), cap.speed) } };
    }
    return { holder, actor: a, motionActor, mixer, clipDur, sky, skyBase: 0, kind, h0, w0 };
  }

  /** Clearance check at song time t: which body parts go inside equipment, props, scenery, the other character or the ground. */
  clearanceAt(t, opts = {}) {
    const k = this.shotIndexAt(t); const g = this.groups[k]; if (!g) return { shot: k, hits: [] };
    const { start, length: D } = this.times[k]; this._poseActors(g, Math.max(0, t - start), D);
    const names = g.actors.map((a, i) => `${this._names?.[a.actor.card_id] || 'actor'}#${i}`);
    return { shot: k, hits: checkClearance(g, { ...opts, names }) };
  }

  shotIndexAt(t) { const i = this.times.findIndex((x) => t >= x.start && t < x.end); return i >= 0 ? i : t >= (this.times.at(-1)?.end ?? 0) ? this.times.length - 1 : 0; }

  renderAt(t) {
    if (!this.groups.length) { this.renderer.render(this.scene, this.camera); return -1; }
    const k = this.shotIndexAt(t);
    const r = this.renderer; const ov = this.overlay; const U = ov.mat.uniforms;
    const tr = this._transitionAt(t, k);
    r.autoClear = true;
    if (tr?.kind === 'dissolve') {
      // Outgoing shot into a texture, incoming shot to the screen, then the outgoing one on top, fading out.
      this._renderShot(tr.out, t, this.rt);
      this._renderShot(tr.in, t, null);
      Object.assign(U.tex, { value: this.rt.texture }); U.useTex.value = 1; U.mode.value = 0; U.alpha.value = 1 - tr.w;
      r.autoClear = false; r.render(ov.scene, ov.camera); r.autoClear = true;
    } else {
      this._renderShot(tr ? (tr.before ? tr.out : tr.in) : k, t, null);
      if (tr) {
        U.useTex.value = 0; U.color.value.set(tr.kind === 'dip-white' ? '#FFFFFF' : this.look?.accent || '#2B2140');
        if (tr.kind === 'dip-white') { U.mode.value = 0; U.alpha.value = 1 - Math.abs(tr.w - 0.5) * 2; }
        else if (tr.kind === 'iris') { U.mode.value = 1; U.p.value = 1.05 * Math.abs(tr.w - 0.5) * 2; }
        else if (tr.kind === 'wipe') { U.mode.value = tr.before ? 2 : 3; U.p.value = tr.before ? tr.w * 2 : (tr.w - 0.5) * 2; }
        r.autoClear = false; r.render(ov.scene, ov.camera); r.autoClear = true;
      }
    }
    // Fade in from / out to black at the very start and end of the video.
    if (lookOf(this.look).fade_in_out) {
      const end = this.times.at(-1)?.end || 0;
      const a = t < 0.7 ? 1 - t / 0.7 : t > end - 0.9 ? Math.min(1, (t - (end - 0.9)) / 0.9) : 0;
      if (a > 0) { U.useTex.value = 0; U.mode.value = 0; U.color.value.set('#000000'); U.alpha.value = a; r.autoClear = false; r.render(ov.scene, ov.camera); r.autoClear = true; }
    }
    return k;
  }

  /** Draw shot k at song time t (into a render target, or the screen when target is null). */
  _renderShot(k, t, target) {
    const g = this.groups[k]; if (!g) return;
    this.groups.forEach((x, i) => { x.group.visible = i === k; });
    const { start, length: D } = this.times[k]; const u = Math.max(0, t - start);
    this._poseActors(g, u, D);
    this._poseFaces(g, t);
    this._alive(g, t);
    this._camera(g, u, D, g.camAdjust);
    this._skyInFrame(g);
    this._light(g);
    g.land?.update(t);
    const ap = this._aperture(g);
    if (ap > 0 && this.dofRT) { // scene → colour + depth, then the blur pass to the screen / transition target
      this.renderer.setRenderTarget(this.dofRT); this.renderer.render(this.scene, this.camera);
      const U = this.dof.mat.uniforms; const H = this.dofRT.height;
      Object.assign(U.tColor, { value: this.dofRT.texture }); Object.assign(U.tDepth, { value: this.dofRT.depthTexture });
      U.near.value = this.camera.near; U.far.value = this.camera.far;
      // Focus band: from the nearest to the farthest character (and prop) of the action, plus their own depth, so
      // EVERY character is sharp (Mango was blurred when he stood a little behind or in front of Mira).
      const cam = this.camera.position; const fd = cam.distanceTo(this._lookAt || new THREE.Vector3()); let fn = fd, ff = fd; const wp = new THREE.Vector3();
      for (const a of g.actors) { if (a.sky || !a.holder.visible) continue; a.holder.getWorldPosition(wp); wp.y += a.h0 * a.holder.scale.y * 0.5; const d = cam.distanceTo(wp); if (d > fd * 2.5) continue; const r = Math.max(0.25, a.w0 * a.holder.scale.x * 0.6); fn = Math.min(fn, d - r); ff = Math.max(ff, d + r); }
      U.focus.value = Math.max(0.05, fn); U.focusFar.value = ff;
      U.aperture.value = ap; U.maxR.value = H * 0.0095; // at most ~10 px of blur at 1080p
      this.renderer.setRenderTarget(target); this.renderer.render(this.dof.scene, this.dof.camera);
    } else {
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
    }
    this.renderer.setRenderTarget(null);
  }
  /** How strong the background blur is for this shot: camera.dof = 'off' | 'auto' (by shot size) | a number 0..2. */
  _aperture(g) {
    const d = g.shot.camera?.dof ?? lookOf(this.look).dof ?? 'auto';
    if (d === 'off' || d === false) return 0;
    if (Number.isFinite(Number(d)) && d !== 'auto' && d !== '') return Math.max(0, Math.min(2, Number(d)));
    return { closeup: 1.6, medium: 1.25, full: 0.95, wide: 0.6, extreme_wide: 0.3, 'extreme-wide': 0.3 }[this._shotSize] ?? 0.9;
  }

  _sectionOf(shot) {
    const i = Number(shot.line_from ?? 0);
    const k = this.sections.findIndex((s) => i >= s.from && i <= s.to);
    return k;
  }
  /** Which transition leads INTO shot k: the shot's own choice, else the project default, else automatic. */
  _transitionInto(k) {
    if (k === 0) return 'cut';
    const g = this.groups[k], prev = this.groups[k - 1];
    const own = g.shot.camera?.transition;
    if (own && own !== 'auto') return own;
    const def = lookOf(this.look).transition;
    if (def && def !== 'auto') return def;
    if (g.shot.setting?.card_id !== prev.shot.setting?.card_id) return 'iris';
    if (g.section !== prev.section) return 'dissolve';
    return 'cut';
  }
  /** The transition happening at time t, if any: { kind, out, in, w (0→1 across the transition), before (still in the outgoing shot) }. */
  _transitionAt(t, k) {
    const DUR = { dissolve: 0.8, 'dip-white': 0.7, iris: 1.0, wipe: 0.8 };
    for (const j of [k, k + 1]) {
      const g = this.groups[j]; if (!g || j === 0) continue;
      const kind = g.transition; const td = DUR[kind]; if (!td) continue;
      const S = this.times[j].start;
      const lenIn = this.times[j].length, lenOut = this.times[j - 1].length;
      const half = Math.min(td / 2, lenIn / 3, lenOut / 3);
      if (t >= S - half && t < S + half) return { kind, out: j - 1, in: j, w: (t - (S - half)) / (2 * half), before: t < S };
    }
    return null;
  }

  /** Sky objects (sun, moon, kite, balloons…) stay inside the picture and at a readable size, whatever the camera does. */
  _skyInFrame(g) {
    const cam = this.camera; cam.updateMatrixWorld(true);
    const th = Math.tan((cam.fov * Math.PI) / 360);
    for (const a of g.actors) {
      if (!a.sky) continue;
      const p = a.holder.position.clone().applyMatrix4(cam.matrixWorldInverse);
      let depth = -p.z; const behind = depth < 1;
      if (behind) depth = Math.max(6, cam.position.distanceTo(this._lookAt || new THREE.Vector3()) * 1.1);
      const nx = behind ? 0.6 : p.x / (depth * th * cam.aspect), ny = behind ? 0.6 : p.y / (depth * th);
      const frac = (a.h0 * a.holder.scale.y) / (2 * depth * th);
      const s = frac < 0.09 ? Math.min(3, 0.09 / Math.max(frac, 1e-3)) : frac > 0.3 ? 0.3 / frac : 1;
      if (s !== 1) a.holder.scale.multiplyScalar(s);
      const cx = Math.max(-0.8, Math.min(0.8, nx)), cy = Math.max(0.22, Math.min(0.78, ny));
      if (!behind && cx === nx && cy === ny) continue;
      const q = new THREE.Vector3(cx * depth * th * cam.aspect, cy * depth * th, -depth).applyMatrix4(cam.matrixWorld);
      a.holder.position.copy(q);
    }
  }
  /**
   * Blinks always; mouths move while a lyric line is sung. The characters the line belongs to (Stage 2 usage) sing it;
   * if none of them is in this shot, everyone in the shot sings along.
   */
  /**
   * The "life" layer, on top of whatever clip is playing (idle, walk, a move): the chest breathes, the head keeps
   * looking around a little, and a character who is singing moves the head with the words, bobs on the loud
   * syllables and tilts differently on each line. Everything is a function of song time, so preview = export.
   */
  _alive(g, t) {
    const bodies = g.actors.filter((a) => a.body?.rig && a.body.obj);
    if (!bodies.length) return;
    const line = this.lines.find((l) => t >= l.start && t < l.end) || null;
    const own = line ? bodies.filter((a) => a.usages?.includes(line.i)) : [];
    const singers = new Set(own.length ? own : line ? g.actors.filter((a) => a.face) : []);
    const env = this.env;
    const loud = (x) => { if (!env) return 0.5; const k = Math.floor(x * env.rate); let v = 0; for (let j = 0; j < 6; j++) v += (env.env[k - j] ?? 0) / 6; return v; };
    const Qc = new THREE.Quaternion(), qd = new THREE.Quaternion(), bw = new THREE.Quaternion(), e = new THREE.Euler();
    bodies.forEach((a, k) => {
      const B = a.body; const M = (B.vis ||= Object.fromEntries(Object.entries(B.rig.map).map(([key, b]) => [key, B.obj.getObjectByName(b.name)]).filter(([, b]) => b?.isBone))); const ph = (B.phase || 0) + k * 1.7;
      B.obj.updateMatrixWorld(true); B.obj.getWorldQuaternion(Qc);
      const calm = 1 - 0.7 * (B.actW || 0); // a big move (jump, wave …) owns the body; the life layer steps back
      // rotate a bone by [x, y, z] degrees in the CHARACTER's frame (x = pitch down, y = turn left, z = tilt), on top of its pose
      const turn = (bone, [x, y, z]) => {
        if (!bone || (!x && !y && !z)) return;
        let rec = B.life.get(bone); if (!rec) { rec = { base: new THREE.Quaternion() }; B.life.set(bone, rec); } if (!rec.turned) rec.base.copy(bone.quaternion); rec.turned = true;
        qd.setFromEuler(e.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), 'YXZ'));
        qd.premultiply(Qc).multiply(Qc.clone().invert()); // into world
        bone.getWorldQuaternion(bw);
        bone.quaternion.multiply(bw.clone().invert().multiply(qd).multiply(bw));
      };
      const sing = !!line && singers.has(a);
      const into = sing ? Math.min(1, (t - line.start) / 0.3, (line.end - t) / 0.3) : 0;
      const v = sing ? loud(t) : 0;
      const lineTilt = sing ? Math.sin(line.i * 2.3 + ph) : 0; // each line its own head tilt
      const head = M.head || null, neck = M.neck || null;
      if (B.rig.biped) {
        const breathe = Math.sin(t * 1.55 + ph);
        turn(M.spine2 || M.spine1 || M.spine, [-1.2 * breathe * calm, 0, 0]);
        turn(M.lShoulder, [0, 0, 1.2 * breathe * calm]); turn(M.rShoulder, [0, 0, -1.2 * breathe * calm]);
        // singing: head bobs down a little on loud syllables, nods with the phrase, tilts per line; small body sway
        const nod = into * (6 * v - 2 + 2.5 * Math.sin(t * 2.6 + ph));
        const lookY = (7 * Math.sin(t * 0.33 + ph) + 3 * Math.sin(t * 0.87 + ph * 2)) * (sing ? 0.6 : 1);
        const tilt = into * 7 * lineTilt + 2 * Math.sin(t * 0.41 + ph);
        turn(neck, [nod * 0.35 * calm, lookY * 0.35 * calm, tilt * 0.3 * calm]);
        turn(head, [nod * 0.65 * calm, lookY * 0.65 * calm, tilt * 0.7 * calm]);
        if (sing) turn(M.spine, [-2.5 * v * into * calm, 0, 2.2 * Math.sin(t * 1.3 + ph) * into * calm]);
      } else if (B.rig.quad) {
        // four legs: the head looks around and perks up, ears flick now and then
        const lookY = 9 * Math.sin(t * 0.37 + ph) + 4 * Math.sin(t * 1.1 + ph * 2);
        const perk = 4 * Math.sin(t * 0.9 + ph) + (sing ? 5 * v * into : 0);
        turn(neck, [-perk * 0.4 * calm, lookY * 0.4 * calm, 0]); turn(head, [-perk * 0.6 * calm, lookY * 0.6 * calm, 3 * Math.sin(t * 0.6 + ph) * calm]);
        const flick = Math.max(0, Math.sin(t * 0.8 + ph * 3)) ** 12 * 18;
        turn(M.lEar, [flick, 0, 0]); turn(M.rEar, [Math.max(0, Math.sin(t * 0.8 + ph * 3 + 1.1)) ** 12 * 18, 0, 0]);
      }
    });
  }

  _poseFaces(g, t) {
    const withFace = g.actors.filter((a) => a.face);
    if (!withFace.length) return;
    const line = this.lines.find((l) => t >= l.start && t < l.end) || null;
    const own = line ? withFace.filter((a) => a.usages?.includes(line.i)) : [];
    const singers = new Set(own.length ? own : withFace);
    withFace.forEach((a) => a.face.pose(t, line && singers.has(a) ? mouthShape(this.env, t, line) : 0, null, this.renderer));
  }
  _poseActors(g, u, D, withClips = true) {
    const travelling = (x) => TRAVEL_MOTIONS.includes(x.motionActor.motion?.type);
    for (const eq of g.equip || []) eq.pose(u, D);
    if (g.equip?.length) g.group.updateMatrixWorld(true);
    g.actors.forEach((a, i) => {
      const ride = this._rideAt(g, a, u);
      if (ride) { // on a seat: the seat decides where the rider is and which way they face
        a.holder.position.copy(ride.pos); a.holder.rotation.set(ride.rot[0], ride.rot[1], ride.rot[2]); const sc = Number(a.actor.scale ?? 1); a.holder.scale.set(sc, sc, sc);
        if (a.body) a.body.riding = !ride.stand;
        if (a.blob) { const gy = g.surface(ride.pos.x, ride.pos.z); a.blob.position.set(ride.pos.x, gy + 0.03, ride.pos.z); const bs = Math.max(0.4, a.w0 * sc * 0.9); a.blob.scale.set(bs, bs * 0.8, 1); a.blob.material.opacity = 0.35; }
        if (a.body && withClips) {
          this._poseBody(a, u); if (!ride.stand) this._seatHips(g, a, ride);
          // The limb solver twisted legs into unnatural shapes (round 5 feedback): rides now rely on poses and equipment
          // that fit each other; the solver only runs when a shot asks for it (ride.solve), and the clearance check verifies.
          if (g.equip?.length && a.actor.ride?.solve === true && !globalThis.__noLegSolver) { // legs never go into the equipment or the floor
            const inv = new THREE.Matrix4().copy(g.group.matrixWorld).invert(); const gp = new THREE.Vector3();
            const ground = (x, z) => { gp.set(x, 0, z).applyMatrix4(inv); return g.surface(gp.x, gp.z) + g.group.matrixWorld.elements[13]; };
            a.holder.updateMatrixWorld(true);
            a.body.legLeft = clearLegs(a, g.equip, ground, (a.body.rig.quad ? 0.1 : 0.055) * a.h0 * Number(a.actor.scale ?? 1)); // limb thickness: a chubby pup's legs are thicker
          }
          if (a.body.rig.quad && ride.seat && !ride.stand) { a.holder.updateMatrixWorld(true); this._onSeat(a, ride.seat, g.equip); } // a pup sits exactly ON his seat
        }
        return;
      }
      if (a.body) a.body.riding = false;
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
      if (a.blob) { // contact shadow: on the ground under the actor, softer and wider the higher it hops
        const gy = g.surface(m.pos[0], m.pos[2]); const lift = Math.max(0, m.pos[1] - gy);
        const s = Math.max(0.4, a.w0 * Number(m.scale[0]) * 0.95) * (1 + lift * 0.35);
        a.blob.position.set(m.pos[0], gy + 0.03, m.pos[2]); a.blob.scale.set(s, s * 0.8, 1); a.blob.rotation.z = -m.rot[1];
        a.blob.material.opacity = 0.85 * Math.max(0.15, 1 - lift / 1.6);
      }
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
      // remember the value first: it is put back before the next frame (the mixer doesn't rewrite a bone whose animation
      // value didn't change, so an extra turn would otherwise pile up frame after frame — a head spinning round)
      const B = a.body; let rec = B.life.get(head); if (!rec) { rec = { base: new THREE.Quaternion() }; B.life.set(head, rec); }
      if (!rec.turned) rec.base.copy(head.quaternion); rec.turned = true;
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
        this._camera(g, u, D, adj);
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

  /**
   * Where the subjects are over the whole shot (sampled), so a static camera frames everyone without chasing them.
   * Stores g.frame (all standing actors) and g.frameOf[i] (each actor).
   */
  _measureFraming(k) {
    const g = this.groups[k]; const D = this.times[k]?.length || 4;
    const box = (list) => {
      if (!list.length) return null;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, gy = 0, n = 0, H = 0, W = 0;
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        this._poseActors(g, f * D, D, false);
        for (const a of list) {
          const p = a.holder.position; const h = a.h0 * a.holder.scale.y; const w = a.w0 * a.holder.scale.x;
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
          gy += a.sky ? p.y - h / 2 : p.y; n++; H = Math.max(H, h); W = Math.max(W, w);
        }
      }
      return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 + 0.15 * (z1 - z0), gy: gy / n, H: Math.max(0.3, H), halfW: (x1 - x0) / 2 + W / 2, depth: z1 - z0, x0: x0 - W / 2, x1: x1 + W / 2, z0: z0 - W / 2, z1: z1 + W / 2 };
    };
    const standing = g.actors.filter((a) => !a.sky);
    g.frame = box(standing.length ? standing : g.actors) || { cx: 0, cz: 0, gy: g.focusY || 0, H: 1.5, halfW: 3, depth: 0 };
    g.frameOf = g.actors.map((a) => box([a]));
  }

  /** The frame box for this moment: the stable box, or (for follow / close-up) where the subject is right now. */
  _subjectBox(g, idx, track) {
    if (idx == null) return g.frame;
    const a = g.actors[idx]; const st = g.frameOf?.[idx];
    if (!a || !st) return g.frame;
    if (!track) return { ...st, prop: a.kind !== 'character', quad: !!a.body?.rig?.quad };
    const p = a.holder.position; const h = a.h0 * a.holder.scale.y;
    return { cx: p.x, cz: p.z, gy: a.sky ? p.y - h / 2 : p.y, H: Math.max(0.3, h), halfW: (a.w0 * a.holder.scale.x) / 2, depth: 0, prop: a.kind !== 'character', quad: !!a.body?.rig?.quad };
  }

  /**
   * Cameras frame the SUBJECT by its real size. The shot size says how much of the frame it fills (extreme wide …
   * close-up); the camera move (wide, pan, dolly-in, orbit, tilt-up, follow, group, closeup) says how the camera
   * travels during the shot. Ground stays in the lower part of the picture, so the sky never swallows the frame.
   */
  _camera(g, u, D, adj = { dy: 0, toward: 0, yaw: 0 }) {
    const c = g.shot.camera || {}; const preset = CAMERAS.includes(c.preset) ? c.preset : 'wide';
    const k = ease(u / D); const lin = Math.min(1, Math.max(0, u / D)); const cam = this.camera;
    cam.fov = Number(c.fov || 40); cam.updateProjectionMatrix();
    const vT = Math.tan((cam.fov * Math.PI) / 360); const aspect = cam.aspect || 16 / 9;
    let size = c.size && c.size !== 'auto' ? c.size : PRESET_SIZE[preset] || 'wide';
    const tIdx = Number.isInteger(c.target) && g.actors[c.target] ? c.target : null;
    const single = tIdx != null && (['closeup', 'follow'].includes(preset) || ['medium', 'closeup'].includes(size));
    const F = this._subjectBox(g, single ? tIdx : null, ['follow', 'closeup'].includes(preset));
    const frameFor = (sz) => {
      const H = F.H; const top = F.gy + H;
      const widthV = (2 * (F.halfW + H * 0.35)) / aspect;
      let V, look, elev;
      switch (sz) {
        case 'extreme-wide': V = Math.max(H * 8, 14, widthV * 1.6); look = F.gy + V * 0.3; elev = 0.22; break;
        case 'full': V = Math.max(H * 1.4, widthV); look = F.gy + V * 0.42; elev = 0.1; break;
        // Small subjects and four-legged animals (head at the front, not on top) are framed more loosely, never closer than ~0.6 m of picture.
        case 'medium': V = F.quad ? Math.max(H * 1.5, 0.9) : single ? Math.max(H * 0.85, 0.7) : Math.max(H * 0.85, widthV * 0.9); look = F.quad ? F.gy + V * 0.45 : top + H * 0.14 - V * 0.5; elev = 0.05; break;
        // Close-up: head and shoulders of a character; a prop (often a rider on a bike) is framed whole.
        case 'closeup': V = F.prop ? H * 1.05 : F.quad ? Math.max(H * 1.2, 0.7) : single ? Math.max(H * 0.66, 0.55) : Math.max(H * 0.66, widthV * 0.8); look = F.prop || F.quad ? F.gy + V * 0.47 : top + H * 0.14 - V * 0.5; elev = F.quad ? 0.12 : 0.03; break;
        default: V = Math.max(H * 3.2, 4, widthV * 1.15); look = F.gy + V * 0.36; elev = 0.16; break; // wide
      }
      return { V, look, elev };
    };
    let fr = frameFor(size);
    if (preset === 'dolly-in') { const f2 = frameFor(CLOSER[size] || 'full'); fr = { V: lerp(fr.V, f2.V, k), look: lerp(fr.look, f2.look, k), elev: lerp(fr.elev, f2.elev, k) }; }
    let V = fr.V * Number(c.distance || 1); let lookY = fr.look; let elev = fr.elev + Number(c.height ?? 0) * 0.07;
    let lookX = F.cx; let yaw = 0;
    const still = ['wide', 'group', 'closeup', 'follow'].includes(preset);
    if (still) { V *= 1 - 0.06 * k; lookX += Math.sin(u * 0.35) * V * 0.012; } // a slow "breathing" push-in so no shot is frozen
    if (preset === 'pan') lookX += lerp(-1, 1, lin) * Number(c.amount ?? 1.5) * (V / 9);
    if (preset === 'orbit') { const a = Number(c.amount ?? 0.42); yaw = lerp(-a, a, k * 0.5 + lin * 0.5); } // amount: radians each side
    if (preset === 'crane') { // starts high and wide, sweeps down to the subject's level (an establishing move)
      const from = frameFor('extreme-wide'); V = lerp(from.V * 1.1, V, k); lookY = lerp(from.look, lookY, k); elev = lerp(0.62, elev, k);
    }
    yaw += Number(c.yaw || 0); // a side angle (radians, + = from the right), for any move
    if (preset === 'tilt-up') { lookY += V * 0.3 * k; elev -= 0.08 * k; } // looks up a little; the subject stays in the picture
    yaw += adj.yaw || 0;
    let d = V / 2 / vT;
    let look = [lookX, lookY, F.cz];
    const place = () => [look[0] + Math.sin(yaw) * Math.cos(elev) * d, look[1] + Math.sin(elev) * d, look[2] + Math.cos(yaw) * Math.cos(elev) * d];
    let pos = place();
    // Fitting pass: everyone the shot is about must be fully in the picture (close-ups and medium shots may crop
    // their own subject on purpose). Look at where they land on screen and back off / re-aim until they fit.
    if (!['closeup', 'medium'].includes(size) || !single) {
      const boxes = single ? [F] : g.actors.map((a, i) => (!a.sky ? (['follow', 'closeup'].includes(preset) ? this._subjectBox(g, i, true) : g.frameOf?.[i]) : null)).filter(Boolean);
      // The object the lyric names must be in the picture too: a kite always; balloons when the shot asks (frame: true).
      for (const eq of g.equip || []) {
        if (!(eq.type === 'kite' || (eq.type === 'balloons' && eq.spec.frame))) continue;
        eq.group.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(eq.group); if (bb.isEmpty()) continue;
        boxes.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, gy: bb.min.y, H: bb.max.y - bb.min.y });
      }
      const v = new THREE.Vector3();
      for (let it = 0; it < 4 && boxes.length; it++) {
        cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld(true);
        let L = 9, R = -9, B = 9, T = -9;
        for (const b of boxes) {
          const xs = b.x0 != null ? [b.x0, b.x1] : [b.cx - b.halfW, b.cx + b.halfW]; const zs = b.z0 != null ? [b.z0, b.z1] : [b.cz, b.cz];
          for (const x of xs) for (const z of zs) for (const y of [b.gy, b.gy + b.H]) { v.set(x, y, z).project(cam); if (v.z > 1) { L = -9; R = 9; continue; } L = Math.min(L, v.x); R = Math.max(R, v.x); B = Math.min(B, v.y); T = Math.max(T, v.y); }
        }
        const over = Math.max(R / 0.94, -L / 0.94, (T - B) / 1.78);
        if (over <= 1 && B >= -0.92 && T <= 0.92) break;
        if (over > 1) d *= Math.min(1.6, over * 1.04);
        const mid = (T + B) / 2; if (B < -0.92 || T > 0.92) look = [look[0], look[1] + mid * (V / 2) * 0.9, look[2]];
        const midX = (R + L) / 2; if (Math.abs(midX) > 0.05 && over > 1) look = [look[0] + midX * (V / 2) * aspect * 0.5, look[1], look[2]];
        pos = place();
      }
    }
    if (adj.toward || adj.dy) { for (let i = 0; i < 3; i++) pos[i] = look[i] + (pos[i] - look[i]) * (1 - adj.toward); pos[1] += adj.dy; } // clear view (see _fitCamera)
    pos[1] = Math.max(pos[1], g.surface(pos[0], pos[2]) + 0.45); // never inside the hill
    cam.position.set(...pos); cam.lookAt(...look);
    this._lookAt = new THREE.Vector3(...look); this._frameV = V; this._shotSize = size;
  }

  /** Lights, fog and reflections from this shot's sky (look + lighting preset). */
  _light(g) {
    const L = LIGHTING[g.preset] || LIGHTING.day; const sky = g.land?.sky || SKY.day; const at = this._lookAt || new THREE.Vector3();
    this.sun.target.position.copy(at); this.sun.target.updateMatrixWorld();
    const sd = new THREE.Vector3(...L.sunPos).normalize();
    this.sun.position.copy(at).addScaledVector(sd, 40);
    const ext = Math.max(8, Math.min(30, (this._frameV || 8) * 1.2));
    const sc = this.sun.shadow.camera; if (sc.right !== ext) { Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext }); sc.updateProjectionMatrix(); }
    // Rim light: from behind the subject, opposite the camera, a little above.
    const back = at.clone().sub(this.camera.position).setY(0).normalize();
    this.rim.position.copy(at).addScaledVector(back, 12).add(new THREE.Vector3(0, 7, 0)); this.rim.target.position.copy(at); this.rim.target.updateMatrixWorld();
    const key = `${g.preset}|${sky.top}|${sky.haze}|${g.land?.groundColor}`;
    if (this._lightKey === key) return;
    this._lightKey = key;
    const night = g.preset === 'night';
    this.scene.background = new THREE.Color(sky.horizon);
    this.scene.fog.color.set(sky.haze || sky.horizon); this.scene.fog.near = 45; this.scene.fog.far = night ? 200 : 280;
    this.hemi.color.set(sky.top); this.hemi.color.lerp(new THREE.Color('#ffffff'), 0.6); this.hemi.groundColor.set(g.land?.groundColor || L.hemiGround); this.hemi.intensity = L.hemi * 0.75;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI * 1.05;
    this.rim.color.set(night ? '#AFC2FF' : '#FFF4E0'); this.rim.intensity = night ? 0.7 : 1.1;
    if (g.land) { this.scene.environment = this._envFor(g.land, g.preset); this.scene.environmentIntensity = night ? 0.3 : 0.55; }
  }

  /**
   * Shot Doctor: check every shot the way a director would and say what to fix. Each issue can carry a "fix":
   * a change to the shot (camera / actors) the app can apply in one click.
   */
  analyse() {
    const issues = []; const cam = this.camera;
    const sizeOf = (s) => (s.camera?.size && s.camera.size !== 'auto' ? s.camera.size : PRESET_SIZE[s.camera?.preset || 'wide'] || 'wide');
    this.groups.forEach((g, k) => {
      const s = g.shot; const D = this.times[k]?.length || 4; const title = s.title || `Shot ${k + 1}`;
      const add = (id, level, text, fix, fixLabel) => issues.push({ shot: k, shot_id: s.id, title, id, level, text, fix, fixLabel });
      const ground = g.actors.map((a, i) => ({ a, i })).filter((x) => !x.a.sky);
      if (!g.actors.length) { add('empty', 'warn', 'Nobody is in this shot: only the scenery shows.', null); return; }
      const m = ground.map(() => ({ h: 0, out: 0, cut: 0, away: 0 })); let skyFrac = 0; let skyVisible = 0;
      const tgt = Number.isInteger(s.camera?.target) ? s.camera.target : null;
      // The shot's main subject: the camera's target, else the first character, else the first actor that travels, else the first actor listed.
      const mainIdx = tgt != null && ground.some((x) => x.i === tgt) ? tgt : (ground.find((x) => x.a.kind === 'character') || ground.find((x) => TRAVEL_MOTIONS.includes(x.a.actor.motion?.type)) || ground[0])?.i;
      const matters = (a, i) => a.kind === 'character' || i === mainIdx; // who must face the camera and stay visible
      const samples = [0.15, 0.5, 0.85];
      for (const f of samples) {
        const u = f * D;
        this._poseActors(g, u, D, false); this._camera(g, u, D, g.camAdjust); this._skyInFrame(g); cam.updateMatrixWorld(true);
        ground.forEach(({ a }, j) => {
          const p = a.holder.position; const h = a.h0 * a.holder.scale.y; const w = (a.w0 * a.holder.scale.x) / 2;
          let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
          for (const dx of [-w, w]) for (const dz of [-w, w]) for (const dy of [0, h]) { const v = new THREE.Vector3(p.x + dx, p.y + dy, p.z + dz).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
          const area = Math.max(1e-6, (x1 - x0) * (y1 - y0));
          const ix = Math.max(0, Math.min(1, x1) - Math.max(-1, x0)), iy = Math.max(0, Math.min(1, y1) - Math.max(-1, y0));
          const inside = (ix * iy) / area;
          m[j].h = Math.max(m[j].h, Math.min(2, y1 - y0) / 2);
          if (inside < 0.35) m[j].out++; else if (inside < 0.8) m[j].cut++;
          if (matters(a, ground[j].i)) {
            const yawV = a.holder.rotation.y; const fwd = new THREE.Vector3(Math.sin(yawV), 0, Math.cos(yawV));
            const toCam = cam.position.clone().sub(p).setY(0).normalize();
            if (fwd.dot(toCam) < -0.45) m[j].away++;
          }
        });
        for (const a of g.actors.filter((x) => x.sky)) { const v = a.holder.position.clone().project(cam); if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1) skyVisible++; }
        const hz = cam.position.clone().add(new THREE.Vector3().subVectors(this._lookAt, cam.position).setY(0).normalize().multiplyScalar(250)).setY(g.frame.gy).project(cam);
        skyFrac += Math.max(0, Math.min(1, (1 - hz.y) / 2)) / samples.length;
      }
      // Hidden behind another actor (e.g. a big rainbow prop in front of the character)?
      {
        this._poseActors(g, D * 0.5, D, false); this._camera(g, D * 0.5, D, g.camAdjust); this._skyInFrame(g); cam.updateMatrixWorld(true);
        g.group.updateMatrixWorld(true);
        const ray = new THREE.Raycaster(); const want = ground.filter(({ a, i }) => matters(a, i));
        for (const { a, i } of want) {
          let blockedBy = null; let n = 0;
          for (const f of [0.3, 0.6, 0.9]) {
            const p = a.holder.position.clone(); p.y += a.h0 * a.holder.scale.y * f;
            const dir = p.clone().sub(cam.position); const dist = dir.length(); ray.set(cam.position, dir.normalize()); ray.far = dist - 0.25;
            for (const o of g.actors) { if (o === a) continue; if (ray.intersectObject(o.holder, true).length) { blockedBy = o; n++; break; } }
          }
          if (n >= 2 && blockedBy && g.actors.indexOf(blockedBy) !== mainIdx) {
            const j = g.actors.indexOf(blockedBy); const z = (s.actors[i]?.pos?.[2] ?? 0) - 2.5;
            add('hidden', 'warn', `${a.name || 'A character'} is hidden behind ${blockedBy.name || 'another object'}.`,
              { actors: s.actors.map((x, n2) => (n2 === j ? { ...x, pos: [x.pos[0], x.pos[1], Math.min(x.pos[2], z)], ...(x.motion?.to ? { motion: { ...x.motion, to: [x.motion.to[0], x.motion.to[1], Math.min(x.motion.to[2], z)] } } : {}) } : x)) },
              `Move ${blockedBy.name || 'it'} behind`);
          }
        }
      }
      const size = sizeOf(s);
      const biggest = Math.max(0, ...m.map((x) => x.h));
      if (ground.length && biggest < 0.17 && size !== 'extreme-wide') add('tiny', 'warn', `The characters are small in the picture (about ${Math.round(biggest * 100)}% of the height). Toddlers follow faces: frame them bigger.`, { camera: { ...s.camera, size: 'full' } }, 'Frame them bigger (Full shot)');
      // In a single-subject shot (close-up / follow / medium on a target) the others are meant to be out of the picture.
      const singleSubject = Number.isInteger(s.camera?.target) && (['closeup', 'follow'].includes(s.camera?.preset) || ['medium', 'closeup'].includes(size));
      ground.forEach(({ a, i }, j) => {
        const name = a.name || `Actor ${i + 1}`;
        if (singleSubject && i !== s.camera.target) return;
        const cropped = ['medium', 'closeup'].includes(size) && (singleSubject || !Number.isInteger(s.camera?.target)) && m[j].h > 0.3; // a close shot crops on purpose
        if (m[j].out >= 2 && !cropped) add('offscreen', 'warn', `${name} is out of the picture for most of the shot.`, { camera: { ...s.camera, preset: 'group', size: 'auto' } }, 'Frame everyone (Group camera)');
        else if (m[j].cut >= 2 && !['medium', 'closeup'].includes(size)) add('cut', 'info', `${name} is cut off at the edge of the picture.`, { camera: { ...s.camera, size: 'wide' } }, 'Widen the shot');
        if (m[j].away >= 2) {
          const act = s.actors[i]; const mt = act?.motion;
          const travels = mt && ['path', 'bounce', 'drift'].includes(mt.type);
          // A rigged walker should walk toward the camera; anything else (a rider on a bike, a toy) can keep facing the camera while it moves.
          const fix = travels && a.body && mt.to
            ? { actors: s.actors.map((x, n) => (n === i ? { ...x, pos: [x.pos[0], x.pos[1], mt.to[2]], motion: { ...mt, to: [mt.to[0], mt.to[1], x.pos[2]] } } : x)) }
            : { actors: s.actors.map((x, n) => (n === i ? { ...x, rot: [0, 0, 0], ...(travels ? { face_travel: false } : {}) } : x)) };
          add('away', 'warn', `${name} has its back to the camera for most of the shot.`, fix, travels ? (a.body ? 'Walk toward the camera instead' : 'Keep facing the camera while moving') : 'Turn to face the camera');
        }
      });
      if (skyFrac > 0.62 && !skyVisible) add('sky', 'info', `About ${Math.round(skyFrac * 100)}% of the picture is empty sky.`, { camera: { ...s.camera, preset: s.camera?.preset === 'tilt-up' ? 'wide' : s.camera?.preset, size: 'full', height: 0 } }, 'Lower the view (Full shot)');
      const prev = this.groups[k - 1]?.shot;
      if (prev && prev.setting?.card_id === s.setting?.card_id && (prev.camera?.preset || 'wide') === (s.camera?.preset || 'wide') && sizeOf(prev) === size && D > 3) {
        const next = size === 'wide' || size === 'extreme-wide' ? 'medium' : size === 'medium' || size === 'closeup' ? 'wide' : 'medium';
        add('repeat', 'info', `Same framing as the shot before (${size}). Changing the shot size keeps little viewers interested.`, { camera: { ...s.camera, size: next } }, `Make it a ${next} shot`);
      }
      if (D > 9 && ['wide', 'group'].includes(s.camera?.preset || 'wide')) add('long', 'info', `A long shot (${D.toFixed(1)} s) with a still camera.`, { camera: { ...s.camera, preset: 'dolly-in' } }, 'Slow push-in (Dolly-in)');
    });
    return issues;
  }
}
