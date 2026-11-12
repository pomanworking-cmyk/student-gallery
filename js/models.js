// 載入 3D 掃描檔（GLB），統一大細同位置
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

const cache = new Map();

export function normalize(obj, target = 1) {
  const wrap = new THREE.Group(); wrap.add(obj);
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  const s = target / Math.max(size.x, size.y, size.z, 1e-6);
  obj.scale.multiplyScalar(s); obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  return wrap;
}

// 回傳一個新嘅 Object3D（每次都係獨立複本）
export async function loadArtModel(db, path) {
  if (!cache.has(path)) {
    cache.set(path, (async () => {
      const res = await db.loadModel(path);
      if (res.object) return res.object;
      return parseGLB(res.buffer);
    })());
  }
  try { const base = await cache.get(path); return base.clone(true); }
  catch (e) { cache.delete(path); throw e; }
}

export async function parseGLB(buffer) {
  const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(buffer, '', ok, bad));
  const root = gltf.scene;
  root.traverse((o) => { if (o.isMesh && o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; m.side = THREE.DoubleSide; }); } });
  return root;
}
