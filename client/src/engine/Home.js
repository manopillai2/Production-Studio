// A family home built in the engine (Project 07 "My Little Home"): rooms and household objects with REAL moving parts.
// Meshy makes one solid piece, so anything that switches on, spins or opens is built here: a TV whose screen plays,
// a standing fan whose blades spin, a fridge whose door opens onto a cool light, a cup a hand can hold. Rooms are
// built here too: walls that face INWARD only (from outside a wall is invisible, so the camera can stand anywhere,
// like looking into a dollhouse), windows onto the landscape, one architecture and one wood floor for the whole home.
// Everything is a function of shot time u (preview = export). Sizes in metres: Mommy ≈ 1.62 m, the child ≈ 0.95 m.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const HOME_ITEMS = ['room', 'tv', 'fan', 'fridge', 'cup', 'nightstand', 'seats', 'blanket'];
export const HOME_LABEL = { room: 'Room (living / bedroom / kitchen)', tv: 'TV (screen plays)', fan: 'Standing fan (blades spin)', fridge: 'Fridge (door opens)', cup: 'Cup (can be held)', nightstand: 'Bedside table + lamp', seats: 'Seat points (sit / lie on a model)', blanket: 'Blanket (tucks in)' };

const C = { red: '#F2545B', coral: '#FF7A6B', orange: '#FF9F1C', yellow: '#FFD23F', butter: '#FFF1B8', green: '#4CC35A', mint: '#9FE3C9', teal: '#21C7C4', sky: '#8CCBFF', blue: '#3E8BF0', lilac: '#B79CFF', purple: '#8A5CF0', pink: '#FF7EC4', white: '#FFF8F0', cream: '#FFEFD6', wood: '#E3A86B', woodDark: '#B9773F', chrome: '#DCE6F0' };
const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.02, ...extra });
const mesh = (g, c, extra) => { const m = new THREE.Mesh(g, typeof c === 'string' ? mat(c, extra) : c); m.castShadow = true; m.receiveShadow = true; return m; };
const box = (w, h, d, c, r = 0.04, extra) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), c, extra);
const cyl = (rt, rb, h, c, seg = 28, extra) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, extra);
const ball = (r, c, extra) => mesh(new THREE.SphereGeometry(r, 24, 16), c, extra);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const noCast = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.userData.noCast = true; } }); return o; };
/** Not a solid obstacle for the clearance check (walls, floor, curtains, mist, a quilt that lies ON the child). */
const noCollide = (o) => { o.traverse((m) => { if (m.isMesh) m.userData.noCollide = true; }); return o; };
const seatPoint = (name, parent, pos, rot = [0, 0, 0]) => { const o = new THREE.Object3D(); o.name = name; o.position.set(...pos); o.rotation.set(...rot, 'YXZ'); parent.add(o); return o; };

