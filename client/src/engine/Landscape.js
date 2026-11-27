// The landscape around the scenery: sky, clouds, far hills, horizon trees, set dressing and the ground.
// "Scenery" (a Stage 2 location card) is the stage the characters stand on. The landscape is everything around it
// out to the horizon, so a small scenery model never floats in an empty green disc under a flat blue colour.
// Everything here is procedural and deterministic (seeded), so the preview and the MP4 export are identical.
import * as THREE from 'three';

/** Defaults for a project's look. Every field can be changed in Stage 4 → Look (project) or per shot. */
export const LOOK_DEFAULTS = {
  sky: 'auto',          // auto (follows the lighting) | clear | soft | storybook
  clouds: 'some',       // none | few | some | many
  hills: 'rolling',     // none | low | rolling | tall
  trees: 'some',        // none | few | some | many  (trees on the far hills)
  dressing: 'light',    // none | light | lush       (flowers, bushes and grass tufts around the scenery)
  ground: '',           // '' = from the World Style foliage colour, or a #hex
  hill_tint: '',        // '' = from the World Style, or a #hex
  title_card: true,     // song title over the opening
  end_card: true,       // "bye-bye" card over the ending
  end_text: 'Bye-bye! Sing again soon!',
  karaoke: true,        // highlight the words as they are sung
  transition: 'auto',   // default between shots: auto | cut | dissolve | dip-white | iris | wipe
  fade_in_out: true,    // fade in at the start and out at the end
  river: 'none',        // none | behind | winding   (a river with flowing water behind the play area)
  houses: 'none',       // none | few | some | many  (colourful cottages around the play area)
  wind: 'breezy',       // calm | breezy | windy     (how much trees, flowers and grass sway)
  birds: 'few',         // none | few | some         (birds circling in the sky)
};
export const LOOK_OPTIONS = {
  sky: ['auto', 'clear', 'soft', 'storybook'], clouds: ['none', 'few', 'some', 'many'], hills: ['none', 'low', 'rolling', 'tall'],
  trees: ['none', 'few', 'some', 'many'], dressing: ['none', 'light', 'lush'], transition: ['auto', 'cut', 'dissolve', 'dip-white', 'iris', 'wipe'],
  river: ['none', 'behind', 'winding'], houses: ['none', 'few', 'some', 'many'], wind: ['calm', 'breezy', 'windy'], birds: ['none', 'few', 'some'],
};
export const lookOf = (projectLook, shotLook) => ({ ...LOOK_DEFAULTS, ...(projectLook || {}), ...Object.fromEntries(Object.entries(shotLook || {}).filter(([, v]) => v !== '' && v != null && v !== 'project')) });

// ---- sky colours per lighting preset (zenith, horizon, sun glow) ----
export const SKY = {
  morning: { top: '#8EC9F2', mid: '#FFD9C2', horizon: '#FFE9C9', glow: '#FFC98F', ground: '#9CCB7E', haze: '#F6DCC8' },
  day: { top: '#3FA6EE', mid: '#8FD0FA', horizon: '#DDF3FF', glow: '#FFF6D8', ground: '#7CC46A', haze: '#C9E8F7' },
  sunset: { top: '#6D7FD8', mid: '#F59AA0', horizon: '#FFC48A', glow: '#FFB070', ground: '#8DA86A', haze: '#F2B9A4' },
  night: { top: '#0E1440', mid: '#26306E', horizon: '#3E4A8C', glow: '#9FB2FF', ground: '#2E4A4A', haze: '#2C3770' },
};

const rnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const col = (c) => new THREE.Color(c);
const mix = (a, b, k) => col(a).lerp(col(b), k);

