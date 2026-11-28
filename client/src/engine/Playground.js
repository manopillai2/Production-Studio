// Playground equipment with REAL moving parts: seesaw, swing set, slide and merry-go-round.
// Meshy makes every model as one solid piece, so a Meshy seesaw would tip over base and all. These are built here, in
// the World Style's candy colours, with a tilting plank, swinging seats on chains, a spinning disc, and named seats that
// characters ride (SceneEngine attaches a rider's hips to a seat every frame). Everything is a function of shot time u,
// so the preview and the MP4 export are identical. Sizes are in metres for a ~1.1 m tall child.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const EQUIPMENT = ['seesaw', 'swing', 'slide', 'merry-go-round', 'kite', 'balloons'];
export const EQUIPMENT_LABEL = { seesaw: 'Seesaw', swing: 'Swing set', slide: 'Slide', 'merry-go-round': 'Merry-go-round', kite: 'Kite (flies on a string)', balloons: 'Pink balloons (float up)' };

const PAL = { red: '#F2545B', orange: '#FF9F1C', yellow: '#FFD23F', green: '#4CC35A', teal: '#21C7C4', blue: '#3E8BF0', purple: '#8A5CF0', pink: '#FF7EC4', white: '#FFF8F0', cream: '#FFE9B8' };
const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.02, ...extra });
const mesh = (g, c, extra) => { const m = new THREE.Mesh(g, typeof c === 'string' ? mat(c, extra) : c); m.castShadow = true; m.receiveShadow = true; return m; };
const box = (w, h, d, c, r = 0.06) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), c);
const tube = (a, b, r, c) => { // a cylinder from point a to point b
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b); const len = A.distanceTo(Bv);
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 14), c); m.position.copy(A).add(Bv).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize()); return m;
};
const ball = (r, c) => mesh(new THREE.SphereGeometry(r, 20, 14), c);
const seatPoint = (name, parent, pos, yaw = 0) => { const o = new THREE.Object3D(); o.name = name; o.position.set(...pos); o.rotation.y = yaw; parent.add(o); return o; };
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

/** Seesaw: a long plank on a pivot. Seats "a" (−x end, facing +x) and "b" (+x end, facing −x). */
function seesaw(p) {
  const g = new THREE.Group();
  const H = 0.55, L = 3.2;
  // base: a chunky rounded A-frame
  g.add(tube([-0.32, 0, -0.28], [0, H, -0.28], 0.07, PAL.yellow), tube([0.32, 0, -0.28], [0, H, -0.28], 0.07, PAL.yellow));
  g.add(tube([-0.32, 0, 0.28], [0, H, 0.28], 0.07, PAL.yellow), tube([0.32, 0, 0.28], [0, H, 0.28], 0.07, PAL.yellow));
  const axle = tube([0, H, -0.36], [0, H, 0.36], 0.06, PAL.red); g.add(axle);
  for (const z of [-0.36, 0.36]) { const k = ball(0.09, PAL.red); k.position.set(0, H, z); g.add(k); }
  const plank = new THREE.Group(); plank.position.y = H; g.add(plank);
  // A narrow plank and seat (like a real seesaw) so a child can sit astride with a leg down each side; the bumper is
  // at the very end, beyond the seat, where no foot hangs. Handles can be left off one end (a dog has none in front).
  const board = box(L, 0.09, 0.26, PAL.purple, 0.04); board.position.y = 0.06; plank.add(board);
  const noHandle = new Set([].concat(p.no_handle || []));
  for (const s of [-1, 1]) {
    const wide = new Set([].concat(p.wide_seat || [])).has(s < 0 ? 'a' : 'b'); // a wide seat for a dog: all four paws on it
    const seat = box(wide ? 0.5 : 0.4, 0.08, wide ? 0.46 : 0.27, PAL.pink, 0.04); seat.position.set(s * 1.32, 0.13, 0); plank.add(seat);
    if (!noHandle.has(s < 0 ? 'a' : 'b')) {
      const post = tube([s * 0.98, 0.1, 0], [s * 0.98, 0.5, 0], 0.035, PAL.teal); plank.add(post);
      const bar = tube([s * 0.98, 0.5, -0.18], [s * 0.98, 0.5, 0.18], 0.035, PAL.teal); plank.add(bar);
      for (const z of [-0.18, 0.18]) { const k = ball(0.05, PAL.orange); k.position.set(s * 0.98, 0.5, z); plank.add(k); }
    }
    const bumper = ball(0.08, PAL.orange); bumper.position.set(s * 1.56, -0.03, 0); bumper.scale.set(1, 0.6, 1); plank.add(bumper);
  }
  const seats = { a: seatPoint('a', plank, [-1.3, 0.18, 0], Math.PI / 2), b: seatPoint('b', plank, [1.3, 0.18, 0], -Math.PI / 2) };
  const A = THREE.MathUtils.degToRad(p.amplitude ?? 15), P = p.period ?? 2.4;
  return {
    group: g, seats, plank, height: H,
    pose(u) { // a bouncy up-and-down: quick through the middle, a short pause at each end
      const x = Math.sin((2 * Math.PI * (u + (p.phase || 0))) / P); const k = Math.sign(x) * Math.pow(Math.abs(x), 0.7);
      plank.rotation.z = A * k * ease(u / 0.8);
    },
  };
}