// ---------- painted textures (canvas, so no image files and no downloads) ----------
const texCache = new Map();
function canvasTex(key, w, h, draw, srgb = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  texCache.set(key, t); return t;
}
function star(g, x, y, r, fill) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fillStyle = fill; g.fill(); }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
/** Wallpaper, one tile = 1 m. Patterns are soft and low-contrast so the wall stays calm behind the characters. */
const wallpaper = (base, accent, pattern) => canvasTex(`wp|${base}|${accent}|${pattern}`, 256, 256, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  if (pattern === 'stripes') { g.fillStyle = accent; for (let x = 0; x < w; x += 64) g.fillRect(x + 8, 0, 22, h); }
  if (pattern === 'stars') for (const [x, y] of [[48, 48], [176, 112], [80, 200], [208, 232], [144, 16]]) star(g, x, y, 11, accent);
  if (pattern === 'dots') { g.fillStyle = accent; for (const [x, y] of [[32, 32], [160, 32], [96, 160], [224, 160]]) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); } }
});
/** Honey wood planks (same floor in every room: one home). One tile = 1 m. */
const woodFloor = () => canvasTex('wood', 512, 512, (g, w, h) => {
  const tones = ['#EDB97C', '#E7B173', '#F0C089', '#E9B57A', '#EBBB80'];
  for (let i = 0; i < 6; i++) { const y = (i * h) / 6; g.fillStyle = tones[i % tones.length]; g.fillRect(0, y, w, h / 6);
    g.fillStyle = 'rgba(160,100,50,0.35)'; g.fillRect(0, y, w, 2); const cut = ((i * 197) % 400) + 40; g.fillRect(cut, y, 2, h / 6);
    g.strokeStyle = 'rgba(180,120,60,0.12)'; g.lineWidth = 2; for (let k = 0; k < 3; k++) { g.beginPath(); const yy = y + 14 + k * 22; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy - 6, w * 0.6, yy + 6, w, yy); g.stroke(); } }
});
const checkerFloor = (a, b) => canvasTex(`chk|${a}|${b}`, 256, 256, (g, w, h) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? b : a; g.fillRect((i * w) / 2, (j * h) / 2, w / 2, h / 2); } g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); });
const tiles = (base) => canvasTex(`tile|${base}`, 256, 256, (g, w, h) => { g.fillStyle = '#E8F4F0'; g.fillRect(0, 0, w, h); g.fillStyle = base; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { rrect(g, i * 64 + 3, j * 64 + 3, 58, 58, 8); g.fill(); } });
/** Round rug: rings of colour with a scalloped dotted border. */
const rugTex = (c1, c2, c3) => canvasTex(`rug|${c1}|${c2}|${c3}`, 512, 512, (g, w, h) => {
  const cx = w / 2; g.fillStyle = c1; g.beginPath(); g.arc(cx, cx, cx, 0, Math.PI * 2); g.fill();
  g.fillStyle = c2; g.beginPath(); g.arc(cx, cx, cx * 0.82, 0, Math.PI * 2); g.fill();
  g.fillStyle = c3; g.beginPath(); g.arc(cx, cx, cx * 0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#FFFFFF'; for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * cx * 0.91, cx + Math.sin(a) * cx * 0.91, 9, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cx, cx * 0.66, 0, Math.PI * 2); g.stroke();
});
/** Simple child-like wall pictures. */
const art = (kind) => canvasTex(`art|${kind}`, 256, 256, (g, w, h) => {
  const sky = { sun: '#BFE6FF', house: '#D6F2FF', moon: '#5161A8', rainbow: '#E6F7FF', apple: '#FFF4D6', heart: '#FFE3EC' }[kind] || '#fff';
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  if (kind === 'sun') { g.fillStyle = '#7FD36B'; g.beginPath(); g.ellipse(128, 260, 200, 90, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#FFD23F'; g.beginPath(); g.arc(128, 100, 46, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#FFD23F'; g.lineWidth = 9; g.lineCap = 'round'; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 62, 100 + Math.sin(a) * 62); g.lineTo(128 + Math.cos(a) * 82, 100 + Math.sin(a) * 82); g.stroke(); } }
  if (kind === 'house') { g.fillStyle = '#7FD36B'; g.fillRect(0, 200, w, 56); g.fillStyle = '#FF9F8A'; g.fillRect(70, 120, 116, 90); g.fillStyle = '#3E8BF0'; g.beginPath(); g.moveTo(54, 124); g.lineTo(128, 60); g.lineTo(202, 124); g.closePath(); g.fill(); g.fillStyle = '#FFD23F'; g.fillRect(114, 160, 28, 50); g.fillStyle = '#FFFFFF'; g.fillRect(84, 140, 22, 22); g.fillRect(150, 140, 22, 22); }
  if (kind === 'moon') { g.fillStyle = '#FFE58A'; g.beginPath(); g.arc(120, 120, 56, 0, Math.PI * 2); g.fill(); g.fillStyle = sky; g.beginPath(); g.arc(146, 104, 50, 0, Math.PI * 2); g.fill(); for (const [x, y, r] of [[60, 60, 12], [200, 70, 9], [190, 190, 14], [70, 200, 9], [210, 130, 7]]) star(g, x, y, r, '#FFE58A'); }
  if (kind === 'rainbow') { ['#F2545B', '#FF9F1C', '#FFD23F', '#4CC35A', '#3E8BF0', '#8A5CF0'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 14; g.beginPath(); g.arc(128, 200, 100 - i * 14, Math.PI, 0); g.stroke(); }); g.fillStyle = '#FFFFFF'; for (const x of [40, 216]) { g.beginPath(); g.arc(x, 200, 26, 0, Math.PI * 2); g.arc(x + 20, 210, 20, 0, Math.PI * 2); g.arc(x - 20, 210, 20, 0, Math.PI * 2); g.fill(); } }
  if (kind === 'apple') { g.fillStyle = '#F2545B'; g.beginPath(); g.arc(110, 140, 50, 0, Math.PI * 2); g.arc(146, 140, 50, 0, Math.PI * 2); g.fill(); g.fillStyle = '#7A4A2A'; g.fillRect(124, 70, 8, 30); g.fillStyle = '#4CC35A'; g.beginPath(); g.ellipse(152, 82, 22, 11, -0.5, 0, Math.PI * 2); g.fill(); }
  if (kind === 'heart') { g.fillStyle = '#FF7EC4'; g.beginPath(); g.moveTo(128, 200); g.bezierCurveTo(30, 130, 60, 50, 128, 95); g.bezierCurveTo(196, 50, 226, 130, 128, 200); g.fill(); }
});

// ---------- room ----------
// One architecture for the whole home: honey wood floor, white skirting and dado rail, a white-framed window with
// curtains, a soft ceiling. Each room has its own calm wall colour; the six objects bring the strong colour.
const ROOMS = {
  living: { wall: '#FFD9C4', accent: '#FFE6D8', pattern: 'stripes', dado: '#FFF8F0', curtain: '#FF8FA3', floor: 'wood', rug: ['#FFD23F', '#FFE27A', '#FFB84D'], rugAt: [0.4, -0.9], rugR: 1.6, art: ['sun', 'house'], windowX: -0.6, door: { side: 'left', z: -1.8, color: '#7FD6B8' }, shelf: { side: 'left', z: -0.6 } },
  bedroom: { wall: '#FFE0EC', accent: '#FFFFFF', pattern: 'stars', dado: '#FFF8F0', curtain: '#9C8BFF', floor: 'wood', rug: ['#8CCBFF', '#B9E0FF', '#FFFFFF'], rugAt: [0.4, 0.1], rugR: 1.5, art: ['moon', 'rainbow'], windowX: 0.6, door: { side: 'left', z: 0.8, color: '#FFB84D' }, shelf: { side: 'right', z: 0.2 } },
  kitchen: { wall: '#FFF1B8', accent: '#FFF6CF', pattern: 'dots', dado: null, curtain: '#7FD6B8', floor: 'checker', rug: null, art: ['apple', 'heart'], windowX: -1.3, counter: true, door: { side: 'left', z: 1.0, color: '#FF8FA3' } },
};
export const ROOM_SIZE = { w: 8.4, d: 7.6, h: 3.1 };

/** An inward-facing wall with optional rectangular holes (windows). Origin: bottom centre; faces +z before placement. */
function wallPlane(w, h, holes, material) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
  for (const o of holes) { const p = new THREE.Path(); p.moveTo(o.x - o.w / 2, o.y); p.lineTo(o.x - o.w / 2, o.y + o.h); p.lineTo(o.x + o.w / 2, o.y + o.h); p.lineTo(o.x + o.w / 2, o.y); p.closePath(); s.holes.push(p); }
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), material); m.receiveShadow = true; return noCast(m);
}
/** Window: hole + reveal (wall thickness), white frame with a cross, a sill, curtains on a rod. In the wall's frame. */
function windowSet(x, y, w, h, wallColor, curtain) {
  const g = new THREE.Group(); const T = 0.18; const fr = C.white;
  const reveal = mat(wallColor); // sides of the opening, so it reads as a real wall with thickness
  for (const [px, py, sw, sh] of [[x - w / 2, y + h / 2, 0.01, h], [x + w / 2, y + h / 2, 0.01, h], [x, y + h, w, 0.01], [x, y, w, 0.01]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(sw || 0.01, sh || 0.01, T), reveal); r.position.set(px, py, -T / 2); g.add(noCast(r)); }
  for (const [px, py, sw, sh] of [[x - w / 2, y + h / 2, 0.09, h + 0.09], [x + w / 2, y + h / 2, 0.09, h + 0.09], [x, y + h, w + 0.09, 0.09], [x, y, w + 0.09, 0.09], [x, y + h / 2, w, 0.05], [x, y + h / 2, 0.05, h]]) g.add(noCast(at(box(sw, sh, 0.07, fr, 0.02), px, py, -0.06)));
  g.add(noCast(at(box(w + 0.3, 0.06, 0.2, fr, 0.025), x, y - 0.03, 0.06)));
  // curtains: soft wavy drapes gathered at the sides, on a rod with round finials
  const rod = at(cyl(0.022, 0.022, w + 0.9, C.woodDark), x, y + h + 0.16, 0.12); rod.rotation.z = Math.PI / 2; g.add(noCast(rod));
  for (const s of [-1, 1]) { g.add(noCast(at(ball(0.045, C.woodDark), x + s * (w / 2 + 0.45), y + h + 0.16, 0.12)));
    const cw = 0.46, ch = h + 0.55, n = 24; const geo = new THREE.PlaneGeometry(cw, ch, n, 8); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + cw / 2) / cw; const v = (p.getY(i) + ch / 2) / ch; p.setZ(i, 0.035 * Math.sin(u * Math.PI * 6) * (0.6 + 0.4 * v)); p.setX(i, p.getX(i) * (0.75 + 0.25 * v)); } // gathered lower down
    geo.computeVertexNormals();
    const cm = mesh(geo, mat(curtain, { roughness: 0.85, side: THREE.DoubleSide })); cm.position.set(x + s * (w / 2 + 0.2), y + h + 0.16 - ch / 2, 0.1); g.add(noCast(cm));
    const tie = at(box(0.3, 0.05, 0.06, C.white, 0.02), x + s * (w / 2 + 0.2), y + h * 0.35, 0.14); g.add(noCast(tie)); }
  return g;
}
function frame(kind, w, h, color) { const g = new THREE.Group(); g.add(noCast(box(w + 0.08, h + 0.08, 0.05, color, 0.02))); const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: art(kind), roughness: 0.7 })); pic.position.z = 0.03; g.add(noCast(pic)); return g; }
function bookshelf(color) {
  const g = new THREE.Group(); g.add(noCast(at(box(1.1, 0.05, 0.24, color, 0.015), 0, 0, 0))); g.add(noCast(at(box(1.1, 0.05, 0.24, color, 0.015), 0, 0.38, 0)));
  const cols = [C.red, C.blue, C.yellow, C.green, C.purple, C.orange, C.teal, C.pink]; let x = -0.48;
  cols.forEach((c, i) => { const bw = 0.06 + (i % 3) * 0.015, bh = 0.24 + (i % 2) * 0.06; g.add(noCast(at(box(bw, bh, 0.18, c, 0.01), x + bw / 2, 0.025 + bh / 2, 0))); x += bw + 0.012; });
  const pot = at(cyl(0.07, 0.055, 0.11, C.coral), 0.36, 0.08, 0); g.add(noCast(pot)); g.add(noCast(at(ball(0.09, C.green), 0.36, 0.19, 0)));
  return g;
}
function door(color) { const g = new THREE.Group(); g.add(noCast(at(box(1.0, 2.15, 0.06, C.white, 0.02), 0, 1.075, 0))); g.add(noCast(at(box(0.88, 2.05, 0.05, color, 0.02), 0, 1.04, 0.03)));
  for (const y of [0.55, 1.45]) g.add(noCast(at(box(0.62, 0.62, 0.02, new THREE.Color(color).offsetHSL(0, 0, 0.06).getStyle(), 0.03), 0, y, 0.06)));
  g.add(noCast(at(ball(0.04, C.yellow), 0.32, 1.0, 0.09))); return g; }

