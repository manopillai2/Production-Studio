// Face animation for rigged characters. Meshy rigs the body only (no face bones), so the studio adds its own:
//  - eyelids that blink, in the character's skin colour, and
//  - a singing mouth while that character sings a lyric line: syllable shapes (a, e, ee, o, oo, m/b/p closed, f/v)
//    from the lyric text, timed to the loudness peaks of the vocals.
// Both are small meshes attached to the HEAD bone, so they follow every body move, head turn and walk.
// Placement: the painted eyes and mouth are found on the model's texture (dark / red areas on the front of
// the head). If that fails, typical cartoon proportions are used. Everything is deterministic, so the
// preview and the MP4 export look the same.
import * as THREE from 'three';
import { measureBox } from './three-common.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ---------- texture sampling ----------
const texPixels = new Map(); // texture uuid -> {data, w, h} | null
function pixelsOf(tex) {
  if (!tex?.image) return null;
  if (texPixels.has(tex.uuid)) return texPixels.get(tex.uuid);
  let out = null;
  try {
    const img = tex.image; const w = Math.min(512, img.width || 512); const h = Math.min(512, img.height || 512);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, w, h);
    out = { data: ctx.getImageData(0, 0, w, h).data, w, h };
  } catch { out = null; }
  texPixels.set(tex.uuid, out);
  return out;
}
const fract = (x) => x - Math.floor(x);
/** Colour of the model's surface at a ray hit: texture × base colour (0..1 rgb). */
function colourAt(hit) {
  const mats = [].concat(hit.object.material); const m = mats[hit.face?.materialIndex ?? 0] || mats[0];
  const base = m?.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1];
  const px = m?.map && hit.uv ? pixelsOf(m.map) : null;
  if (!px) return base;
  // glTF textures use flipY = false: uv (0,0) is the top-left of the image.
  const x = Math.min(px.w - 1, Math.floor(fract(hit.uv.x) * px.w)); const y = Math.min(px.h - 1, Math.floor(fract(hit.uv.y) * px.h));
  const i = (y * px.w + x) * 4;
  const srgb = (v) => (v / 255) ** 2.2; // texture is sRGB; base colour is linear
  return [srgb(px.data[i]) * base[0], srgb(px.data[i + 1]) * base[1], srgb(px.data[i + 2]) * base[2]];
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---------- finding the face ----------
const layouts = new Map(); // model key -> layout in head-bone space (or null = no face)

/** Static copy of the triangles of `obj` whose three corners pass `keep` (world space, skinning applied). */
function bakeRegion(obj, keep) {
  const out = []; const v = new THREE.Vector3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry; const pos = g.attributes.position; const uv = g.attributes.uv; const idx = g.index;
    const n = pos.count; const world = new Float32Array(n * 3); const nrm = g.attributes.normal; const wn = nrm ? new Float32Array(n * 3) : null;
    const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld); const q = new THREE.Vector3();
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); world[i * 3] = v.x; world[i * 3 + 1] = v.y; world[i * 3 + 2] = v.z;
      if (wn) { q.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); wn[i * 3] = q.x; wn[i * 3 + 1] = q.y; wn[i * 3 + 2] = q.z; } }
    const mats = [].concat(o.material);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : n, materialIndex: 0 }];
    for (const gr of groups) {
      const P = [], U = [], N = [];
      for (let t = gr.start; t < gr.start + gr.count; t += 3) {
        const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
        if (!ids.every((i) => keep({ x: world[i * 3], y: world[i * 3 + 1], z: world[i * 3 + 2] }))) continue;
        for (const i of ids) { P.push(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]); if (uv) U.push(uv.getX(i), uv.getY(i)); if (wn) N.push(wn[i * 3], wn[i * 3 + 1], wn[i * 3 + 2]); }
      }
      if (!P.length) continue;
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      if (uv) bg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      if (wn) bg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else bg.computeVertexNormals();
      bg.computeBoundingSphere(); bg.computeBoundingBox();
      const m = new THREE.Mesh(bg, mats[gr.materialIndex ?? 0] || mats[0]); m.updateMatrixWorld(true);
      out.push(m);
    }
  });
  return out;
}

/**
 * Work out where the eyes and mouth are, in the head bone's local space. `obj` must be in its rest pose
 * and not yet parented (its own world frame: Y up, the character faces +Z).
 */
