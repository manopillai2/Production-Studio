// Face animation for rigged characters. Meshy rigs the body only (no face bones), so the studio adds its own:
//  - eyelids that blink, in the character's skin colour, and
//  - a mouth that opens with the song's vocals while that character sings a lyric line.
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
    const n = pos.count; const world = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); world[i * 3] = v.x; world[i * 3 + 1] = v.y; world[i * 3 + 2] = v.z; }
    const mats = [].concat(o.material);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : n, materialIndex: 0 }];
    for (const gr of groups) {
      const P = [], U = [];
      for (let t = gr.start; t < gr.start + gr.count; t += 3) {
        const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
        if (!ids.every((i) => keep({ x: world[i * 3], y: world[i * 3 + 1], z: world[i * 3 + 2] }))) continue;
        for (const i of ids) { P.push(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]); if (uv) U.push(uv.getX(i), uv.getY(i)); }
      }
      if (!P.length) continue;
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      if (uv) bg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
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
  if (!meshes.length) { console.warn("Face: no mesh near the head"); return null; }
  const ray = new THREE.Raycaster();
  const front = box.max.z + h * 0.5;
  const cast = (x, y) => { ray.set(new THREE.Vector3(x, y, front), new THREE.Vector3(0, 0, -1)); ray.far = front - box.min.z + 1; return ray.intersectObjects(meshes, false)[0] || null; };

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
    if (sep < 0.15 * L || sep > 1.2 * L || dy > 0.35 * sep) continue;
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
  const inZone = (c) => c.y < eyeY - eyeR * 0.9 && c.y > eyeY - 0.9 * sep && Math.abs(c.x - fx) < 0.3 * sep; // centre line only (cheek blush is to the sides)
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
  const mo = place(mouth.x, mouth.y, lift * 0.8);
  if (lids.length < 2 || !mo) { console.warn("Face: lids " + lids.length + " mouth " + !!mo); return null; }

  // Express in head-bone space.
  // three.js's attach() converts a world transform into the bone's local one, whatever the bone's scale or
  // rotation (Meshy rigs are often in centimetres with rotated bones). Depth scales with the width.
  head.updateMatrixWorld(true);
  const toHead = (s, w, hgt) => {
    const tmp = new THREE.Object3D();
    tmp.position.copy(s.p); tmp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n); tmp.scale.set(w, hgt, w);
    tmp.updateMatrixWorld(true);
    head.attach(tmp);
    const out = { pos: tmp.position.clone(), quat: tmp.quaternion.clone(), scale: tmp.scale.clone() };
    head.remove(tmp);
    return out;
  };
  return {
    found, skin, debug: { L, h, cell, skinLum, whites: best ? [best.l.white, best.r.white].map((x) => +x.toFixed(2)) : null, marks: marks.length, eyes: [le, re].map((e) => [+(e.x - cx).toFixed(3), +(e.y - H.y).toFixed(3), +e.r.toFixed(3)]), mouth: [+(mouth.x - cx).toFixed(3), +(mouth.y - H.y).toFixed(3), +mouth.w.toFixed(3)] },
    lids: lids.map((s) => toHead(s, eyeR * 2.15, eyeR * 2.2)),
    mouth: toHead(mo, mouth.w, mouth.w * 0.7),
  };
}

// Unit shapes: an eyelid that hangs from its top edge (scale.y 0→1 closes the eye), and a mouth that opens downward.
// The lid is a shallow dome (half an ellipsoid facing forward), so it wraps the eyeball instead of looking like a sticker.
const lidGeo = (() => { const g = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateX(Math.PI / 2); g.scale(1, 1, 0.22); g.translate(0, -0.5, 0); return g; })();
const mouthGeo = (() => { const g = new THREE.CircleGeometry(0.5, 28); g.translate(0, -0.5, 0); return g; })();
const tongueGeo = (() => { const g = new THREE.CircleGeometry(0.5, 20); g.scale(0.55, 0.4, 1); g.translate(0, -0.78, 0.002); return g; })();

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
  const mouthMesh = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ color: '#4a1a28', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const tongue = new THREE.Mesh(tongueGeo, new THREE.MeshBasicMaterial({ color: '#e0707e', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  mouthMesh.add(tongue); mouthIn.add(mouthMesh); head.add(mouthG); mouthG.visible = false;
  // Blink schedule: every 2.4–5 s, a little different per character; sometimes a double blink.
  const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const blinks = []; for (let t = 0.6 + rnd(0) * 2, k = 1; t < 600; k++) { blinks.push(t); if (rnd(k * 3) < 0.15) blinks.push(t + 0.32); t += 2.4 + rnd(k) * 2.6; }
  return {
    found: L.found, debug: L.debug,
    /** t = song time (s); open = mouth opening 0..1; forceClose (tests) sets the eyelids directly. */
    pose(t, open, forceClose = null) {
      let close = 0; const B = 0.2; // blink length (s)
      for (const b of blinks) { if (b > t) break; const k = (t - b) / B; if (k < 1) close = Math.max(close, k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6); }
      if (forceClose != null) close = forceClose;
      for (const l of lids) { l.g.visible = close > 0.02; l.lid.scale.y = Math.max(0.001, close); l.lash.visible = close > 0.8; }
      const o = clamp01(open);
      mouthG.visible = o > 0.04; mouthMesh.scale.y = Math.max(0.001, o); mouthMesh.scale.x = 0.75 + 0.25 * o;
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