/** Swing set: an A-frame with two swings. Seats "a" and "b" face +z (towards the camera side). */
function swing(p) {
  const g = new THREE.Group();
  const H = 2.15, W = 2.6, D = 0.9, CH = 1.65;
  for (const s of [-1, 1]) {
    g.add(tube([s * W / 2, 0, -D / 2], [s * W / 2, H, 0], 0.07, PAL.teal), tube([s * W / 2, 0, D / 2], [s * W / 2, H, 0], 0.07, PAL.teal));
    const k = ball(0.1, PAL.yellow); k.position.set(s * W / 2, H, 0); g.add(k);
    for (const z of [-D / 2, D / 2]) { const f = ball(0.1, PAL.purple); f.position.set(s * W / 2, 0.03, z); f.scale.y = 0.5; g.add(f); }
  }
  g.add(tube([-W / 2, H, 0], [W / 2, H, 0], 0.07, PAL.red));
  const swings = []; const seats = {};
  [[-0.62, PAL.orange, 'a'], [0.62, PAL.pink, 'b']].forEach(([x, c, name], i) => {
    const pivot = new THREE.Group(); pivot.position.set(x, H, 0); g.add(pivot);
    for (const sx of [-0.22, 0.22]) pivot.add(tube([sx, 0, 0], [sx, -CH, 0], 0.018, '#C9C2D6'));
    // A shallow seat (as deep as a small child's thigh) with the child sitting at its back: knees at the front edge,
    // shins hanging free in front of it (a deep seat put the shins through the board).
    const seat = box(0.56, 0.07, 0.19, c, 0.03); seat.position.y = -CH; pivot.add(seat);
    seats[name] = seatPoint(name, pivot, [0, -CH + 0.06, -0.07], 0);
    swings.push({ pivot, phase: i * 0.5 + (p.phase || 0), amp: THREE.MathUtils.degToRad((p.amplitude ?? 32) * (i ? 0.85 : 1)) });
  });
  const P = p.period ?? 2.6; // a 1.65 m swing really swings about every 2.6 s
  return {
    group: g, seats, height: H,
    pose(u) { for (const s of swings) s.pivot.rotation.x = s.amp * ease(u / 2.5) * Math.sin((2 * Math.PI * (u + s.phase)) / P); },
  };
}