/** Gradient sky dome with a soft glow around the sun direction. */
function skyDome(p, sunDir) {
  const g = new THREE.SphereGeometry(300, 48, 24);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: col(p.top) }, mid: { value: col(p.mid) }, horizon: { value: col(p.horizon) }, glow: { value: col(p.glow) }, sunDir: { value: sunDir.clone().normalize() }, soft: { value: p.soft ?? 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; uniform float soft; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = h < 0.18 ? mix(horizon, mid, smoothstep(-0.02, 0.18, h)) : mix(mid, top, smoothstep(0.18, 0.85, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += glow * (pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12) * soft;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}

/** A puffy cartoon cloud: a few overlapping squashed spheres with a flat underside. */
function cloud(r, night) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: night ? '#8C98C8' : '#FFFFFF', roughness: 1, emissive: night ? '#20264a' : '#d8ecff', emissiveIntensity: night ? 0.4 : 0.35, fog: false });
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = 1.6 + r() * 1.6 * (1 - Math.abs(i - n / 2) / n);
    const b = new THREE.Mesh(new THREE.SphereGeometry(s, 20, 14), mat);
    b.position.set((i - (n - 1) / 2) * 2.1 + (r() - 0.5), s * 0.35 + r() * 0.6, (r() - 0.5) * 1.6);
    b.scale.y = 0.8;
    grp.add(b);
  }
  return grp;
}

/** A ring of rolling hills (seen from the middle). Height varies around the ring; a gentle hump across its width. */
function hillRing(r0, r1, height, color, seed, topColor) {
  const g = new THREE.RingGeometry(r0, r1, 180, 8); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position; const colors = new Float32Array(pos.count * 3);
  const r = rnd(seed); const ph = [r() * 6.28, r() * 6.28, r() * 6.28]; const fr = [2 + Math.floor(r() * 3), 5 + Math.floor(r() * 4), 11 + Math.floor(r() * 5)];
  const c0 = col(color), c1 = col(topColor || color);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); const d = Math.hypot(x, z); const a = Math.atan2(z, x);
    const across = Math.sin(Math.PI * Math.min(1, Math.max(0, (d - r0) / (r1 - r0))));
    const wave = 0.55 + 0.3 * Math.sin(a * fr[0] + ph[0]) + 0.15 * Math.sin(a * fr[1] + ph[1]) + 0.06 * Math.sin(a * fr[2] + ph[2]);
    const y = height * Math.max(0, wave) * Math.pow(across, 0.8);
    pos.setY(i, y - 0.05);
    const k = Math.min(1, y / (height || 1));
    const c = c0.clone().lerp(c1, k * 0.6); colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.receiveShadow = false;
  const heightAt = (x, z) => { // approximate surface height for placing trees
    const d = Math.hypot(x, z); const a = Math.atan2(z, x);
    const across = Math.sin(Math.PI * Math.min(1, Math.max(0, (d - r0) / (r1 - r0))));
    const wave = 0.55 + 0.3 * Math.sin(a * fr[0] + ph[0]) + 0.15 * Math.sin(a * fr[1] + ph[1]) + 0.06 * Math.sin(a * fr[2] + ph[2]);
    return height * Math.max(0, wave) * Math.pow(across, 0.8) - 0.05;
  };
  return { mesh: m, heightAt };
}

/** Instanced lollipop trees (round crown on a short trunk) in the World Style foliage colours. */
function trees(points, crownColors, scale = 1) {
  const grp = new THREE.Group();
  const trunkG = new THREE.CylinderGeometry(0.18, 0.26, 1.4, 8); trunkG.translate(0, 0.7, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 2); crownG.translate(0, 2.2, 0);
  const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#9A6A45', roughness: 1 }), points.length);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ roughness: 0.9 }), points.length);
  const mtx = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
  const place = (i, p, ax = 0, az = 0) => {
    const s = p.s * scale; q.setFromEuler(e.set(ax, 0, az)); const at = new THREE.Vector3(p.x, p.y, p.z);
    mtx.compose(at, q, new THREE.Vector3(s, s, s)); trunk.setMatrixAt(i, mtx);
    mtx.compose(at, q, new THREE.Vector3(s * 1.15, s * 1.05, s * 1.15)); crowns.setMatrixAt(i, mtx);
  };
  points.forEach((p, i) => { place(i, p); crowns.setColorAt(i, col(crownColors[i % crownColors.length])); });
  grp.add(trunk, crowns);
  // Wind: every tree bends a little from its base, each with its own rhythm (deterministic in t).
  const sway = (t, amp) => {
    if (!amp) return;
    points.forEach((p, i) => { const ph = i * 1.7; const gust = 0.6 + 0.4 * Math.sin(t * 0.21 + p.x * 0.05); place(i, p, amp * gust * 0.5 * Math.sin(t * 0.8 + ph), amp * gust * Math.sin(t * 1.05 + ph * 1.3)); });
    trunk.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  };
  return { group: grp, sway };
}

