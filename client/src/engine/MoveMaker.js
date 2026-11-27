// In-app animation for rigged characters. Meshy (or any tool) supplies the rig once; every move after that is
// made here: keyframed poses written onto the character's own skeleton, saved as a normal animation clip.
//
// Poses are described in the CHARACTER's frame (the model faces +Z, up is +Y, the character's left is +X),
// in degrees, as rotations about those axes. They are converted to each bone's local rotation from the rig's
// rest pose, so the same move fits any rig with standard bone names (Meshy, Mixamo, most humanoid rigs).
import * as THREE from 'three';
import { measureBox } from './three-common.js';

const norm = (n) => String(n || '').toLowerCase().replace(/^.*[:|]/, '').replace(/[^a-z0-9]/g, '');
const ALIASES = {
  hips: ['hips', 'pelvis', 'root', 'hip'], spine: ['spine', 'spine0'], spine1: ['spine01', 'spine1'], spine2: ['spine02', 'spine2', 'chest', 'upperchest'],
  neck: ['neck', 'neck01', 'neck1'], head: ['head'],
  lToe: ['lefttoebase', 'lefttoe', 'ltoe'], rToe: ['righttoebase', 'righttoe', 'rtoe'],
  lShoulder: ['leftshoulder', 'lshoulder', 'leftclavicle'], lArm: ['leftarm', 'leftupperarm', 'lupperarm'], lFore: ['leftforearm', 'leftlowerarm', 'lforearm'], lHand: ['lefthand', 'lhand'],
  rShoulder: ['rightshoulder', 'rshoulder', 'rightclavicle'], rArm: ['rightarm', 'rightupperarm', 'rupperarm'], rFore: ['rightforearm', 'rightlowerarm', 'rforearm'], rHand: ['righthand', 'rhand'],
  lThigh: ['leftupleg', 'leftupperleg', 'leftthigh', 'lthigh'], lShin: ['leftleg', 'leftlowerleg', 'leftcalf', 'lcalf'], lFoot: ['leftfoot', 'lfoot'],
  rThigh: ['rightupleg', 'rightupperleg', 'rightthigh', 'rthigh'], rShin: ['rightleg', 'rightlowerleg', 'rightcalf', 'rcalf'], rFoot: ['rightfoot', 'rfoot'],
  // four-legged rigs (Meshy quadruped and similar)
  chest: ['chest', 'spine03', 'spine3'],
  lFLeg: ['frontlegl01', 'frontlegl', 'frontupperl', 'frontuprl', 'leftfrontleg', 'lfrontleg'], rFLeg: ['frontlegr01', 'frontlegr', 'frontupperr', 'frontuprr', 'rightfrontleg', 'rfrontleg'],
  lFLwr: ['frontlwrl', 'frontlowerl', 'frontlegl02', 'leftfrontlowerleg'], rFLwr: ['frontlwrr', 'frontlowerr', 'frontlegr02', 'rightfrontlowerleg'],
  lRLeg: ['rearuprl', 'rearupperl', 'backlegl01', 'leftrearleg', 'lrearleg'], rRLeg: ['rearuprr', 'rearupperr', 'backlegr01', 'rightrearleg', 'rrearleg'],
  lRLwr: ['rearlwrl', 'rearlowerl', 'backlegl02'], rRLwr: ['rearlwrr', 'rearlowerr', 'backlegr02'],
  lEar: ['earl', 'leftear', 'lear', 'earleft'], rEar: ['earr', 'rightear', 'rear', 'earright'],
  lEar2: ['earl01', 'leftear01', 'lear01'], rEar2: ['earr01', 'rightear01', 'rear01'],
};
const MIRROR = { lShoulder: 'rShoulder', lArm: 'rArm', lFore: 'rFore', lHand: 'rHand', lThigh: 'rThigh', lShin: 'rShin', lFoot: 'rFoot' };

/** Find the rig's bones and remember its rest pose. `root` must be a fresh (un-animated) copy of the rigged scene. */
export function analyseRig(root) {
  const bones = []; root.traverse((o) => { if (o.isBone) bones.push(o); });
  const byNorm = new Map(bones.map((b) => [norm(b.name), b]));
  const map = {};
  for (const [k, names] of Object.entries(ALIASES)) for (const n of names) if (byNorm.has(n)) { map[k] = byNorm.get(n); break; }
  if (!map.hips && bones.length) map.hips = bones.find((b) => !b.parent?.isBone) || bones[0];
  const biped = !!(map.lArm && map.rArm && map.lThigh && map.rThigh);
  // Tail chain (root to tip), for wagging: every bone named tail…, ordered by depth in the hierarchy.
  const depth = (b) => { let d = 0; for (let p = b.parent; p; p = p.parent) d++; return d; };
  bones.filter((b) => norm(b.name).startsWith('tail')).sort((a, b) => depth(a) - depth(b)).slice(0, 6).forEach((b, i) => { map[`tail${i}`] = b; });
  const quad = !biped && !!(map.lFLeg && map.rFLeg && map.head);
  root.updateMatrixWorld(true);
  const rest = new Map();
  for (const b of bones) rest.set(b, { q: b.quaternion.clone(), p: b.position.clone(), wq: b.getWorldQuaternion(new THREE.Quaternion()), pwq: b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion() });
  const box = measureBox(root); const height = box.getSize(new THREE.Vector3()).y || 1;
  // Resting arm elevation (degrees above horizontal: -90 down, 0 sideways, 90 straight up), so poses mean the same on A-pose and T-pose rigs.
  const elev = (arm, fore) => { if (!arm || !fore) return -45; const a = arm.getWorldPosition(new THREE.Vector3()), f = fore.getWorldPosition(new THREE.Vector3()); const d = f.sub(a); return THREE.MathUtils.radToDeg(Math.atan2(d.y, Math.hypot(d.x, d.z))); };
  return { bones, map, rest, biped, quad, height, armRest: { l: elev(map.lArm, map.lFore), r: elev(map.rArm, map.rFore) }, hipsWorld: map.hips?.getWorldPosition(new THREE.Vector3()) };
}

const D = THREE.MathUtils.degToRad;
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
/** Character-frame rotation: rz first, then rx, then ry (so "raise sideways, then swing forward, then turn"). */
function deltaQ([x = 0, y = 0, z = 0]) {
  const q = new THREE.Quaternion().setFromAxisAngle(AX.y, D(y));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(AX.x, D(x)));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(AX.z, D(z)));
  return q;
}
const ease = (k) => k * k * (3 - 2 * k);

