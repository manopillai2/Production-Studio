// Read / patch materials inside a .glb without touching geometry (used for per-part recolouring of
// imported, Local AI and Meshy models). Only the JSON chunk changes; the binary chunk is kept as-is.
const toLinear = (hex) => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
};
const toHex = (lin) => `#${lin.slice(0, 3).map((c) => { const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, s)) * 255).toString(16).padStart(2, '0'); }).join('')}`;

export function parseGLB(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('Not a binary glTF (.glb) file.');
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('GLB is missing its JSON chunk.');
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const rest = buf.subarray(20 + jsonLen); // BIN chunk header + data (if any)
  return { json, rest };
}
export function packGLB(json, rest) {
  let j = Buffer.from(JSON.stringify(json), 'utf8');
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + j.length + rest.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, jh, j, rest]);
}

export function listMaterials(buf) {
  const { json } = parseGLB(buf);
  const usedBy = {};
  (json.meshes || []).forEach((m) => (m.primitives || []).forEach((p) => { if (p.material != null) (usedBy[p.material] ||= new Set()).add(m.name || 'mesh'); }));
  return (json.materials || []).map((m, i) => ({
    index: i, name: m.name || `Material ${i + 1}`, color: toHex(m.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1]),
    textured: !!m.pbrMetallicRoughness?.baseColorTexture, meshes: [...(usedBy[i] || [])].slice(0, 6),
  }));
}

/** Apply the World Style surface finish to every material (keeps geometry, textures and colours). */
export function applyFinish(buf, { roughness = 0.6, metallic = 0 } = {}) {
  const { json, rest } = parseGLB(buf);
  for (const m of json.materials || []) {
    m.pbrMetallicRoughness ||= {};
    m.pbrMetallicRoughness.roughnessFactor = roughness;
    if (!m.pbrMetallicRoughness.metallicRoughnessTexture) m.pbrMetallicRoughness.metallicFactor = metallic;
  }
  return packGLB(json, rest);
}

/** Recolour one material. Every other material (and all geometry/textures) is left untouched. */
export function recolorMaterial(buf, index, hex) {
  const { json, rest } = parseGLB(buf);
  const m = json.materials?.[index];
  if (!m) throw new Error('Material not found.');
  m.pbrMetallicRoughness ||= {};
  const a = m.pbrMetallicRoughness.baseColorFactor?.[3] ?? 1;
  m.pbrMetallicRoughness.baseColorFactor = [...toLinear(hex), a];
  return packGLB(json, rest);
}
