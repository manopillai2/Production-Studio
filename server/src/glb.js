// Minimal glTF 2.0 binary (.glb) writer for procedurally built sample models.
// Nodes: {name, translation?, rotation? [x,y,z,w], scale?, parts?: [{geometry: THREE.BufferGeometry, color, emissive?, metallic?, roughness?}], children?}
// Animations: [{name, channels: [{node: name, path: 'rotation'|'translation'|'scale', times: number[], values: number[]}]}]

export function writeGLB({ nodes: roots, animations = [], generator = 'Rhymes Automation sample builder' }) {
  const chunks = []; let byteLength = 0;
  const bufferViews = [], accessors = [], materials = [], meshes = [], nodes = [];
  const images = [], textures = [];
  const matKey = new Map(), texKey = new Map();

  const addView = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad; }
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, ...(target ? { target } : {}) });
    chunks.push(bytes); byteLength += bytes.length;
    return bufferViews.length - 1;
  };
  const addAccessor = (typed, type, componentType, target, minmax) => {
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    const acc = { bufferView: addView(typed, target), componentType, count: typed.length / comps, type };
    if (minmax) {
      const min = Array(comps).fill(Infinity), max = Array(comps).fill(-Infinity);
      for (let i = 0; i < typed.length; i++) { const c = i % comps; min[c] = Math.min(min[c], typed[i]); max[c] = Math.max(max[c], typed[i]); }
      acc.min = min; acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };
  // Embedded PNG textures (stored inside the .glb, so the file is self-contained).
  const texture = (png) => {
    if (!texKey.has(png)) {
      images.push({ bufferView: addView(new Uint8Array(png.buffer, png.byteOffset, png.byteLength)), mimeType: 'image/png' });
      textures.push({ source: images.length - 1, sampler: 0 });
      texKey.set(png, textures.length - 1);
    }
    return texKey.get(png);
  };
  let texIds = 0; const texIdOf = new Map();
  const material = ({ color = [1, 1, 1], emissive, metallic = 0, roughness = 0.75, texture: png, name }) => {
    if (png && !texIdOf.has(png)) texIdOf.set(png, ++texIds);
    const key = JSON.stringify([color, emissive, metallic, roughness, png ? texIdOf.get(png) : 0, name || '']);
    if (!matKey.has(key)) {
      materials.push({
        ...(name ? { name } : {}),
        pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: metallic, roughnessFactor: roughness, ...(png ? { baseColorTexture: { index: texture(png) } } : {}) },
        ...(emissive ? { emissiveFactor: emissive } : {}),
      });
      matKey.set(key, materials.length - 1);
    }
    return matKey.get(key);
  };
  const nodeIndex = new Map();
  const addNode = (n) => {
    const out = { name: n.name };
    if (n.translation) out.translation = n.translation;
    if (n.rotation) out.rotation = n.rotation;
    if (n.scale) out.scale = n.scale;
    if (n.parts?.length) {
      const primitives = n.parts.map((p) => {
        const g = p.geometry.index ? p.geometry : p.geometry;
        if (!g.attributes.normal) g.computeVertexNormals();
        const pos = new Float32Array(g.attributes.position.array);
        const nor = new Float32Array(g.attributes.normal.array);
        const prim = { attributes: { POSITION: addAccessor(pos, 'VEC3', 5126, 34962, true), NORMAL: addAccessor(nor, 'VEC3', 5126, 34962) }, material: material(p) };
        if (p.texture && g.attributes.uv) prim.attributes.TEXCOORD_0 = addAccessor(new Float32Array(g.attributes.uv.array), 'VEC2', 5126, 34962);
        if (g.index) {
          const idx = g.index.array;
          const big = pos.length / 3 > 65535;
          prim.indices = addAccessor(big ? new Uint32Array(idx) : new Uint16Array(idx), 'SCALAR', big ? 5125 : 5123, 34963);
        }
        return prim;
      });
      meshes.push({ name: n.name, primitives });
      out.mesh = meshes.length - 1;
    }
    nodes.push(out);
    const idx = nodes.length - 1;
    nodeIndex.set(n.name, idx);
    if (n.children?.length) out.children = n.children.map(addNode);
    return idx;
  };
  const sceneNodes = roots.map(addNode);

  const anims = animations.map((a) => {
    const samplers = [], channels = [];
    for (const c of a.channels) {
      const input = addAccessor(new Float32Array(c.times), 'SCALAR', 5126, undefined, true);
      const output = addAccessor(new Float32Array(c.values), c.path === 'rotation' ? 'VEC4' : 'VEC3', 5126);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex.get(c.node), path: c.path } });
    }
    return { name: a.name, samplers, channels };
  });

  const bin = Buffer.concat(chunks);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const gltf = {
    asset: { version: '2.0', generator }, scene: 0, scenes: [{ nodes: sceneNodes }],
    nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength: binPadded.length }],
    ...(images.length ? { images, textures, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }] } : {}),
    ...(anims.length ? { animations: anims } : {}),
  };
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binPadded.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, json, bh, binPadded]);
}