function findFace(obj, head) {
  const box = measureBox(obj); // also poses the skeleton, so skinned vertices are in their rest positions
  const h = box.getSize(new THREE.Vector3()).y || 1;
  const H = head.getWorldPosition(new THREE.Vector3());
  // Raycasting a skinned mesh skins every vertex for every ray (slow). Bake the area around the head once into
  // plain triangles (same uvs and materials), and cast all rays against that.
  const meshes = bakeRegion(obj, (v) => Math.abs(v.x - H.x) < 0.45 * h && v.y > H.y - 0.45 * h);
  // The face can point sideways in the rest pose (Meshy rigs mark the face with a "headfront" bone). Turn the baked
  // head so the face looks along +Z, search there, and turn the results back at the end.
  let yaw = 0; let frontBone = null; obj.traverse((o) => { if (!frontBone && /headfront/i.test(o.name || '')) frontBone = o; });
  if (frontBone) { const f = frontBone.getWorldPosition(new THREE.Vector3()).sub(H); if (Math.hypot(f.x, f.z) > 1e-4 * h) yaw = Math.atan2(f.x, f.z); }
  const toFace = new THREE.Matrix4().makeTranslation(H.x, H.y, H.z).multiply(new THREE.Matrix4().makeRotationY(-yaw)).multiply(new THREE.Matrix4().makeTranslation(-H.x, -H.y, -H.z));
  const fromFace = toFace.clone().invert(); const unYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  for (const m of meshes) { if (yaw) m.geometry.applyMatrix4(toFace); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere(); }
  const fbox = new THREE.Box3(); for (const m of meshes) fbox.union(m.geometry.boundingBox);
  if (!meshes.length) { console.warn("Face: no mesh near the head"); return null; }
  const ray = new THREE.Raycaster();
  const front = fbox.max.z + h * 0.5;
  const cast = (x, y) => { ray.set(new THREE.Vector3(x, y, front), new THREE.Vector3(0, 0, -1)); ray.far = front - fbox.min.z + 1; return ray.intersectObjects(meshes, false)[0] || null; };

  // 1) Head top: scan upward from the head bone until the rays stop hitting.
  let top = null;
  for (let k = 0; k <= 40; k++) { const y = H.y + h * 0.012 * k; if (y > box.max.y + h * 0.01) break; if (cast(H.x, y)) top = y; else if (top != null) break; }
  if (top == null) { console.warn("Face: head top not found"); return null; }
  const L = Math.max(h * 0.08, top - H.y); // head height from the head bone to the crown
  const cx = H.x;

  // 2) Sample the front of the head on a wide grid (ears or hair can make the head look taller than the face is).
  const NX = 25, NY = 33; const span = 0.8 * L; const cell = (2 * span) / (NX - 1);
  const cells = []; const grid = new Map();
  for (let j = 0; j < NY; j++) {
    const y = H.y + (-0.8 + 1.8 * (j / (NY - 1))) * L; // four-legged heads: the face can hang below the head bone
    for (let i = 0; i < NX; i++) {
      const x = cx - span + i * cell; const hit = cast(x, y);
      if (hit) { const c = { i, j, x, y, z: hit.point.z, c: colourAt(hit) }; c.l = lum(c.c); cells.push(c); grid.set(`${i},${j}`, c); }
    }
  }
  if (cells.length < 40) { console.warn("Face: face not found (" + cells.length + " hits)"); return null; }
  const avg = (list, f) => list.reduce((t, x) => t + f(x), 0) / Math.max(1, list.length);
  const median = (arr) => { const a = [...arr].sort((p, q) => p - q); return a[Math.floor(a.length / 2)] ?? 0; };
  const skinLum = median(cells.map((c) => c.l));
  // Connected groups of cells (8-neighbours) that pass a test.
  const groups = (test) => {
    const seen = new Set(); const out = [];
    for (const c of cells) {
      if (seen.has(c) || !test(c)) continue;
      const g = []; const stack = [c]; seen.add(c);
      while (stack.length) { const a = stack.pop(); g.push(a); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const b = grid.get(`${a.i + di},${a.j + dj}`); if (b && !seen.has(b) && test(b)) { seen.add(b); stack.push(b); } } }
      out.push({ cells: g, x: avg(g, (q) => q.x), y: avg(g, (q) => q.y), n: g.length, r: Math.sqrt(g.length / Math.PI) * cell + cell * 0.35 });
    }
    return out;
  };

  // 3) Eyes: the best PAIR of dark spots side by side (similar height, sensible spacing, similar size).
  const darkSpots = groups((c) => c.l < skinLum * 0.45).filter((g) => g.n <= 40);
  // Eyes usually have a light rim (whites / sclera) around the dark pupil; eyebrows and fur patches don't.
  const whiteRing = (g) => {
    const ring = new Set();
    for (const c of g.cells) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const b = grid.get(`${c.i + di},${c.j + dj}`); if (b && !g.cells.includes(b)) ring.add(b); }
    return ring.size ? [...ring].filter((b) => b.l > skinLum * 1.25).length / ring.size : 0;
  };
  for (const g of darkSpots) g.white = whiteRing(g);
  const pairs = [];
  for (let a = 0; a < darkSpots.length; a++) for (let b = a + 1; b < darkSpots.length; b++) {
    const A = darkSpots[a], B = darkSpots[b]; const sep = Math.abs(A.x - B.x); const dy = Math.abs(A.y - B.y);
    if (sep < 0.15 * L || sep > 0.75 * L || dy > 0.25 * sep) continue;
    if (Math.min(A.n, B.n) / Math.max(A.n, B.n) < 0.4) continue; // a pair of eyes is about the same size (a hair patch next to one eye is not)
    const score = Math.min(A.n, B.n) * 2 + A.n + B.n - dy / cell - Math.abs(A.n - B.n) * 0.5 + (A.white + B.white) * 6;
    pairs.push({ score, sep, y: (A.y + B.y) / 2, x: (A.x + B.x) / 2, l: A.x > B.x ? A : B, r: A.x > B.x ? B : A });
  }
  pairs.sort((p, q) => q.score - p.score);
  let best = pairs[0] || null;
  // Eyebrows sit just above the eyes: if a decent pair lies right below the winner, those are the eyes.
  if (best) {
    const below = pairs.find((p) => p !== best && p.score >= best.score * 0.35 && best.y - p.y > 0.08 * best.sep && best.y - p.y < 0.9 * best.sep && Math.abs(p.x - best.x) < 0.3 * best.sep && Math.abs(p.sep - best.sep) < 0.5 * best.sep);
    if (below) best = below;
  }
  let le, re, found = 'texture';
  if (best) { le = best.l; re = best.r; }
  else { const y = H.y + 0.45 * L; le = { x: cx + 0.17 * L, y, r: 0.1 * L }; re = { x: cx - 0.17 * L, y, r: 0.1 * L }; found = 'proportions'; }
  const sep = Math.abs(le.x - re.x); const fx = (le.x + re.x) / 2; // the face's centre line
  const eyeR = THREE.MathUtils.clamp((le.r + re.r) / 2, 0.12 * sep, 0.45 * sep);
  const eyeY = (le.y + re.y) / 2;
  // Eyelid colour = the surface just above the eyes (fur, skin…), not the muzzle.
  const brow = cells.filter((c) => [le, re].some((e) => { const d = Math.hypot(c.x - e.x, c.y - e.y); return c.y > e.y && d > eyeR * 1.2 && d < eyeR * 2.4; }) && c.l > skinLum * 0.45);
  const skinSrc = brow.length ? brow : cells.filter((c) => Math.abs(c.l - skinLum) < skinLum * 0.2);
  const skin = skinSrc.length ? [0, 1, 2].map((k) => median(skinSrc.map((c) => c.c[k]))) : [0.8, 0.7, 0.6];

  // 4) Mouth: below the eyes on the centre line, the dark/red mark right under the nose (the nose is the top one).
  //    Collars, scarves and buttons further down are ignored.
  const near = (c) => { const ns = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([di, dj]) => grid.get(`${c.i + di},${c.j + dj}`)).filter(Boolean); return ns.length ? median(ns.map((q) => q.l)) : skinLum; };
  const reddish = ([r, g, b]) => r > g * 1.4 && r > b * 1.3 && lum([r, g, b]) < skinLum * 1.6; // not light pink blush
  const chin = Math.max(eyeY - 0.9 * sep, H.y - 0.55 * L); // never below the chin (collars, buttons, pockets are not the mouth)
  const inZone = (c) => c.y < eyeY - eyeR * 0.9 && c.y > chin && Math.abs(c.x - fx) < 0.3 * sep; // centre line only (cheek blush is to the sides)
  const marks = groups((c) => inZone(c) && (c.l < near(c) * 0.6 || reddish(c.c))).filter((g) => g.n <= 30).sort((p, q) => q.y - p.y); // top first: nose, then mouth
  let mouth;
  // The nose can show up as several marks (nose + nostrils): the mouth is the first mark clearly BELOW the nose.
  const noseBottom = marks.length ? Math.min(...marks[0].cells.map((c) => c.y)) : 0;
  const below = marks.slice(1).find((g) => { const top = Math.max(...g.cells.map((c) => c.y)); return top < noseBottom - cell * 1.2 && top > noseBottom - 0.5 * sep; });
  // A tall first mark is nose + nostrils + mouth painted touching each other: the mouth is its bottom.
  if (below || (marks.length === 1 && marks[0].y < eyeY - 0.6 * sep)) {
    const m = below || marks[0];
    const xsM = m.cells.map((c) => c.x);
    // Hang the opening from the LOWEST painted cells of the mark (the smile line), not from the nostrils above it.
    const lowY = Math.min(...m.cells.map((c) => c.y)); const low = m.cells.filter((c) => c.y < lowY + cell * 0.5);
    mouth = { x: avg(low, (c) => c.x), y: lowY + cell * 0.3, w: Math.max(...xsM) - Math.min(...xsM) + cell };
  } else if (marks.length >= 1 && Math.max(...marks[0].cells.map((c) => c.y)) - noseBottom >= cell * 2.5) {
    mouth = { x: marks[0].x, y: noseBottom + cell * 0.5, w: 0.45 * sep };
  } else if (marks.length >= 1) {
    mouth = { x: marks[0].x, y: noseBottom - Math.max(eyeR * 0.9, cell * 1.5), w: 0.45 * sep }; // only the nose found: mouth just below it
  } else mouth = { x: fx, y: eyeY - 0.8 * sep, w: 0.45 * sep };
  mouth.w = THREE.MathUtils.clamp(mouth.w, 0.3 * sep, 0.8 * sep);

  // Surface point + normal (from neighbouring depths) for placing a part flat on the face.
  const d = cell * 0.7;
  const surf = (x, y) => {
    const p = cast(x, y); if (!p) return null;
    const zx1 = cast(x + d, y)?.point.z ?? p.point.z, zx0 = cast(x - d, y)?.point.z ?? p.point.z;
    const zy1 = cast(x, y + d)?.point.z ?? p.point.z, zy0 = cast(x, y - d)?.point.z ?? p.point.z;
    const n = new THREE.Vector3(-(zx1 - zx0) / (2 * d), -(zy1 - zy0) / (2 * d), 1).normalize();
    if (n.z < 0.35) n.set(0, 0, 1);
    return { p: p.point.clone(), n };
  };
  const place = (x, y, lift) => { const s = surf(x, y); if (!s) return null; s.p.addScaledVector(s.n, lift); return s; };
  const lift = 0.04 * sep;
  // Eyelid pivot = the top of each eye (the lid hangs down from there).
  // Eyes often bulge out of the head, so the lid goes in front of the most forward point of the eye.
  // The face may be turned a little in the rest pose: its forward direction is square to the line between the eyes.
  const eL = cast(le.x, le.y)?.point, eR = cast(re.x, re.y)?.point;
  const fwd = eL && eR ? new THREE.Vector3().crossVectors(new THREE.Vector3(eL.x - eR.x, 0, eL.z - eR.z), new THREE.Vector3(0, 1, 0)).normalize() : new THREE.Vector3(0, 0, 1);
  if (!(fwd.z > 0.3)) fwd.set(0, 0, 1);
  const lids = [le, re].map((e) => {
    const topHit = cast(e.x, e.y + eyeR * 1.1); const centre = cast(e.x, e.y); if (!centre) return null;
    let maxP = -Infinity;
    for (let a = 0; a < 12; a++) for (const f of [0, 0.5, 0.95]) { const hit = cast(e.x + Math.cos(a * Math.PI / 6) * eyeR * f, e.y + Math.sin(a * Math.PI / 6) * eyeR * f); if (hit) maxP = Math.max(maxP, hit.point.dot(fwd)); }
    const top = topHit ? topHit.point.clone() : centre.point.clone().setY(e.y + eyeR * 1.1);
    const p = top.addScaledVector(fwd, Math.max(0, maxP - top.dot(fwd)) + lift);
    return { p, n: fwd.clone() };
  }).filter(Boolean);
  if (mouth.y < chin) mouth.y = Math.max(chin, eyeY - 0.75 * sep);
  const mo = place(mouth.x, mouth.y, lift * 0.8);
  if (mo && (mo.p.distanceTo(H) > 1.1 * L || mo.p.y < H.y - 0.6 * L)) { console.warn('Face: mouth would not be on the head; no face overlay'); return null; }
  if (lids.length < 2 || !mo) { console.warn("Face: lids " + lids.length + " mouth " + !!mo); return null; }
  // The face is curved: measure how far the surface falls back from the mouth's plane on a grid (in mouth units:
  // x × width, y × 0.7·width), so the drawn mouth can bend with the face instead of floating like a flat sticker.
  const bend = (() => {
    const w = mouth.w; const n = mo.n.clone().normalize();
    const X = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize(); const Y = new THREE.Vector3().crossVectors(n, X).normalize();
    const dz = []; let lowest = 0;
    for (let j = 0; j < MP.ny; j++) {
      const v = MP.y1 - ((MP.y1 - MP.y0) * j) / (MP.ny - 1); // rows from the top, like PlaneGeometry
      for (let i = 0; i < MP.nx; i++) {
        const u = MP.x0 + ((MP.x1 - MP.x0) * i) / (MP.nx - 1);
        const P = mo.p.clone().addScaledVector(X, u * w).addScaledVector(Y, v * 0.7 * w);
        const hit = cast(P.x, P.y);
        const d = hit ? (hit.point.clone().sub(mo.p).dot(n) + lift * 0.8) / w : null;
        dz.push(d); if (d != null) lowest = Math.min(lowest, d);
      }
    }
    return dz.map((d) => (d == null ? lowest : Math.max(d, lowest)));
  })();
  const paint = (() => {
    const w = mouth.w; const n = mo.n.clone().normalize();
    const X = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize(); const Y = new THREE.Vector3().crossVectors(n, X).normalize();
    const centreHit = cast(mo.p.x, mo.p.y);
    const cm = centreHit ? (Array.isArray(centreHit.object.material) ? centreHit.object.material[centreHit.face?.materialIndex || 0] : centreHit.object.material) : null;
    const map = cm?.map; if (!map) return null;
    const tris = []; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
    const plane = (p) => { const d = p.clone().sub(mo.p); return [d.dot(X) / w, d.dot(Y) / (0.7 * w), d.dot(n) / w]; };
    for (const m of meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const g = m.geometry; const pos = g.attributes.position, uvA = g.attributes.uv; if (!uvA) continue;
      const idx = g.index; const count = idx ? idx.count : pos.count;
      const groupMat = (k) => { if (!g.groups?.length) return mats[0]; const gr = g.groups.find((q) => k >= q.start && k < q.start + q.count); return mats[gr?.materialIndex || 0]; };
      for (let k = 0; k < count; k += 3) {
        const i0 = idx ? idx.getX(k) : k, i1 = idx ? idx.getX(k + 1) : k + 1, i2 = idx ? idx.getX(k + 2) : k + 2;
        a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
        const P = [a, b, c].map(plane);
        const bx0 = Math.min(P[0][0], P[1][0], P[2][0]), bx1 = Math.max(P[0][0], P[1][0], P[2][0]), by0 = Math.min(P[0][1], P[1][1], P[2][1]), by1 = Math.max(P[0][1], P[1][1], P[2][1]);
        if (bx1 < MP.x0 || bx0 > MP.x1 || by1 < MP.y0 || by0 > MP.y1) continue; // does not overlap the mouth area (a big triangle can cover it with all corners outside)
        if (P.some((q) => q[2] < -2.2)) continue; // the back of the head (several mouth-widths behind), not the face // the back of the head, not the face
        nn.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize(); if (nn.dot(n) < -0.95) continue; // facing far away (the painted smile is carved in: its inner walls face up/down and must be repainted too)
        if (groupMat(k)?.map !== map) continue;
        tris.push(P.map((q, j) => [q[0], q[1], uvA.getX([i0, i1, i2][j]), uvA.getY([i0, i1, i2][j])]));
      }
    }
    return tris.length ? { map, tris } : null;
  })();

  // The mouth layer: a thin skin of the face itself around the mouth (a decal), cut out of the head's triangles and
  // projected along the face's forward direction. It lies exactly ON the face (no floating sticker, no gaps), and the
  // mouth is drawn on it as a sharp picture, so the edges stay clean at any size (painting into Meshy's texture, which
  // is cut into many small scattered pieces, gave torn edges).
  // Skin colour right around the mouth (a ring just outside the painted mouth; dark and strongly red marks left out):
  // the cover over the painted smile must match THIS skin, not the forehead's.
  const mouthSkin = (() => {
    const out = []; const w = mouth.w;
    for (let a = 0; a < 24; a++) for (const r of [0.95, 1.15, 1.35]) {
      const hit = cast(mouth.x + Math.cos((a / 24) * Math.PI * 2) * r * w, mouth.y + 0.12 * w + Math.sin((a / 24) * Math.PI * 2) * r * 0.75 * w);
      if (hit) out.push(colourAt(hit));
    }
    if (out.length < 8) return null;
    const L0 = median(out.map(lum));
    const ok = out.filter((c) => lum(c) > L0 * 0.7 && !(c[0] > c[1] * 2.2 && c[0] > c[2] * 2.2));
    const src = ok.length >= 6 ? ok : out;
    return [0, 1, 2].map((k) => median(src.map((c) => c[k])));
  })();
  // Skin colour around the eyes (for the blinking lids): a ring around each eye, dark marks (brows, lashes, hair) left out.
  const eyeSkin = (() => {
    const out = [];
    for (const e of [le, re]) for (let a = 0; a < 24; a++) for (const r of [1.35, 1.6]) { const hit = cast(e.x + Math.cos((a / 24) * Math.PI * 2) * r * eyeR, e.y + Math.sin((a / 24) * Math.PI * 2) * r * eyeR); if (hit) out.push(colourAt(hit)); }
    if (out.length < 8) return null;
    const L0 = median(out.map(lum)); const ok = out.filter((c) => lum(c) > L0 * 0.8 && !(c[0] > c[1] * 2.2 && c[0] > c[2] * 2.2));
    const src = ok.length >= 6 ? ok : out; return [0, 1, 2].map((k) => median(src.map((c) => c[k])));
  })();
  const faceMat = (() => { const h = cast(mo.p.x, mo.p.y + 0.6 * mouth.w); const mats = h ? [].concat(h.object.material) : []; return mats[h?.face?.materialIndex ?? 0] || mats[0] || null; })();
  // Express in head-bone space.
  // three.js's attach() converts a world transform into the bone's local one, whatever the bone's scale or
  // rotation (Meshy rigs are often in centimetres with rotated bones). Depth scales with the width.
  head.updateMatrixWorld(true);
  const toHead = (s, w, hgt) => {
    const tmp = new THREE.Object3D();
    const wp = s.p.clone().applyMatrix4(fromFace); const wn = s.n.clone().applyQuaternion(unYaw); // back from the face frame to the model
    tmp.position.copy(wp); tmp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), wn); tmp.scale.set(w, hgt, w);
    tmp.updateMatrixWorld(true);
    head.attach(tmp);
    const out = { pos: tmp.position.clone(), quat: tmp.quaternion.clone(), scale: tmp.scale.clone() };
    head.remove(tmp);
    return out;
  };
  return {
    found, skin, debug: { yaw: +THREE.MathUtils.radToDeg(yaw).toFixed(1), L, h, cell, skinLum, whites: best ? [best.l.white, best.r.white].map((x) => +x.toFixed(2)) : null, marks: marks.length, eyes: [le, re].map((e) => [+(e.x - cx).toFixed(3), +(e.y - H.y).toFixed(3), +e.r.toFixed(3)]), mouth: [+(mouth.x - cx).toFixed(3), +(mouth.y - H.y).toFixed(3), +mouth.w.toFixed(3)] },
    lids: lids.map((s) => toHead(s, eyeR * 2.15, eyeR * 2.2)),
    mouth: { ...toHead(mo, mouth.w, mouth.w * 0.7), bend }, paint, mouthSkin, eyeSkin, faceMat: faceMat ? { roughness: faceMat.roughness ?? 0.75, metalness: faceMat.metalness ?? 0 } : null,
  };
}

