// Shared three.js helpers: cached GLB loading, framing, and one shared thumbnail renderer
// (a single WebGL context for all thumbnails — friendly to integrated graphics).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();
/** Load a .glb once per URL (blob: URLs and /media/ URLs both work). */
export function loadGLTF(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).catch((e) => { cache.delete(url); throw e; }));
  return cache.get(url);
}
export const forgetGLTF = (url) => cache.delete(url);
export const parseGLB = (arrayBuffer) => new Promise((res, rej) => loader.parse(arrayBuffer, '', res, rej));

/**
 * Bounding box that is correct for rigged (skinned) models too. Before the first render a skeleton's bone
 * matrices are all zero, so three.js would measure every skinned vertex at the origin (a near-zero box).
 * Posing the skeleton first gives the real size, whatever units the rig uses (Meshy rigs are in centimetres).
 */
export function measureBox(object) {
  object.updateMatrixWorld(true);
  object.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
  return new THREE.Box3().setFromObject(object);
}
/** Copy a loaded scene; rigged models need a skeleton-aware copy or their skin stays frozen / unbound. */
export const cloneScene = (gltf) => (gltf.animations?.length || hasSkin(gltf.scene) ? skeletonClone(gltf.scene) : gltf.scene.clone(true));
function hasSkin(root) { let s = false; root.traverse((o) => { if (o.isSkinnedMesh) s = true; }); return s; }

export function modelInfo(root) {
  let triangles = 0, meshes = 0; const materials = new Set(); let textured = false;
  root.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const g = o.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      [].concat(o.material).forEach((m) => { materials.add(m); if (m.map) textured = true; });
    }
  });
  const size = measureBox(root).getSize(new THREE.Vector3());
  return { triangles: Math.round(triangles), meshes, materials: materials.size, textured, size: size.toArray().map((v) => +v.toFixed(2)) };
}

/** Position a camera so the object fills the view. */
export function frame(camera, object, { padding = 1.25, from = new THREE.Vector3(0.6, 0.45, 1) } = {}) {
  const box = measureBox(object);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  // Fit the whole bounding sphere (not just the largest side) in both directions, so nothing is clipped from any angle.
  const radius = size.length() * 0.5 || 1;
  const vHalf = (camera.fov * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * (camera.aspect || 1));
  const dist = (radius * padding) / Math.sin(Math.min(vHalf, hHalf));
  camera.position.copy(center).add(from.clone().normalize().multiplyScalar(dist));
  camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
  camera.lookAt(center);
  return center;
}

export function studioLights(scene) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9d7c4', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 1.8); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe6ff', 0.6); rim.position.set(-4, 2, -3); scene.add(rim);
}

// ---------- shared thumbnail renderer ----------
let thumbRenderer = null;
const thumbCache = new Map();
export async function thumbnail(url, size = 256) {
  const key = `${url}@${size}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const p = (async () => {
    const gltf = await loadGLTF(url);
    thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(size, size, false);
    thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); studioLights(scene);
    const obj = cloneScene(gltf); scene.add(obj);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 1000); frame(cam, obj, { padding: 1.1 });
    thumbRenderer.render(scene, cam);
    return thumbRenderer.domElement.toDataURL('image/png');
  })();
  thumbCache.set(key, p);
  p.catch(() => thumbCache.delete(key));
  return p;
}

/** Pictures of a model from the front (3/4) and the side, for Claude's look check. PNG data URLs. */
export async function modelViews(url, size = 448) {
  const gltf = await loadGLTF(url);
  thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbRenderer.setSize(size, size, false);
  thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f2f4f7'); studioLights(scene);
  const obj = cloneScene(gltf); scene.add(obj);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  const out = [];
  for (const from of [new THREE.Vector3(0.45, 0.25, 1), new THREE.Vector3(1, 0.2, 0.05)]) {
    frame(cam, obj, { padding: 1.08, from });
    thumbRenderer.render(scene, cam);
    out.push(thumbRenderer.domElement.toDataURL('image/png'));
  }
  return out;
}