/** A tileable water texture: deep and light turquoise bands, soft ripple lines and sparkles. Scrolled along the river to make it flow. */
let waterCanvas = null;
function waterTexture() {
  if (!waterCanvas) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#1C93C9'); g.addColorStop(0.5, '#4CC9EC'); g.addColorStop(1, '#1C93C9');
    x.fillStyle = g; x.fillRect(0, 0, 512, 128);
    const r = rnd(4242);
    for (let k = 0; k < 46; k++) { // ripple lines (they wrap around horizontally so the texture tiles)
      const y0 = 8 + r() * 112, len = 40 + r() * 90, x0 = r() * 512, amp = 1.5 + r() * 2.5;
      x.strokeStyle = `rgba(255,255,255,${0.18 + r() * 0.25})`; x.lineWidth = 1.5 + r() * 2; x.beginPath();
      for (let s = 0; s <= len; s += 4) { const px = (x0 + s) % 512; const py = y0 + Math.sin(s * 0.12) * amp; if (s === 0 || px < 4) x.moveTo(px, py); else x.lineTo(px, py); }
      x.stroke();
    }
    for (let k = 0; k < 70; k++) { x.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.5})`; x.beginPath(); x.ellipse(r() * 512, 6 + r() * 116, 1.2 + r() * 2.5, 0.8 + r() * 1.2, 0, 0, Math.PI * 2); x.fill(); }
    waterCanvas = c;
  }
  const t = new THREE.CanvasTexture(waterCanvas); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A river crossing behind the play area, with sandy banks and flowing water. Returns { group, zAt(x), width, update(t) }. */
function river({ zBase, winding, seed, preset }) {
  const r = rnd(seed * 31337 + 5); const ph1 = r() * 6.28, ph2 = r() * 6.28;
  const amp = winding ? 6 : 2.2; const width = winding ? 6.5 : 5.5;
  const zAt = (x) => zBase + amp * Math.sin(x * 0.045 + ph1) + amp * 0.35 * Math.sin(x * 0.11 + ph2);
  const strip = (w, y, uvScale) => {
    const N = 260, X0 = -175, X1 = 175; const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) { const x = X0 + ((X1 - X0) * i) / N; const z = zAt(x); pos.push(x, y, z - w / 2, x, y, z + w / 2); uv.push(x / uvScale, 0, x / uvScale, 1); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const grp = new THREE.Group();
  const sand = new THREE.Mesh(strip(width + 3, 0.012, 8), new THREE.MeshStandardMaterial({ color: preset === 'night' ? '#6E6A86' : '#F2D9A2', roughness: 1 }));
  sand.receiveShadow = true;
  const tex = waterTexture(); tex.repeat.set(1, 1);
  const tint = { night: '#5A73B8', sunset: '#FFC2A8', morning: '#E8F6FF' }[preset] || '#FFFFFF';
  const water = new THREE.Mesh(strip(width, 0.05, 9), new THREE.MeshStandardMaterial({ map: tex, color: tint, roughness: 0.18, metalness: 0.05, emissive: '#0E5E80', emissiveIntensity: preset === 'night' ? 0.15 : 0.08 }));
  water.receiveShadow = true;
  grp.add(sand, water);
  const update = (t) => { tex.offset.x = -t * 0.09; tex.offset.y = Math.sin(t * 0.6) * 0.015; };
  return { group: grp, zAt, width, update };
}

/** A colourful cottage: walls, gable roof, door, two windows (they glow at night) and a chimney. */
function cottage({ wall, roof, door, w, h, d, night }) {
  const g = new THREE.Group();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(wall)); body.position.y = h / 2; g.add(body);
  const rh = h * 0.65; const shape = new THREE.Shape(); shape.moveTo(-w / 2 - 0.25, 0); shape.lineTo(w / 2 + 0.25, 0); shape.lineTo(0, rh); shape.closePath();
  const roofG = new THREE.ExtrudeGeometry(shape, { depth: d + 0.5, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }); roofG.translate(0, 0, -(d + 0.5) / 2);
  const roofM = new THREE.Mesh(roofG, std(roof, { roughness: 0.6 })); roofM.position.y = h; g.add(roofM);
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.35), std(roof)); ch.position.set(w * 0.25, h + rh * 0.65, -d * 0.15); g.add(ch);
  const dr = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, h * 0.48, 0.06), std(door)); dr.position.set(0, h * 0.24, d / 2 + 0.02); g.add(dr);
  const winM = std('#FFF3B0', { emissive: '#FFD970', emissiveIntensity: night ? 1.2 : 0.15 });
  for (const sx of [-1, 1]) { const wi = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, h * 0.22, 0.06), winM); wi.position.set(sx * w * 0.3, h * 0.6, d / 2 + 0.02); g.add(wi); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Small birds circling high in the sky, flapping their wings. Returns { group, update(t) }. */
function birds(n, seed) {
  const r = rnd(seed * 7 + 99); const grp = new THREE.Group(); const list = [];
  const mat = new THREE.MeshStandardMaterial({ color: '#3B3456', roughness: 0.8, side: THREE.DoubleSide });
  const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.1, 0, 0], 3)); wingG.computeVertexNormals();
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat); body.scale.set(0.8, 0.7, 1.5); b.add(body);
    const lw = new THREE.Mesh(wingG, mat); const rw = new THREE.Mesh(wingG, mat); rw.scale.x = -1; b.add(lw, rw);
    const s = 0.9 + r() * 0.6; b.scale.setScalar(s); grp.add(b);
    list.push({ b, lw, rw, R: 22 + r() * 26, y: 13 + r() * 9, w: (0.08 + r() * 0.07) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28, cz: -18 - r() * 14, cx: (r() - 0.5) * 30 });
  }
  const update = (t) => {
    for (const q of list) {
      const a = q.ph + q.w * t; q.b.position.set(q.cx + Math.cos(a) * q.R, q.y + Math.sin(t * 0.7 + q.ph) * 1.2, q.cz + Math.sin(a) * q.R * 0.45);
      q.b.rotation.y = Math.atan2(-Math.sin(a) * q.R * q.w, Math.cos(a) * q.R * 0.45 * q.w); // face the way it flies
      const f = Math.sin(t * 9 + q.ph * 3) * 0.7; q.lw.rotation.z = f; q.rw.rotation.z = -f;
    }
  };
  return { group: grp, update };
}

/** Small set dressing around the scenery: flower clumps, round bushes and grass tufts (instanced, cheap). */
function dressing(points, roles) {
  const grp = new THREE.Group();
  const flowers = points.filter((p) => p.type === 'flower'), bushes = points.filter((p) => p.type === 'bush'), tufts = points.filter((p) => p.type === 'tuft');
  const q = new THREE.Quaternion(); const m = new THREE.Matrix4(); const up = new THREE.Vector3(0, 1, 0);
  const swayers = []; // {im, list:[{pos, scale, ax, az}]}: instances that bend in the wind
  if (bushes.length) {
    const g = new THREE.IcosahedronGeometry(0.6, 2); g.scale(1, 0.75, 1); g.translate(0, 0.35, 0);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.9 }), bushes.length);
    bushes.forEach((p, i) => { m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.a), new THREE.Vector3(p.s, p.s, p.s)); im.setMatrixAt(i, m); im.setColorAt(i, mix(roles.foliage, '#2f6b3a', 0.15 + p.k * 0.2)); });
    im.castShadow = true; grp.add(im);
  }
  if (tufts.length) {
    const g = new THREE.ConeGeometry(0.06, 0.38, 4); g.translate(0, 0.19, 0);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 1 }), tufts.length * 5);
    let j = 0; const list = [];
    tufts.forEach((p) => { for (let b = 0; b < 5; b++) { const a = p.a + b * 1.3; const it = { pos: new THREE.Vector3(p.x + Math.cos(a) * 0.09, p.y, p.z + Math.sin(a) * 0.09), scale: new THREE.Vector3(p.s, p.s * (0.8 + 0.4 * ((b * 7) % 3) / 2), p.s), ax: Math.cos(a) * 0.35, az: Math.sin(a) * 0.35, ph: p.x * 0.3 + b }; list.push(it); m.compose(it.pos, q.setFromEuler(new THREE.Euler(it.ax, 0, it.az)), it.scale); im.setMatrixAt(j, m); im.setColorAt(j, mix(roles.foliage, '#d9f59a', 0.1 + 0.1 * b)); j++; } });
    grp.add(im); swayers.push({ ims: [im], list, k: 2.2 });
  }
  if (flowers.length) {
    const stemG = new THREE.CylinderGeometry(0.02, 0.025, 0.4, 5); stemG.translate(0, 0.2, 0);
    const headG = new THREE.SphereGeometry(0.11, 12, 8); headG.scale(1, 0.55, 1); headG.translate(0, 0.42, 0);
    const per = 3; const stems = new THREE.InstancedMesh(stemG, new THREE.MeshStandardMaterial({ color: mix(roles.foliage, '#1f5a2a', 0.2), roughness: 1 }), flowers.length * per);
    const heads = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ roughness: 0.6 }), flowers.length * per);
    let j = 0; const list = [];
    flowers.forEach((p) => { for (let b = 0; b < per; b++) { const a = p.a + b * 2.1; const v = new THREE.Vector3(p.x + Math.cos(a) * 0.16, p.y, p.z + Math.sin(a) * 0.16); const s = p.s * (0.85 + 0.15 * b); list.push({ pos: v, scale: new THREE.Vector3(s, s, s), ax: 0, az: 0, ph: p.x * 0.4 + p.z * 0.2 + b }); m.compose(v, q.identity(), new THREE.Vector3(s, s, s)); stems.setMatrixAt(j, m); heads.setMatrixAt(j, m); heads.setColorAt(j, col(roles.flowers[(p.c + b) % roles.flowers.length])); j++; } });
    grp.add(stems, heads); swayers.push({ ims: [stems, heads], list, k: 3 });
  }
  // Wind: flowers nod and grass bends from the ground, each a little out of step with its neighbours.
  const e = new THREE.Euler();
  const sway = (t, amp) => {
    if (!amp) return;
    for (const s of swayers) {
      s.list.forEach((it, j) => { q.setFromEuler(e.set(it.ax + amp * s.k * 0.4 * Math.sin(t * 1.6 + it.ph), 0, it.az + amp * s.k * Math.sin(t * 1.9 + it.ph * 1.3))); m.compose(it.pos, q, it.scale); for (const im of s.ims) im.setMatrixAt(j, m); });
      for (const im of s.ims) im.instanceMatrix.needsUpdate = true;
    }
  };
  return { group: grp, sway };
}

/** Ground that continues the scenery to the hills, with large soft colour patches so it never looks like flat paint. */
function ground(color, seed) {
  const g = new THREE.CircleGeometry(140, 96, 0, Math.PI * 2); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position; const colors = new Float32Array(pos.count * 3);
  const r = rnd(seed); const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const base = col(color); const light = base.clone().offsetHSL(0.01, 0.02, 0.06); const dark = base.clone().offsetHSL(-0.01, 0, -0.05);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.11 + ph[0]) * Math.cos(z * 0.09 + ph[1]) + 0.5 * Math.sin(x * 0.27 + z * 0.21 + ph[2]);
    const c = n > 0 ? base.clone().lerp(light, Math.min(1, n)) : base.clone().lerp(dark, Math.min(1, -n));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.position.y = -0.03; m.receiveShadow = true;
  return m;
}

/**
 * Build the landscape for one shot. setRadius = how far the scenery reaches (dressing starts outside it).
 * roles = World Style colour roles (foliage, foliage_far, flowers, sky_day). Returns { group, update(t), sky }.
 */
export function buildLandscape({ look, preset = 'day', roles = {}, setRadius = 8, seed = 1, sunDir = new THREE.Vector3(4, 8, 6), keepClear = [] }) {
  const L = lookOf(look);
  const grp = new THREE.Group(); grp.name = 'landscape';
  const R = { foliage: roles.foliage || '#6CC45E', foliage_far: roles.foliage_far || '#5FB8A8', flowers: roles.flowers?.length ? roles.flowers : ['#FF7EC4', '#FFD23F', '#B98CF5', '#FF9234'], sky_day: roles.sky_day || '#4FB9F7' };
  const night = preset === 'night';
  const base = SKY[preset] || SKY.day;
  const p = { ...base };
  if (preset === 'day' && roles.sky_day) { p.top = mix(base.top, roles.sky_day, 0.5).getStyle(); }
  if (L.sky === 'soft') { p.top = mix(p.top, p.horizon, 0.35).getStyle(); p.mid = mix(p.mid, p.horizon, 0.3).getStyle(); }
  if (L.sky === 'storybook') { p.top = mix(p.top, '#7B8CF0', 0.25).getStyle(); p.horizon = mix(p.horizon, '#FFE6F2', 0.35).getStyle(); }
  if (L.sky === 'clear') p.soft = 0.4;
  grp.add(skyDome(p, sunDir));
  const r = rnd(seed * 7919 + 13);

  // Stars at night.
  if (night) {
    const n = 600; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, ph = 0.08 + r() * 1.3; a.set([Math.cos(th) * Math.cos(ph) * 250, Math.sin(ph) * 250, Math.sin(th) * Math.cos(ph) * 250], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#FFF6D0', size: 1.6, sizeAttenuation: false, fog: false }));
    grp.add(pts);
  }

  // Ground.
  const groundColor = L.ground || mix(R.foliage, preset === 'night' ? '#1d3340' : '#A9D68A', preset === 'night' ? 0.55 : 0.45).getStyle();
  grp.add(ground(groundColor, seed));

  // Hills: three rings, each farther one hazier (mixed toward the sky's horizon colour).
  const hillH = { none: 0, low: 0.55, rolling: 1, tall: 1.6 }[L.hills] ?? 1;
  const hillTint = L.hill_tint || R.foliage;
  const ringsOut = [];
  if (hillH > 0) {
    const rings = [[30, 52, 5.5, 0.15], [50, 85, 10, 0.4], [80, 140, 18, 0.65]];
    rings.forEach(([a, b, h, haze], i) => {
      const c = mix(mix(i === 0 ? hillTint : mix(hillTint, R.foliage_far, 0.3).getStyle(), '#9CCB7E', 0.3).getStyle(), p.haze || p.horizon, haze + (night ? 0.25 : 0));
      const top = c.clone().offsetHSL(0, 0, 0.05);
      const ring = hillRing(a, b, h * hillH, c.getStyle(), seed * 31 + i, top.getStyle());
      grp.add(ring.mesh); ringsOut.push({ ...ring, r0: a, r1: b });
    });
  }

  let treeSet = null; let dressSet = null;
  // Trees on the nearest two hill rings.
  const treeN = { none: 0, few: 18, some: 45, many: 90 }[L.trees] ?? 45;
  if (treeN && ringsOut.length) {
    const pts = [];
    for (let i = 0; i < treeN; i++) {
      const ring = ringsOut[i % 3 === 2 && ringsOut[1] ? 1 : 0];
      const a = r() * Math.PI * 2; const d = ring.r0 + 3 + r() * (ring.r1 - ring.r0 - 6);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      pts.push({ x, z, y: ring.heightAt(x, z), s: (ring === ringsOut[0] ? 1.2 : 2.0) * (0.75 + r() * 0.6) });
    }
    const crown = [mix(R.foliage, '#3F8F4A', 0.25).getStyle(), mix(R.foliage, R.foliage_far, 0.18).getStyle(), mix(R.foliage, '#2E7D4F', 0.45).getStyle(), mix(R.foliage, '#A6D86A', 0.3).getStyle()];
    treeSet = trees(pts, crown.map((c) => mix(c, p.haze || p.horizon, night ? 0.45 : 0.15).getStyle()));
    grp.add(treeSet.group);
  }

  // River behind the play area (its own random sequence, so the rest of the landscape keeps its layout).
  const r2 = rnd(seed * 104729 + 7);
  const riv = L.river && L.river !== 'none' ? river({ zBase: -(setRadius * 1.25 + 4.5), winding: L.river === 'winding', seed, preset }) : null;
  if (riv) grp.add(riv.group);
  const inRiver = (x, z, pad = 1) => !!riv && Math.abs(z - riv.zAt(x)) < riv.width / 2 + 1.5 + pad;

  // Set dressing just outside the scenery, never in the action area (keepClear = where characters stand or travel).
  const dressN = { none: 0, light: 70, lush: 170 }[L.dressing] ?? 70;
  if (dressN) {
    const pts = []; let guard = 0;
    while (pts.length < dressN && guard++ < dressN * 20) {
      const a = r() * Math.PI * 2; const d = setRadius * (0.95 + r() * 1.9);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > setRadius * 0.6 && Math.abs(x) < setRadius * 1.2) continue; // keep the camera side open
      if (keepClear.some((c) => Math.hypot(c[0] - x, c[2] - z) < 2.2)) continue;
      const k = r(); const type = k < 0.45 ? 'tuft' : k < 0.8 ? 'flower' : 'bush';
      const item = { x, z, y: 0, a: r() * 6.28, s: type === 'bush' ? 0.8 + r() * 0.9 : 0.8 + r() * 0.6, k: r(), c: Math.floor(r() * 10), type };
      if (inRiver(x, z, 0)) continue;
      pts.push(item);
    }
    dressSet = dressing(pts, R);
    grp.add(dressSet.group);
  }

  // Colourful cottages around the play area (beyond the river when there is one), facing the action.
  const houseN = { none: 0, few: 4, some: 8, many: 13 }[L.houses] ?? 0;
  if (houseN) {
    const WALLS = ['#FFD6E0', '#FFF1B8', '#C9F2E3', '#D7E8FF', '#FFE0C2', '#E8D9FF', '#FFFFFF'];
    const ROOFS = ['#F03E4E', '#FF9234', '#3E6BE0', '#8A5CF0', '#21C7C4', '#E8409E', '#4CC35A'];
    const DOORS = ['#9A6A45', '#3E6BE0', '#F03E4E', '#2F6B6B'];
    const placed = []; let guard = 0;
    const near = Math.max(setRadius * 1.7, riv ? -riv.zAt(0) + riv.width / 2 + 5 : 0, 13);
    while (placed.length < houseN && guard++ < houseN * 60) {
      const a = Math.PI * (1.08 + r2() * 0.84); // the back half of the circle, seen behind the characters
      const d = near + r2() * Math.max(3, 27 - near);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (inRiver(x, z, 2) || placed.some((h) => Math.hypot(h.x - x, h.z - z) < 6.5)) continue;
      const w = 2.4 + r2() * 1.4, h = 1.9 + r2() * 0.9, dp = 2.2 + r2() * 1;
      const k = placed.length;
      const house = cottage({ wall: WALLS[(k * 3 + Math.floor(r2() * 7)) % WALLS.length], roof: ROOFS[(k * 5 + 2) % ROOFS.length], door: DOORS[k % DOORS.length], w, h, d: dp, night });
      const s = 1 + r2() * 0.35; house.scale.setScalar(s); house.position.set(x, -0.02, z); house.rotation.y = Math.atan2(-x, -z);
      grp.add(house); placed.push({ x, z });
    }
  }

  // Clouds drifting slowly across the sky (deterministic in t).
  const cloudN = { none: 0, few: 5, some: 9, many: 15 }[L.clouds] ?? 9;
  const clouds = [];
  for (let i = 0; i < cloudN; i++) {
    const c = cloud(r, night); const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.5; const d = 70 + r() * 70;
    const s = 1.4 + r() * 1.6; c.scale.setScalar(s);
    const base = new THREE.Vector3(Math.cos(a) * d, 16 + r() * 22, Math.sin(a) * d);
    c.position.copy(base); grp.add(c); clouds.push({ obj: c, base, speed: 0.25 + r() * 0.35 });
  }
  // Birds circling high up.
  const birdN = { none: 0, few: 4, some: 8 }[L.birds] ?? 0;
  const flock = birdN && !night ? birds(birdN, seed) : null;
  if (flock) grp.add(flock.group);
  const windAmp = { calm: 0.012, breezy: 0.035, windy: 0.07 }[L.wind] ?? 0.035;
  const update = (t) => {
    for (const c of clouds) c.obj.position.x = ((((c.base.x + t * c.speed + 160) % 320) + 320) % 320) - 160;
    treeSet?.sway(t, windAmp); dressSet?.sway(t, windAmp); riv?.update(t); flock?.update(t);
  };
  return { group: grp, update, sky: p, groundColor };
}

/** Soft round shadow texture for contact shadows under characters (makes them sit on the ground). */
let blobTex = null;
export function blobShadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.55, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c); return blobTex;
}