// Unit shapes: an eyelid that hangs from its top edge (scale.y 0→1 closes the eye), and a mouth that opens downward.
// The lid is a shallow dome (half an ellipsoid facing forward), so it wraps the eyeball instead of looking like a sticker.
const lidGeo = (() => { const g = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateX(Math.PI / 2); g.scale(1, 1, 0.22); g.translate(0, -0.5, 0); return g; })();
// The mouth is drawn on a small canvas each frame (lips, teeth, tongue, any shape), shown on a plane on the face.
// While a character sings, the drawn mouth REPLACES the painted one: a soft skin-coloured patch hides the painted
// smile, and the singing mouth is drawn at the same size. Units: the painted mouth's width is about 2 (x -1..1),
// its BOTTOM edge is y = 0 (the face finder anchors on the lowest painted cells), its smile line about y = 0.3.
const MP = { x0: -1.9, x1: 1.9, y0: -1.4, y1: 1.2, px: 640, nx: 29, ny: 21 };
const PG = { nx: 15, ny: 11 }; // grid for painting the mouth into the skin texture

/**
 * Paint the singing mouth INTO the character's skin texture (the picture wrapped around the model), so it bends with
 * the face, is lit and shaded like the cheeks, and can never float or cut through. Only a small rectangle of the
 * texture around the mouth is rewritten (on the GPU), and put back as it was when the character stops singing.
 */
