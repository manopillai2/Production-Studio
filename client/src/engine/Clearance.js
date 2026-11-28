// Clearance: does any part of a character go INSIDE something solid — and keep riders' legs out of the equipment.
//  - Every piece of playground equipment is described by exact shapes (boxes, rods, balls, rings, the slide chute),
//    with a signed distance: negative = inside, by that many metres.
//  - checkClearance(g) measures real points on the characters' skin (skinned vertices, so poses count) against the
//    equipment, props and the other characters (inside test), the scenery model (benches, fences… as a voxel grid)
//    and the ground. Hands may hold thin bars, chains and rims (gripping is not going through).
//  - clearLegs() is used every frame by the engine: a rider's leg that would go into the equipment or the ground is
//    swung outward / bent at the knee until it is clear (deterministic small search, same result every render).
import * as THREE from 'three';

const v = new THREE.Vector3(), w = new THREE.Vector3(), inv4 = new THREE.Matrix4();
const GRIP = new Set(['lHand', 'rHand', 'lFore', 'rFore']);

// ---------- exact shapes of the equipment ----------
function shapesOf(eq) {
  if (eq._shapes) return eq._shapes;
  const list = [];
  eq.group.traverse((m) => {
    if (!m.isMesh || !m.geometry || m.userData.noCollide) return;
    const geo = m.geometry; const P = geo.parameters || {};
    if (geo.type === 'TubeGeometry') return; // curved slide rails / balloon strings
    if (eq.curve && geo.type === 'BufferGeometry') return; // the chute: handled by its curve
    if (geo.type === 'BufferGeometry') return; // kite sails (thin, in the sky)
    if (!geo.boundingBox) geo.computeBoundingBox();
    let kind = 'box', dims = null;
    if (geo.type === 'SphereGeometry') { kind = 'sphere'; dims = { r: P.radius }; }
    else if (geo.type === 'CylinderGeometry') { kind = 'cyl'; dims = { r: Math.max(P.radiusTop, P.radiusBottom), h: P.height / 2 }; }
    else if (geo.type === 'TorusGeometry') { kind = 'torus'; dims = { R: P.radius, r: P.tube }; }
    else { const b = geo.boundingBox; dims = { c: b.getCenter(new THREE.Vector3()), h: b.getSize(new THREE.Vector3()).multiplyScalar(0.5) }; }
    list.push({ m, kind, dims, thin: (kind === 'cyl' || kind === 'torus') ? (dims.r < 0.06) : kind === 'sphere' ? dims.r < 0.06 : false, name: geo.type.replace('Geometry', '').toLowerCase() });
  });
  eq._shapes = list; return list;
}
/** Signed distance (metres, world) from world point p to one shape. */
function sdShape(s, p) {
  inv4.copy(s.m.matrixWorld).invert(); const q = w.copy(p).applyMatrix4(inv4);
  const sc = new THREE.Vector3().setFromMatrixScale(s.m.matrixWorld); const k = Math.min(sc.x, sc.y, sc.z);
  let d;
  if (s.kind === 'sphere') return (q.length() - s.dims.r) * k; // squashed balls: tested in their own (unsquashed) space
  if (s.kind === 'cyl') { const dr = Math.hypot(q.x, q.z) - s.dims.r, dy = Math.abs(q.y) - s.dims.h; d = Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0)); return d * k; }
  if (s.kind === 'torus') { d = Math.hypot(Math.hypot(q.x, q.y) - s.dims.R, q.z) - s.dims.r; return d * k; }
  const c = s.dims.c, h = s.dims.h; const dx = Math.abs(q.x - c.x) - h.x, dy = Math.abs(q.y - c.y) - h.y, dz = Math.abs(q.z - c.z) - h.z;
  d = Math.min(Math.max(dx, dy, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0));
  return d * k;
}
/** The slide chute (open half-pipe): distance below its surface, when over it. */
function sdChute(eq, p) {
  const q = w.copy(p).applyMatrix4(inv4.copy(eq.group.matrixWorld).invert());
  const pts = eq._chutePts || (eq._chutePts = eq.curve.getSpacedPoints(80));
  let best = null; for (const c of pts) { const dz = Math.abs(c.z - q.z); if (!best || dz < best.dz) best = { c, dz }; }
  if (!best || best.dz > 0.05 || Math.abs(q.x) > 0.3) return Infinity;
  const xr = Math.min(1, Math.abs(q.x) / 0.31); const surf = best.c.y + 0.12 * (1 - Math.sqrt(1 - xr * xr));
  const below = surf - q.y; return below > 0 && below < 0.3 ? -below : Infinity;
}
/** Deepest point of p inside a piece of equipment: {d (negative = inside), part, thin}. */
export function equipSD(eq, p) {
  let best = { d: Infinity, part: null, thin: false };
  for (const s of shapesOf(eq)) { const d = sdShape(s, p); if (d < best.d) best = { d, part: s.name, thin: s.thin }; }
  if (eq.curve) { const d = sdChute(eq, p); if (d < best.d) best = { d, part: 'chute', thin: false }; }
  return best;
}