/** Expand a pose: mirror helpers, absolute arm elevation, level feet. Returns {bone: [x,y,z]} plus hips offsets. */
function expandPose(pose, rig) {
  const out = {};
  const add = (k, v) => { const o = (out[k] ||= [0, 0, 0]); for (let i = 0; i < 3; i++) o[i] += v[i] || 0; };
  for (const [k, v] of Object.entries(pose)) {
    if (k === 'up' || k === 'fwd' || k === 'side') continue;
    if (k === 'arms') { add('lArm', v); add('rArm', [v[0], -(v[1] || 0), -(v[2] || 0)]); continue; }
    if (k === 'fores') { add('lFore', v); add('rFore', [v[0], -(v[1] || 0), -(v[2] || 0)]); continue; }
    if (k === 'legs') { add('lThigh', [v[0]]); add('rThigh', [v[0]]); add('lShin', [v[1]]); add('rShin', [v[1]]); continue; }
    if (k === 'armUp') { add('lArm', [0, 0, v - rig.armRest.l]); add('rArm', [0, 0, -(v - rig.armRest.r)]); continue; }
    if (k === 'lArmUp') { add('lArm', [0, 0, v - rig.armRest.l]); continue; }
    if (k === 'rArmUp') { add('rArm', [0, 0, -(v - rig.armRest.r)]); continue; }
    add(k, v);
  }
  // Keep feet flat on the ground when the legs bend; in the air (hips up) the toes point down instead, like a real jump.
  const air = Math.min(1, Math.max(0, ((pose.up || 0) - 0.015) / 0.1));
  for (const s of ['l', 'r']) {
    const th = out[`${s}Thigh`] || [0, 0, 0], sh = out[`${s}Shin`]?.[0] || 0;
    if (th[0] || sh || th[2]) add(`${s}Foot`, [-(th[0] + sh) * (1 - air), 0, -th[2]]);
    if (air) { add(`${s}Foot`, [28 * air]); add(`${s}Toe`, [-12 * air]); }
    else if ((pose.up || 0) < -0.03) add(`${s}Toe`, [-10 * Math.min(1, -(pose.up || 0) / 0.1)]); // crouching: weight on the balls of the feet
  }
  // Wrists follow the forearms a little (a straight, stiff hand looks like a stick).
  for (const s of ['l', 'r']) { const f = out[`${s}Fore`]; if (f && !pose[`${s}Hand`]) add(`${s}Hand`, [f[0] * 0.22, 0, (f[2] || 0) * 0.3]); }
  return { rot: out, up: pose.up || 0, fwd: pose.fwd || 0, side: pose.side || 0 };
}

/** Interpolate between keyframes [{t, pose}] (t from 0 to 1). Arm "up" values default to the rest elevation. */
// The motion flows THROUGH the keyframes (a smooth spline) instead of stopping dead at each one, the way an animator
// keeps the arcs moving. The first and last keys (rest) still ease in and out, so moves blend with the idle.
function sampleKeys(keys, u, rig) {
  let i = 0; while (i < keys.length - 2 && u > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1] || a;
  const h = b.t - a.t; const s = h > 0 ? Math.min(1, Math.max(0, (u - a.t) / h)) : 0;
  const prev = keys[i - 1], next = keys[i + 2];
  const P = [prev, a, b, next].map((k) => (k ? expandPose(k.pose, rig) : null));
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  // Tangent at a key: the slope between its neighbours (Catmull-Rom), zero at the first/last key; 0.85 keeps arcs from overshooting.
  const tan = (pm, p, pp, tm, tp) => (pm == null || pp == null ? 0 : (0.85 * (pp - pm)) / Math.max(1e-6, tp - tm));
  const val = (get) => {
    const v1 = get(P[1]), v2 = get(P[2]);
    const m1 = i === 0 ? 0 : tan(P[0] && get(P[0]), v1, v2, prev?.t, b.t);
    const m2 = !next ? 0 : tan(v1, v2, get(P[3]), a.t, next.t);
    return h00 * v1 + h10 * h * m1 + h01 * v2 + h11 * h * m2;
  };
  const rot = {};
  const names = new Set(P.flatMap((p) => (p ? Object.keys(p.rot) : [])));
  for (const name of names) rot[name] = [0, 1, 2].map((j) => val((p) => p?.rot[name]?.[j] || 0));
  return { rot, up: val((p) => p?.up || 0), fwd: val((p) => p?.fwd || 0), side: val((p) => p?.side || 0) };
}

/** Wide, low martial-arts stance with fists up (k scales how deep). */
const ninjaStance = (k = 1) => ({ up: -0.06 * k, lThigh: [-18 * k, 0, 14], rThigh: [-18 * k, 0, -14], lShin: [34 * k], rShin: [34 * k], spine: [8 * k], head: [-6],
  arms: [-50, -12], fores: [-95, -10] });