function texturePainter(paint, mouthCanvas, drawBase) {
  const map = paint?.map; const img = map?.image;
  const W = img?.width, H = img?.height;
  if (!img || !W || !H || !paint.tris?.length) { console.warn('Face paint: no texture image or triangles'); return null; }
  const MH = mouthCanvas.height;
  const T = paint.tris.map((t) => t.map(([u, v, tu, tv]) => ({ s: [((u - MP.x0) / (MP.x1 - MP.x0)) * MP.px, ((MP.y1 - v) / (MP.y1 - MP.y0)) * MH], d: [tu * W, (map.flipY ? 1 - tv : tv) * H] })));
  // The face triangles lie scattered over the texture (Meshy cuts it into many pieces): group them into small patches
  // (connected 32-px cells) and rewrite only those patches, not one huge rectangle.
  const CELL = 32; const cellOf = new Map(); const parent = [];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  T.forEach((t, i) => {
    parent[i] = i;
    const xs = t.map((p) => p.d[0]), ys = t.map((p) => p.d[1]);
    for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++) for (let cy = Math.floor(Math.min(...ys) / CELL); cy <= Math.floor(Math.max(...ys) / CELL); cy++) {
      const key = cx + ',' + cy; if (cellOf.has(key)) parent[find(i)] = find(cellOf.get(key)); else cellOf.set(key, i);
    }
  });
  const groupsBy = new Map(); T.forEach((t, i) => { const r = find(i); if (!groupsBy.has(r)) groupsBy.set(r, []); groupsBy.get(r).push(t); });
  const patches = [...groupsBy.values()].map((list) => {
    const xs = list.flatMap((t) => t.map((p) => p.d[0])), ys = list.flatMap((t) => t.map((p) => p.d[1]));
    const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2), y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
    const x1 = Math.min(W, Math.ceil(Math.max(...xs)) + 2), y1 = Math.min(H, Math.ceil(Math.max(...ys)) + 2);
    const rw = Math.max(1, x1 - x0), rh = Math.max(1, y1 - y0);
    const mk = () => { const c = document.createElement('canvas'); c.width = rw; c.height = rh; return c; };
    const orig = mk(); orig.getContext('2d', { willReadFrequently: true }).drawImage(img, x0, y0, rw, rh, 0, 0, rw, rh);
    const work = mk();
    return { list, x0, y0, rw, rh, orig, work, wctx: work.getContext('2d', { willReadFrequently: true }), origTex: new THREE.Texture(orig), workTex: new THREE.Texture(work), at: new THREE.Vector2(x0, y0) };
  });
  let wctx = null; // the patch being drawn
  const zx0 = ((MOUTH_ZONE.x0 - MP.x0) / (MP.x1 - MP.x0)) * MP.px, zx1 = ((MOUTH_ZONE.x1 - MP.x0) / (MP.x1 - MP.x0)) * MP.px;
  const zy0 = ((MP.y1 - MOUTH_ZONE.y1) / (MP.y1 - MP.y0)) * MH, zy1 = ((MP.y1 - MOUTH_ZONE.y0) / (MP.y1 - MP.y0)) * MH;
  const inZone = (t) => { const xs = t.map((p) => p.s[0]), ys = t.map((p) => p.s[1]); return Math.max(...xs) >= zx0 && Math.min(...xs) <= zx1 && Math.max(...ys) >= zy0 && Math.min(...ys) <= zy1; };
  for (const P of patches) { P.live = P.list.filter(inZone); }
  let pix = null; // the mouth drawing's pixels, for triangles seen edge-on
  const flat = (s0, s1, s2, d0, d1, d2) => { // fill with the drawing's colour where the triangle sits
    const x = Math.round((s0[0] + s1[0] + s2[0]) / 3), y = Math.round((s0[1] + s1[1] + s2[1]) / 3);
    const W2 = mouthCanvas.width; let r = 0, g = 0, b = 0, a = 0;
    if (x >= 0 && y >= 0 && x < W2 && y < MH) { const k = (y * W2 + x) * 4; r = pix[k]; g = pix[k + 1]; b = pix[k + 2]; a = pix[k + 3]; }
    if (a < 8) return;
    wctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3; const grow = (p) => [p[0] + Math.sign(p[0] - cx) * 0.7, p[1] + Math.sign(p[1] - cy) * 0.7];
    const [g0, g1, g2] = [grow(d0), grow(d1), grow(d2)];
    wctx.beginPath(); wctx.moveTo(g0[0], g0[1]); wctx.lineTo(g1[0], g1[1]); wctx.lineTo(g2[0], g2[1]); wctx.closePath(); wctx.fill();
  };
  const tri = (s0, s1, s2, d0, d1, d2) => {
    const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
    const area3 = Math.abs((d1[0] - d0[0]) * (d2[1] - d0[1]) - (d2[0] - d0[0]) * (d1[1] - d0[1]));
    if (Math.abs(den) < 40 || Math.abs(den) < area3 * 0.08) { flat(s0, s1, s2, d0, d1, d2); return; } // seen edge-on (the walls of the carved smile): a flat colour
    const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den;
    const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den;
    const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den;
    const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den;
    const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3; const grow = (p) => [p[0] + Math.sign(p[0] - cx) * 0.7, p[1] + Math.sign(p[1] - cy) * 0.7];
    const [g0, g1, g2] = [grow(d0), grow(d1), grow(d2)];
    wctx.save(); wctx.beginPath(); wctx.moveTo(g0[0], g0[1]); wctx.lineTo(g1[0], g1[1]); wctx.lineTo(g2[0], g2[1]); wctx.closePath(); wctx.clip();
    wctx.transform(a, b, c, d, e, f); wctx.drawImage(mouthCanvas, 0, 0); wctx.restore();
  };
  let painted = false; let based = false;
  // Static part, drawn once: the original texture with the skin cover over the painted mouth.
  const makeBase = () => {
    drawBase(); pix = mouthCanvas.getContext('2d').getImageData(0, 0, mouthCanvas.width, MH).data;
    for (const P of patches) { P.base = document.createElement('canvas'); P.base.width = P.rw; P.base.height = P.rh; wctx = P.base.getContext('2d', { willReadFrequently: true }); wctx.drawImage(P.orig, 0, 0); const rel = (p) => [p[0] - P.x0, p[1] - P.y0]; for (const t of P.list) tri(t[0].s, t[1].s, t[2].s, rel(t[0].d), rel(t[1].d), rel(t[2].d)); }
    based = true;
  };
  const genMips = map.generateMipmaps; // mipmaps are rebuilt once per frame, after the last patch
  return {
    region: [patches.length, patches.reduce((a, p) => a + p.rw * p.rh, 0), T.length],
    /** call BEFORE drawing the mouth into mouthCanvas the first time (it uses mouthCanvas for the cover) */
    prepare() { if (!based) makeBase(); },
    draw(renderer) {
      pix = mouthCanvas.getContext('2d').getImageData(0, 0, mouthCanvas.width, MH).data;
      patches.forEach((P, k) => {
        wctx = P.wctx; wctx.clearRect(0, 0, P.rw, P.rh); wctx.drawImage(P.base, 0, 0);
        const rel = (p) => [p[0] - P.x0, p[1] - P.y0];
        for (const t of P.live) tri(t[0].s, t[1].s, t[2].s, rel(t[0].d), rel(t[1].d), rel(t[2].d));
        P.workTex.needsUpdate = true; map.generateMipmaps = genMips && k === patches.length - 1;
        renderer.copyTextureToTexture(P.workTex, map, null, P.at);
      });
      map.generateMipmaps = genMips; painted = true;
    },
    clear(renderer) {
      if (!painted) return;
      patches.forEach((P, k) => { P.origTex.needsUpdate = true; map.generateMipmaps = genMips && k === patches.length - 1; renderer.copyTextureToTexture(P.origTex, map, null, P.at); });
      map.generateMipmaps = genMips; painted = false;
    },
    get painted() { return painted; },
  };
}