/** Slide: ladder at the back (−z), platform, a wavy chute down to +z. Seat "top" moves down the chute (ride.slide). */
function slide(p) {
  const g = new THREE.Group();
  const H = 1.3, Lz = 2.9;
  // platform with rails and a little roof
  for (const [x, z] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.3], [0.6, 0.3]]) g.add(tube([x, 0, z], [x, H + 1.1, z], 0.055, PAL.blue)); // tall enough for a child to stand under the roof
  const deck = box(1.34, 0.1, 0.8, PAL.yellow, 0.04); deck.position.set(0, H, -0.02); g.add(deck);
  const roof = mesh(new THREE.ConeGeometry(1.0, 0.5, 4), PAL.red); roof.rotation.y = Math.PI / 4; roof.position.y = H + 1.35; g.add(roof);
  const top = ball(0.1, PAL.yellow); top.position.y = H + 1.65; g.add(top);
  for (const s of [-1, 1]) g.add(tube([s * 0.6, H + 0.45, -0.35], [s * 0.6, H + 0.45, 0.3], 0.03, PAL.orange)); // wide enough for a child's head and hair
  // ladder
  for (const s of [-1, 1]) g.add(tube([s * 0.28, 0, -1.05], [s * 0.28, H, -0.42], 0.04, PAL.green));
  for (let i = 1; i <= 5; i++) { const k = i / 6; g.add(tube([-0.28, H * k, -1.05 + 0.63 * k], [0.28, H * k, -1.05 + 0.63 * k], 0.03, PAL.white)); }
  // chute: a wavy curve from the deck edge down to the ground at +z
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, H + 0.05, 0.35), new THREE.Vector3(0, H * 0.72, 0.35 + Lz * 0.28), new THREE.Vector3(0, H * 0.5, 0.35 + Lz * 0.5), new THREE.Vector3(0, H * 0.2, 0.35 + Lz * 0.78), new THREE.Vector3(0, 0.12, 0.35 + Lz), new THREE.Vector3(0, 0.1, 0.35 + Lz + 0.4)]); // ends low with a flat run-out, like a real slide
  const N = 60, Wd = 0.62; const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const c = curve.getPointAt(i / N); const wave = 0.03 * Math.sin(i * 0.6);
    for (let j = 0; j <= 8; j++) { const a = Math.PI * (j / 8); pos.push(c.x + Math.cos(a) * Wd / 2, c.y + wave - Math.sin(a) * 0.12 + 0.12, c.z); }
    if (i < N) for (let j = 0; j < 8; j++) { const k = i * 9 + j; idx.push(k, k + 9, k + 1, k + 1, k + 9, k + 10); }
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeVertexNormals();
  g.add(mesh(cg, mat(PAL.yellow, { side: THREE.DoubleSide, roughness: 0.25 })));
  for (const s of [-1, 1]) { const rail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.getPoints(20).map((q) => q.clone().add(new THREE.Vector3(s * Wd / 2, 0.14, 0)))), 40, 0.04, 8), PAL.orange); g.add(rail); }
  const leg = tube([0, 0, 0.35 + Lz * 0.55], [0, H * 0.42, 0.35 + Lz * 0.55], 0.05, PAL.blue); g.add(leg);
  const rider = seatPoint('top', g, [0, H + 0.12, 0.2], 0);
  return {
    group: g, seats: { top: rider }, curve, height: H, endZ: 0.35 + Lz + 0.4,
    /** where a climber's feet are at ladder progress k (0 = bottom, 1 = top), in the slide's frame */
    climbAt(k) { const t = Math.min(1, Math.max(0, k)); return { pos: new THREE.Vector3(0, H * t + 0.02, -1.22 + 0.68 * t) }; },
    /** where a rider sits at slide progress k (0 = top, 1 = bottom), in the slide's frame */
    slideAt(k) {
      if (k <= 0) return { pos: new THREE.Vector3(0, H + 0.12, 0.2), pitch: 0 };
      const t = Math.min(1, k); const c = curve.getPointAt(t); const d = curve.getTangentAt(t);
      return { pos: new THREE.Vector3(c.x, c.y + 0.15, c.z), pitch: Math.atan2(-d.y, d.z) * 0.95 }; // lie back along the chute's slope
    },
    pose() {},
  };
}