function room(p) {
  const R = ROOMS[p.style] || ROOMS.living; const W = p.w ?? ROOM_SIZE.w, D = p.d ?? ROOM_SIZE.d, H = p.h ?? ROOM_SIZE.h;
  const g = new THREE.Group();
  const floorTex = (R.floor === 'checker' ? checkerFloor('#FFF6E4', '#BDEBD8') : woodFloor()).clone(); floorTex.needsUpdate = true; floorTex.repeat.set(R.floor === 'checker' ? W / 1.0 : W, R.floor === 'checker' ? D / 1.0 : D);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.0 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.004; floor.receiveShadow = true; g.add(noCast(floor));
  const wallTex = wallpaper(R.wall, R.accent, R.pattern); // 1 m tiles (ShapeGeometry uvs are in metres)
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  const win = { x: R.windowX, y: R.counter ? 1.25 : 1.0, w: 1.7, h: 1.45 };
  const walls = [
    { name: 'back', len: W, pos: [0, 0, -D / 2], rot: 0, holes: [win] },
    { name: 'left', len: D, pos: [-W / 2, 0, 0], rot: Math.PI / 2, holes: [] },
    { name: 'right', len: D, pos: [W / 2, 0, 0], rot: -Math.PI / 2, holes: [] },
    { name: 'front', len: W, pos: [0, 0, D / 2], rot: Math.PI, holes: [] },
  ];
  const wallG = {};
  for (const wl of walls) {
    const wg = new THREE.Group(); wg.position.set(...wl.pos); wg.rotation.y = wl.rot; g.add(wg); wallG[wl.name] = wg;
    wg.add(wallPlane(wl.len, H, wl.holes, wallMat));
    if (wl.name === 'front') continue; // the camera side stays plain (it is invisible from outside anyway)
    // skirting board and (except in the kitchen) a dado rail with a lighter panel below it
    if (R.dado) { const pan = wallPlane(wl.len, 0.95, [], mat(R.dado, { roughness: 0.8 })); pan.position.z = 0.004; wg.add(pan); wg.add(noCast(at(box(wl.len, 0.05, 0.04, C.white, 0.015), 0, 0.97, 0.02))); }
    wg.add(noCast(at(box(wl.len, 0.12, 0.03, C.white, 0.012), 0, 0.06, 0.015)));
  }
  wallG.back.add(windowSet(win.x, win.y, win.w, win.h, R.wall, R.curtain));
  // ceiling faces down only (invisible from above), with a soft round lamp
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#FFF9F0', { roughness: 0.95 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(noCast(ceil));
  const lamp = at(mesh(new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#FFFFFF', { emissive: '#FFE9B8', emissiveIntensity: 0.6 })), 0, H - 0.005, -0.4); lamp.rotation.x = Math.PI; g.add(noCast(lamp));
  // wall pictures, a shelf, a door
  const artX = R.windowX < 0 ? [1.2, 2.5] : [-2.4, -1.1];
  if (p.style === 'living') { artX[0] = 1.5; artX[1] = 2.7; } // the sofa sits under the window; pictures on the right of the back wall
  R.art.forEach((k, i) => { if (artX[i] == null) return; const f = frame(k, 0.62, 0.62, [C.blue, C.coral][i]); f.position.set(artX[i], p.style === 'living' ? 2.15 : 1.75, 0.03); wallG.back.add(f); });
  if (R.shelf) { const s = bookshelf(C.white); s.position.set(R.shelf.z, 1.45, 0.14); wallG[R.shelf.side].add(s); }
  if (R.door) { const d = door(R.door.color); d.position.set(R.door.side === 'right' ? -R.door.z : R.door.z, 0, 0.03); wallG[R.door.side].add(d); }
  if (R.rug) { const rug = new THREE.Mesh(new THREE.CircleGeometry(p.rug_r ?? R.rugR, 64), new THREE.MeshStandardMaterial({ map: rugTex(...R.rug), roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; const ra = p.rug_at || R.rugAt; rug.position.set(ra[0], 0.012, ra[1]); rug.receiveShadow = true; g.add(noCast(rug)); }
  // A wall's decorations (door, shelf, frames, window) would show their BACKS if the camera stood outside that wall
  // (the wall itself is invisible from outside). Hide them whenever the camera is on the outside of their wall.
  const wallList = Object.values(wallG); const cl = new THREE.Vector3();
  const onCamera = (cam) => { for (const wg of wallList) { wg.updateMatrixWorld(); cl.copy(cam.position); wg.worldToLocal(cl); const inside = cl.z > 0.02; wg.children.forEach((c, i) => { if (i > 0) c.visible = inside; }); } };
  noCollide(g); // the room itself is not an obstacle: the floor, walls and rug are what characters stand by and on
  if (R.counter) g.add(kitchenCounter(W, D, win)); // the worktop and cabinets ARE solid
  return { group: g, seats: {}, height: 0, pose() {}, onCamera, size: { w: W, d: D, h: H } };
}

/** Kitchen run along the back wall: mint cabinets with round knobs, a honey-wood worktop at adult height (0.9 m),
 *  a tiled splashback, a sink under the window, upper cabinets. The fridge stands at the right end (separate item). */
export const COUNTER = { x0: -3.9, x1: 0.85, top: 0.9, depth: 0.62 };
function kitchenCounter(W, D, win) {
  const g = new THREE.Group(); const z0 = -D / 2; const { x0, x1, top, depth } = COUNTER; const len = x1 - x0, cx = (x0 + x1) / 2;
  g.add(at(box(len, top - 0.1, depth - 0.04, C.mint, 0.03), cx, (top - 0.1) / 2 + 0.06, z0 + depth / 2 - 0.02));
  g.add(at(box(len, 0.08, 0.5, '#FFFFFF', 0.02), cx, 0.04, z0 + 0.3)); // plinth
  g.add(at(box(len + 0.06, 0.06, depth + 0.04, C.wood, 0.02), cx, top - 0.03, z0 + depth / 2));
  const nDoors = Math.round(len / 0.6);
  for (let i = 0; i < nDoors; i++) { const x = x0 + (i + 0.5) * (len / nDoors); g.add(at(box(len / nDoors - 0.05, top - 0.24, 0.03, '#B2ECD6', 0.02), x, (top - 0.1) / 2 + 0.05, z0 + depth - 0.02)); g.add(at(ball(0.03, C.coral), x + (i % 2 ? -1 : 1) * (len / nDoors / 2 - 0.08), top - 0.25, z0 + depth + 0.01)); }
  const splash = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.55), new THREE.MeshStandardMaterial({ map: (() => { const t = tiles('#CFEFE4').clone(); t.needsUpdate = true; t.repeat.set(len / 0.6, 0.55 / 0.6); return t; })(), roughness: 0.4 }));
  splash.position.set(cx, top + 0.275, z0 + 0.006); g.add(noCast(splash));
  // sink under the window
  g.add(at(box(0.6, 0.02, 0.42, C.chrome, 0.02, { metalness: 0.5, roughness: 0.25 }), win.x, top + 0.002, z0 + depth / 2));
  const tap = at(cyl(0.02, 0.02, 0.28, C.chrome, 12, { metalness: 0.6, roughness: 0.2 }), win.x, top + 0.14, z0 + 0.1); g.add(tap);
  const spout = at(cyl(0.018, 0.018, 0.18, C.chrome, 12, { metalness: 0.6, roughness: 0.2 }), win.x, top + 0.27, z0 + 0.18); spout.rotation.x = Math.PI / 2; g.add(spout);
  // upper cabinets either side of the window
  for (const [a, b] of [[x0, win.x - win.w / 2 - 0.35], [win.x + win.w / 2 + 0.35, x1]]) { if (b - a < 0.3) continue; const w = b - a; g.add(noCast(at(box(w, 0.7, 0.36, C.mint, 0.03), (a + b) / 2, 2.05, z0 + 0.18)));
    const n = Math.max(1, Math.round(w / 0.55)); for (let i = 0; i < n; i++) { const x = a + (i + 0.5) * (w / n); g.add(noCast(at(box(w / n - 0.05, 0.6, 0.02, '#B2ECD6', 0.02), x, 2.05, z0 + 0.37))); g.add(noCast(at(ball(0.028, C.coral), x, 1.8, z0 + 0.39))); } }
  return g;
}

// ---------- TV: a chunky rounded screen on a low wooden stand; the screen switches on and plays a little show ----------
function tv(p) {
  const g = new THREE.Group(); const SW = 1.12, SH = 0.66, standH = 0.5;
  g.add(at(box(1.5, standH, 0.48, C.wood, 0.05), 0, standH / 2, 0));
  for (const s of [-1, 1]) g.add(at(box(0.62, standH - 0.14, 0.02, '#F2C48E', 0.03), s * 0.36, standH / 2, 0.245)); // two cupboard doors
  for (const s of [-1, 1]) g.add(at(ball(0.028, C.yellow), s * 0.1, standH / 2, 0.26));
  const body = at(box(SW + 0.14, SH + 0.14, 0.12, p.color || C.purple, 0.06), 0, standH + 0.07 + (SH + 0.14) / 2, -0.04); g.add(body);
  const foot = at(box(0.36, 0.06, 0.2, p.color || C.purple, 0.03), 0, standH + 0.03, -0.04); g.add(foot);
  // screen: a canvas redrawn from shot time
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 300; const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#FFFFFF', emissiveIntensity: 0, roughness: 0.18, metalness: 0.05 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMat); screen.position.set(0, standH + 0.07 + (SH + 0.14) / 2, 0.025); g.add(screen);
  const onAt = p.on?.at ?? (p.on === true ? 0 : null);
  let last = -1;
  const draw = (u) => {
    const k = onAt == null ? 0 : ease((u - onAt) / 0.5); // switch-on: a quick bright bloom
    const key = k === 0 ? -2 : Math.round(u * 30); if (key === last) return; last = key;
    const w = cv.width, h = cv.height;
    if (k === 0) { const gr = ctx.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2A3050'); gr.addColorStop(1, '#151a30'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(160, 0); ctx.lineTo(60, h); ctx.lineTo(0, h); ctx.fill(); screenMat.emissiveIntensity = 0; tex.needsUpdate = true; return; }
    const t = u - onAt;
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#7FD0FF'); sky.addColorStop(1, '#D9F3FF'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ['#F2545B', '#FF9F1C', '#FFD23F', '#4CC35A', '#3E8BF0', '#8A5CF0'].forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 13; ctx.beginPath(); ctx.arc(w / 2, h + 40, 230 - i * 13, Math.PI, 0); ctx.stroke(); });
    ctx.fillStyle = '#7FD36B'; ctx.beginPath(); ctx.ellipse(w / 2, h + 60, w * 0.75, 110, 0, 0, Math.PI * 2); ctx.fill();
    // a singing star that bounces to the beat (about 100 bpm) with a happy face
    const bob = Math.abs(Math.sin(t * Math.PI * 1.65)) * 18; const sx = w / 2, sy = h * 0.5 - bob; const sq = 1 + 0.06 * Math.sin(t * Math.PI * 3.3);
    ctx.save(); ctx.translate(sx, sy); ctx.scale(sq, 1 / sq); star(ctx, 0, 0, 74, '#FFD23F'); ctx.fillStyle = '#3B2A1A'; for (const ex of [-20, 20]) { ctx.beginPath(); ctx.arc(ex, -6, 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#FF8FA3'; for (const ex of [-34, 34]) { ctx.beginPath(); ctx.arc(ex, 12, 8, 0, Math.PI * 2); ctx.fill(); }
    const open = 6 + 6 * Math.abs(Math.sin(t * Math.PI * 3.3)); ctx.fillStyle = '#C2304A'; ctx.beginPath(); ctx.ellipse(0, 18, 12, open, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // music notes floating up
    for (let i = 0; i < 4; i++) { const ph = (t * 0.45 + i / 4) % 1; const nx = (i % 2 ? w * 0.78 : w * 0.22) + 18 * Math.sin(ph * 6 + i); const ny = h * 0.85 - ph * h * 0.7; ctx.globalAlpha = Math.min(1, (1 - ph) * 2); ctx.fillStyle = ['#F2545B', '#8A5CF0', '#3E8BF0', '#FF7EC4'][i];
      ctx.beginPath(); ctx.ellipse(nx, ny, 14, 10, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(nx + 10, ny - 44, 5, 44); ctx.fillRect(nx + 10, ny - 44, 22, 7); ctx.globalAlpha = 1; }
    if (k < 1) { ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.fillRect(0, 0, w, h); }
    screenMat.emissiveIntensity = 0.85; tex.needsUpdate = true;
  };
  draw(0);
  return { group: g, seats: {}, height: standH, screenCenter: new THREE.Vector3(0, standH + 0.07 + (SH + 0.14) / 2, 0.03), pose: draw };
}

// ---------- standing fan: round base, pole, motor, a cage with three COLOURED blades that spin when it is on ----------
function fan(p) {
  const g = new THREE.Group(); const H = p.height ?? 1.15; const col = p.color || C.teal;
  g.add(at(cyl(0.26, 0.3, 0.07, col, 32), 0, 0.035, 0)); g.add(at(cyl(0.12, 0.14, 0.04, C.white, 24), 0, 0.09, 0));
  g.add(at(ball(0.035, C.red), 0.16, 0.09, 0.14)); // the on button
  g.add(at(cyl(0.032, 0.032, H - 0.2, C.white, 16), 0, 0.1 + (H - 0.2) / 2, 0));
  const head = new THREE.Group(); head.position.set(0, H, 0); g.add(head);
  const motor = at(mesh(new THREE.SphereGeometry(0.13, 24, 16), col), 0, 0, -0.11); motor.scale.set(1, 1, 1.15); head.add(motor);
  const R = 0.36; const cage = new THREE.Group(); head.add(cage);
  for (const z of [-0.02, 0.12]) { const ring = mesh(new THREE.TorusGeometry(R, 0.012, 8, 48), C.white); ring.position.z = z; cage.add(ring); }
  const front = new THREE.Group(); front.position.z = 0.12; cage.add(front);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sp = mesh(new THREE.CylinderGeometry(0.007, 0.007, R, 6), C.white); sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a - Math.PI / 2; front.add(sp); }
  for (const r of [0.12, 0.24]) { const ring = mesh(new THREE.TorusGeometry(r, 0.007, 6, 40), C.white); front.add(ring); }
  const badge = at(cyl(0.06, 0.06, 0.03, col, 24), 0, 0, 0.13); badge.rotation.x = Math.PI / 2; cage.add(badge);
  const rotor = new THREE.Group(); rotor.position.z = 0.05; head.add(rotor);
  const hub = at(cyl(0.055, 0.055, 0.06, C.white, 20), 0, 0, 0); hub.rotation.x = Math.PI / 2; rotor.add(hub);
  [C.red, C.yellow, C.blue].forEach((c, i) => { const bl = mesh(new THREE.SphereGeometry(1, 20, 12), mat(c, { roughness: 0.35 })); bl.scale.set(0.12, 0.27, 0.025); const a = (i / 3) * Math.PI * 2; bl.position.set(Math.cos(a + Math.PI / 2) * 0.18, Math.sin(a + Math.PI / 2) * 0.18, 0); bl.rotation.set(0, 0.35, a); rotor.add(bl); });
  const onAt = p.on?.at ?? (p.on === true ? 0 : null); const speed = p.speed ?? 1.6; // turns per second at full speed: fast enough to read as "on", slow enough for the eye to follow
  return {
    group: g, seats: {}, height: H, head,
    pose(u) {
      const x = onAt == null ? 0 : Math.max(0, u - onAt); const ramp = 1.6; // spins up over 1.6 s
      const turns = x < ramp ? (speed * x * x) / (2 * ramp) : speed * (x - ramp / 2);
      rotor.rotation.z = -turns * Math.PI * 2;
      if (p.sweep) head.rotation.y = Number(p.sweep) * Math.sin(u * 0.5); // gentle side-to-side, off by default
    },
  };
}

// ---------- fridge: a rounded retro fridge; the big door swings open (hinge on the right) onto a cool light ----------
function fridge(p) {
  const g = new THREE.Group(); const W = 0.82, H = 1.78, Dp = 0.7, col = p.color || '#8CD2FF';
  const shell = new THREE.Group(); g.add(shell);
  const wallT = 0.05; const sm = mat(col, { roughness: 0.3 });
  shell.add(at(box(W, H, wallT, sm, 0.04), 0, H / 2 + 0.06, -Dp / 2 + wallT / 2)); // back
  for (const s of [-1, 1]) shell.add(at(box(wallT, H, Dp, sm, 0.04), s * (W / 2 - wallT / 2), H / 2 + 0.06, 0)); // sides
  shell.add(at(box(W, wallT, Dp, sm, 0.04), 0, H + 0.06 - wallT / 2, 0)); shell.add(at(box(W, wallT, Dp, sm, 0.04), 0, 0.06 + wallT / 2, 0));
  const split = 1.28; shell.add(at(box(W - 0.04, 0.04, Dp - 0.04, sm, 0.01), 0, split + 0.06, 0)); // freezer floor
  for (const s of [-1, 1]) for (const z of [-0.2, 0.2]) shell.add(at(cyl(0.04, 0.04, 0.06, '#D8E2EA', 12), s * 0.3, 0.03, z));
  // inside: white liner, glowing cool back panel, glass shelves, food
  const liner = mat('#F4FAFF', { roughness: 0.6 }); shell.add(at(box(W - 0.1, split - 0.12, 0.02, mat('#EAF7FF', { emissive: '#BFE8FF', emissiveIntensity: 0 }), 0.01), 0, (split + 0.12) / 2 + 0.06, -Dp / 2 + 0.06));
  const glow = shell.children[shell.children.length - 1];
  for (const s of [-1, 1]) shell.add(at(box(0.01, split - 0.12, Dp - 0.1, liner, 0.004), s * (W / 2 - 0.055), (split + 0.12) / 2 + 0.06, 0));
  const shelves = [0.5, 0.88]; for (const y of shelves) shell.add(at(box(W - 0.12, 0.015, Dp - 0.16, mat('#DDF2FF', { transparent: true, opacity: 0.7, roughness: 0.1 }), 0.005), 0, y, -0.02));
  const food = new THREE.Group(); shell.add(food);
  const milk = at(cyl(0.06, 0.065, 0.24, '#FFFFFF', 20), -0.22, 0.5 + 0.13, 0); food.add(milk); food.add(at(cyl(0.035, 0.035, 0.04, C.blue, 16), -0.22, 0.5 + 0.27, 0));
  food.add(at(box(0.12, 0.22, 0.09, C.orange, 0.015), 0.0, 0.5 + 0.12, 0.02));
  for (const [x, z] of [[0.18, 0.05], [0.26, -0.06]]) { food.add(at(ball(0.055, C.red), x, 0.5 + 0.06, z)); food.add(at(cyl(0.006, 0.006, 0.03, '#7A4A2A', 6), x, 0.5 + 0.12, z)); }
  for (let i = 0; i < 3; i++) food.add(at(box(0.07, 0.06, 0.07, mat('#E6F8FF', { transparent: true, opacity: 0.85, roughness: 0.05 }), 0.012), -0.2 + i * 0.09, 0.88 + 0.04, 0.0)); // ice cubes
  food.add(at(cyl(0.11, 0.1, 0.08, '#FFE6F0', 20), 0.2, 0.88 + 0.05, 0)); food.add(at(ball(0.035, C.red), 0.17, 0.88 + 0.1, 0.02)); food.add(at(ball(0.035, C.red), 0.23, 0.88 + 0.1, -0.02)); // a bowl of strawberries
  const light = new THREE.PointLight('#CDEBFF', 0, 2.2, 1.5); light.position.set(0, split - 0.1, 0.1); shell.add(light);
  // doors: hinge on the right edge (x = +W/2, z = +Dp/2)
  // hinge: 'right' (default) or 'left' edge of the door as you face the fridge. Choose the side AWAY from the camera, so
  // the open door swings out of the way and the cool inside shows.
  const hs = p.hinge === 'left' ? -1 : 1;
  const mkDoor = (h, y0, magnets) => { const pivot = new THREE.Group(); pivot.position.set(hs * W / 2, y0, Dp / 2); shell.add(pivot);
    const d = at(box(W, h, 0.07, sm, 0.05), -hs * W / 2, h / 2, 0.035); pivot.add(d);
    const handle = at(box(0.05, Math.min(0.4, h * 0.45), 0.05, C.chrome, 0.02, { metalness: 0.55, roughness: 0.2 }), -hs * (W - 0.08), h / 2, 0.1); pivot.add(handle);
    if (magnets) { const shapes = [[C.red, 'heart', -0.55, 0.85], [C.yellow, 'star', -0.3, 0.6], [C.green, 'ball', -0.5, 0.35], [C.pink, 'ball', -0.22, 0.95]];
      for (const [c, s, x, yy] of shapes) { const m = s === 'star' ? (() => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.025 : 0.055; sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); } return mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.015, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }), c); })()
        : s === 'heart' ? (() => { const sh = new THREE.Shape(); sh.moveTo(0, -0.05); sh.bezierCurveTo(-0.07, 0, -0.045, 0.05, 0, 0.025); sh.bezierCurveTo(0.045, 0.05, 0.07, 0, 0, -0.05); return mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.015, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }), c); })()
        : (() => { const b2 = ball(0.04, c); b2.scale.z = 0.4; return b2; })();
        m.position.set(hs * x, yy * h, 0.075); pivot.add(m); } }
    // inside of the door: a white liner with a little shelf (seen when open)
    pivot.add(at(box(W - 0.12, h - 0.12, 0.012, liner, 0.01), -hs * W / 2, h / 2, -0.004)); pivot.add(at(box(W - 0.16, 0.04, 0.08, '#FFFFFF', 0.01), -hs * W / 2, h * 0.45, -0.05));
    return pivot; };
  const main = mkDoor(split - 0.02, 0.06, true); mkDoor(H - split - 0.03, split + 0.09, false);
  // cold puffs: soft white mist that rolls out of the open door
  const puffs = []; const puffMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, roughness: 1, depthWrite: false });
  for (let i = 0; i < 7; i++) { const m2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), puffMat.clone()); m2.castShadow = false; m2.userData.noCast = true; m2.userData.noCollide = true; shell.add(m2); puffs.push(m2); }
  const op = p.open || null; // {at, dur, close}
  return {
    group: g, seats: {}, height: H, door: main,
    pose(u) {
      let k = 0;
      if (op) { const a = Number(op.at ?? 0), d = Number(op.dur ?? 0.9); k = ease((u - a) / d); if (op.close != null) k *= 1 - ease((u - Number(op.close)) / d); }
      main.rotation.y = hs * THREE.MathUtils.degToRad(105) * k; // swings out on the hinge side
      light.intensity = 2.2 * k; glow.material.emissiveIntensity = 0.9 * k;
      puffs.forEach((m2, i) => { const ph = ((u * 0.35 + i / puffs.length) % 1); const sp = 0.25 + 0.75 * ph; m2.position.set(-0.25 + (i % 3) * 0.22 + 0.06 * Math.sin(u + i), 0.4 + (i % 4) * 0.22 - ph * 0.25, Dp / 2 + ph * 0.5); m2.scale.setScalar(sp * (0.8 + 0.3 * (i % 2))); m2.material.opacity = 0.42 * k * Math.sin(Math.PI * ph); });
    },
  };
}