/** The mouth plane, bent to follow the face (bend = depth per grid point, from findFace). Used when painting isn't possible. */
function mouthPlane(bend) {
  const g = new THREE.PlaneGeometry(MP.x1 - MP.x0, MP.y1 - MP.y0, MP.nx - 1, MP.ny - 1); g.translate((MP.x0 + MP.x1) / 2, (MP.y0 + MP.y1) / 2, 0);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) pos.setZ(k, (bend?.[k] ?? 0) + 0.05);
  g.computeVertexNormals();
  return g;
}

/**
 * Draw one mouth shape. open 0..1 (how far the jaw drops), wide 0.5..1.2 (corners apart: "ee" wide, "oo" narrow),
 * round 0..1 (pursed lips), teeth 0..1 (upper teeth showing). Colours: skin, inside, lip, tongue.
 */
/** The skin-coloured cover that hides the painted mouth (it never changes while singing). */
function drawCover(ctx, C) {
  const W = MP.px, H = Math.round(W * (MP.y1 - MP.y0) / (MP.x1 - MP.x0)); ctx.clearRect(0, 0, W, H);
  const X = (x) => ((x - MP.x0) / (MP.x1 - MP.x0)) * W, Y = (y) => ((MP.y1 - y) / (MP.y1 - MP.y0)) * H, S = (d) => (d / (MP.x1 - MP.x0)) * W;
  // 1) hide the painted mouth (its smiling corners reach out and up): skin colour, wide and soft-edged, below the nose
  const PY = 0.08, RX = 1.62, RY = 0.92; // wide enough for the painted smile's corners, below the nose, inside the layer's edges
  const g = ctx.createRadialGradient(X(0), Y(PY), 0, X(0), Y(PY), S(RX));
  const cs = globalThis.__mouthCover || C.skin; g.addColorStop(0, cs); g.addColorStop(0.86, cs); g.addColorStop(1, cs + '00');
  ctx.save(); ctx.translate(X(0), Y(PY)); ctx.scale(1, RY / RX); ctx.translate(-X(0), -Y(PY));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(0), Y(PY), S(RX), 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

/** The area the singing mouth can ever reach (mouth units), so only those triangles are redrawn each frame. */
const MOUTH_ZONE = { x0: -0.8, x1: 0.8, y0: -1.4, y1: 0.35 };

function drawMouth(ctx, { open, wide, round, teeth }, C, size = 1) {
  const W = MP.px; drawCover(ctx, C);
  const H = Math.round(W * (MP.y1 - MP.y0) / (MP.x1 - MP.x0));
  const X = (x) => ((x - MP.x0) / (MP.x1 - MP.x0)) * W, Y = (y) => ((MP.y1 - y) / (MP.y1 - MP.y0)) * H, S = (d) => (d / (MP.x1 - MP.x0)) * W;
  // 2) Her own smile, opening: the top edge lies on the painted smile line with the corners gently raised (a smile),
  //    the bottom is round like a "D", the corners are rounded (never pointed), inside dark with a pink tongue and a
  //    soft band of upper teeth. Closed ("m", "b", "p") it is the smile line itself.
  const o = Math.max(0, Math.min(1, open));
  const LINE = 0.3;                                                  // the painted smile line (mouth units; the painted mouth's bottom is 0)
  const rx = 0.5 * size * wide * (1 - 0.22 * round);                 // half width ≈ the painted smile
  const lift = 0.1 * (1 - round);                                    // how much the corners rise (a smile); pursed lips: level
  const cy = LINE + lift;                                            // corners
  const top = LINE - 0.02;                                           // middle of the upper lip
  const depth = 0.12 + 1.0 * o * size;                               // jaw drop
  const bot = LINE - depth;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(X(-rx), Y(cy));
    ctx.bezierCurveTo(X(-rx * 0.55), Y(top), X(rx * 0.55), Y(top), X(rx), Y(cy));                                  // top: the smile line
    ctx.bezierCurveTo(X(rx * 1.02), Y(cy - depth * 0.7), X(rx * 0.6), Y(bot), X(0), Y(bot));                         // bottom right: round
    ctx.bezierCurveTo(X(-rx * 0.6), Y(bot), X(-rx * 1.02), Y(cy - depth * 0.7), X(-rx), Y(cy));                      // bottom left
    ctx.closePath();
  };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o < 0.05) { // lips together: the smile line
    ctx.beginPath(); ctx.moveTo(X(-rx), Y(cy)); ctx.bezierCurveTo(X(-rx * 0.55), Y(top - 0.06), X(rx * 0.55), Y(top - 0.06), X(rx), Y(cy));
    ctx.strokeStyle = C.inside; ctx.lineWidth = S(0.07); ctx.stroke();
    return;
  }
  ctx.save(); path(); ctx.fillStyle = C.inside; ctx.fill(); ctx.clip(); // no dark outline: with the teeth below it, it read as a black line above the mouth
  // tongue: a soft pink mound at the bottom
  ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(X(0), Y(bot + 0.01), S(rx * 0.55), S(0.06 + 0.22 * depth), 0, 0, Math.PI * 2); ctx.fill(); // small, at the bottom: the dark inside stays readable
  // upper teeth: a soft white band just under the upper lip (only when the mouth is open enough)
  if (teeth > 0.05 && o > 0.15) { // flush under the upper lip (nothing dark above the teeth)
    const tw = Math.min(0.11, 0.035 + 0.08 * teeth * o);
    ctx.beginPath(); ctx.moveTo(X(-rx), Y(cy + 0.02)); ctx.bezierCurveTo(X(-rx * 0.55), Y(top + 0.02), X(rx * 0.55), Y(top + 0.02), X(rx), Y(cy + 0.02));
    ctx.strokeStyle = '#FFFDF8'; ctx.lineCap = 'round'; ctx.lineWidth = S(2 * tw); ctx.stroke();
  }
  ctx.restore();
}