/** Merry-go-round: a low striped disc that spins, with handrails and a canopy. Seats "a", "b", "c" ride on the rim. */
function merryGoRound(p) {
  const g = new THREE.Group();
  const R = 1.15, Hd = 0.32;
  const base = mesh(new THREE.CylinderGeometry(0.25, 0.32, Hd, 20), PAL.blue); base.position.y = Hd / 2; g.add(base);
  const spin = new THREE.Group(); spin.position.y = Hd; g.add(spin);
  const cols = [PAL.red, PAL.orange, PAL.yellow, PAL.green, PAL.teal, PAL.purple];
  cols.forEach((c, i) => { const w = mesh(new THREE.CylinderGeometry(R, R, 0.1, 12, 1, false, (i / 6) * Math.PI * 2, Math.PI / 3), c); w.position.y = 0.05; spin.add(w); });
  const rim = mesh(new THREE.TorusGeometry(R, 0.05, 10, 48), PAL.white); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; spin.add(rim);
  const pole = tube([0, 0, 0], [0, 1.6, 0], 0.06, PAL.white); spin.add(pole);
  const canopy = mesh(new THREE.ConeGeometry(0.75, 0.42, 12), PAL.pink); canopy.position.y = 1.75; spin.add(canopy);
  const knob = ball(0.09, PAL.yellow); knob.position.y = 2.0; spin.add(knob);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const x = Math.cos(a) * 0.55, z = Math.sin(a) * 0.55;
    spin.add(tube([x, 0.1, z], [x, 0.7, z], 0.035, PAL.yellow));
    spin.add(tube([x, 0.7, z], [x * 0.2, 0.9, z * 0.2], 0.035, PAL.yellow));
  }
  const seats = {}; ['a', 'b', 'c'].forEach((n, i) => { const a = (i / 3) * Math.PI * 2 + 0.5 + Math.PI / 3; seats[n] = seatPoint(n, spin, [Math.cos(a) * 1.07, 0.12, Math.sin(a) * 1.07], Math.PI / 2 - a); }); // at the rim, facing out: knees past the edge, legs dangle clear of it
  const speed = p.speed ?? 0.55; // turns per second at full speed
  return {
    group: g, seats, height: Hd,
    pose(u) { // speeds up over 1.5 s
      const ramp = 1.5; const turns = u < ramp ? (speed * u * u) / (2 * ramp) : speed * (u - ramp / 2);
      spin.rotation.y = -turns * Math.PI * 2 + (p.phase || 0);
    },
  };
}


/** A red diamond kite with a fluttering bow tail, on a string down to an anchor (where the child holds it).
 *  Params: anchor [x,y,z] (setting space, relative to the kite's pos), swoop {at, dur, drop} to dive low and climb again. */
function kite(p) {
  const g = new THREE.Group(); const k = new THREE.Group(); g.add(k);
  const quad = (pts, c) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); geo.computeVertexNormals(); return mesh(geo, mat(c, { side: THREE.DoubleSide, roughness: 0.5 })); };
  const T = [0, 0.75, 0], Bm = [0, -1.05, 0], Lf = [-0.55, 0.1, 0], Rt = [0.55, 0.1, 0], C = [0, 0.1, 0.06];
  k.add(quad([T, Lf, C], PAL.red), quad([T, C, Rt], '#FF7A6B'), quad([Lf, Bm, C], PAL.yellow), quad([C, Bm, Rt], PAL.orange));
  k.add(tube([0, 0.75, 0.03], [0, -1.05, 0.03], 0.025, PAL.white), tube([-0.55, 0.1, 0.03], [0.55, 0.1, 0.03], 0.025, PAL.white));
  // p.tail: number of bows (a long tail can reach the ground)
  const tail = []; for (let i = 0; i < Math.max(2, Math.round(p.tail ?? 9)); i++) { const b = new THREE.Group(); const c = [PAL.blue, PAL.green, PAL.purple, PAL.pink, PAL.yellow][i % 5];
    for (const s2 of [-1, 1]) { const w = mesh(new THREE.ConeGeometry(0.09, 0.18, 8), c); w.rotation.z = s2 * Math.PI / 2; w.position.x = s2 * 0.09; b.add(w); }
    k.add(b); tail.push(b); }
  const strGeo = new THREE.BufferGeometry(); strGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 24), 3));
  const str = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: '#FFFFFF' })); g.add(str);
  const anchor = new THREE.Vector3(...(p.anchor || [0, -4, 2]));
  k.scale.setScalar(p.size ?? 1);
  return {
    group: g, seats: {}, height: 0,
    pose(u) {
      const sw = p.swoop; let drop = 0;
      if (sw) { const x = (u - sw.at) / Math.max(0.5, sw.dur); if (x > 0 && x < 1) drop = Math.sin(Math.PI * x) ** 2 * (sw.drop ?? 3); }
      k.position.set(0.6 * Math.sin(u * 0.9) + 0.25 * Math.sin(u * 2.1), -drop + 0.35 * Math.sin(u * 1.3), 0.2 * Math.sin(u * 0.7));
      k.rotation.set(0.15 * Math.sin(u * 1.1), 0, 0.25 * Math.sin(u * 0.9 + 0.5) + (drop ? 0.3 * Math.sin(u * 3) : 0));
      tail.forEach((b, i) => { const d = i + 1; b.position.set(0.18 * Math.sin(u * 3.2 - d * 0.7) * Math.min(1, d / 3), -1.05 - d * 0.28, 0.1 * Math.sin(u * 2.1 - d)); b.rotation.z = 0.5 * Math.sin(u * 3.2 - d * 0.7); });
      // string: a gentle curve from the kite's nose bottom to the anchor
      const from = new THREE.Vector3(0, -0.3, 0.05).applyMatrix4(new THREE.Matrix4().compose(k.position, k.quaternion, k.scale));
      const pos = strGeo.attributes.position;
      for (let i = 0; i < 24; i++) { const t = i / 23; const q = from.clone().lerp(anchor, t); q.y -= Math.sin(Math.PI * t) * 0.6; pos.setXYZ(i, q.x, q.y, q.z); }
      pos.needsUpdate = true; strGeo.computeBoundingSphere();
    },
  };
}

