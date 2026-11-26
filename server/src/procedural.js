// BUILD LOCALLY: offline procedural 3D generator (no GPU, no network, no paid API).
// Every build follows the World Style: a recipe carries a snapshot of the Style Profile (palette roles,
// finish, proportions, face construction, tufts, asymmetry, scenery & sky motifs) taken when it was created,
// so rebuilds are reproducible and "Apply current World Style" is an explicit, visible step.
import * as THREE from 'three';
import { writeGLB } from './glb.js';
import { Canvas } from './media.js';

// ---------- neutral style (only used if no World Style exists yet) ----------
export const DEFAULT_STYLE = {
  version: 'default',
  roles: { fur: '#E8EEF7', fur_support: '#FFF6E8', inner_ear: '#FFB3C7', iris: '#2B2140', nose: '#FF7FA3', cheeks: '#FFB3C7', accent: '#F5B800',
    foliage: '#7BC96F', foliage_far: '#9AD88A', flowers: ['#FF7FA3', '#FFD23F'], stone: '#B8C0CA', soil: '#C99A72', water: '#7CB7FF', sun: '#FFD23F', moon: '#F4E7B0', sky_day: '#CFE6F5' },
  finish: { fur: 0.8, eyes: 0.3, nose: 0.6, foliage: 0.75, rock: 0.85, water: 0.2 },
  proportions: { head: 1, torso: 1, cheeks: 1 },
  face: { iris: false, catchlights: true, eyelids: false, muzzle: false },
  features: { tufts: false, inset_ears: true, freckles: false, tooth: false, whiskers: false },
  asymmetry: 0,
  scenery: { leaf_terrain: false, path: false, petal_flowers: false, hill_layers: 2, leaf_canopies: false, stones: false },
  sky: { petal_rays: false, cloud_lobes: false, rainbow: false },
};