/** The eyelid on its layer (lid frame: x across the eye, y = 0 at the top of the eye, -1 at the bottom). */
const EB = { x0: -0.85, x1: 0.85, y0: -1.35, y1: 0.35 }; const EPX = 256;
function drawLid(ctx, close, C) {
  const W = EPX; ctx.clearRect(0, 0, W, W); if (close < 0.02) return;
  const X = (x) => ((x - EB.x0) / (EB.x1 - EB.x0)) * W, Y = (y) => ((EB.y1 - y) / (EB.y1 - EB.y0)) * W, S = (d) => (d / (EB.x1 - EB.x0)) * W;
  const cx = 0, cy = -0.5, R = 0.66; // the eye, a little generously
  const edge = 0.05 - close * 1.2;   // the lid's lower edge travels down as the eye closes
  const sag = 0.16;                  // the edge curves down in the middle (a round lid)
  ctx.save();
  const TOP = 0.05; // the lid starts at the top of the eye: the eyebrows above always stay visible
  ctx.beginPath(); ctx.moveTo(X(-1), Y(TOP)); ctx.lineTo(X(1), Y(TOP)); ctx.lineTo(X(1), Y(edge)); ctx.quadraticCurveTo(X(0), Y(edge - 2 * sag), X(-1), Y(edge)); ctx.closePath(); ctx.clip();
  const g = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), S(R));
  g.addColorStop(0, C.skin); g.addColorStop(0.84, C.skin); g.addColorStop(1, C.skin + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(cx), Y(cy), S(R), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (close > 0.78) { // closed: a soft curved lash line, like a sleeping smile
    ctx.beginPath(); ctx.moveTo(X(-0.46), Y(-0.5)); ctx.quadraticCurveTo(X(0), Y(-0.5 - 0.26), X(0.46), Y(-0.5));
    ctx.strokeStyle = C.lash; ctx.lineWidth = S(0.075); ctx.lineCap = 'round'; ctx.globalAlpha = Math.min(1, (close - 0.78) / 0.15); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

/**
 * The mouth layer: a COPY of the character's own face triangles around the mouth, with the same material, the same
 * uvs and the same bone weights, so it is pixel-identical to the face where nothing is drawn and moves exactly with
 * the skin. The mouth picture (canvas) is blended into its colour (and glow, for Meshy's emissive skin) through a
 * second set of uvs laid flat across the mouth. Sharp at any size; no seams, no floating, no tearing.
 */
function mouthLayer(obj, head, m, canvasTex, { box = MP, smooth = true, push = 0.45 } = {}) {
  obj.updateMatrixWorld(true); head.updateMatrixWorld(true);
  const toMouth = new THREE.Matrix4().multiplyMatrices(head.matrixWorld, new THREE.Matrix4().compose(m.pos, m.quat, m.scale)).invert();
  const all = []; obj.traverse((o) => { if (o.isSkinnedMesh && o.visible && !o.userData.mouthLayer) all.push(o); });
  const layers = all.map((best) => layerFor(best)).filter(Boolean);
  if (!layers.length) return null;
  // one handle for all pieces (the model can be split into several meshes around the mouth)
  return { get visible() { return layers[0].visible; }, set visible(x) { for (const l of layers) l.visible = x; }, layers };

  function layerFor(best) {
  const g = best.geometry; const pos = g.attributes.position, idx = g.index; const n = pos.count; const v = new THREE.Vector3();
  const mu = new Float32Array(n * 2); const inside = new Uint8Array(n); const M = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    best.getVertexPosition(i, v); v.applyMatrix4(best.matrixWorld).applyMatrix4(toMouth); // mouth units: x × width, y × 0.7·width, z × width
    M[i * 3] = v.x; M[i * 3 + 1] = v.y; M[i * 3 + 2] = v.z;
    mu[i * 2] = (v.x - box.x0) / (box.x1 - box.x0); mu[i * 2 + 1] = (v.y - box.y0) / (box.y1 - box.y0);
    inside[i] = v.x > box.x0 && v.x < box.x1 && v.y > box.y0 && v.y < box.y1 && v.z > -3 && v.z < 1.5 ? 1 : 0; // deep enough for the carved smile's groove walls
  }
  const tri = []; const count = idx ? idx.count : n;
  for (let k = 0; k < count; k += 3) { const a = idx ? idx.getX(k) : k, b = idx ? idx.getX(k + 1) : k + 1, c = idx ? idx.getX(k + 2) : k + 2; if (inside[a] && inside[b] && inside[c]) tri.push(a, b, c); } // whole triangles only: one reaching far outside would smear the picture across it
  if (!tri.length) return null;
  const sub = new THREE.BufferGeometry(); sub.setIndex(tri); // the triangles first: normals are computed from them
  for (const [name, attr] of Object.entries(g.attributes)) sub.setAttribute(name, attr); // shared vertex data, only some triangles
  // Smooth the carved smile out of the copy (membrane fill, below). The groove's walls caught the drawing at odd
  // angles (dark lines, red corner ticks); flattened, they disappear. The real model keeps its groove (the painted
  // smile shows when she isn't singing).
  if (smooth) try {
    const E = (x, y) => Math.hypot(x / 1.62, (y - 0.08) / 0.92); // the cover's ellipse (see drawCover)
    const used = new Set(tri);
    // Membrane fill: the skin around the mouth stays where it is; every point inside settles to the average depth of its
    // neighbours (like a rubber sheet stretched over the groove). It follows the face's real curve, and the groove's
    // walls collapse flat.
    // Meshy splits vertices along texture seams: join points at the same place, so the sheet is one piece.
    const keyOf = (i) => `${Math.round(M[i * 3] * 2000)},${Math.round(M[i * 3 + 1] * 2000)},${Math.round(M[i * 3 + 2] * 2000)}`;
    const K = new Map(); for (const i of used) K.set(i, keyOf(i));
    const nb = new Map(); const link = (a, b) => { if (a === b) return; if (!nb.has(a)) nb.set(a, new Set()); nb.get(a).add(b); };
    for (let k = 0; k < tri.length; k += 3) { const [a, b, c] = [K.get(tri[k]), K.get(tri[k + 1]), K.get(tri[k + 2])]; link(a, b); link(b, a); link(b, c); link(c, b); link(a, c); link(c, a); }
    const zStart = new Map(); for (const i of used) zStart.set(K.get(i), M[i * 3 + 2]);
    const innerKeys = [...zStart.keys()].filter((k) => { const [x, y] = k.split(',').map((v) => v / 2000); return E(x, y) < 0.95 && y < 0.7; }); // the mouth area, below the nose
    const Z = new Map(innerKeys.map((k) => [k, zStart.get(k)]));
    const zOf = (k) => (Z.has(k) ? Z.get(k) : zStart.get(k));
    for (let it = 0; it < 150; it++) for (const k of innerKeys) { const ns = nb.get(k); if (!ns?.size) continue; let s2 = 0; for (const j of ns) s2 += zOf(j); Z.set(k, s2 / ns.size); }
    const inner = [...used].filter((i) => Z.has(K.get(i)));
    {
      const P = new Float32Array(g.attributes.position.array);
      const toLocal = new THREE.Matrix4().multiplyMatrices(toMouth, best.matrixWorld).invert(); // mouth units → mesh space (posed)
      const moved = new Set(); const q = new THREE.Vector3(), t0 = new THREE.Vector3(), c = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; const Lm = new THREE.Matrix3();
      for (const i of inner) {
        const x = M[i * 3], y = M[i * 3 + 1], z = M[i * 3 + 2]; const zs = Z.get(K.get(i)); if (Math.abs(zs - z) < 1e-4) continue; // flatten the groove AND its rims (the layer is drawn slightly in front: mouthPush)
        q.set(x, y, zs).applyMatrix4(toLocal); // the wanted POSED position, in mesh space
        // The position attribute is in the BIND pose; skinning maps it affinely for this vertex: posed = L·bind + t.
        // Measure L and t with the vertex's own bone weights, then solve for the bind position.
        best.applyBoneTransform(i, t0.set(0, 0, 0));
        for (let a = 0; a < 3; a++) { best.applyBoneTransform(i, c[a].set(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0)); c[a].sub(t0); }
        Lm.set(c[0].x, c[1].x, c[2].x, c[0].y, c[1].y, c[2].y, c[0].z, c[1].z, c[2].z);
        if (Math.abs(Lm.determinant()) < 1e-12) continue;
        q.sub(t0).applyMatrix3(Lm.invert());
        P[i * 3] = q.x; P[i * 3 + 1] = q.y; P[i * 3 + 2] = q.z; moved.add(i);
      }
      sub.userData.smooth = { used: used.size, inner: inner.length, moved: moved.size };
      if (moved.size) {
        sub.setAttribute('position', new THREE.BufferAttribute(P, 3));
        const N0 = g.attributes.normal; if (N0) sub.setAttribute('normal', N0.clone()); // its OWN copy: computing normals must not touch the face's
        sub.computeVertexNormals(); const N = sub.attributes.normal;
        if (N0) for (let i = 0; i < n; i++) if (!moved.has(i)) N.setXYZ(i, N0.getX(i), N0.getY(i), N0.getZ(i)); // keep the face's own shading at the edges
      }
    }
  } catch (e) { console.warn('Face: smoothing the mouth layer failed:', e.message); }
  sub.setAttribute('mouthUv', new THREE.BufferAttribute(mu, 2));
  if (g.morphAttributes) sub.morphAttributes = g.morphAttributes;
  const groupsMat = Array.isArray(best.material) ? best.material[0] : best.material;
  const mat = groupsMat.clone();
  mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -4;
  // Drawn a little in front of the real face, moved along the line of sight only (so it stays in exactly the same
  // place on screen): the real lip rims and groove can never poke through the smooth layer.
  const sc = new THREE.Vector3(); head.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
  const ms = new THREE.Vector3(); best.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ms);
  const pushLocal = (push * m.scale.x * sc.x) / (ms.x || 1);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.mouthMap = { value: canvasTex }; sh.uniforms.mouthPush = { value: pushLocal };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float mouthPush;\nattribute vec2 mouthUv;\nvarying vec2 vMouthUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMouthUv = mouthUv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nmvPosition.xyz -= normalize(mvPosition.xyz) * mouthPush * length(modelViewMatrix[0].xyz);\ngl_Position = projectionMatrix * mvPosition;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D mouthMap;\nvarying vec2 vMouthUv;\nvec4 mouthC;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nmouthC = texture2D(mouthMap, vMouthUv);\ndiffuseColor.rgb = mix(diffuseColor.rgb, mouthC.rgb, mouthC.a);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_EMISSIVEMAP\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, emissive * mouthC.rgb, mouthC.a);\n#endif');
  };
  mat.customProgramCacheKey = () => 'mouthLayer';
  const layer = new THREE.SkinnedMesh(sub, mat);
  layer.bind(best.skeleton, best.bindMatrix);
  layer.position.copy(best.position); layer.quaternion.copy(best.quaternion); layer.scale.copy(best.scale);
  layer.castShadow = false; layer.receiveShadow = true; layer.frustumCulled = false; layer.userData.noClearance = true; layer.userData.mouthLayer = true; layer.renderOrder = 1;
  best.parent.add(layer);
  return layer;
  }
}