// ---------- the limb solver (riders) ----------
const LEGS = [['lThigh', 'lShin', 'lFoot', 'lToe'], ['rThigh', 'rShin', 'rFoot', 'rToe'], ['lFLeg', 'lFLwr'], ['rFLeg', 'rFLwr'], ['lRLeg', 'lRLwr', 'lRHock'], ['rRLeg', 'rRLwr', 'rRHock']];
const ARMS = [['lArm', 'lFore', 'lHand'], ['rArm', 'rFore', 'rHand']];
/** Points along a limb from its middle joint (knee / elbow) to the tip, in world space. */
function limbPoints(bones) {
  const pts = []; const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 1; i < bones.length; i++) {
    bones[i - 1].getWorldPosition(a); bones[i].getWorldPosition(b);
    for (const t of i === 1 ? [1] : [0.33, 0.66, 1]) pts.push(a.clone().lerp(b, t));
  }
  const last = bones.at(-1); const tip = last.children.find((c) => c.isBone);
  if (tip) { last.getWorldPosition(a); tip.getWorldPosition(b); pts.push(a.clone().lerp(b, 0.5), b.clone()); }
  else if (bones.length >= 2) { // no finger / toe bone (Meshy rigs): the palm or foot reaches past the last joint
    bones.at(-2).getWorldPosition(a); last.getWorldPosition(b); const d = b.clone().sub(a).multiplyScalar(0.35);
    pts.push(b.clone().add(d), b.clone().add(d.multiplyScalar(2)));
  }
  return pts;
}
function depthOf(pts, equip, ground, radius, grip) {
  let worst = 0;
  for (const p of pts) {
    for (const eq of equip) { const r = equipSD(eq, p); if (grip && r.thin) continue; const d = radius - r.d; if (d > worst) worst = d; }
    const gd = radius * 0.6 - (p.y - ground(p.x, p.z)); if (gd > worst) worst = gd;
  }
  return worst;
}
/**
 * Keep a rider's legs and arms out of the equipment and the ground, then make sure the body sits ON the seat.
 * a: engine actor; equip: the shot's equipment; ground(x,z) → floor y (world); radius: limb thickness (m).
 * Every change is recorded in a.body.legUndo so the engine can undo it before the next frame. Returns the worst depth left.
 */