// ---------------- the moves ----------------
// Each returns { seconds, keys } for ONE repeat. Angles in degrees, hips offsets as a fraction of body height.
const P = (o) => o;
export const MOVES = {
  jump: {
    label: 'Jump', icon: '⤒', words: ['jump', 'leap', 'spring'], biped: true,
    params: { height: { label: 'Jump height', min: 0.05, max: 0.8, step: 0.01, value: 0.3 }, crouch: { label: 'Crouch', min: 0.2, max: 1.5, step: 0.05, value: 1 }, seconds: { label: 'Time per jump (s)', min: 0.6, max: 2.5, step: 0.05, value: 1.2 }, repeats: { label: 'Jumps', min: 1, max: 6, step: 1, value: 1 } },
    make: ({ height, crouch: c, seconds }) => ({ seconds, keys: [
      { t: 0, pose: {} },
      { t: 0.25, pose: P({ up: -0.11 * c, legs: [-45 * c, 85 * c], spine: [16 * c], head: [-6], arms: [35 * c] }) },
      { t: 0.4, pose: P({ up: 0.03, legs: [0, 0], spine: [-4], armUp: 65 }) },
      { t: 0.6, pose: P({ up: height, legs: [-28, 50], spine: [-6], head: [-8], armUp: 75 }) },
      { t: 0.8, pose: P({ up: 0.0, legs: [-5, 10], armUp: 30 }) },
      { t: 0.9, pose: P({ up: -0.07 * c, legs: [-32 * c, 60 * c], spine: [12 * c], arms: [-15] }) },
      { t: 1, pose: {} },
    ] }),
  },
  hop: {
    label: 'Happy hops', icon: '🐇', words: ['hop', 'bounce', 'bunny'], biped: true,
    params: { height: { label: 'Hop height', min: 0.02, max: 0.3, step: 0.01, value: 0.1 }, seconds: { label: 'Time per hop (s)', min: 0.3, max: 1.2, step: 0.05, value: 0.5 }, repeats: { label: 'Hops', min: 1, max: 10, step: 1, value: 4 } },
    make: ({ height, seconds }) => ({ seconds, keys: [
      { t: 0, pose: {} },
      { t: 0.2, pose: P({ up: -0.05, legs: [-25, 45], spine: [8], arms: [-25], fores: [-40] }) },
      { t: 0.55, pose: P({ up: height, legs: [-10, 20], arms: [-35], fores: [-50], head: [-6] }) },
      { t: 0.85, pose: P({ up: -0.03, legs: [-18, 32], spine: [6], arms: [-25], fores: [-40] }) },
      { t: 1, pose: {} },
    ] }),
  },
  wave: {
    label: 'Wave hello', icon: '👋', words: ['wave', 'hello', 'hi', 'bye', 'goodbye'], biped: true,
    params: { hand: { label: 'Hand', options: ['right', 'left'], value: 'right' }, waves: { label: 'Waves', min: 1, max: 6, step: 1, value: 3 }, seconds: { label: 'Length (s)', min: 1, max: 5, step: 0.1, value: 2.4 }, repeats: { label: 'Repeat', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ hand, waves, seconds }) => {
      const s = hand === 'left' ? 'l' : 'r', m = s === 'l' ? 1 : -1;
      const up = { [`${s}ArmUp`]: 80, [`${s}Arm`]: [15], [`${s}Fore`]: [0, 0, 0], head: [0, 0, -6 * m], spine: [0, 0, -4 * m] };
      const keys = [{ t: 0, pose: {} }, { t: 0.15, pose: up }];
      const n = Math.round(waves) * 2;
      for (let i = 0; i < n; i++) keys.push({ t: 0.2 + (0.6 * (i + 1)) / n, pose: { ...up, [`${s}Fore`]: [0, 0, (i % 2 ? -1 : 1) * 28 * m], [`${s}Hand`]: [0, 0, (i % 2 ? -1 : 1) * 12 * m] } });
      keys.push({ t: 0.88, pose: up }, { t: 1, pose: {} });
      return { seconds, keys };
    },
  },
  clap: {
    label: 'Clap', icon: '👏', words: ['clap', 'applause', 'applaud'], biped: true,
    params: { claps: { label: 'Claps', min: 1, max: 8, step: 1, value: 4 }, seconds: { label: 'Length (s)', min: 0.8, max: 4, step: 0.1, value: 2 }, repeats: { label: 'Repeat', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ claps, seconds }) => {
      const open = { arms: [-60, -10], fores: [-50], spine: [4] }, shut = { arms: [-62, -60], fores: [-55, -40], spine: [6], head: [6] };
      const keys = [{ t: 0, pose: {} }, { t: 0.15, pose: open }];
      const n = Math.round(claps);
      for (let i = 0; i < n; i++) { const a = 0.15 + (0.7 * i) / n, b = 0.15 + (0.7 * (i + 1)) / n; keys.push({ t: (a + b) / 2, pose: shut }, { t: b, pose: open }); }
      keys.push({ t: 1, pose: {} });
      return { seconds, keys };
    },
  },
  cheer: {
    label: 'Cheer (hooray!)', icon: '🙌', words: ['cheer', 'hooray', 'yay', 'celebrate', 'happy', 'excited'], biped: true,
    params: { height: { label: 'Bounce', min: 0, max: 0.25, step: 0.01, value: 0.08 }, seconds: { label: 'Length (s)', min: 0.6, max: 3, step: 0.05, value: 1.2 }, repeats: { label: 'Repeat', min: 1, max: 5, step: 1, value: 2 } },
    make: ({ height, seconds }) => ({ seconds, keys: [
      { t: 0, pose: {} },
      { t: 0.2, pose: P({ up: -0.04, legs: [-18, 32], armUp: 40, fores: [-30] }) },
      { t: 0.45, pose: P({ up: height, armUp: 72, fores: [0, 0, 12], head: [-12], spine: [-6] }) },
      { t: 0.7, pose: P({ up: 0, armUp: 68, fores: [0, 0, -12], head: [-10] }) },
      { t: 1, pose: {} },
    ] }),
  },
  nod: {
    label: 'Nod (yes)', icon: '🙂', words: ['nod', 'yes', 'agree'], biped: false,
    params: { nods: { label: 'Nods', min: 1, max: 6, step: 1, value: 3 }, amount: { label: 'Amount', min: 5, max: 35, step: 1, value: 18 }, seconds: { label: 'Length (s)', min: 0.6, max: 4, step: 0.1, value: 1.6 }, repeats: { label: 'Repeat', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ nods, amount, seconds }) => {
      const keys = [{ t: 0, pose: {} }]; const n = Math.round(nods);
      for (let i = 0; i < n; i++) keys.push({ t: (i + 0.5) / (n + 0.5), pose: { head: [amount], neck: [amount * 0.3] } }, { t: (i + 1) / (n + 0.5), pose: { head: [-amount * 0.25] } });
      keys.push({ t: 1, pose: {} });
      return { seconds, keys };
    },
  },
  shake: {
    label: 'Shake head (no)', icon: '🙅', words: ['no', 'shake', 'disagree'], biped: false,
    params: { shakes: { label: 'Shakes', min: 1, max: 6, step: 1, value: 3 }, amount: { label: 'Amount', min: 10, max: 50, step: 1, value: 28 }, seconds: { label: 'Length (s)', min: 0.6, max: 4, step: 0.1, value: 1.5 }, repeats: { label: 'Repeat', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ shakes, amount, seconds }) => {
      const keys = [{ t: 0, pose: {} }]; const n = Math.round(shakes) * 2;
      for (let i = 0; i < n; i++) keys.push({ t: (i + 1) / (n + 1), pose: { head: [0, (i % 2 ? -1 : 1) * amount], neck: [0, (i % 2 ? -1 : 1) * amount * 0.3] } });
      keys.push({ t: 1, pose: {} });
      return { seconds, keys };
    },
  },
  bow: {
    label: 'Bow', icon: '🙇', words: ['bow', 'thank', 'thanks', 'greet'], biped: true,
    params: { depth: { label: 'Depth', min: 10, max: 60, step: 1, value: 40 }, seconds: { label: 'Length (s)', min: 1, max: 4, step: 0.1, value: 2 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ depth, seconds }) => ({ seconds, keys: [
      { t: 0, pose: {} },
      { t: 0.35, pose: { spine: [depth * 0.6], spine1: [depth * 0.4], spine2: [depth * 0.3], head: [12], arms: [-12] } },
      { t: 0.6, pose: { spine: [depth * 0.6], spine1: [depth * 0.4], spine2: [depth * 0.3], head: [12], arms: [-12] } },
      { t: 1, pose: {} },
    ] }),
  },
  look: {
    label: 'Look around', icon: '👀', words: ['look', 'around', 'search', 'wonder', 'curious'], biped: false,
    params: { amount: { label: 'Turn', min: 15, max: 75, step: 1, value: 50 }, seconds: { label: 'Length (s)', min: 1.5, max: 6, step: 0.1, value: 3 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ amount, seconds }) => ({ seconds, keys: [
      { t: 0, pose: {} },
      { t: 0.2, pose: { head: [-5, amount], neck: [0, amount * 0.25], spine2: [0, amount * 0.15] } },
      { t: 0.4, pose: { head: [-5, amount], neck: [0, amount * 0.25], spine2: [0, amount * 0.15] } },
      { t: 0.6, pose: { head: [-5, -amount], neck: [0, -amount * 0.25], spine2: [0, -amount * 0.15] } },
      { t: 0.8, pose: { head: [-5, -amount], neck: [0, -amount * 0.25], spine2: [0, -amount * 0.15] } },
      { t: 1, pose: {} },
    ] }),
  },
  lookUp: {
    label: 'Look up & point (at the star)', icon: '☝️', words: ['point', 'up', 'sky', 'star', 'look up', 'wonder'], biped: true,
    params: { hand: { label: 'Hand', options: ['right', 'left'], value: 'right' }, seconds: { label: 'Length (s)', min: 1, max: 5, step: 0.1, value: 2.5 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ hand, seconds }) => {
      const s = hand === 'left' ? 'l' : 'r';
      const pose = { [`${s}ArmUp`]: 70, [`${s}Arm`]: [30], head: [-28], neck: [-8], spine2: [-6] }; // raised arm: +X tips it forward
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.25, pose }, { t: 0.75, pose }, { t: 1, pose: {} }] };
    },
  },
  dance: {
    label: 'Dance sway', icon: '💃', words: ['dance', 'sway', 'groove', 'party', 'music', 'sing'], biped: true,
    params: { amount: { label: 'Amount', min: 0.3, max: 1.6, step: 0.05, value: 1 }, seconds: { label: 'Time per sway (s)', min: 0.6, max: 3, step: 0.05, value: 1.2 }, repeats: { label: 'Repeats', min: 1, max: 8, step: 1, value: 3 } },
    make: ({ amount: a, seconds }) => {
      const side = (d) => ({ side: 0.03 * a * d, Hips: [0, 0, -6 * a * d], spine: [0, 0, 8 * a * d], head: [0, 0, 6 * a * d], lArm: [-25 * a * d], rArm: [25 * a * d], fores: [-35 * a], legs: [-10 * a, 18 * a], up: -0.02 * a });
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.25, pose: side(1) }, { t: 0.5, pose: { fores: [-35 * a], up: 0.01 * a } }, { t: 0.75, pose: side(-1) }, { t: 1, pose: {} }] };
    },
  },
  stretch: {
    label: 'Stretch & yawn', icon: '🥱', words: ['stretch', 'yawn', 'sleepy', 'wake', 'morning', 'tired'], biped: true,
    params: { seconds: { label: 'Length (s)', min: 1.5, max: 5, step: 0.1, value: 3 }, repeats: { label: 'Repeat', min: 1, max: 2, step: 1, value: 1 } },
    make: ({ seconds }) => {
      const top = { armUp: 85, spine: [-10], spine2: [-6], head: [-18], up: 0.03 };
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.3, pose: top }, { t: 0.65, pose: top }, { t: 1, pose: {} }] };
    },
  },
  spin: {
    label: 'Spin around', icon: '🌀', words: ['spin', 'turn', 'twirl', 'around'], biped: false,
    params: { turns: { label: 'Turns', min: 1, max: 3, step: 1, value: 1 }, height: { label: 'Little hop', min: 0, max: 0.15, step: 0.01, value: 0.03 }, seconds: { label: 'Length (s)', min: 0.8, max: 4, step: 0.1, value: 1.6 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ turns, height, seconds }) => ({ seconds, keys: [
      { t: 0, pose: { Hips: [0, 0] } },
      { t: 0.5, pose: { Hips: [0, 180 * turns], up: height, armUp: 0 } },
      { t: 1, pose: { Hips: [0, 360 * turns] } },
    ] }),
  },
  bounce: {
    label: 'Bounce in place', icon: '⬍', words: ['bounce', 'bob', 'wiggle'], biped: false,
    params: { height: { label: 'Height', min: 0.01, max: 0.2, step: 0.01, value: 0.05 }, seconds: { label: 'Time per bounce (s)', min: 0.25, max: 1.5, step: 0.05, value: 0.5 }, repeats: { label: 'Bounces', min: 1, max: 12, step: 1, value: 4 } },
    make: ({ height, seconds }) => ({ seconds, keys: [{ t: 0, pose: {} }, { t: 0.5, pose: { up: height } }, { t: 1, pose: {} }] }),
  },
  // ---------- Ninja set (pretend-play martial arts) ----------
  // Leg directions: thigh x<0 lifts the leg forward, shin x>0 bends the knee back; left leg z>0 / right leg z<0 lifts it out to the side.
  // Arm directions: hanging arm x<0 swings forward; forearm x<0 bends the elbow forward/up.
  ninjaStance: {
    label: 'Ninja stance', icon: '🥷', group: 'Ninja', words: ['ninja', 'stance', 'ready', 'fighting', 'karate', 'kung fu'], biped: true,
    params: { low: { label: 'How low', min: 0.3, max: 1.5, step: 0.05, value: 1 }, seconds: { label: 'Length (s)', min: 1, max: 4, step: 0.1, value: 2 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ low: k, seconds }) => {
      const st = ninjaStance(k);
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.3, pose: st }, { t: 0.5, pose: { ...st, up: st.up - 0.01, head: [-4, 12] } }, { t: 0.75, pose: { ...st, head: [-4, -12] } }, { t: 1, pose: {} }] };
    },
  },
  punch: {
    label: 'Ninja punches', icon: '👊', group: 'Ninja', words: ['punch', 'punches', 'box', 'hit'], biped: true,
    params: { punches: { label: 'Punches', min: 1, max: 8, step: 1, value: 4 }, seconds: { label: 'Length (s)', min: 0.8, max: 4, step: 0.1, value: 2 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ punches, seconds }) => {
      const st = ninjaStance(0.8);
      const hit = (side) => { const s = side === 'r' ? 'r' : 'l', m = s === 'l' ? 1 : -1, o = s === 'l' ? 'r' : 'l';
        return { ...st, [`${s}Arm`]: [-88, -14 * m], [`${s}Fore`]: [0], [`${o}Arm`]: [-50, 10 * m], [`${o}Fore`]: [-100], spine: [4, 18 * -m], head: [0, 10 * m] }; };
      const keys = [{ t: 0, pose: {} }, { t: 0.15, pose: st }];
      const n = Math.round(punches);
      for (let i = 0; i < n; i++) { const a = 0.15 + (0.75 * i) / n, b = 0.15 + (0.75 * (i + 1)) / n; keys.push({ t: a + (b - a) * 0.4, pose: hit(i % 2 ? 'l' : 'r') }, { t: b, pose: st }); }
      keys.push({ t: 1, pose: {} });
      return { seconds, keys };
    },
  },
  chop: {
    label: 'Karate chop', icon: '🤚', group: 'Ninja', words: ['chop', 'karate chop', 'hiya', 'hi-ya'], biped: true,
    params: { hand: { label: 'Hand', options: ['right', 'left'], value: 'right' }, seconds: { label: 'Length (s)', min: 0.8, max: 3, step: 0.1, value: 1.4 }, repeats: { label: 'Chops', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ hand, seconds }) => {
      const s = hand === 'left' ? 'l' : 'r', m = s === 'l' ? 1 : -1;
      const st = ninjaStance(0.8);
      const lift = { ...st, [`${s}ArmUp`]: 75, [`${s}Arm`]: [25], [`${s}Fore`]: [-60], spine: [-6, 12 * m] };
      const strike = { ...st, up: st.up - 0.02, [`${s}Arm`]: [-75, -10 * m], [`${s}Fore`]: [-10], [`${s}Hand`]: [0, 0, 20 * m], spine: [18, -10 * m], head: [8] };
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.2, pose: st }, { t: 0.45, pose: lift }, { t: 0.6, pose: strike }, { t: 0.8, pose: strike }, { t: 1, pose: {} }] };
    },
  },
  frontKick: {
    label: 'Front kick', icon: '🦶', group: 'Ninja', words: ['kick', 'front kick', 'kicks'], biped: true,
    params: { leg: { label: 'Leg', options: ['right', 'left'], value: 'right' }, height: { label: 'Kick height', min: 30, max: 100, step: 1, value: 75 }, seconds: { label: 'Length (s)', min: 0.8, max: 3, step: 0.1, value: 1.4 }, repeats: { label: 'Kicks', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ leg, height, seconds }) => {
      const s = leg === 'left' ? 'l' : 'r', o = s === 'l' ? 'r' : 'l';
      const st = ninjaStance(0.7);
      const chamber = { ...st, [`${s}Thigh`]: [-height * 0.9], [`${s}Shin`]: [100], [`${o}Thigh`]: [-12], [`${o}Shin`]: [20], spine: [-6] };
      const kick = { ...st, [`${s}Thigh`]: [-height], [`${s}Shin`]: [0], [`${s}Foot`]: [-20], [`${o}Thigh`]: [-10], [`${o}Shin`]: [15], spine: [-12], arms: [-30], fores: [-90] };
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.2, pose: st }, { t: 0.38, pose: chamber }, { t: 0.52, pose: kick }, { t: 0.66, pose: kick }, { t: 0.8, pose: chamber }, { t: 1, pose: {} }] };
    },
  },
  sideKick: {
    label: 'Side kick', icon: '🦵', group: 'Ninja', words: ['side kick', 'sidekick'], biped: true,
    params: { leg: { label: 'Leg', options: ['right', 'left'], value: 'right' }, height: { label: 'Kick height', min: 30, max: 95, step: 1, value: 70 }, seconds: { label: 'Length (s)', min: 0.8, max: 3, step: 0.1, value: 1.5 }, repeats: { label: 'Kicks', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ leg, height, seconds }) => {
      const s = leg === 'left' ? 'l' : 'r', o = s === 'l' ? 'r' : 'l', m = s === 'l' ? 1 : -1;
      const st = ninjaStance(0.7);
      const chamber = { ...st, [`${s}Thigh`]: [-60, 0, height * 0.5 * m], [`${s}Shin`]: [100], spine: [0, 0, -10 * m] };
      const kick = { ...st, [`${s}Thigh`]: [0, 0, height * m], [`${s}Shin`]: [0], [`${o}Thigh`]: [0, 0, 8 * m], spine: [0, 0, -22 * m], head: [0, 0, 12 * m], [`${s}Arm`]: [-40], [`${o}Arm`]: [0, 0, -30 * m] };
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.2, pose: st }, { t: 0.38, pose: chamber }, { t: 0.52, pose: kick }, { t: 0.68, pose: kick }, { t: 0.82, pose: chamber }, { t: 1, pose: {} }] };
    },
  },
  roundhouse: {
    label: 'Spinning kick', icon: '🌪️', group: 'Ninja', words: ['roundhouse', 'spinning kick', 'spin kick', 'tornado'], biped: true,
    params: { height: { label: 'Kick height', min: 30, max: 90, step: 1, value: 65 }, seconds: { label: 'Length (s)', min: 1, max: 3, step: 0.1, value: 1.6 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ height, seconds }) => {
      const st = ninjaStance(0.7);
      const out = { rThigh: [0, 0, -height], rShin: [10], lThigh: [-10], lShin: [18], spine: [0, 0, 18], arms: [-20], armUp: 10 };
      return { seconds, keys: [{ t: 0, pose: { Hips: [0, 0] } }, { t: 0.2, pose: { ...st, Hips: [0, 0] } }, { t: 0.45, pose: { ...out, Hips: [0, 160], up: 0.02 } }, { t: 0.7, pose: { ...out, Hips: [0, 300] } }, { t: 0.85, pose: { ...st, Hips: [0, 360] } }, { t: 1, pose: { Hips: [0, 360] } }] };
    },
  },
  ninjaFlip: {
    label: 'Ninja backflip', icon: '🤸', group: 'Ninja', words: ['flip', 'backflip', 'somersault', 'acrobat'], biped: true,
    params: { height: { label: 'Flip height', min: 0.3, max: 1.2, step: 0.01, value: 0.7 }, seconds: { label: 'Length (s)', min: 1, max: 3, step: 0.1, value: 1.6 }, repeats: { label: 'Flips', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ height, seconds }) => ({ seconds, keys: [
      { t: 0, pose: { Hips: [0] } },
      { t: 0.18, pose: { Hips: [0], up: -0.12, legs: [-50, 90], spine: [20], arms: [40] } },
      { t: 0.3, pose: { Hips: [-20], up: 0.1, legs: [0, 0], armUp: 70 } },
      { t: 0.5, pose: { Hips: [-180], up: height, legs: [-95, 130], arms: [-60], fores: [-60], spine: [25], head: [20] } },
      { t: 0.7, pose: { Hips: [-320], up: height * 0.45, legs: [-40, 60], armUp: 40 } },
      { t: 0.82, pose: { Hips: [-360], up: -0.08, legs: [-40, 70], spine: [15], arms: [-30] } },
      { t: 1, pose: { Hips: [-360] } },
    ] }),
  },
  shuriken: {
    label: 'Throw a star', icon: '✴️', group: 'Ninja', words: ['throw', 'shuriken', 'throwing star', 'toss'], biped: true,
    params: { hand: { label: 'Hand', options: ['right', 'left'], value: 'right' }, throws: { label: 'Throws', min: 1, max: 3, step: 1, value: 1 }, seconds: { label: 'Time per throw (s)', min: 0.8, max: 2.5, step: 0.1, value: 1.2 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ hand, seconds, throws }) => {
      const s = hand === 'left' ? 'l' : 'r', m = s === 'l' ? 1 : -1, o = s === 'l' ? 'r' : 'l';
      const st = ninjaStance(0.6);
      const wind = { ...st, [`${s}ArmUp`]: 20, [`${s}Arm`]: [45, 30 * m], [`${s}Fore`]: [-100], spine: [-4, 25 * m], head: [0, -15 * m] };
      const release = { ...st, [`${s}Arm`]: [-95, -25 * m], [`${s}Fore`]: [0], [`${s}Hand`]: [0, 0, -25 * m], [`${o}Arm`]: [10], spine: [10, -25 * m], head: [0, 10 * m] };
      const keys = [{ t: 0, pose: {} }]; const n = Math.round(throws);
      for (let i = 0; i < n; i++) { const a = (i / n), b = ((i + 1) / n); keys.push({ t: a + (b - a) * 0.35, pose: wind }, { t: a + (b - a) * 0.55, pose: release }, { t: a + (b - a) * 0.8, pose: st }); }
      keys.push({ t: 1, pose: {} });
      return { seconds: seconds * n, keys };
    },
  },
  block: {
    label: 'Ninja block', icon: '🛡️', group: 'Ninja', words: ['block', 'defend', 'guard', 'protect'], biped: true,
    params: { seconds: { label: 'Length (s)', min: 0.8, max: 3, step: 0.1, value: 1.5 }, repeats: { label: 'Repeat', min: 1, max: 4, step: 1, value: 2 } },
    make: ({ seconds }) => {
      const st = ninjaStance(0.8);
      const high = { ...st, armUp: 45, arms: [-35, -25], fores: [-70, -30], head: [6], spine: [6], up: st.up - 0.02 };
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.25, pose: st }, { t: 0.45, pose: high }, { t: 0.7, pose: high }, { t: 1, pose: {} }] };
    },
  },
  sneak: {
    label: 'Ninja sneak (tiptoe)', icon: '🤫', group: 'Ninja', words: ['sneak', 'tiptoe', 'creep', 'quiet', 'shh', 'sneaky'], biped: true,
    params: { steps: { label: 'Steps', min: 2, max: 8, step: 1, value: 4 }, seconds: { label: 'Length (s)', min: 1.5, max: 6, step: 0.1, value: 3 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ steps, seconds }) => {
      const base = { up: -0.07, legs: [-28, 52], spine: [22], head: [-15, 0], arms: [-40, -10], fores: [-90] };
      const keys = [{ t: 0, pose: {} }, { t: 0.12, pose: base }]; const n = Math.round(steps);
      for (let i = 0; i < n; i++) {
        const a = 0.12 + (0.76 * i) / n, b = 0.12 + (0.76 * (i + 1)) / n, s = i % 2 ? 'l' : 'r', m = s === 'l' ? 1 : -1;
        keys.push({ t: (a + b) / 2, pose: { ...base, [`${s}Thigh`]: [-55], [`${s}Shin`]: [95], head: [-15, 25 * m], spine: [22, 6 * m], side: -0.01 * m } }, { t: b, pose: base });
      }
      keys.push({ t: 1, pose: {} });
      return { seconds, keys };
    },
  },
  ninjaBow: {
    label: 'Ninja bow (hands together)', icon: '🙏', group: 'Ninja', words: ['ninja bow', 'respect', 'namaste', 'salute'], biped: true,
    params: { seconds: { label: 'Length (s)', min: 1, max: 4, step: 0.1, value: 2 }, repeats: { label: 'Repeat', min: 1, max: 2, step: 1, value: 1 } },
    make: ({ seconds }) => {
      const hands = { arms: [-62, -60], fores: [-75, -40] };
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.25, pose: hands }, { t: 0.5, pose: { ...hands, spine: [22], spine1: [10], head: [12] } }, { t: 0.7, pose: { ...hands, spine: [22], spine1: [10], head: [12] } }, { t: 0.85, pose: hands }, { t: 1, pose: {} }] };
    },
  },
  greet: {
    label: 'Reach out a hand (greeting)', icon: '🤝', words: ['handshake', 'shake hands', 'greet', 'meet'], biped: true,
    params: { seconds: { label: 'Length (s)', min: 1.2, max: 4, step: 0.1, value: 2.4 }, repeats: { label: 'Repeat', min: 1, max: 2, step: 1, value: 1 } },
    make: ({ seconds }) => {
      const reach = { rArm: [-62, 0, 0], rFore: [-14], lArmUp: -72, spine: [6], head: [8] };
      const pump = (d) => ({ ...reach, rFore: [-14 - 14 * d], head: [8 + 4 * d] });
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.22, pose: reach }, { t: 0.36, pose: pump(1) }, { t: 0.5, pose: pump(-0.4) }, { t: 0.64, pose: pump(1) }, { t: 0.8, pose: reach }, { t: 1, pose: {} }] };
    },
  },
  // ---- four-legged moves (tail, ears, head, front legs) ----
  tailWag: {
    label: 'Wag tail', icon: '🐕', group: 'Four-legged', words: ['wag', 'tail', 'happy dog'], quad: true,
    params: { wags: { label: 'Wags', min: 2, max: 10, step: 1, value: 5 }, amount: { label: 'Amount', min: 10, max: 45, step: 1, value: 30 }, seconds: { label: 'Length (s)', min: 0.8, max: 5, step: 0.1, value: 2 }, repeats: { label: 'Repeat', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ wags, amount, seconds }) => {
      const n = Math.round(wags) * 6; const keys = [];
      for (let f = 0; f <= n; f++) {
        const t = f / n; const env = Math.sin(Math.PI * t); const pose = { Hips: [0, -3 * env * Math.sin(2 * Math.PI * wags * t), 0] };
        for (let i = 0; i < 6; i++) pose[`tail${i}`] = [12 * env, amount * env * (0.55 + 0.12 * i) * Math.sin(2 * Math.PI * wags * t - i * 0.55), 0];
        keys.push({ t, pose });
      }
      return { seconds, keys };
    },
  },
  headTilt: {
    label: 'Head tilt (listening)', icon: '🐶', group: 'Four-legged', words: ['tilt', 'listen', 'curious dog'], quad: true,
    params: { side: { label: 'Side', options: ['right', 'left'], value: 'right' }, amount: { label: 'Tilt', min: 8, max: 35, step: 1, value: 22 }, seconds: { label: 'Length (s)', min: 1, max: 4, step: 0.1, value: 2 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ side, amount, seconds }) => {
      const m = side === 'left' ? 1 : -1;
      const tilt = { head: [-4, 6 * m, amount * m], neck: [0, 0, amount * 0.25 * m], lEar: [-14, 0, 8], rEar: [-14, 0, -8] };
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.3, pose: tilt }, { t: 0.72, pose: tilt }, { t: 1, pose: {} }] };
    },
  },
  earTwitch: {
    label: 'Ear twitch', icon: '👂', group: 'Four-legged', words: ['ear', 'twitch', 'hear'], quad: true,
    params: { seconds: { label: 'Length (s)', min: 0.5, max: 3, step: 0.1, value: 1.2 }, repeats: { label: 'Repeat', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ seconds }) => ({ seconds, keys: [
      { t: 0, pose: {} }, { t: 0.2, pose: { lEar: [-28, 0, 10], rEar: [-10, 0, -4], lEar2: [-15] } }, { t: 0.4, pose: { lEar: [10], rEar: [-26, 0, -10], rEar2: [-15] } },
      { t: 0.6, pose: { lEar: [-22, 0, 8], rEar: [-22, 0, -8] } }, { t: 1, pose: {} },
    ] }),
  },
  pawRaise: {
    label: 'Raise a front paw', icon: '🐾', group: 'Four-legged', words: ['paw', 'give paw', 'high five'], quad: true,
    params: { hand: { label: 'Paw', options: ['right', 'left'], value: 'right' }, seconds: { label: 'Length (s)', min: 1, max: 4, step: 0.1, value: 2 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ hand, seconds }) => {
      const s = hand === 'left' ? 'l' : 'r', m = s === 'l' ? 1 : -1;
      const up = { [`${s}FLeg`]: [-58], [`${s}FLwr`]: [62], chest: [-4, 0, -5 * m], head: [-10, -8 * m], tail0: [10, 15], tail1: [0, 12] };
      const wave = { ...up, [`${s}FLwr`]: [40], tail0: [10, -15], tail1: [0, -12] };
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.25, pose: up }, { t: 0.45, pose: wave }, { t: 0.65, pose: up }, { t: 0.8, pose: up }, { t: 1, pose: {} }] };
    },
  },
  playBow: {
    label: 'Play bow', icon: '🙇', group: 'Four-legged', words: ['play bow', 'lets play', 'playful'], quad: true,
    params: { seconds: { label: 'Length (s)', min: 1.2, max: 4, step: 0.1, value: 2.2 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ seconds }) => {
      const bow = (w) => ({ chest: [18], lFLeg: [-38], rFLeg: [-38], lFLwr: [-6], rFLwr: [-6], head: [-24], neck: [-6], up: -0.03,
        tail0: [30, 22 * w], tail1: [8, 18 * w], tail2: [0, 14 * w], lEar: [-10], rEar: [-10] });
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.25, pose: bow(1) }, { t: 0.4, pose: bow(-1) }, { t: 0.55, pose: bow(1) }, { t: 0.7, pose: bow(-1) }, { t: 1, pose: {} }] };
    },
  },
  excitedHop: {
    label: 'Excited hops', icon: '⤒', group: 'Four-legged', words: ['excited', 'jump', 'bounce dog', 'zoomies'], quad: true,
    params: { height: { label: 'Hop height', min: 0.02, max: 0.25, step: 0.01, value: 0.1 }, seconds: { label: 'Time per hop (s)', min: 0.35, max: 1.2, step: 0.05, value: 0.6 }, repeats: { label: 'Hops', min: 1, max: 8, step: 1, value: 3 } },
    make: ({ height, seconds }) => ({ seconds, keys: [
      { t: 0, pose: {} },
      { t: 0.25, pose: { up: -0.03, lFLeg: [-12], rFLeg: [-12], lFLwr: [26], rFLwr: [26], lRLeg: [14], rRLeg: [14], chest: [4] } },
      { t: 0.55, pose: { up: height, lFLeg: [-38], rFLeg: [-30], lFLwr: [55], rFLwr: [48], lRLeg: [22], rRLeg: [18], head: [-12], tail0: [25, 15] } },
      { t: 0.85, pose: { up: -0.02, lFLeg: [-10], rFLeg: [-10], lFLwr: [20], rFLwr: [20], tail0: [15, -15] } },
      { t: 1, pose: {} },
    ] }),
  },
  sniff: {
    label: 'Sniff', icon: '👃', group: 'Four-legged', words: ['sniff', 'smell', 'nose'], quad: true,
    params: { seconds: { label: 'Length (s)', min: 0.8, max: 4, step: 0.1, value: 1.8 }, repeats: { label: 'Repeat', min: 1, max: 3, step: 1, value: 1 } },
    make: ({ seconds }) => {
      // Head reaches forward and down, quick little nose bobs, ears forward, tail gently up.
      const down = (b) => ({ chest: [6], neck: [16 + b], head: [10 + b * 0.6], lEar: [-12], rEar: [-12], tail0: [14, 6], tail1: [4, 4] });
      return { seconds, keys: [{ t: 0, pose: {} }, { t: 0.25, pose: down(0) }, { t: 0.35, pose: down(5) }, { t: 0.45, pose: down(-2) }, { t: 0.55, pose: down(5) }, { t: 0.65, pose: down(-2) }, { t: 0.78, pose: down(0) }, { t: 1, pose: {} }] };
    },
  },
  dogIdle: {
    label: 'Four-legged idle', icon: '🫁', group: 'Four-legged', words: ['dog idle', 'stand dog'], quad: true,
    params: { seconds: { label: 'Cycle length (s)', min: 2, max: 8, step: 0.1, value: 4 }, repeats: { label: 'Cycles', min: 1, max: 4, step: 1, value: 1 } },
    make: ({ seconds }) => {
      // Breathe, gentle tail wag, look around a little, one ear flick: visible but calm.
      const n = 24; const keys = []; const T = 2 * Math.PI;
      for (let f = 0; f <= n; f++) {
        const t = f / n; const pose = { chest: [1.5 * Math.sin(T * 2 * t)], head: [3 * Math.sin(T * t), 14 * Math.sin(T * t + 0.6), 4 * Math.sin(T * 2 * t)], neck: [0, 5 * Math.sin(T * t + 0.6)], up: 0.004 * Math.sin(T * 2 * t) };
        for (let i = 0; i < 6; i++) pose[`tail${i}`] = [8, 14 * (0.6 + 0.12 * i) * Math.sin(T * 3 * t - i * 0.5), 0];
        const flick = Math.max(0, 1 - Math.abs(t - 0.62) / 0.06);
        pose.lEar = [-22 * flick, 0, 0]; pose.rEar = [-8 * flick, 0, 0];
        keys.push({ t, pose });
      }
      return { seconds, keys };
    },
  },
  idle: {
    label: 'Breathing idle', icon: '🫁', words: ['idle', 'stand', 'breathe', 'wait', 'rest'], biped: false,
    params: { seconds: { label: 'Cycle length (s)', min: 1.5, max: 8, step: 0.1, value: 4 }, repeats: { label: 'Cycles', min: 1, max: 6, step: 1, value: 2 } },
    make: ({ seconds }) => {
      // A lively idle you can see in a wide shot: breathe, shift weight from foot to foot, look around, small arm swing.
      const relaxed = { armUp: -72, fores: [-12] }; // arms hang naturally (the rig's rest pose has them out in an A)
      const lean = (m) => ({ ...relaxed, side: 0.02 * m, spine: [-3, 6 * m, -4 * m], spine2: [-4], head: [-6, 22 * m, 5 * m],
        lArm: [8 * m], rArm: [-8 * m], [m > 0 ? 'rThigh' : 'lThigh']: [-10], [m > 0 ? 'rShin' : 'lShin']: [16], up: 0.008 });
      return { seconds, keys: [{ t: 0, pose: relaxed }, { t: 0.25, pose: lean(1) }, { t: 0.5, pose: { ...relaxed, spine: [-3], head: [-8], up: 0.01 } }, { t: 0.75, pose: lean(-1) }, { t: 1, pose: relaxed }] };
    },
  },
};