/**
 * Add a face to one rigged character. Returns a controller, or null when the model has no head bone or no
 * readable face. `key` identifies the model, so the face search runs once per model.
 */
export function addFace(obj, head, key, seed = 1, { quad = false } = {}) {
  // Four-legged characters have their eyes on the sides of a snout: the front-facing placement isn't reliable there,
  // and a lid in the wrong place looks worse than no blink, so they keep their painted face.
  if (!head || quad) return null;
  if (!layouts.has(key)) { let l = null; try { l = findFace(obj, head); } catch (e) { console.warn(`Face: could not place a face on ${key}: ${e.message}`); l = null; } layouts.set(key, l); }
  const L = layouts.get(key); if (!L) return null;
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...L.skin), roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lashMat = new THREE.MeshBasicMaterial({ color: '#2a1d22' });
  // Blinking eyelids drawn on a copy of the skin around each eye (same method as the mouth: matches the skin exactly).
  const eyeC = new THREE.Color().setRGB(...(L.eyeSkin || L.skin));
  const lidColors = { skin: '#' + eyeC.getHexString(), lash: '#3A2329' };
  const eyeLayers = L.lids.map((p) => {
    const c = document.createElement('canvas'); c.width = c.height = EPX; const ctx = c.getContext('2d');
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
    let layer = null; try { layer = mouthLayer(obj, head, p, t, { box: EB, smooth: false, push: 0.3 }); } catch (e) { console.warn('Face: eyelid layer failed:', e.message); }
    if (layer) layer.visible = false;
    return layer ? { layer, ctx, t, last: -1 } : null;
  });
  const useEyeLayers = eyeLayers.every(Boolean);
  const lids = L.lids.map((p) => {
    // Group origin = top of the eye; the lid (unit disc hanging below the origin) grows downward as it closes.
    const g = new THREE.Group(); g.position.copy(p.pos); g.quaternion.copy(p.quat);
    const inner = new THREE.Group(); inner.scale.copy(p.scale); g.add(inner);
    const lid = new THREE.Mesh(lidGeo, skinMat); inner.add(lid);
    // Closed eye: a soft lash line across the middle of the lid.
    const lash = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.07), lashMat); lash.position.set(0, -0.55, 0.115); inner.add(lash);
    head.add(g); g.visible = false;
    return { g, lid, lash };
  });
  const m = L.mouth;
  const mouthG = new THREE.Group(); mouthG.position.copy(m.pos); mouthG.quaternion.copy(m.quat);
  const mouthIn = new THREE.Group(); mouthIn.scale.copy(m.scale); mouthG.add(mouthIn);
  const canvas = document.createElement('canvas'); canvas.width = MP.px; canvas.height = Math.round(MP.px * (MP.y1 - MP.y0) / (MP.x1 - MP.x0)); const mctx = canvas.getContext('2d', { willReadFrequently: true });
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps: on surfaces seen edge-on (the smile groove's walls) the GPU would sample a blurred, shrunken copy that
  // mixes in the transparent border, and the skin underneath shows through as a smeared wedge.
  // Mipmaps ON: in medium and wide shots the mouth is only a few pixels and without them it breaks up into jagged bits
  // (round 5 feedback). The groove that once made mipmaps smear is flattened out of the mouth layer.
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 8;
  const mouthMesh = new THREE.Mesh(mouthPlane(m.bend), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  mouthIn.add(mouthMesh); head.add(mouthG); mouthG.visible = false;
  // Preferred: the mouth layer that lies on the face (decal), lit like the skin. Fallbacks: painting into the texture,
  // then a bent plane.
  let decalMesh = null;
  try { decalMesh = mouthLayer(obj, head, m, tex); if (decalMesh) decalMesh.visible = false; } catch (e) { console.warn('Face: mouth layer failed:', e.message); decalMesh = null; }
  let painter = null; if (!decalMesh) { try { painter = texturePainter(L.paint, canvas, () => drawCover(mctx, colors)); } catch (e) { console.warn('Face: mouth painting off:', e.message); painter = null; } }
  const skinC = new THREE.Color().setRGB(...(L.mouthSkin || L.skin)); // linear → shown as sRGB hex for the canvas
  const colors = { skin: '#' + skinC.getHexString(), inside: '#5A1626', tongue: '#F27C8C', lip: '#' + skinC.clone().lerp(new THREE.Color('#E0384F'), 0.8).getHexString() };
  let last = '';
  // Blink schedule: every 2.4–5 s, a little different per character; sometimes a double blink.
  const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const blinks = []; for (let t = 0.6 + rnd(0) * 2, k = 1; t < 600; k++) { blinks.push(t); if (rnd(k * 3) < 0.15) blinks.push(t + 0.32); t += 2.4 + rnd(k) * 2.6; }
  return {
    found: L.found, debug: { ...L.debug, mouth_layer: !!decalMesh, eyelid_layers: useEyeLayers, paint: painter ? painter.region : false },
    canvas,
    /** t = song time (s); open = mouth shape {open, wide, round, teeth} or a number 0..1; forceClose (tests) sets the eyelids directly. */
    pose(t, open, forceClose = null, renderer = null) {
      let close = 0; const B = 0.2; // blink length (s)
      for (const b of blinks) { if (b > t) break; const k = (t - b) / B; if (k < 1) close = Math.max(close, k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6); }
      if (forceClose != null) close = forceClose; else if (globalThis.__forceBlink != null) close = globalThis.__forceBlink; // tests
      if (useEyeLayers) {
        const q = Math.round(close * 20) / 20;
        for (const e of eyeLayers) { e.layer.visible = q > 0.02; if (q > 0.02 && q !== e.last) { drawLid(e.ctx, q, lidColors); e.t.needsUpdate = true; e.last = q; } }
        for (const l of lids) l.g.visible = false;
      } else for (const l of lids) { l.g.visible = close > 0.02; l.lid.scale.y = Math.max(0.001, close); l.lash.visible = close > 0.8; }
      const sh = typeof open === 'number' ? { open: clamp01(open), wide: 0.85 + 0.15 * clamp01(open), round: 0, teeth: 0.5 } : open;
      const singing = typeof open === 'number' ? sh.open > 0.04 : true; // an object = singing: the drawn mouth replaces the painted one
      const key = [sh.open, sh.wide, sh.round, sh.teeth].map((x) => x.toFixed(2)).join();
      if (decalMesh) {
        mouthG.visible = false; decalMesh.visible = singing;
        if (singing && key !== last) { drawMouth(mctx, sh, colors); tex.needsUpdate = true; last = key; }
      } else if (painter && renderer) {
        mouthG.visible = false;
        if (singing) { if (key !== last || !painter.painted) { painter.prepare(); drawMouth(mctx, sh, colors); painter.draw(renderer); last = key; } }
        else painter.clear(renderer);
      } else {
        mouthG.visible = singing;
        if (singing && key !== last) { drawMouth(mctx, sh, colors); tex.needsUpdate = true; last = key; }
      }
    },
  };
}

// ---------- vocals ----------
const envelopes = new Map();
/**
 * Loudness of the vocal range of the song, 60 values per second, 0..1. A band-pass around the singing voice
 * (300–3000 Hz) keeps the bass and drums from moving the mouth. Null if the audio can't be decoded.
 */
export function vocalEnvelope(url) {
  if (!url) return Promise.resolve(null);
  if (!envelopes.has(url)) envelopes.set(url, (async () => {
    const bytes = await (await fetch(url)).arrayBuffer();
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const decoded = await new Off(1, 44100, 44100).decodeAudioData(bytes);
    const sr = 22050; const off = new Off(1, Math.ceil(decoded.duration * sr), sr);
    const src = off.createBufferSource(); src.buffer = decoded;
    const hp = off.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    src.connect(hp).connect(lp).connect(off.destination); src.start();
    const data = (await off.startRendering()).getChannelData(0);
    const rate = 60; const hop = Math.floor(sr / rate); const n = Math.floor(data.length / hop); const env = new Float32Array(n);
    for (let k = 0; k < n; k++) { let s = 0; for (let j = k * hop; j < (k + 1) * hop; j += 2) s += data[j] * data[j]; env[k] = Math.sqrt(s / (hop / 2)); }
    const sorted = Array.from(env).sort((a, b) => a - b); const lo = sorted[Math.floor(n * 0.3)] || 0; const hi = sorted[Math.floor(n * 0.97)] || 1;
    for (let k = 0; k < n; k++) env[k] = clamp01((env[k] - lo) / Math.max(1e-6, hi - lo));
    return { rate, env };
  })().catch(() => null));
  return envelopes.get(url);
}

// ---------- lip sync ----------
// Mouth shapes (visemes) for the sounds of a sung syllable. open = jaw, wide = corners apart, round = pursed lips.
const VOWEL = {
  a: { open: 0.95, wide: 0.98, round: 0, teeth: 0.5 }, e: { open: 0.62, wide: 1.06, round: 0, teeth: 0.8 },
  i: { open: 0.5, wide: 1.08, round: 0, teeth: 0.9 }, o: { open: 0.8, wide: 0.78, round: 0.6, teeth: 0.1 },
  u: { open: 0.5, wide: 0.7, round: 0.85, teeth: 0 }, y: { open: 0.5, wide: 1.05, round: 0, teeth: 0.8 },
};
const CONS = { m: { open: 0, wide: 0.92, round: 0.05, teeth: 0 }, f: { open: 0.14, wide: 0.95, round: 0, teeth: 1 }, w: { open: 0.28, wide: 0.7, round: 0.8, teeth: 0 } };
// Sung vowels by spelling (good enough for nursery-rhyme English): "ow/ou" → o, "ee/ea/ey" → i, "oo" → u, final "y" → i …
function vowelOf(v) {
  v = v.toLowerCase();
  if (/^(oo|ew|ue)/.test(v)) return 'u';
  if (/^(ee|ie|ey|i)$/.test(v) || /^y/.test(v)) return 'i'; // see, high, try, bye
  if (/^(ow|ou|oa|o|au|aw)/.test(v)) return 'o';
  if (/^(ai|ay|ei|e)/.test(v)) return 'e';
  if (/^u/.test(v)) return 'a'; // up, sun, fun: an open 'uh'
  return 'a';
}
/** Split a lyric line into sung syllables: { lead: consonant class, vowel, weight }. */
export function syllables(text) {
  const out = [];
  for (const raw of String(text || '').toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean)) {
    const word = raw.replace(/'/g, '').replace(/^y(?=[aeiou])/, 'j'); // 'y' before a vowel is a consonant (yes, you)
    const parts = word.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]+$)?/g) || [word];
    // a silent final "e" ("there", "here", "time") is not its own syllable
    if (parts.length > 1 && /^[^aeiouy]*e$/.test(parts.at(-1))) { const e = parts.pop(); parts[parts.length - 1] += e; }
    parts.forEach((p, k) => {
      const lead = (p.match(/^[^aeiouy]*/) || [''])[0]; const vow = (p.match(/[aeiouy]+/) || ['a'])[0];
      const c = lead.slice(-1);
      out.push({ lead: /[mbp]/.test(c) ? 'm' : /[fv]/.test(c) ? 'f' : /w/.test(c) || lead === 'wh' ? 'w' : '', vowel: vowelOf(vow), weight: 1 + (k === parts.length - 1 ? 0.35 : 0), wordStart: k === 0 });
    });
  }
  return out;
}