// ---------- cup: a toddler mug with a handle, milk inside; can sit on a surface or be HELD (see SceneEngine hold) ----------
function cup(p) {
  const g = new THREE.Group(); const s = p.size ?? 1; const col = p.color || C.red;
  const prof = [[0, 0], [0.04, 0], [0.046, 0.004], [0.05, 0.02], [0.052, 0.09], [0.054, 0.1], [0.048, 0.1], [0.046, 0.094], [0.044, 0.012], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = mesh(new THREE.LatheGeometry(prof, 32), mat(col, { roughness: 0.3, side: THREE.DoubleSide })); g.add(body);
  const dotTex = canvasTex(`dots|${col}`, 128, 64, (c2, w, h) => { c2.fillStyle = col; c2.fillRect(0, 0, w, h); c2.fillStyle = '#FFFFFF'; for (const [x, y] of [[16, 16], [48, 44], [80, 16], [112, 44]]) { c2.beginPath(); c2.arc(x, y, 7, 0, Math.PI * 2); c2.fill(); } });
  body.material.map = dotTex; body.material.color.set('#FFFFFF');
  const milk = at(cyl(0.045, 0.045, 0.004, '#FFFDF6', 28), 0, 0.085, 0); g.add(milk);
  const handle = mesh(new THREE.TorusGeometry(0.03, 0.009, 10, 24, Math.PI * 1.2), mat(col, { roughness: 0.3 })); handle.position.set(0.052, 0.055, 0); handle.rotation.z = -Math.PI * 0.6; g.add(handle);
  g.scale.setScalar(s); noCollide(g); // held in a hand: the fingers wrap round it
  return { group: g, seats: {}, height: 0.1 * s, isCup: true, pose() {} };
}

// ---------- bedside table with a lamp that glows warm ----------
function nightstand(p) {
  const g = new THREE.Group(); g.add(at(box(0.5, 0.5, 0.42, C.white, 0.05), 0, 0.29, 0)); g.add(at(box(0.42, 0.18, 0.02, '#FFD3E3', 0.02), 0, 0.33, 0.215)); g.add(at(ball(0.025, C.yellow), 0, 0.33, 0.235));
  for (const [x, z] of [[-0.19, -0.15], [0.19, -0.15], [-0.19, 0.15], [0.19, 0.15]]) g.add(at(cyl(0.025, 0.02, 0.06, C.wood, 10), x, 0.03, z));
  g.add(at(cyl(0.08, 0.1, 0.05, C.yellow, 20), 0.06, 0.565, -0.04)); g.add(at(cyl(0.014, 0.014, 0.22, C.white, 10), 0.06, 0.7, -0.04));
  const shade = at(cyl(0.1, 0.16, 0.18, mat('#FFF2D6', { emissive: '#FFD9A0', emissiveIntensity: p.lit ? 0.7 : 0.15, roughness: 0.9 }), 24), 0.06, 0.86, -0.04); g.add(shade);
  return { group: g, seats: {}, height: 0.54, pose() {} };
}

// ---------- seat points: sit or lie ON a Meshy model (sofa, bed). The model is a prop actor; this only marks where.
// p.seats: {name: {pos:[x,y,z], rot:[x,y,z] (radians)}} in this item's frame. Lying on the back = rot x −π/2.
function seats(p) {
  const g = new THREE.Group(); const out = {};
  for (const [name, s] of Object.entries(p.seats || {})) out[name] = seatPoint(name, g, s.pos || [0, 0.45, 0], s.rot || [0, 0, 0]);
  return { group: g, seats: out, height: 0, pose() {}, invisible: true };
}

// ---------- a soft quilt that Mommy pulls up over the child (also hides the body where it meets the mattress) ----------
function blanket(p) {
  const g = new THREE.Group(); const W = p.w ?? 0.95, L = p.l ?? 1.25, col = p.color || '#B79CFF';
  const tex = canvasTex(`quilt|${col}`, 256, 256, (c2, w, h) => { c2.fillStyle = col; c2.fillRect(0, 0, w, h); for (const [x, y] of [[40, 40], [170, 70], [90, 150], [210, 200], [30, 220], [140, 20]]) star(c2, x, y, 16, '#FFE066'); });
  const t2 = tex.clone(); t2.needsUpdate = true; t2.repeat.set(W / 0.5, L / 0.5);
  const geo = new THREE.PlaneGeometry(W, L, 16, 24); const base = geo.attributes.position.array.slice();
  const m = mesh(geo, new THREE.MeshStandardMaterial({ map: t2, roughness: 0.9, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; g.add(m);
  const hem = mesh(new THREE.CylinderGeometry(0.035, 0.035, W, 12), '#FFF6E8'); hem.rotation.z = Math.PI / 2; g.add(hem);
  noCollide(g); const bump = p.bump ?? 0.16; // how much the quilt rises over the body
  const cover = p.cover || { at: 0, dur: 1.5 };
  return {
    group: g, seats: {}, height: 0,
    pose(u) {
      const k = cover.from_start ? 1 : ease((u - Number(cover.at ?? 0)) / Number(cover.dur ?? 1.5)); // 0 = folded at the feet, 1 = up to the chest
      const len = L * (0.25 + 0.75 * k); const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = base[i * 3], y0 = base[i * 3 + 1]; const v = (y0 + L / 2) / L; // 0 at the feet end, 1 at the chest end
        const yy = -L / 2 + v * len; const across = 1 - Math.pow(Math.abs(x) / (W / 2), 2); const along = Math.sin(Math.PI * Math.min(1, v * len / L * 1.05));
        pos.setXYZ(i, x * (1 + 0.04 * (1 - across)), yy, bump * Math.max(0, across) * (0.35 + 0.65 * along) + 0.01 - 0.12 * Math.pow(Math.abs(x) / (W / 2), 6)); }
      pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
      hem.position.set(0, 0.03, -( -L / 2 + len)); // the folded top edge (the plane's +y maps to −z after the rotation)
    },
  };
}

const BUILD = { room, tv, fan, fridge, cup, nightstand, seats, blanket };
/** Build one household item from a shot's setting.equipment entry {type, pos, rot_y, scale, ...params}. */
export function buildHome(e) {
  const f = BUILD[e.type]; if (!f) return null;
  const eq = f(e); eq.type = e.type; eq.spec = e;
  eq.group.position.set(...(e.pos || [0, 0, 0])); eq.group.rotation.y = Number(e.rot_y || 0); eq.group.scale.multiplyScalar(Number(e.scale || 1));
  return eq;
}