/** Pick a move from free text ("make him jump twice"). */
export function moveFromText(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  let best = null, score = 0;
  for (const [id, m] of Object.entries(MOVES)) for (const w of m.words) if (t.includes(w) && w.length > score) { best = id; score = w.length; }
  const n = t.match(/\b(\d+|once|twice|three|four|five)\b/);
  const count = n ? ({ once: 1, twice: 2, three: 3, four: 4, five: 5 }[n[1]] || Number(n[1])) : null;
  return best ? { move: best, count } : null;
}
export const defaultParams = (id) => Object.fromEntries(Object.entries(MOVES[id].params).map(([k, p]) => [k, p.value]));

/** Build a three.js AnimationClip for `rig` from a move + params. 30 fps, deterministic. */
export function buildClip(rig, moveId, params, name) {
  const mv = MOVES[moveId]; const p = { ...defaultParams(moveId), ...params };
  const one = mv.make(p); const reps = Math.max(1, Math.round(p.repeats || 1));
  const total = one.seconds * reps, fps = 30, n = Math.max(2, Math.round(total * fps) + 1);
  const times = new Float32Array(n);
  const used = new Set(['hips']);
  for (const k of one.keys) Object.keys(expandPose(k.pose, rig).rot).forEach((b) => used.add(b === 'Hips' ? 'hips' : b));
  const tracks = {};
  for (const key of used) { const b = rig.map[key]; if (b) tracks[key] = { bone: b, q: new Float32Array(n * 4) }; }
  const hips = rig.map.hips; const hipsPos = new Float32Array(n * 3);
  const hr = hips && rig.rest.get(hips);
  const parentInv = hips?.parent ? hips.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
  const hw = rig.hipsWorld || new THREE.Vector3();
  const base = hw.clone().applyMatrix4(parentInv);
  for (let f = 0; f < n; f++) {
    const t = Math.min(total, f / fps); times[f] = t;
    const u = reps > 1 ? (t % one.seconds) / one.seconds || (t >= total ? 1 : 0) : t / one.seconds;
    const s = sampleKeys(one.keys, Math.min(1, u), rig);
    // energy: the same move performed a little bigger or smaller (so repeated moves never look copy-pasted)
    const en = Number(p.energy || 1); if (en !== 1) { for (const k of Object.keys(s.rot)) s.rot[k] = s.rot[k].map((x) => x * en); s.up *= en; s.fwd *= en; s.side *= en; }
    for (const [key, tr] of Object.entries(tracks)) {
      const v = s.rot[key] || (key === 'hips' ? s.rot.Hips : null) || [0, 0, 0];
      const r = rig.rest.get(tr.bone);
      const q = r.pwq.clone().invert().multiply(deltaQ(v)).multiply(r.wq); // local = parentRest⁻¹ · Δ · boneRestWorld
      q.toArray(tr.q, f * 4);
    }
    if (hips) {
      const off = new THREE.Vector3(s.side * rig.height, s.up * rig.height, s.fwd * rig.height);
      const lp = hw.clone().add(off).applyMatrix4(parentInv).sub(base).add(hr.p);
      lp.toArray(hipsPos, f * 3);
    }
  }
  const kf = Object.values(tracks).map((tr) => new THREE.QuaternionKeyframeTrack(`${tr.bone.name}.quaternion`, times, tr.q));
  if (hips) kf.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, hipsPos));
  return new THREE.AnimationClip(name || mv.label, total, kf);
}