const plans = new WeakMap();
/** When each syllable of a line is sung: spread over the line, then each one snapped to the nearest loudness peak. */
function syllablePlan(env, line) {
  let byLine = plans.get(env || plans); if (!byLine) { byLine = new Map(); plans.set(env || plans, byLine); }
  const key = `${line.start}|${line.text}`;
  if (byLine.has(key)) return byLine.get(key);
  const syl = syllables(line.text); const n = syl.length || 1;
  const T0 = line.start + 0.03, T1 = line.end - 0.05; const span = Math.max(0.2, T1 - T0);
  const total = syl.reduce((s, x) => s + x.weight, 0) || 1; let acc = 0;
  const centres = syl.map((x) => { const c = T0 + ((acc + x.weight * 0.45) / total) * span; acc += x.weight; return c; });
  if (env) { // snap to vocal peaks (keeping order and a minimum gap)
    const at = (t) => env.env[Math.floor(t * env.rate)] ?? 0;
    let prev = T0 - 1;
    for (let k = 0; k < n; k++) {
      const win = Math.min(0.14, (span / n) * 0.6); let best = centres[k], bv = -1;
      for (let t = centres[k] - win; t <= centres[k] + win; t += 1 / env.rate) { const v = at(t); if (v > bv && t > prev + 0.07) { bv = v; best = t; } }
      centres[k] = Math.max(best, prev + 0.07); prev = centres[k];
    }
  }
  const plan = syl.map((x, k) => ({ ...x, c: centres[k], a: k ? (centres[k - 1] + centres[k]) / 2 : T0, b: k < n - 1 ? (centres[k] + centres[k + 1]) / 2 : T1 }));
  byLine.set(key, plan);
  return plan;
}

const vocalAt = (env, t) => { if (!env) return 0.7; const k = Math.floor(t * env.rate); return (env.env[k] ?? 0) * 0.5 + (env.env[k - 1] ?? 0) * 0.3 + (env.env[k - 2] ?? 0) * 0.2; };
/** Mouth shape target (not smoothed) at song time t. */
function shapeTarget(env, t, line) {
  if (!line || t < line.start || t >= line.end) return { open: 0, wide: 0.9, round: 0, teeth: 0 };
  const plan = syllablePlan(env, line);
  const s = plan.find((x) => t >= x.a && t < x.b) || plan.at(-1);
  if (!s) return { open: 0, wide: 0.9, round: 0, teeth: 0 };
  const loud = env ? clamp01((vocalAt(env, t) - 0.08) / 0.55) : 0.8;
  const v = VOWEL[s.vowel] || VOWEL.a;
  // consonant at the start of the syllable (lips together for m/b/p, teeth on lip for f/v, pursed for w), then the vowel
  const k = (t - s.a) / Math.max(0.05, s.b - s.a);
  const lead = s.lead ? CONS[s.lead] : null;
  const leadW = lead ? clamp01(1 - (k - 0.05) / 0.25) : 0;
  const tail = clamp01((k - 0.85) / 0.15) * (s.wordStart ? 0.2 : 0.45); // close a little between syllables
  const vopen = v.open * (0.5 + 0.8 * loud) * (1 - tail);
  const mixv = (p) => (lead ? lead[p] * leadW + v[p] * (1 - leadW) : v[p]);
  return { open: clamp01(lead ? lead.open * leadW + vopen * (1 - leadW) : vopen), wide: mixv('wide'), round: mixv('round'), teeth: mixv('teeth') };
}

/** Mouth shape at song time t while a line is sung (syllable shapes timed to the vocals), smoothed like real lips. */
export function mouthShape(env, t, line) {
  if (!line) return { open: 0, wide: 0.9, round: 0, teeth: 0 };
  const W = [[0.03, 0.15], [0, 0.3], [-0.03, 0.25], [-0.06, 0.18], [-0.09, 0.12]]; // ~0.1 s of smoothing: lips glide between shapes, slightly ahead of the sound
  const o = { open: 0, wide: 0, round: 0, teeth: 0 };
  for (const [dt, w] of W) { const s = shapeTarget(env, t + dt, line); for (const k in o) o[k] += s[k] * w; }
  return o;
}

/** Mouth opening at song time t while a line is sung. Uses the vocal loudness, or a syllable rhythm without audio. */
export function mouthOpen(env, t, line, seed = 0) {
  if (!line) return 0;
  const edge = Math.min(clamp01((t - line.start) / 0.08), clamp01((line.end - t) / 0.08));
  if (env) {
    const k = Math.floor(t * env.rate); const v = (env.env[k] ?? 0) * 0.6 + (env.env[k - 1] ?? 0) * 0.25 + (env.env[k - 2] ?? 0) * 0.15;
    return edge * clamp01((v - 0.12) / 0.6);
  }
  const s = Math.abs(Math.sin(Math.PI * 4.2 * (t - line.start) + seed));
  return edge * (0.25 + 0.6 * s);
}