// ---------- helpers ----------
const lin = (hex) => {
  const v = parseInt(String(hex || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
};
const shade = (hex, k) => `#${[1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
const xf = (g, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) =>
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...([].concat(scale).length === 1 ? [scale, scale, scale] : scale))));
const sph = (r, o, w = 28, h = 20) => xf(new THREE.SphereGeometry(r, w, h), o);
const quat = (x, y, z) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)); return [q.x, q.y, q.z, q.w]; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v)));
const P = (key, label, type, def, extra = {}) => ({ key, label, type, default: def, ...extra });
const num = (key, label, def, min, max, step = 0.05, styleKey) => P(key, label, 'number', def, { min, max, step, styleKey });
const part = (name, color, geometries, extra = {}) => geometries.map((geometry) => ({ geometry, color: lin(color), name, roughness: 0.8, ...extra }));
function rng(seed) { let s = (Math.abs(Math.round(seed)) * 9301 + 49297) % 233280 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function grassTexture(base) {
  const c = new Canvas(256, 256);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  const R = rng(7);
  c.rect(0, 0, 256, 256, [r, g, b, 255]);
  for (let i = 0; i < 900; i++) { const k = 0.9 + R() * 0.16; c.rect(R() * 256, R() * 256, 2, 3, [r * k, g * k, b * k, 255]); }
  return c.png();
}
function craterTexture(base) {
  const c = new Canvas(256, 256);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  c.rect(0, 0, 256, 256, [r, g, b, 255]);
  const R = rng(3);
  for (let i = 0; i < 14; i++) c.circle(R() * 256, R() * 256, 6 + R() * 14, [r * 0.9, g * 0.9, b * 0.86, 255], { shade: 0.15 });
  return c.png();
}
/** A flat ribbon following a curve (paths, leaf veins). */
function ribbon(points, width, y = 0.02) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], y, p[1])));
  const n = 80; const pos = []; const idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n; const p = curve.getPoint(t); const tan = curve.getTangent(t);
    const nx = -tan.z, nz = tan.x; const w = width * (0.6 + 0.4 * Math.sin(Math.PI * t));
    pos.push(p.x + nx * w / 2, y, p.z + nz * w / 2, p.x - nx * w / 2, y, p.z - nz * w / 2);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } // faces point up (+Y)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** A soft folded petal flower: n petals around a centre. */
function petalFlower(x, y, z, size, n = 5) {
  const petals = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; petals.push(sph(size, { pos: [x + Math.cos(a) * size * 0.9, y + size * 0.35, z + Math.sin(a) * size * 0.9], rot: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], scale: [1, 0.45, 0.7] }, 12, 8)); }
  return { petals, center: sph(size * 0.45, { pos: [x, y + size * 0.4, z] }, 10, 8) };
}

/** Default colour for a template part, taken from the World Style palette roles. */
const PART_ROLES = {
  bunny: { body: 'fur', belly: 'fur_support', inner_ear: 'inner_ear', left_paw: 'fur', right_paw: 'fur', eyes: 'iris', nose: 'nose', cheeks: 'cheeks', tail: 'fur_support' },
  sun: { core: 'sun', rays: 'sun', cheeks: 'cheeks' }, moon: { body: 'moon' }, star: { body: 'sun' },
  tree: { trunk: 'soil', leaves: 'foliage', fruit: 'nose' }, hill: { grass: 'foliage', flowers: 'flowers' },
  meadow: { ground: 'foliage', flowers: 'flowers', path: 'soil' }, stone: { body: 'stone', moss: 'foliage_far' }, flowers: { petals: 'flowers', leaves: 'foliage' },
};
function styledPartDefault(template, key, S, fallback) {
  const role = PART_ROLES[template]?.[key];
  if (!role || !S?.roles?.[role]) return fallback;
  const v = S.roles[role];
  const c = Array.isArray(v) ? v[0] : v;
  if (template === 'sun' && key === 'rays') return shade(c, 0.93);
  return /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
}

// ---------- templates ----------
/** Resting tilt (radians, around Z) of a bunny ear — shared by the model and its ear-wiggle clip. */
function earRest(side, style, asym = 0) {
  const sx = side === 'left' ? 1 : -1; // character's own sides; it faces +Z so its own left is +X
  if (style === 'crescent') return -0.15 * sx;
  return -0.18 * sx - (style === 'floppy' ? 1.25 * sx : 0) - (side === 'left' ? asym : 0);
}

export const TEMPLATES = {
  bunny: {
    label: 'Bunny', kind: 'character',
    params: [
      P('pose', 'Pose', 'select', 'upright', { options: ['upright', 'four_legged'] }),
      num('height', 'Overall size', 1, 0.5, 1.8), num('head_size', 'Head size', 1, 0.75, 1.4, 0.05, 'head'), num('body_width', 'Body width', 1, 0.75, 1.35, 0.05, 'torso'),
      num('ear_length', 'Ear length', 1, 0.5, 1.7), num('eye_size', 'Eye size', 1, 0.6, 1.6),
      P('eye_style', 'Eye shape', 'select', 'round', { options: ['round', 'wide', 'soft'] }),
      P('left_ear', 'Own left ear', 'select', 'straight', { options: ['straight', 'floppy', 'crescent'] }),
      P('right_ear', 'Own right ear', 'select', 'straight', { options: ['straight', 'floppy', 'crescent'] }),
      num('ear_asymmetry', 'Ear asymmetry', 0, 0, 0.3, 0.01, 'asymmetry'),
      P('left_paw_shiny', 'Own left paw shiny', 'bool', false), P('right_paw_shiny', 'Own right paw shiny', 'bool', false),
      P('freckles', 'Freckles', 'number', 0, { min: 0, max: 5, step: 1 }), P('freckle_side', 'Freckles on own…', 'select', 'right', { options: ['right', 'left'] }),
      P('tooth', 'Little front tooth', 'bool', false), P('tail', 'Tail', 'bool', true),
      P('tufts', 'Fur tufts (cheeks, chest, tail)', 'bool', false, { styleBool: 'tufts' }), P('cheeks', 'Cheek blush', 'bool', true),
    ],
    parts: { body: ['Fur', '#E8EEF7'], belly: ['Muzzle, chest & belly', '#FFF6E8'], inner_ear: ['Inner ears', '#FFB3C7'], left_paw: ['Own left front paw', '#E8EEF7'],
      right_paw: ['Own right front paw', '#E8EEF7'], eyes: ['Iris', '#2B2140'], nose: ['Nose', '#FF7FA3'], cheeks: ['Cheeks', '#FFB3C7'], tail: ['Tail', '#FFFFFF'] },
    build(p, c, S) {
      const hs = p.head_size, bw = p.body_width, el = p.ear_length, es = p.eye_size;
      const fur = { roughness: S.finish.fur };
      const quad = p.pose === 'four_legged';
      const lidAmt = { round: 0.3, wide: 0.22, soft: 0.42 }[p.eye_style] ?? 0.3;
      const eye = (x) => [
        ...part('Eyes', c.eyes, [sph(0.056 * es, { pos: [x, 0.05, 0.278], scale: [1, 1.12, 0.8] })], { roughness: S.finish.eyes }),
        ...(S.face.iris ? part('Pupils', '#1E1A1E', [sph(0.03 * es, { pos: [x, 0.048, 0.318], scale: [1, 1.1, 0.5] })], { roughness: S.finish.eyes }) : []),
        ...(S.face.catchlights ? part('Catchlights', '#FFFFFF', [sph(0.014 * es, { pos: [x + 0.016, 0.074, 0.33] }), sph(0.007 * es, { pos: [x - 0.012, 0.03, 0.33] })], { roughness: 0.05, emissive: [0.6, 0.6, 0.6] }) : []),
        ...(S.face.eyelids ? part('Eyelids', c.body, [xf(new THREE.SphereGeometry(0.062 * es, 18, 10, 0, Math.PI * 2, 0, Math.PI * lidAmt), { pos: [x, 0.05, 0.272], rot: [0.35, 0, 0], scale: [1, 1.12, 0.85] })], fur) : []),
      ];
      const ear = (side, style) => {
        const sx = side === 'left' ? 1 : -1;
        const name = side === 'left' ? 'EarLeft' : 'EarRight';
        const up = side === 'left' ? p.ear_asymmetry * 0.25 : 0;
        let parts;
        if (style === 'crescent') {
          const rot = [0, 0, sx > 0 ? -0.35 : 0.35 - 0.2 * Math.PI];
          parts = [...part(name, c.body, [xf(new THREE.TorusGeometry(0.17 * el, 0.065, 16, 36, Math.PI * 1.2), { pos: [0.02 * sx, 0.2 * el, 0], rot })], fur),
            ...part(`${name}Inner`, c.inner_ear, [xf(new THREE.TorusGeometry(0.17 * el, 0.032, 10, 36, Math.PI * 1.12), { pos: [0.02 * sx, 0.2 * el, 0.045], rot })])];
        } else {
          const len = 0.36 * el;
          parts = [
            ...part(name, c.body, [xf(new THREE.CapsuleGeometry(0.078, len, 8, 16), { pos: [0, len / 2 + 0.07, 0], scale: [1, 1, 0.8] })], fur),
            ...part(`${name}Inner`, c.inner_ear, [xf(new THREE.CapsuleGeometry(0.042, len * 0.76, 6, 12), { pos: [0, len / 2 + 0.07, S.features.inset_ears ? 0.03 : 0.045], scale: [1, 1, 0.45] })]),
          ];
        }
        return { name, translation: [(style === 'crescent' ? 0.14 : 0.13) * sx * hs, (style === 'crescent' ? 0.24 : 0.25) * hs + up, 0], rotation: quat(0, 0, earRest(side, style, p.ear_asymmetry)), parts };
      };
      const shiny = (on) => (on ? { metallic: 0.35, roughness: 0.3 } : fur);
      const cheekK = S.proportions.cheeks;
      const fx = p.freckle_side === 'left' ? 1 : -1;
      const head = {
        name: 'Head', translation: quad ? [0, 0.74, 0.36] : [0, 1.0, 0], scale: [hs, hs, hs],
        parts: [
          ...part('Head', c.body, [sph(0.33, { scale: [1.04 * Math.min(1.12, cheekK ** 0.3), 1, 1] })], fur),
          ...eye(-0.11), ...eye(0.11),
          ...(S.face.muzzle ? part('Muzzle', c.belly, [sph(0.075, { pos: [-0.045, -0.07, 0.285], scale: [1, 0.85, 0.8] }), sph(0.075, { pos: [0.045, -0.07, 0.285], scale: [1, 0.85, 0.8] })], fur) : []),
          ...part('Nose', c.nose, [sph(0.032, { pos: [0, -0.025, 0.335], scale: [1.25, 0.8, 0.9] })], { roughness: S.finish.nose }),
          ...part('Mouth', '#4A3A3A', [xf(new THREE.TorusGeometry(0.035, 0.008, 6, 14, Math.PI), { pos: [0, -0.095, 0.33], rot: [0.2, 0, Math.PI] })]),
          ...(p.tooth ? part('Tooth', '#FFFDF5', [xf(new THREE.BoxGeometry(0.022, 0.026, 0.01), { pos: [0, -0.126, 0.33] })], { roughness: 0.25 }) : []),
          ...(p.cheeks ? part('Cheeks', c.cheeks, [sph(0.06 * cheekK, { pos: [-0.2, -0.06, 0.235], scale: [1, 0.6, 0.4] }), sph(0.06 * cheekK, { pos: [0.2, -0.06, 0.235], scale: [1, 0.6, 0.4] })], { roughness: 0.9 }) : []),
          ...(p.freckles > 0 ? part('Freckles', shade(c.nose, 0.8), Array.from({ length: Math.round(p.freckles) }, (_, i) => sph(0.011, { pos: [fx * (0.17 + (i % 2) * 0.03), -0.02 - i * 0.022, 0.27] }, 8, 6))) : []),
          ...(p.tufts ? part('Tufts', c.body, [xf(new THREE.ConeGeometry(0.05, 0.12, 10), { pos: [-0.31, -0.08, 0.06], rot: [0, 0, 1.9] }), xf(new THREE.ConeGeometry(0.05, 0.12, 10), { pos: [0.31, -0.08, 0.06], rot: [0, 0, -1.9] }), xf(new THREE.ConeGeometry(0.045, 0.1, 10), { pos: [0.03, 0.32, 0.05], rot: [0.2, 0, -0.3] })], fur) : []),
        ],
        children: [ear('left', p.left_ear), ear('right', p.right_ear)],
      };
      const chestTuft = (y, z) => (p.tufts ? part('ChestTuft', c.belly, [-1, 0, 1].map((k) => sph(0.07, { pos: [k * 0.075, y - Math.abs(k) * 0.02, z], scale: [1, 0.7, 0.5] }, 14, 10)), fur) : []);
      const tail = (pos) => (p.tail ? part('Tail', c.tail, p.tufts ? [sph(0.1, { pos }), sph(0.075, { pos: [pos[0] - 0.07, pos[1] + 0.05, pos[2] - 0.03] }), sph(0.075, { pos: [pos[0] + 0.07, pos[1] + 0.04, pos[2] - 0.03] })] : [sph(0.12, { pos })], fur) : []);
      if (quad) {
        return {
          name: 'Bunny', scale: [p.height, p.height, p.height],
          parts: [
            ...part('Body', c.body, [sph(0.27, { pos: [0, 0.36, 0.13], scale: [bw, 1, 1.05] }), sph(0.34, { pos: [0, 0.38, -0.16], scale: [bw * 1.05, 0.95, 1.1] })], fur),
            ...part('Belly', c.belly, [sph(0.2, { pos: [0, 0.3, 0.24], scale: [bw * 0.9, 1.05, 0.7] })], fur),
            ...chestTuft(0.42, 0.36),
            ...part('Legs', c.body, [xf(new THREE.CapsuleGeometry(0.06, 0.16, 6, 12), { pos: [0.15 * bw, 0.17, 0.27] }), xf(new THREE.CapsuleGeometry(0.06, 0.16, 6, 12), { pos: [-0.15 * bw, 0.17, 0.27] }),
              sph(0.17, { pos: [0.2 * bw, 0.3, -0.18] }), sph(0.17, { pos: [-0.2 * bw, 0.3, -0.18] })], fur),
            ...part('HindFeet', c.body, [sph(0.1, { pos: [0.21 * bw, 0.05, -0.04], scale: [0.75, 0.45, 1.75] }), sph(0.1, { pos: [-0.21 * bw, 0.05, -0.04], scale: [0.75, 0.45, 1.75] })], fur),
            ...tail([0, 0.44, -0.5]),
          ],
          children: [
            { name: 'PawLeft', translation: [0.15 * bw, 0.055, 0.33], parts: part('PawLeft', c.left_paw, [sph(0.075, { scale: [1, 0.65, 1.25] })], shiny(p.left_paw_shiny)) },
            { name: 'PawRight', translation: [-0.15 * bw, 0.055, 0.33], parts: part('PawRight', c.right_paw, [sph(0.075, { scale: [1, 0.65, 1.25] })], shiny(p.right_paw_shiny)) },
            head,
          ],
        };
      }
      return {
        name: 'Bunny', scale: [p.height, p.height, p.height],
        parts: [
          ...part('Body', c.body, [sph(0.4, { pos: [0, 0.45, 0], scale: [bw, 1.08, 0.95] })], fur),
          ...part('Belly', c.belly, [sph(0.25, { pos: [0, 0.42, 0.2], scale: [bw, 1.1, 0.6] })], fur),
          ...chestTuft(0.66, 0.3),
          ...part('HindFeet', c.body, [sph(0.13, { pos: [-0.17 * bw, 0.06, 0.1], scale: [1, 0.55, 1.65] }), sph(0.13, { pos: [0.17 * bw, 0.06, 0.1], scale: [1, 0.55, 1.65] })], fur),
          ...tail([0, 0.4, -0.38]),
        ],
        children: [
          { name: 'PawLeft', translation: [0.24 * bw, 0.44, 0.27], parts: part('PawLeft', c.left_paw, [sph(0.09, {})], shiny(p.left_paw_shiny)) },
          { name: 'PawRight', translation: [-0.24 * bw, 0.44, 0.27], parts: part('PawRight', c.right_paw, [sph(0.09, {})], shiny(p.right_paw_shiny)) },
          head,
        ],
      };
    },
  },
  sun: {
    label: 'Sun', kind: 'character',
    params: [num('size', 'Size', 1, 0.4, 2), P('rays', 'Number of rays', 'number', 12, { min: 6, max: 18, step: 1 }), num('ray_length', 'Ray length', 1, 0.5, 1.8),
      P('ray_style', 'Ray style', 'select', 'cone', { options: ['cone', 'petal'], styleSelect: ['sky', 'petal_rays', 'petal'] }), P('face', 'Friendly face', 'bool', true), P('glow', 'Glow', 'bool', true)],
    parts: { core: ['Sun body', '#FFD23F'], rays: ['Rays', '#FFB400'], face: ['Eyes & smile', '#3A2A1A'], cheeks: ['Cheeks', '#FF8FA3'] },
    build(p, c, S) {
      const glow = (hex, k) => (p.glow ? { emissive: lin(hex).map((v) => v * k) } : {});
      const n = Math.round(p.rays);
      const rays = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2; const r = 0.8 + 0.17 * p.ray_length;
        return p.ray_style === 'petal'
          ? sph(0.2, { pos: [Math.cos(a) * (r + 0.05), Math.sin(a) * (r + 0.05), -0.08], rot: [0, 0, a - Math.PI / 2], scale: [0.85, 1.25 * p.ray_length, 0.55] }, 18, 12)
          : xf(new THREE.ConeGeometry(0.13, 0.38 * p.ray_length, 12), { pos: [Math.cos(a) * r, Math.sin(a) * r, -0.05], rot: [0, 0, a - Math.PI / 2] });
      });
      return {
        name: 'Sun', scale: [p.size, p.size, p.size],
        parts: [
          ...part('Core', c.core, [sph(0.72, {}, 36, 26)], { roughness: 0.6, ...glow(c.core, 0.45) }),
          ...part('Rays', c.rays, rays, { roughness: 0.6, ...glow(c.rays, 0.35) }),
          ...(p.face ? [
            ...part('Face', c.face, [sph(0.078, { pos: [-0.22, 0.14, 0.66], scale: [1, 1.15, 0.8] }), sph(0.078, { pos: [0.22, 0.14, 0.66], scale: [1, 1.15, 0.8] }), xf(new THREE.TorusGeometry(0.21, 0.036, 8, 24, Math.PI), { pos: [0, -0.06, 0.68], rot: [0, 0, Math.PI] })], { roughness: S.finish.eyes }),
            ...(S.face.catchlights ? part('Catchlights', '#FFFFFF', [sph(0.022, { pos: [-0.2, 0.17, 0.725] }), sph(0.022, { pos: [0.24, 0.17, 0.725] })], { emissive: [0.6, 0.6, 0.6] }) : []),
            ...part('Cheeks', c.cheeks, [sph(0.09, { pos: [-0.38, -0.08, 0.58], scale: [1, 0.6, 0.4] }), sph(0.09, { pos: [0.38, -0.08, 0.58], scale: [1, 0.6, 0.4] })]),
          ] : []),
        ],
      };
    },
  },
  moon: {
    label: 'Moon', kind: 'character',
    params: [num('size', 'Size', 1, 0.4, 2), P('shape', 'Shape', 'select', 'crescent', { options: ['crescent', 'full'] }), P('face', 'Sleepy face', 'bool', true), P('craters', 'Craters texture', 'bool', true)],
    parts: { body: ['Moon', '#F4E7B0'], face: ['Face', '#5A4A3A'] },
    build(p, c) {
      const tex = p.craters ? { texture: craterTexture(c.body), color: [1, 1, 1] } : {};
      const body = p.shape === 'full' ? [sph(0.7, {}, 36, 26)] : [xf(new THREE.TorusGeometry(0.5, 0.24, 20, 40, Math.PI * 1.3), { rot: [0, 0, Math.PI * 0.35] })];
      return {
        name: 'Moon', scale: [p.size, p.size, p.size],
        parts: [
          ...part('Body', c.body, body, { ...tex, emissive: lin(c.body).map((v) => v * 0.15) }),
          ...(p.face ? part('Face', c.face, p.shape === 'full'
            ? [xf(new THREE.TorusGeometry(0.09, 0.02, 6, 16, Math.PI), { pos: [-0.22, 0.12, 0.66] }), xf(new THREE.TorusGeometry(0.09, 0.02, 6, 16, Math.PI), { pos: [0.22, 0.12, 0.66] }), xf(new THREE.TorusGeometry(0.15, 0.025, 8, 20, Math.PI), { pos: [0, -0.12, 0.68], rot: [0, 0, Math.PI] })]
            : [xf(new THREE.TorusGeometry(0.06, 0.018, 6, 16, Math.PI), { pos: [-0.62, 0.05, 0.2], rot: [0, -0.9, 0] }), sph(0.035, { pos: [-0.66, -0.12, 0.17] })]) : []),
        ],
      };
    },
  },
  star: {
    label: 'Star', kind: 'prop',
    params: [num('size', 'Size', 1, 0.3, 2), P('points', 'Points', 'number', 5, { min: 4, max: 8, step: 1 }), num('puffiness', 'Puffiness (rounded points)', 1.2, 0.5, 1.8), P('face', 'Friendly face', 'bool', true), P('glow', 'Glow', 'bool', true)],
    parts: { body: ['Star', '#FFE066'], face: ['Face', '#5A3A1A'] },
    build(p, c) {
      const n = Math.round(p.points); const shape = new THREE.Shape();
      for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2; const r = i % 2 ? 0.3 : 0.6; if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16 * p.puffiness, bevelEnabled: true, bevelThickness: 0.1 * p.puffiness, bevelSize: 0.1, bevelSegments: 8 });
      geo.translate(0, 0, -0.08 * p.puffiness);
      return { name: 'Star', scale: [p.size, p.size, p.size], parts: [
        ...part('Body', c.body, [geo], { roughness: 0.55, ...(p.glow ? { emissive: lin(c.body).map((v) => v * 0.35) } : {}) }),
        ...(p.face ? part('Face', c.face, [sph(0.045, { pos: [-0.11, 0.06, 0.2 * p.puffiness] }), sph(0.045, { pos: [0.11, 0.06, 0.2 * p.puffiness] }), xf(new THREE.TorusGeometry(0.08, 0.018, 6, 16, Math.PI), { pos: [0, -0.05, 0.2 * p.puffiness], rot: [0, 0, Math.PI] })]) : []),
      ] };
    },
  },
  cloud: {
    label: 'Cloud', kind: 'prop',
    params: [num('size', 'Size', 1, 0.4, 2.5), P('style', 'Shape', 'select', 'puffs', { options: ['puffs', 'lobes'], styleSelect: ['sky', 'cloud_lobes', 'lobes'] }),
      P('puffs', 'Puffs', 'number', 6, { min: 3, max: 9, step: 1 }), num('width', 'Width', 1, 0.6, 1.8), num('flatness', 'Flatness', 0.85, 0.5, 1.2), P('face', 'Friendly face', 'bool', false)],
    parts: { body: ['Cloud', '#FFFFFF'], face: ['Face', '#6B7684'] },
    build(p, c) {
      let puffs;
      if (p.style === 'lobes') {
        // One large rounded lobe with two smaller lobes trailing to one side.
        puffs = [sph(0.62, { scale: [1.05, p.flatness, 0.8] }), sph(0.42, { pos: [0.72 * p.width, -0.12, 0], scale: [1, p.flatness, 0.8] }), sph(0.28, { pos: [1.18 * p.width, -0.2, 0], scale: [1, p.flatness, 0.8] })];
      } else {
        const n = Math.round(p.puffs); const R = rng(n * 13);
        puffs = Array.from({ length: n }, (_, i) => { const x = (i / (n - 1) - 0.5) * 1.4 * p.width; const r = 0.38 + R() * 0.25 - Math.abs(x) * 0.12; return sph(r, { pos: [x, (R() - 0.3) * 0.25, (R() - 0.5) * 0.25], scale: [1, p.flatness, 0.75] }); });
      }
      return { name: 'Cloud', scale: [p.size, p.size, p.size], parts: [...part('Body', c.body, puffs, { roughness: 0.95 }),
        ...(p.face ? part('Face', c.face, [sph(0.05, { pos: [-0.14, 0.05, 0.42] }), sph(0.05, { pos: [0.14, 0.05, 0.42] })]) : [])] };
    },
  },
  tree: {
    label: 'Tree', kind: 'prop',
    params: [num('height', 'Height', 1, 0.5, 2.5), num('canopy', 'Canopy size', 1, 0.5, 1.8),
      P('style', 'Canopy style', 'select', 'round', { options: ['round', 'cluster', 'pine', 'leafcluster'], styleSelect: ['scenery', 'leaf_canopies', 'leafcluster'] }),
      num('curve', 'Trunk curve', 0.15, 0, 0.6), P('fruit', 'Fruit', 'bool', false)],
    parts: { trunk: ['Trunk', '#9A6A43'], leaves: ['Leaves', '#5DBB63'], fruit: ['Fruit', '#FF5A5A'] },
    build(p, c, S) {
      const h = 1.4 * p.height, k = p.canopy; const R = rng(Math.round(h * 100 + k * 10));
      const bend = p.curve;
      const trunk = [xf(new THREE.CylinderGeometry(0.15, 0.22, h * 0.55, 14), { pos: [0, h * 0.27, 0] }), xf(new THREE.CylinderGeometry(0.11, 0.15, h * 0.5, 14), { pos: [bend * 0.35, h * 0.75, 0], rot: [0, 0, -bend] })];
      const top = [bend * 0.6, h + 0.35 * k, 0];
      let leaves;
      if (p.style === 'pine') leaves = [0, 1, 2].map((i) => xf(new THREE.ConeGeometry((0.9 - i * 0.22) * k, 0.9 * k, 18), { pos: [top[0], h + 0.2 + i * 0.5 * k, 0] }));
      else if (p.style === 'cluster') leaves = [[0, 0.5, 0, 0.75], [-0.55, 0.15, 0.1, 0.55], [0.55, 0.2, 0, 0.58], [0, 0.15, 0.45, 0.5]].map(([x, y, z, r]) => sph(r * k, { pos: [top[0] + x * k, h + y * k, z * k] }));
      else if (p.style === 'leafcluster') {
        // Broad overlapping leaf shapes arranged in a soft dome.
        leaves = [];
        for (let i = 0; i < 22; i++) { const a = R() * Math.PI * 2, e = R() * 1.2 - 0.25; const rr = 0.75 * k; leaves.push(sph(0.34 * k, { pos: [top[0] + Math.cos(a) * rr * Math.cos(e), top[1] + Math.sin(e) * rr * 0.8, Math.sin(a) * rr * Math.cos(e)], rot: [R() * 2, a, R() * 2], scale: [1, 0.32, 0.62] }, 14, 10)); }
        leaves.push(sph(0.55 * k, { pos: top, scale: [1, 0.8, 1] }));
      } else leaves = [sph(0.9 * k, { pos: [top[0], h + 0.45 * k, 0] })];
      return { name: 'Tree', parts: [
        ...part('Trunk', c.trunk, trunk), ...part('Leaves', c.leaves, leaves, { roughness: S.finish.foliage }),
        ...(p.fruit && p.style !== 'pine' ? part('Fruit', c.fruit, Array.from({ length: 7 }, () => { const a = R() * Math.PI * 2, e = R() * 1.2 - 0.3; return sph(0.08, { pos: [top[0] + Math.cos(a) * 0.85 * k * Math.cos(e), top[1] + Math.sin(e) * 0.8 * k, Math.sin(a) * 0.85 * k * Math.cos(e)] }, 12, 10); }), { roughness: 0.4 }) : []),
      ] };
    },
  },
  hill: {
    label: 'Hill', kind: 'location',
    params: [num('width', 'Width', 1, 0.4, 3), num('height', 'Height', 1, 0.3, 2.5), P('flowers', 'Flowers', 'number', 10, { min: 0, max: 60, step: 1 }), P('texture', 'Grass texture', 'bool', true)],
    parts: { grass: ['Grass', '#7BC96F'], flowers: ['Flowers', '#FF7FA3'] },
    build(p, c, S) {
      const W = 3 * p.width, H = 1.2 * p.height; const R = rng(Math.round(p.flowers) + 3);
      const flowers = []; const centers = [];
      for (let i = 0; i < Math.round(p.flowers); i++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.85; const x = Math.cos(a) * d * W, z = Math.sin(a) * d * W * 0.7;
        const y = H * Math.sqrt(Math.max(0, 1 - (x / W) ** 2 - (z / (W * 0.7)) ** 2));
        if (S.scenery.petal_flowers) { const f = petalFlower(x, y, z, 0.06); flowers.push(...f.petals); centers.push(f.center); } else flowers.push(sph(0.07, { pos: [x, y + 0.02, z], scale: [1, 0.5, 1] }, 10, 8));
      }
      return { name: 'Hill', parts: [
        ...part('Grass', c.grass, [sph(1, { scale: [W, H, W * 0.7] }, 40, 20)], { roughness: S.finish.foliage, ...(p.texture ? { texture: grassTexture(c.grass), color: [1, 1, 1] } : {}) }),
        ...(flowers.length ? part('Flowers', c.flowers, flowers) : []), ...(centers.length ? part('FlowerCentres', S.roles.sun, centers) : []),
      ] };
    },
  },
  stone: {
    label: 'Stone (landmark)', kind: 'prop',
    params: [num('size', 'Size', 1, 0.2, 3), num('flatness', 'Flatness', 0.45, 0.2, 1), P('shape', 'Shape', 'select', 'round', { options: ['round', 'leaf_seed', 'ledge'] }), P('moss', 'Moss patches', 'bool', true)],
    parts: { body: ['Stone', '#B8C0CA'], moss: ['Moss', '#9AD88A'] },
    build(p, c, S) {
      const sc = { round: [1, p.flatness, 0.9], leaf_seed: [1.5, p.flatness * 0.6, 0.85], ledge: [2.2, p.flatness * 0.7, 1.2] }[p.shape];
      return { name: 'Stone', scale: [p.size, p.size, p.size], parts: [
        ...part('Body', c.body, [xf(new THREE.IcosahedronGeometry(0.5, 3), { pos: [0, 0.5 * sc[1] * 0.8, 0], scale: sc })], { roughness: S.finish.rock }),
        ...(p.moss ? part('Moss', c.moss, [sph(0.18, { pos: [0.12 * sc[0], 0.5 * sc[1] * 1.55, 0.05], scale: [1.2, 0.25, 0.9] }), sph(0.12, { pos: [-0.18 * sc[0], 0.5 * sc[1] * 1.4, -0.08], scale: [1.2, 0.25, 0.9] })], { roughness: 0.95 }) : []),
      ] };
    },
  },
  flowers: {
    label: 'Flower cluster', kind: 'prop',
    params: [P('count', 'Flowers', 'number', 5, { min: 1, max: 12, step: 1 }), num('size', 'Flower size', 1, 0.4, 2.5), num('spread', 'Spread', 1, 0.3, 3)],
    parts: { petals: ['Petals', '#EFB2C2'], leaves: ['Leaves', '#8BB174'] },
    build(p, c, S) {
      const R = rng(Math.round(p.count * 7 + p.size * 10)); const petals = [], centers = [], stems = [];
      for (let i = 0; i < Math.round(p.count); i++) {
        const x = (R() - 0.5) * 0.6 * p.spread, z = (R() - 0.5) * 0.6 * p.spread, h = 0.18 + R() * 0.18;
        const f = petalFlower(x, h, z, 0.09 * p.size, 6); petals.push(...f.petals); centers.push(f.center);
        stems.push(xf(new THREE.CylinderGeometry(0.012, 0.016, h, 6), { pos: [x, h / 2, z] }), sph(0.06, { pos: [x + 0.04, 0.05, z], rot: [0, R() * 3, 0.5], scale: [1.4, 0.25, 0.7] }, 10, 6));
      }
      return { name: 'Flowers', parts: [...part('Petals', c.petals, petals, { roughness: S.finish.foliage }), ...part('FlowerCentres', S.roles.accent || '#F4C430', centers), ...part('Leaves', c.leaves, stems, { roughness: S.finish.foliage })] };
    },
  },
  rainbow: {
    label: 'Rainbow', kind: 'prop',
    params: [num('size', 'Size', 1, 0.3, 3), num('thickness', 'Band thickness', 1, 0.5, 2)],
    parts: { band1: ['Band 1', '#EFA6A6'], band2: ['Band 2', '#F5C6A5'], band3: ['Band 3', '#F4E3A1'], band4: ['Band 4', '#A9D3A0'], band5: ['Band 5', '#9FC6D9'], band6: ['Band 6', '#B9AEDC'] },
    build(p, c) {
      const w = 0.1 * p.thickness;
      return { name: 'Rainbow', scale: [p.size, p.size, p.size], parts: [1, 2, 3, 4, 5, 6].flatMap((i) => part(`Band${i}`, c[`band${i}`], [xf(new THREE.TorusGeometry(1.5 - (i - 1) * w * 1.6, w, 16, 64, Math.PI), {})], { roughness: 0.7 })) };
    },
  },
  meadow: {
    label: 'Meadow (scenery)', kind: 'location', scenery: true,
    params: [num('size', 'Ground size', 1, 0.5, 2), P('layout', 'Ground shape', 'select', 'round', { options: ['round', 'leaf'], styleSelect: ['scenery', 'leaf_terrain', 'leaf'] }),
      P('path', 'Winding path', 'bool', false, { styleBool: ['scenery', 'path'] }), P('flowers', 'Flowers on the ground', 'number', 36, { min: 0, max: 120, step: 1 }), P('texture', 'Grass texture', 'bool', true)],
    parts: { ground: ['Ground', '#7BC96F'], flowers: ['Flowers', '#FF7FA3'], path: ['Path', '#C99A72'] },
    build(p, c, S) {
      const Sz = p.size; const R = rng(Math.round(p.flowers) + 11);
      let ground;
      if (p.layout === 'leaf') {
        // A giant curled leaf seen from above: pointed oval with a raised, curled tip.
        const sh = new THREE.Shape(); sh.moveTo(-9, 0);
        sh.bezierCurveTo(-5, 6.2, 5, 6.5, 10, 0.6); sh.bezierCurveTo(5, -5.8, -5, -6, -9, 0);
        ground = xf(new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.9, bevelSegments: 6, curveSegments: 48 }), { pos: [0, -1.1, -1], rot: [-Math.PI / 2, 0, 0], scale: [Sz, Sz, 1] });
      } else ground = sph(10, { pos: [0, -1.8, -1], scale: [Sz, 0.18, 0.75 * Sz] }, 48, 24);
      const fl = {}; const centers = [];
      const palette = [c.flowers, ...(S.roles.flowers || []).slice(1), '#FFFFFF'];
      for (let i = 0; i < Math.round(p.flowers); i++) {
        const col = palette[i % palette.length]; const x = (R() - 0.5) * 14 * Sz, z = (R() - 0.5) * 7 * Sz - 1;
        if (S.scenery.petal_flowers) { const f = petalFlower(x, 0.02, z, 0.07); (fl[col] ||= []).push(...f.petals); centers.push(f.center); }
        else (fl[col] ||= []).push(sph(0.09, { pos: [x, 0.04, z], scale: [1, 0.5, 1] }, 10, 8));
      }
      const veins = p.path ? [
        ...part('Path', c.path, [ribbon([[-8 * Sz, 0.5], [-4 * Sz, -1.2], [0, 0.8], [4 * Sz, -0.6], [8.5 * Sz, 0.4]], 1.1, 0.05)], { roughness: 0.95 }),
        ...part('Veins', shade(c.ground, 1.08), [ribbon([[-2, 0.4], [-0.5, 3.2], [1.5, 4.6]], 0.35, 0.04), ribbon([[2, 0.2], [3.5, -2.8], [5, -4.2]], 0.35, 0.04), ribbon([[-5, -0.6], [-6, -3.2], [-6.5, -4.5]], 0.3, 0.04)], { roughness: 0.9 }),
      ] : [];
      return { name: 'Meadow', parts: [
        ...part('Ground', c.ground, [ground], { roughness: S.finish.foliage, ...(p.texture ? { texture: grassTexture(c.ground), color: [1, 1, 1] } : {}) }),
        ...veins,
        ...Object.entries(fl).flatMap(([col, gs], i) => part(i === 0 ? 'Flowers' : `Flowers${i}`, col, gs)),
        ...(centers.length ? part('FlowerCentres', S.roles.accent || '#F4C430', centers) : []),
      ] };
    },
  },
};
/** Objects a scenery recipe may contain (each individually movable / recolourable). */
export const SCENERY_OBJECT_TEMPLATES = ['tree', 'hill', 'cloud', 'sun', 'moon', 'star', 'stone', 'flowers', 'rainbow', 'bunny'];

export function templateList(style = DEFAULT_STYLE) {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    key, label: t.label, kind: t.kind, scenery: !!t.scenery,
    params: t.params.map((d) => ({ ...d, default: paramDefault(d, style) })),
    parts: Object.entries(t.parts).map(([k, [label, color]]) => ({ key: k, label, default: styledPartDefault(key, k, style, color) })),
  }));
}
function paramDefault(d, S) {
  if (!S) return d.default;
  if (d.styleKey === 'head') return S.proportions?.head ?? d.default;
  if (d.styleKey === 'torso') return S.proportions?.torso ?? d.default;
  if (d.styleKey === 'asymmetry') return S.asymmetry ?? d.default;
  if (d.styleBool === 'tufts') return !!S.features?.tufts;
  if (Array.isArray(d.styleBool)) return !!S[d.styleBool[0]]?.[d.styleBool[1]];
  if (d.styleSelect) { const [grp, key, val] = d.styleSelect; return S[grp]?.[key] ? val : d.default; }
  return d.default;
}

/** Fill defaults (from the recipe's World Style snapshot) and clamp values so any recipe is valid. */
export function normalizeRecipe(r, style = null) {
  const t = TEMPLATES[r?.template];
  if (!t) throw new Error(`Unknown template "${r?.template}". Supported: ${Object.keys(TEMPLATES).join(', ')}.`);
  const S = r.style || style || DEFAULT_STYLE;
  const params = {};
  for (const d of t.params) {
    let v = r.params?.[d.key] ?? paramDefault(d, S);
    if (d.type === 'number') v = clamp(v, d.min, d.max);
    if (d.type === 'bool') v = !!v;
    if (d.type === 'select' && !d.options.includes(v)) v = paramDefault(d, S);
    params[d.key] = v;
  }
  const parts = {};
  for (const [k, [, def]] of Object.entries(t.parts)) parts[k] = /^#[0-9a-f]{6}$/i.test(r.parts?.[k] || '') ? r.parts[k] : styledPartDefault(r.template, k, S, def);
  const out = { template: r.template, params, parts, style: S };
  if (t.scenery) {
    out.objects = (r.objects || []).filter((o) => SCENERY_OBJECT_TEMPLATES.includes(o.template)).map((o, i) => {
      const n = normalizeRecipe({ template: o.template, params: o.params, parts: o.parts, style: S });
      return { id: o.id || `obj${i + 1}`, name: o.name || TEMPLATES[o.template].label, template: n.template, params: n.params, parts: n.parts,
        position: (o.position || [0, 0, 0]).map(Number).slice(0, 3), rotation_y: Number(o.rotation_y || 0), scale: clamp(o.scale ?? 1, 0.1, 5) };
    });
  }
  return out;
}

/** "Apply current World Style": swap the style snapshot and update every colour still at the old style's default. */
export function restyleRecipe(recipe, newStyle) {
  const old = normalizeRecipe(recipe);
  const swap = (tpl, parts) => Object.fromEntries(Object.entries(parts).map(([k, v]) => {
    const def = TEMPLATES[tpl].parts[k][1];
    return [k, v.toLowerCase() === styledPartDefault(tpl, k, old.style, def).toLowerCase() ? styledPartDefault(tpl, k, newStyle, def) : v];
  }));
  return normalizeRecipe({
    ...old, style: newStyle, parts: swap(old.template, old.parts),
    ...(old.objects ? { objects: old.objects.map((o) => ({ ...o, parts: swap(o.template, o.parts) })) } : {}),
  });
}

/** Recipe -> GLB bytes. Scenery objects become separately named nodes (Object_<id>_<name>). */
export function buildFromRecipe(recipe, style = null) {
  const r = normalizeRecipe(recipe, style);
  const S = r.style;
  const t = TEMPLATES[r.template];
  const root = t.build(r.params, r.parts, S);
  if (r.objects?.length) {
    root.children = [...(root.children || []), ...r.objects.map((o) => {
      const n = TEMPLATES[o.template].build(o.params, o.parts, S);
      return { name: `Object_${o.id}_${o.name.replace(/\W+/g, '')}`, translation: o.position, rotation: quat(0, o.rotation_y, 0), scale: [o.scale, o.scale, o.scale], children: [n] };
    })];
  }
  const animations = [];
  if (r.template === 'bunny') {
    const ts = [0, 0.25, 0.5, 0.75, 1];
    const wig = (base, amp) => ts.flatMap((s) => quat(0, 0, base + amp * Math.sin(s * Math.PI * 2)));
    animations.push({ name: 'ear-wiggle', channels: [
      { node: 'EarLeft', path: 'rotation', times: ts, values: wig(earRest('left', r.params.left_ear, r.params.ear_asymmetry), 0.2) },
      { node: 'EarRight', path: 'rotation', times: ts, values: wig(earRest('right', r.params.right_ear), -0.2) },
    ] });
  }
  return writeGLB({ nodes: [root], animations, generator: `Rhymes Automation procedural (${r.template}) · World Style ${S.version || 'default'}` });
}

// ---------- uniqueness: every new design must differ clearly from the locked ones ----------
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const colorDist = (a, b) => Math.sqrt(hexRgb(a).reduce((s, v, i) => s + (v - hexRgb(b)[i]) ** 2, 0));
/** 0 = completely different … 1 = identical (same template only). */
export function similarity(a, b) {
  if (a.template !== b.template) return 0;
  const t = TEMPLATES[a.template]; let s = 0, n = 0;
  for (const d of t.params) {
    const x = a.params[d.key], y = b.params[d.key];
    const w = ['left_ear', 'right_ear', 'freckles', 'tooth', 'pose', 'eye_style', 'ray_style', 'style', 'left_paw_shiny', 'right_paw_shiny', 'shape', 'layout'].includes(d.key) ? 2 : 1;
    s += w * (d.type === 'number' ? 1 - Math.min(1, Math.abs(x - y) / ((d.max - d.min) || 1) * 3) : x === y ? 1 : 0); n += w;
  }
  for (const k of Object.keys(t.parts)) { const w = ['body', 'core', 'left_paw', 'right_paw', 'eyes'].includes(k) ? 2 : 1; s += w * (1 - Math.min(1, colorDist(a.parts[k], b.parts[k]) / 90)); n += w; }
  return +(s / n).toFixed(2);
}
export const SIMILARITY_LIMIT = 0.84;

/** Human-readable signature (what makes this design recognizable). */
export function signatureOf(r) {
  const p = r.params, c = r.parts, d = TEMPLATES[r.template].parts;
  if (r.template !== 'bunny') return `${TEMPLATES[r.template].label}: ${Object.entries(p).filter(([, v]) => typeof v !== 'number').map(([k, v]) => `${k} ${v}`).join(', ')}`;
  const bits = [];
  for (const s of ['left', 'right']) if (p[`${s}_ear`] !== 'straight') bits.push(`own ${s} ear ${p[`${s}_ear`]}`);
  for (const s of ['left', 'right']) if (c[`${s}_paw`].toLowerCase() !== c.body.toLowerCase()) bits.push(`own ${s} paw ${c[`${s}_paw`]}`);
  if (p.freckles) bits.push(`${p.freckles} freckles (own ${p.freckle_side} cheek)`);
  if (p.tooth) bits.push('front tooth');
  if (p.pose === 'four_legged') bits.push('four-legged');
  bits.push(`fur ${c.body}`);
  void d;
  return bits.join(' · ');
}

/** Check a recipe against other (locked) recipes. */
export function uniquenessReport(recipe, others) {
  const r = normalizeRecipe(recipe);
  const scored = others.map((o) => ({ ...o, score: similarity(r, normalizeRecipe(o.recipe)) })).filter((o) => o.score > 0).sort((a, b) => b.score - a.score);
  const top = scored[0];
  return { unique: !top || top.score < SIMILARITY_LIMIT, closest: top ? { name: top.name, item_id: top.item_id, score: top.score, signature: signatureOf(normalizeRecipe(top.recipe)) } : null, signature: signatureOf(r), limit: SIMILARITY_LIMIT };
}

/** Change the fewest signature features needed to become clearly different from every other design. */
export function makeUnique(recipe, others) {
  let r = normalizeRecipe(recipe);
  const S = r.style; const changes = [];
  const pool = [...new Set([...(S.palette || []), ...Object.values(S.roles).flat()])].filter((h) => /^#[0-9a-f]{6}$/i.test(h));
  const lum = (h) => { const [a, b, c] = hexRgb(h); return (0.299 * a + 0.587 * b + 0.114 * c) / 255; };
  const furPool = pool.filter((h) => lum(h) > 0.55); // fur alternatives: light base colours only
  const steps = r.template === 'bunny' ? [
    () => { const used = new Set(others.map((o) => normalizeRecipe(o.recipe).parts.body)); const c = furPool.find((h) => ![...used].some((u) => colorDist(u, h) < 45) && colorDist(h, r.parts.body) > 40); if (c) { const old = r.parts.body; r.parts = { ...r.parts, body: c, left_paw: r.parts.left_paw === old ? c : r.parts.left_paw, right_paw: r.parts.right_paw === old ? c : r.parts.right_paw }; changes.push(`fur colour → ${c}`); } },
    () => { const opts = ['floppy', 'crescent', 'straight'].filter((o) => o !== r.params.left_ear); r.params = { ...r.params, left_ear: opts[0] }; changes.push(`own left ear → ${opts[0]}`); },
    () => { if (!r.params.freckles) { r.params = { ...r.params, freckles: 3, freckle_side: r.params.freckle_side === 'right' ? 'left' : 'right' }; changes.push('3 freckles'); } },
    () => { r.params = { ...r.params, eye_style: r.params.eye_style === 'wide' ? 'soft' : 'wide' }; changes.push(`eye shape → ${r.params.eye_style}`); },
    () => {
      // Accent paws come from the world's accent colours (never a dark iris/charcoal tone).
      const accents = [S.roles.cheeks, S.roles.nose, '#EE8A78', '#D9922E', '#E9A97A', S.roles.accent].filter((h) => /^#[0-9a-f]{6}$/i.test(h || ''));
      const accent = accents.find((h) => colorDist(h, r.parts.body) > 60 && colorDist(h, r.parts.left_paw) > 60 && lum(h) > 0.45) || accents[0];
      r.parts = { ...r.parts, right_paw: accent }; changes.push(`own right paw → ${accent}`);
    },
    () => { r.params = { ...r.params, tooth: !r.params.tooth }; changes.push(r.params.tooth ? 'front tooth' : 'no tooth'); },
  ] : [
    () => { const k = Object.keys(r.parts)[0]; const c = pool.find((h) => colorDist(h, r.parts[k]) > 70); if (c) { r.parts = { ...r.parts, [k]: c }; changes.push(`${k} colour → ${c}`); } },
    () => { const d = TEMPLATES[r.template].params.find((x) => x.type === 'select'); if (d) { const o = d.options.find((v) => v !== r.params[d.key]); r.params = { ...r.params, [d.key]: o }; changes.push(`${d.label} → ${o}`); } },
    () => { const d = TEMPLATES[r.template].params.find((x) => x.type === 'number'); if (d) { const v = clamp(r.params[d.key] + (d.max - d.min) * 0.35, d.min, d.max); r.params = { ...r.params, [d.key]: v === r.params[d.key] ? d.min : v }; changes.push(`${d.label} changed`); } },
  ];
  for (const step of steps) {
    if (uniquenessReport(r, others).unique) break;
    step(); r = normalizeRecipe(r);
  }
  return { recipe: r, changes, report: uniquenessReport(r, others) };
}

// ---------- description -> recipe ----------
export const COLORS = {
  red: '#FF5A5A', pink: '#FF8FB3', rose: '#FF7FA3', orange: '#FF9B5A', yellow: '#FFD23F', gold: '#F2B705', golden: '#F2B705', 'golden yellow': '#F4C430', amber: '#D9922E',
  green: '#7BC96F', mint: '#9EE6C1', lime: '#B6E36B', teal: '#3FB8AF', blue: '#7CB7FF', 'sky-blue': '#BFE3FF', 'sky blue': '#BFE3FF', skyblue: '#BFE3FF', navy: '#2D4A7A',
  purple: '#B79CFF', lavender: '#CDB8FF', violet: '#A77BFF', white: '#FFFFFF', cream: '#F7EEDC', silver: '#D9DEE6', grey: '#B8C0CA', gray: '#B8C0CA',
  brown: '#9A6A43', black: '#2B2140', peach: '#F5BFA0', coral: '#EE8A78',
  'oat cream': '#EADCC0', 'oat-cream': '#EADCC0', ivory: '#FBF5E6', 'pale ivory': '#F5EEDB', 'moss green': '#8BB174', 'moss-green': '#8BB174', 'dusty teal': '#6E9E9B',
  'deep teal-brown': '#3E5450', 'deep teal': '#2F6B6B', 'teal-brown': '#4A5A4E', 'soft peach': '#F5C6A5', 'peach-pink': '#F4B3A6', 'petal pink': '#EFB2C2', 'dusty-pink': '#D9A3AE', 'dusty pink': '#D9A3AE',
  'lavender-gray': '#B4AEC4', 'lavender gray': '#B4AEC4', apricot: '#E9A97A', 'muted apricot': '#D99B78', charcoal: '#383640',
  'honey cream': '#FFE2A8', 'honey-cream': '#FFE2A8', 'snow white': '#FFFDF8', 'snow-white': '#FFFDF8', 'sunshine yellow': '#FFD23F',
  'leaf green': '#4CC35A', 'leaf-green': '#4CC35A', 'lime green': '#A6E04F', turquoise: '#21C7C4', 'royal blue': '#3E6BE0',
  'coral pink': '#FF6F7D', 'coral-pink': '#FF6F7D', 'bubblegum pink': '#FF7EC4', 'bubblegum-pink': '#FF7EC4', tangerine: '#FF9234', lilac: '#B98CF5',
  'cherry red': '#F03E4E', magenta: '#E8409E',
};
const TEMPLATE_WORDS = [
  ['bunny', /\b(bunny|bunnies|rabbit|hare)\b/], ['sun', /\b(sun|sunny|sunshine)\b/], ['moon', /\bmoon\b/], ['rainbow', /\brainbows?\b/], ['star', /\bstars?\b/],
  ['cloud', /\bclouds?\b/], ['tree', /\b(tree|trees|oak|apple tree|pine)\b/], ['stone', /\b(stones?|rocks?|boulder|pebbles?)\b/], ['flowers', /\b(flowers?|blossoms?|petals?)\b/],
  ['meadow', /\b(meadow|field|garden|park|countryside|valley|grassland|clearing|bend|hollow)\b/], ['hill', /\b(hill|hills|mound|ridge)\b/],
];
// Things the templates can't make — reported so you can pick Local AI, Import or Meshy instead.
const UNSUPPORTED = /\b(hat|cap|bonnet|scarf|glasses|bow tie|bowtie|dress|shirt|shoes|boots|wings?|horns?|wheels?|car|truck|train|boat|house|castle|bridge|river|lake|sea|ocean|mountain|elephant|monkey|dog|puppy|wolf|cat|kitten|tiger|bird|duck|fish|frog|bear|lion|cow|pig|horse|sheep|child|children|kid|girl|boy|person|people|umbrella|balloon|kite|ball|book|whiskers?)\b/g;

const colorBefore = (text, nounRe) => {
  const m = text.match(new RegExp(`\\b(${Object.keys(COLORS).sort((a, b) => b.length - a.length).map((k) => k.replace(/[ -]/, '[ -]')).join('|')})[ -]?(?:\\w+[ -]){0,2}?${nounRe}`));
  if (!m) return null;
  const key = Object.keys(COLORS).find((k) => k.replace(/[ -]/g, '') === m[1].replace(/[ -]/g, ''));
  return key ? COLORS[key] : null;
};

/**
 * Map a free-text description to a supported template + parameters, starting from the World Style.
 * Purely local (no AI, no network). Returns {supported, recipe, applied:[...], unsupported:[...], message}
 */
export function mapDescription({ name = '', description = '', signature = '', kind, style = null } = {}) {
  const S = style || DEFAULT_STYLE;
  const text = `${name} ${description} ${signature}`.toLowerCase();
  const nm = String(name).toLowerCase();
  const desc = `${description} ${signature}`.toLowerCase();
  // Scenery assets prefer scenery templates even when the name contains e.g. "Sunny" ("Sunny Bend" is a place).
  const order = kind === 'location' ? [...TEMPLATE_WORDS].sort((a, b) => (['meadow', 'hill'].includes(b[0]) ? 1 : 0) - (['meadow', 'hill'].includes(a[0]) ? 1 : 0)) : TEMPLATE_WORDS;
  const earliest = (s) => TEMPLATE_WORDS.map((tw) => [tw, s.search(tw[1])]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0]?.[0];
  const hit = order.find(([, re]) => re.test(nm)) || (kind === 'location' && order.find(([, re]) => re.test(desc))) || earliest(desc);
  const unsupported = [...new Set((text.match(UNSUPPORTED) || []))];
  if (!hit) {
    return { supported: false, recipe: null, applied: [], unsupported,
      message: `No offline template matches “${name || description}”. Supported: ${Object.values(TEMPLATES).map((t) => t.label.toLowerCase()).join(', ')}. Use Local AI (with a World-Style reference image), Import Model or Generate in Meshy — or pick a template manually.` };
  }
  const template = hit[0];
  const t = TEMPLATES[template];
  const params = {}; const parts = {}; const applied = [`Template: ${t.label}`, `World Style ${S.version && S.version !== 'default' ? 'applied' : '(default)'}`];
  const PARTW = '(?:\\s+(?:\\w+\\s+)?(?:eyes?|ears?|paws?|cheeks?|nose|belly|head|tail|feet|rays?|smile|face|teeth|tooth|freckles?|tufts?|lock|details?|things?))';
  const sizeRe = (words) => new RegExp(`\\b(${words})\\b(?!${PARTW})`);
  const size = sizeRe('huge|giant|big|large').test(text) ? 1.3 : sizeRe('tiny|small|little|baby').test(text) ? 0.85 : null;

  if (template === 'bunny') {
    if (size) { params.height = size; applied.push(`Size ×${size}`); }
    if (/four-legged|on all fours|quadruped|four legs/.test(text)) { params.pose = 'four_legged'; applied.push('Four-legged pose'); }
    const body = colorBefore(text, '(bunny|rabbit|hare|fur|body)');
    if (body) { parts.body = body; parts.left_paw = body; parts.right_paw = body; applied.push(`Fur ${body}`); }
    // "own right ear sweeps outward and curls inward at the top like a crescent Moon" / "crescent-shaped right ear"
    const cres = text.match(/\b(left|right)\s+ear\b[^.]{0,90}?crescent|crescent[- ](?:shaped|moon)?[ -]?(?:\w+ ){0,1}?(left|right)?[ -]?ear|\bear\b[^.]{0,90}?crescent/);
    if (cres) { const side = (cres[1] || cres[2] || 'right'); params[`${side}_ear`] = 'crescent'; applied.push(`Own ${side} ear curls like a crescent`); }
    const up = text.match(/\b(left|right)\s+ear\s+stands?\s+upright/); if (up) params[`${up[1]}_ear`] = params[`${up[1]}_ear`] === 'crescent' ? 'crescent' : 'straight';
    if (/floppy|droopy/.test(text)) { for (const s of ['left', 'right']) if (!params[`${s}_ear`]) params[`${s}_ear`] = 'floppy'; applied.push('Floppy ears'); }
    if (/long ears?/.test(text)) { params.ear_length = 1.4; applied.push('Long ears'); }
    if (/big (?:shiny |round )?eyes/.test(text)) { params.eye_size = 1.3; applied.push('Big eyes'); }
    if (/wide eyes|lifted brow|curious/.test(text)) { params.eye_style = 'wide'; applied.push('Wide, curious eyes'); } else if (/shy|softer upper lids|sleepy/.test(text)) { params.eye_style = 'soft'; applied.push('Soft, shy eyelids'); }
    const colorWords = Object.keys(COLORS).sort((a, b) => b.length - a.length).map((k) => k.replace(/[ -]/, '[ -]')).join('|');
    const paw = text.match(new RegExp(`(left|right)?[ -]?(?:front )?paw[^.]{0,24}?\\b(${colorWords})\\b|\\b(${colorWords})\\b(?:[ -](?:coloured|colored))?[ -](?:own )?(?:front[ -])?(left|right)?[ -]?(?:front )?paw`));
    if (paw) {
      const side = (paw[1] || paw[4] || 'right'); const word = (paw[2] || paw[3]);
      const key = Object.keys(COLORS).find((k) => k.replace(/[ -]/g, '') === word.replace(/[ -]/g, ''));
      parts[`${side}_paw`] = COLORS[key]; if (/gold/.test(word)) params[`${side}_paw_shiny`] = true;
      applied.push(`Own ${side} front paw ${word}`);
    }
    const fr = text.match(/\b(one|two|three|four|five|\d)\s+(?:small\s+|little\s+|tiny\s+)?freckles?(?:[^.]{0,30}?\b(left|right)\b)?/);
    if (fr) { params.freckles = { one: 1, two: 2, three: 3, four: 4, five: 5 }[fr[1]] || Number(fr[1]); if (fr[2]) params.freckle_side = fr[2]; applied.push(`${params.freckles} freckles${fr[2] ? ` (own ${fr[2]} cheek)` : ''}`); }
    if (/\btooth\b|\bteeth\b/.test(text)) { params.tooth = true; applied.push('Little front tooth'); }
    if (/tufts?/.test(text)) { params.tufts = true; applied.push('Fur tufts'); }
    const belly = colorBefore(text, '(belly|chest|muzzle)'); if (belly) { parts.belly = belly; applied.push(`Muzzle & chest ${belly}`); }
    const iris = colorBefore(text, 'eyes'); if (iris) { parts.eyes = iris; applied.push(`Eyes ${iris}`); }
    const nose = colorBefore(text, 'nose'); if (nose) { parts.nose = nose; applied.push(`Nose ${nose}`); }
    const inner = text.match(/(peach-pink|petal pink|soft peach|pink)[^.]{0,6}interiors?|interiors?[^.]{0,6}(peach-pink|petal pink|pink)/); if (inner) { parts.inner_ear = COLORS[(inner[1] || inner[2]).replace('-', ' ')] || COLORS[inner[1] || inner[2]]; applied.push('Inner ears coloured'); }
  } else if (template === 'sun') {
    if (size) params.size = size;
    if (/petal/.test(text)) { params.ray_style = 'petal'; applied.push('Petal-like rays'); }
    if (/no face|without a face/.test(text)) params.face = false; else applied.push('Friendly face');
    const c = colorBefore(text, '(sun|sunny)'); if (c) { parts.core = c; applied.push(`Colour ${c}`); }
  } else if (template === 'moon') {
    if (size) params.size = size;
    params.shape = /\bfull moon\b|round moon|full form/.test(text) ? 'full' : 'crescent'; applied.push(`${params.shape} moon`);
    if (/no face/.test(text)) params.face = false;
  } else if (template === 'star') {
    if (size) params.size = size;
    const pts = text.match(/\b(four|five|six|seven|eight|4|5|6|7|8)[- ]point/); if (pts) { params.points = { four: 4, five: 5, six: 6, seven: 7, eight: 8 }[pts[1]] || Number(pts[1]); applied.push(`${params.points} points`); }
    const c = colorBefore(text, 'stars?'); if (c) { parts.body = c; applied.push(`Colour ${c}`); }
  } else if (template === 'cloud') {
    if (size) params.size = size * 1.2;
    if (/lobe/.test(text)) { params.style = 'lobes'; applied.push('One large lobe + two trailing'); } else if (/fluffy|puffy/.test(text)) { params.puffs = 7; applied.push('Extra puffy'); }
    if (/smil|face|happy|sleepy/.test(text)) { params.face = true; applied.push('Friendly face'); }
    const c = colorBefore(text, 'clouds?'); if (c) { parts.body = c; applied.push(`Colour ${c}`); }
  } else if (template === 'tree') {
    if (size) params.height = size;
    if (/pine|fir|christmas/.test(text)) params.style = 'pine'; else if (/leaf clusters?|overlapping leaf/.test(text)) params.style = 'leafcluster'; else if (/bushy|cluster/.test(text)) params.style = 'cluster';
    if (/curved/.test(text)) { params.curve = 0.4; applied.push('Curved trunk'); }
    if (/apple|fruit|cherr|orange tree/.test(text)) { params.fruit = true; applied.push('Fruit'); }
  } else if (template === 'stone') {
    if (/leaf seed|seed-shaped|leaf-seed/.test(text)) { params.shape = 'leaf_seed'; applied.push('Leaf-seed shaped'); } else if (/ledge|shelf|ridge/.test(text)) params.shape = 'ledge';
    const c = colorBefore(text, '(stones?|rocks?)'); if (c) { parts.body = c; applied.push(`Colour ${c}`); }
  } else if (template === 'flowers') {
    const c = colorBefore(text, '(flowers?|petals?)'); if (c) { parts.petals = c; applied.push(`Petals ${c}`); }
  } else if (template === 'hill') {
    if (size) { params.width = size; params.height = size; }
    if (/flower/.test(text)) { params.flowers = 24; applied.push('Flowers'); }
  } else if (template === 'meadow') {
    applied.push('Scenery with separately editable objects');
    if (/leaf/.test(text)) params.layout = 'leaf';
    if (/path/.test(text)) params.path = true;
  }
  // Colours named in a description snap to the nearest World Style palette colour, so every design stays on-palette.
  const worldColors = [...new Set([...(S.palette || []), ...Object.values(S.roles || {}).flat()])].filter((h) => /^#[0-9a-f]{6}$/i.test(h));
  if (worldColors.length && S.version !== 'default') {
    for (const [k, v] of Object.entries(parts)) {
      const best = worldColors.map((w) => [w, colorDist(w, v)]).sort((a, b) => a[1] - b[1])[0];
      if (best && best[1] > 0 && best[1] < 75) { parts[k] = best[0]; }
    }
    applied.push('Colours snapped to the World Style palette');
  }
  let recipe = { template, params, parts };
  if (t.scenery) recipe.objects = defaultMeadowObjects(text, S);
  recipe = normalizeRecipe(recipe, S);
  const extra = unsupported.filter((u) => !(template === 'meadow' && /flower/.test(u)));
  return {
    supported: true, recipe, applied, unsupported: extra,
    message: extra.length
      ? `Built with the ${t.label} template in your World Style. Not supported offline: ${extra.join(', ')} — remove them, add them later in Blender, or use Local AI / Import / Meshy for this asset.`
      : `Mapped to the ${t.label} template, following your World Style.`,
  };
}

export function defaultMeadowObjects(text = '', S = DEFAULT_STYLE) {
  const far = S.roles?.foliage_far || '#9AD88A', near = S.roles?.foliage || '#7BC96F';
  const layers = S.scenery?.hill_layers || 2;
  const hills = Array.from({ length: layers }, (_, i) => ({
    // Rolling hills behind the ground, each layer further back and cooler (bluer) with distance.
    id: `hill${i + 1}`, name: `Back hill ${i + 1}`, template: 'hill', params: { width: 1.3 + i * 0.35, height: 1.1 + i * 0.3, flowers: 0 },
    parts: { grass: mix(near, far, 0.3 + i * 0.3) }, position: [i % 2 ? 6 : -5 + i * 2, -0.9 - i * 0.15, -8 - i * 3.5],
  }));
  const leafy = S.scenery?.leaf_canopies ? 'leafcluster' : 'round';
  const objs = [
    ...hills,
    { id: 'tree1', name: 'Tree (left)', template: 'tree', params: { height: 1, canopy: 1, style: leafy, curve: 0.3 }, position: [-5.5, 0, -4] },
    { id: 'tree2', name: 'Tree (right)', template: 'tree', params: { height: 1.2, canopy: 1.1, style: /apple|fruit/.test(text) ? 'round' : leafy, fruit: /apple|fruit/.test(text), curve: 0.25 }, position: [6, 0, -5.5], rotation_y: Math.PI },
  ];
  if (S.scenery?.stones) objs.push({ id: 'stone1', name: 'Landmark stone', template: 'stone', params: { size: 0.9, shape: 'leaf_seed' }, parts: { body: S.roles?.soil || '#C99A72' }, position: [1.5, 0, 1.2] });
  if (S.scenery?.petal_flowers) objs.push({ id: 'flowers1', name: 'Flower cluster', template: 'flowers', params: { count: 6, size: 1.1 }, position: [-2.5, 0, 2] });
  if (/cloud/.test(text)) objs.push({ id: 'cloud1', name: 'Cloud', template: 'cloud', params: { size: 1.2 }, position: [-2, 4.5, -8] });
  return objs;
}

/** Simple offline description for an asset card (used when Claude is not used). */
export function draftDescription({ name, kind, signature, lyricLines = [] }) {
  const where = lyricLines.length ? ` Appears in: “${lyricLines[0]}”${lyricLines.length > 1 ? ` (+${lyricLines.length - 1} more)` : ''}.` : '';
  const sig = signature ? ` Signature features: ${signature}` : '';
  return `${name} — a ${kind === 'location' ? 'scenery set' : kind} in the World Style.${sig}${where}`.replace(/\s+/g, ' ').trim();
}
