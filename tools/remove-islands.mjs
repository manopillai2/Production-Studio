// Remove small detached pieces ("islands") from a .glb — e.g. a background object Meshy kept next to a character.
// Works on static and rigged (skinned) models: only the triangle index lists change; vertices, UVs, textures,
// skin weights and animations are untouched. Keeps every piece with at least `keep` of the largest piece's triangles.
// usage: node tools/remove-islands.mjs <in.glb> <out.glb> [keepFraction=0.02] [--near]
// --near: instead of by size, keep the pieces that touch the main piece's box (grown by 5%): attached parts stay, floating
//         background bits (a cloud or leaves copied from the preview picture) go, whatever their size.
import fs from 'node:fs';

const args = process.argv.slice(2); const NEAR = args.includes('--near');
const [inFile, outFile, keepArg] = args.filter((a) => a !== '--near');
const KEEP = Number(keepArg || 0.02);
const buf = fs.readFileSync(inFile);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('Not a GLB file');
let off = 12; let json = null; let bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = Buffer.from(data);
  off += 8 + len;
}
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const view = (acc) => { const bv = json.bufferViews[acc.bufferView]; return { start: (bv.byteOffset || 0) + (acc.byteOffset || 0), stride: bv.byteStride || 0 }; };
const readPositions = (acc) => { const { start, stride } = view(acc); const st = stride || 12; const out = new Float32Array(acc.count * 3); for (let i = 0; i < acc.count; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = bin.readFloatLE(start + i * st + k * 4); return out; };
const IDX = { 5121: [1, 'readUInt8', 'writeUInt8'], 5123: [2, 'readUInt16LE', 'writeUInt16LE'], 5125: [4, 'readUInt32LE', 'writeUInt32LE'] };
let report = [];
for (const mesh of json.meshes || []) for (const prim of mesh.primitives) {
  if (prim.indices == null) continue;
  const ia = json.accessors[prim.indices]; const [sz, rd, wr] = IDX[ia.componentType]; const { start } = view(ia);
  const idx = Array.from({ length: ia.count }, (_, i) => bin[rd](start + i * sz));
  const pos = readPositions(json.accessors[prim.attributes.POSITION]);
  // weld vertices by position (UV seams split vertices), then union triangles that share a welded vertex
  const key = (v) => `${Math.round(pos[v * 3] * 1e4)},${Math.round(pos[v * 3 + 1] * 1e4)},${Math.round(pos[v * 3 + 2] * 1e4)}`;
  const weld = new Map(); const wid = new Int32Array(pos.length / 3);
  for (let v = 0; v < wid.length; v++) { const k = key(v); if (!weld.has(k)) weld.set(k, weld.size); wid[v] = weld.get(k); }
  const parent = Int32Array.from({ length: weld.size }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(wid[idx[t]]), b = find(wid[idx[t + 1]]), c = find(wid[idx[t + 2]]); parent[b] = a; parent[find(c)] = a; }
  const count = new Map(); for (let t = 0; t < idx.length; t += 3) { const r = find(wid[idx[t]]); count.set(r, (count.get(r) || 0) + 1); }
  const biggest = Math.max(...count.values());
  let keepRoot = new Set([...count].filter(([, n]) => n >= biggest * KEEP).map(([r]) => r));
  const boxes = new Map(); for (let t = 0; t < idx.length; t++) { const r = find(wid[idx[t]]); const v = idx[t]; let b = boxes.get(r); if (!b) boxes.set(r, (b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity])); for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], pos[v * 3 + k]); b[k + 3] = Math.max(b[k + 3], pos[v * 3 + k]); } }
  if (NEAR) {
    const main = [...count].find(([, n]) => n === biggest)[0]; const M = boxes.get(main); const g = [0, 1, 2].map((k) => (M[k + 3] - M[k]) * 0.05);
    keepRoot = new Set([...count.keys()].filter((r) => { const b = boxes.get(r); return [0, 1, 2].every((k) => b[k] <= M[k + 3] + g[k] && b[k + 3] >= M[k] - g[k]); }));
  }
  const kept = []; for (let t = 0; t < idx.length; t += 3) if (keepRoot.has(find(wid[idx[t]]))) kept.push(idx[t], idx[t + 1], idx[t + 2]);
  const removed = (idx.length - kept.length) / 3;
  if (removed) { kept.forEach((v, i) => bin[wr](v, start + i * sz)); ia.count = kept.length; }
  report.push({ mesh: mesh.name, pieces: count.size, sizes: [...count.values()].sort((a, b) => b - a), kept: keepRoot.size, boxes: process.env.BOXES ? [...count].sort((a, b) => b[1] - a[1]).map(([r, n]) => [n, keepRoot.has(r), boxes.get(r).map((x) => +x.toFixed(2))]) : undefined, trianglesRemoved: removed, trianglesKept: kept.length / 3 });
}
// rebuild the GLB (JSON chunk padded with spaces, BIN chunk unchanged in size)
const js = Buffer.from(JSON.stringify(json)); const jsPad = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsPad.length + 8 + binPad.length, 8);
const ch = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
fs.writeFileSync(outFile, Buffer.concat([header, ch(0x4e4f534a, jsPad), ch(0x004e4942, binPad)]));
console.log(JSON.stringify(report));