/**
 * Copy a clip made for another character onto this rig (same bone names). Rotations are carried over relative to each
 * rig's own rest pose; hip movement is scaled to this character's size.
 */
export function retargetClip(srcRig, clip, dstRig, name) {
  const srcByNorm = new Map(srcRig.bones.map((b) => [norm(b.name), b]));
  const dstByNorm = new Map(dstRig.bones.map((b) => [norm(b.name), b]));
  const tracks = [];
  for (const tr of clip.tracks) {
    const [node, prop] = [tr.name.slice(0, tr.name.lastIndexOf('.')), tr.name.slice(tr.name.lastIndexOf('.') + 1)];
    const sb = srcByNorm.get(norm(node)), db = dstByNorm.get(norm(node));
    if (!sb || !db) continue;
    const sr = srcRig.rest.get(sb), dr = dstRig.rest.get(db);
    if (prop === 'quaternion') {
      const v = new Float32Array(tr.values.length); const inv = sr.q.clone().invert(); const q = new THREE.Quaternion();
      for (let i = 0; i < tr.values.length; i += 4) { q.fromArray(tr.values, i); dr.q.clone().multiply(inv.clone().multiply(q)).toArray(v, i); }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${db.name}.quaternion`, tr.times.slice(), v));
    } else if (prop === 'position' && db === dstRig.map.hips) {
      const k = dr.p.length() / (sr.p.length() || 1); const v = new Float32Array(tr.values.length);
      for (let i = 0; i < tr.values.length; i += 3) for (let j = 0; j < 3; j++) v[i + j] = dr.p.getComponent(j) + (tr.values[i + j] - sr.p.getComponent(j)) * k;
      tracks.push(new THREE.VectorKeyframeTrack(`${db.name}.position`, tr.times.slice(), v));
    }
  }
  return new THREE.AnimationClip(name || clip.name, clip.duration, tracks);
}