export function clearLegs(a, equip, ground, radius, mode = 'full') {
  // The character's OWN bones (rig.map belongs to a hidden analysis copy of the skeleton).
  const M = a.body.liveMap || (a.body.liveMap = Object.fromEntries(Object.entries(a.body.rig.map).map(([k, b]) => [k, b && a.body.obj.getObjectByName(b.name)]).filter(([, b]) => b)));
  let worstLeft = 0;
  const undo = a.body.legUndo || (a.body.legUndo = []);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(a.holder.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0); const side = new THREE.Vector3().crossVectors(up, fwd).normalize(); // character's left
  const rotWorld = (bone, axis, ang) => {
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()); const la = axis.clone().applyQuaternion(pq.clone().invert()).normalize();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(la, ang)); bone.updateMatrixWorld(true);
  };
  const body = (M.spine1 || M.spine || M.hips)?.getWorldPosition(new THREE.Vector3());
  // GENTLE mode (default for rides since round 5): keep the designed pose; only swing a leg slightly outward (at most
  // ~17°), by the SMALLEST angle that clears the seat, found continuously (bisection), so legs never jump between frames.
  // The full search below twisted legs into unnatural shapes and is only used when a shot asks for it.
  if (mode === 'gentle') {
    if (a.body.rig.quad) return 0;
    for (const names of LEGS.slice(0, 2)) {
      const bones = names.map((n) => M[n]).filter(Boolean); if (bones.length < 2) continue;
      const root = bones[0], mid = bones[1];
      const pen = () => depthOf(limbPoints(bones), equip, ground, radius, false);
      const p0 = pen(); if (p0 < 0.004) continue;
      const ref = root.parent?.getWorldPosition(new THREE.Vector3());
      const out = Math.sign(side.dot(mid.getWorldPosition(new THREE.Vector3()).sub(ref || new THREE.Vector3()))) || (names[0].startsWith('l') ? 1 : -1);
      const q0 = root.quaternion.clone(); undo.push([root, q0.clone()]);
      const apply = (ang) => { root.quaternion.copy(q0); root.updateMatrixWorld(true); if (ang) rotWorld(root, fwd, out * ang); };
      const MAX = 0.3; apply(MAX); const pMax = pen();
      if (pMax >= p0) { apply(0); worstLeft = Math.max(worstLeft, p0); continue; } // swinging out doesn't help: leave the pose alone
      let lo = 0, hi = MAX;
      if (pMax < 0.004) for (let it = 0; it < 7; it++) { const m = (lo + hi) / 2; apply(m); if (pen() < 0.004) hi = m; else lo = m; }
      apply(hi); worstLeft = Math.max(worstLeft, pen());
    }
    return worstLeft;
  }
  // Four-legged riders keep their sitting pose (splayed dog legs look wrong): only the tail lifts; the settle step below
  // raises the whole body so it sits on top of the seat.
  const chains = a.body.rig.quad ? [[['tail0', 'tail1', 'tail2', 'tail3'], false]] : [...LEGS.slice(0, 2).map((n) => [n, false]), ...ARMS.map((n) => [n, true])];
  for (const [names, grip] of chains) {
    const bones = names.map((n) => M[n]).filter(Boolean); if (bones.length < 2) continue;
    const root = bones[0], mid = bones[1];
    const pen = () => depthOf(limbPoints(bones), equip, ground, radius * (grip ? 2 : 1), grip); // hands: more margin (palms are wider than the wrist bone)
    const p0 = pen(); if (p0 < 0.004) continue;
    const ref = grip ? body : root.parent?.getWorldPosition(new THREE.Vector3());
    const out = Math.sign(side.dot(mid.getWorldPosition(new THREE.Vector3()).sub(ref || new THREE.Vector3()))) || (names[0].startsWith('l') ? 1 : -1);
    const rq0 = root.quaternion.clone(), mq0 = mid.quaternion.clone();
    undo.push([root, rq0.clone()], [mid, mq0.clone()]);
    const apply = (abd, lift, flex) => {
      root.quaternion.copy(rq0); mid.quaternion.copy(mq0); root.updateMatrixWorld(true);
      if (abd) rotWorld(root, fwd, out * abd);   // swing the limb outward, sideways
      if (lift) rotWorld(root, side, -lift);     // raise it forward (knee up / arm up)
      if (flex) rotWorld(mid, side, grip ? -flex : flex); // bend the knee / elbow
    };
    let best = { d: p0, abd: 0, lift: 0, flex: 0 };
    search: for (const flex of [0, 0.3, 0.6]) for (const lift of [0, 0.2, -0.2, 0.4, -0.4, 0.6, 0.8]) for (let abd = 0; abd <= 0.95; abd += 0.1) {
      if (!flex && !lift && !abd) continue;
      apply(abd, lift, flex); const d = pen();
      if (d < best.d - 1e-4) best = { d, abd, lift, flex };
      if (d < 0.004) break search;
    }
    apply(best.abd, best.lift, best.flex);
    worstLeft = Math.max(worstLeft, best.d);
  }
  // Settle: the body rests ON the seat — nothing of the hips, thighs or folded legs sinks into the equipment.
  const sitPts = [];
  for (const k of ['hips', 'lThigh', 'rThigh', 'lShin', 'rShin', 'lRLeg', 'rRLeg', 'lRLwr', 'rRLwr', 'lRHock', 'rRHock', 'lFLwr', 'rFLwr']) { const b = M[k]; if (b) sitPts.push(b.getWorldPosition(new THREE.Vector3())); }
  for (const names of LEGS) { const bones = names.map((n) => M[n]).filter(Boolean); if (bones.length >= 2) sitPts.push(...limbPoints(bones)); }
  let sink = 0; for (const p of sitPts) for (const eq of equip) { const r = equipSD(eq, p); const d = radius * 0.9 - r.d; if (r.d < radius && d > sink) sink = d; }
  if (sink > 0.002) { const dy = Math.min(0.1, sink); a.holder.position.y += dy / (a.holder.parent ? new THREE.Vector3().setFromMatrixScale(a.holder.parent.matrixWorld).y : 1); a.holder.updateMatrixWorld(true); a.body.settled = dy; }
  return worstLeft;
}