/** A bunch of round pink balloons on curly strings. Params: lift (seconds into the shot when they float up and away), rise. */
function balloons(p) {
  const g = new THREE.Group(); const bunch = new THREE.Group(); g.add(bunch);
  const cols = ['#FF7EC4', '#FF5A9E', '#FFB3D9', '#FF8FB1', '#FFFFFF', '#FF6FB5', '#F7A8D8'];
  const knots = [];
  cols.forEach((c, i) => {
    const a = (i / cols.length) * Math.PI * 2; const r = i === 0 ? 0 : 0.26;
    const bl = mesh(new THREE.SphereGeometry(0.26, 24, 18), mat(c, { roughness: 0.18, metalness: 0.05 })); bl.scale.set(1, 1.15, 1);
    const pos = new THREE.Vector3(Math.cos(a) * r, 1.55 + (i % 3) * 0.16 + (i === 0 ? 0.3 : 0), Math.sin(a) * r * 0.6); bl.position.copy(pos); bunch.add(bl);
    const knot = mesh(new THREE.ConeGeometry(0.035, 0.06, 8), c); knot.position.copy(pos).add(new THREE.Vector3(0, -0.31, 0)); knot.rotation.x = Math.PI; bunch.add(knot);
    const pts = []; for (let j = 0; j <= 12; j++) { const t = j / 12; pts.push(new THREE.Vector3(pos.x * (1 - t) + 0.04 * Math.sin(t * 9 + i), (pos.y - 0.33) * (1 - t) + 0.2 * t, pos.z * (1 - t))); }
    bunch.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.007, 4), mat('#F4F0FF')));
    knots.push(bl);
  });
  const bow = mesh(new THREE.TorusGeometry(0.06, 0.025, 8, 16), PAL.pink); bow.position.y = 0.2; bunch.add(bow);
  return {
    group: g, seats: {}, height: 0,
    pose(u) {
      const lift = p.lift ?? 999; const x = Math.max(0, u - lift) / 4; const up = x < 1 ? x * x * (2 - x) : 1 + (x - 1) * 0.9;
      bunch.position.set(Math.sin(u * 0.9) * (0.05 + 0.25 * Math.min(1, x * 2)) + 0.6 * Math.min(1, x), (p.rise ?? 4) * up + Math.sin(u * 1.6) * 0.07, Math.sin(u * 0.75 + 1) * 0.06);
      bunch.rotation.z = Math.sin(u * 1.2) * (0.05 + 0.08 * Math.min(1, x));
      knots.forEach((b, i) => { b.position.x += Math.sin(u * 2 + i) * 0.0008; });
    },
  };
}

const BUILD = { seesaw, swing, slide, 'merry-go-round': merryGoRound, kite, balloons };
/** Build one piece of equipment from a shot's setting.equipment entry {type, pos, rot_y, scale, ...params}. */
export function buildEquipment(e) {
  const f = BUILD[e.type]; if (!f) return null;
  const eq = f(e); eq.type = e.type; eq.spec = e;
  eq.group.position.set(...(e.pos || [0, 0, 0])); eq.group.rotation.y = Number(e.rot_y || 0); eq.group.scale.setScalar(Number(e.scale || 1));
  return eq;
}