// ---------- the full check ----------
function actorPoints(a, max = 1400) {
  const meshes = []; a.holder.traverse((m) => { if (m.isMesh && m.visible && m.geometry?.attributes?.position && !m.userData.noClearance) meshes.push(m); });
  const total = meshes.reduce((s, m) => s + m.geometry.attributes.position.count, 0);
  const stride = Math.max(1, Math.floor(total / max));
  const map = a.body?.rig?.map || {}; const keyOf = new Map(Object.entries(map).map(([k, b]) => [b?.name, k]));
  const out = [];
  for (const m of meshes) {
    const pos = m.geometry.attributes.position; const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    const bones = m.isSkinnedMesh ? m.skeleton.bones : null;
    for (let i = 0; i < pos.count; i += stride) {
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld);
      let part = null;
      if (bones && si) {
        let best = 0, bi = 0; for (let k = 0; k < 4; k++) { const ww = sw.getComponent(i, k); if (ww > best) { best = ww; bi = si.getComponent(i, k); } }
        for (let b = bones[bi]; b && !part; b = b.parent) part = keyOf.get(b.name) || null;
      }
      out.push({ p: v.clone(), part });
    }
  }
  return out;
}
const ray = new THREE.Raycaster();
const dbl = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
/** The posed (skinned) meshes of an actor baked into static world-space meshes, once per check: raycasting a skinned
 *  mesh re-skins every vertex for every ray, which made the inside test thousands of times slower. */
function baked(o) {
  if (o._baked) return o._baked;
  o._baked = o.meshes.map((m) => {
    if (!m.isSkinnedMesh) return m;
    const src = m.geometry; const n = src.attributes.position.count; const arr = new Float32Array(n * 3); const q = new THREE.Vector3();
    for (let i = 0; i < n; i++) { m.getVertexPosition(i, q); q.applyMatrix4(m.matrixWorld); arr[i * 3] = q.x; arr[i * 3 + 1] = q.y; arr[i * 3 + 2] = q.z; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); if (src.index) g.setIndex(src.index);
    g.computeBoundingSphere(); g.computeBoundingBox();
    const bm = new THREE.Mesh(g, dbl); bm.updateMatrixWorld(true); return bm;
  });
  return o._baked;
}
function inside(p, meshes) {
  let votes = 0;
  for (const dir of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0.13).normalize()]) {
    ray.set(p, dir); ray.far = 50; const hits = ray.intersectObjects(meshes, false);
    let n = 0, last = -1; for (const h of hits) { if (h.distance - last > 0.002) n++; last = h.distance; }
    if (n % 2 === 1) votes++;
  }
  return votes === 2;
}
function sceneryGrid(g, inv) {
  if (g._sceneryGrid !== undefined) return g._sceneryGrid;
  const S = 0.1, cells = new Set();
  if (g.settingObj) g.settingObj.traverse((m) => {
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const pos = m.geometry.attributes.position; const M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      if (v.y < g.surface(v.x, v.z) + 0.1) continue;
      cells.add(`${Math.floor(v.x / S)},${Math.floor(v.y / S)},${Math.floor(v.z / S)}`);
    }
  });
  g._sceneryGrid = { S, cells }; return g._sceneryGrid;
}

/**
 * Check shot group g at its current pose. Returns [{ who, against, part, depth, at }] — the deepest point per
 * (who, against) pair deeper than `tol` metres. Works in world space (the shot group sits at the origin).
 */
export function checkClearance(g, { tol = 0.02, names = [] } = {}) {
  g.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.group.matrixWorld).invert();
  const solid = g.actors.map((a, i) => {
    const meshes = []; a.holder.traverse((m) => { if (m.isMesh && m.visible) meshes.push(m); });
    return { a, i, meshes, pts: actorPoints(a), name: names[i] || `actor ${i}` };
  });
  solid.forEach((s) => { s.box = new THREE.Box3().setFromPoints(s.pts.map((x) => x.p)); });
  const grid = sceneryGrid(g, inv);
  const worst = new Map(); const note = (who, against, part, depth, p) => { if (depth <= tol) return; const k = `${who}|${against}`; const o = worst.get(k); if (!o || depth > o.depth) worst.set(k, { who, against, part, depth: +depth.toFixed(3), at: p.toArray().map((x) => +x.toFixed(2)) }); };
  const lp = new THREE.Vector3();
  for (const s of solid) {
    if (s.a.sky) continue;
    const isChar = s.a.kind === 'character';
    const riding = s.a.actor.ride && g.equip?.[Number(s.a.actor.ride.equip ?? 0)];
    for (const { p, part } of s.pts) {
      lp.copy(p).applyMatrix4(inv);
      const gy = g.surface(lp.x, lp.z); note(s.name, 'ground', part, gy - lp.y, p);
      (g.equip || []).forEach((eq, ei) => {
        const r = equipSD(eq, p); if (r.d >= 0) return;
        if (r.thin && GRIP.has(part)) return; // holding a bar, chain or rim
        const seatPart = riding === eq && (part === 'hips' || part === 'spine' || /Thigh|RLeg/.test(part || '') || part == null);
        note(s.name, `${eq.type}#${ei}:${r.part}`, part, seatPart ? -r.d - 0.03 : -r.d, p);
      });
      if (grid.cells.size && lp.y > gy + 0.12) { const S = grid.S; if (grid.cells.has(`${Math.floor(lp.x / S)},${Math.floor(lp.y / S)},${Math.floor(lp.z / S)}`)) note(s.name, 'scenery', part, 0.05, p); }
      if (!isChar && s.a.kind !== 'prop') continue;
      for (const o of solid) {
        if (o === s || o.a.sky || !o.box.containsPoint(p)) continue;
        if (inside(p, baked(o))) note(s.name, o.name, part, 0.05, p);
      }
    }
  }
  return [...worst.values()].sort((a, b) => b.depth - a.depth);
}
