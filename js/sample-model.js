// 試用模式用嘅示範立體作品（用程式砌出嚟嘅「黏土公仔」）
import * as THREE from 'three';

const PALS = [['#f4a261', '#e76f51', '#2a9d8f', '#264653'], ['#ffafcc', '#cdb4db', '#a2d2ff', '#ffc8dd'], ['#90be6d', '#f9c74f', '#f94144', '#577590']];

export function buildSampleModel(seed) {
  const pal = PALS[seed % PALS.length];
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0 });
  const ball = (r, c, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  if (seed % 2 === 0) { // 小怪獸
    ball(0.5, pal[0], 0, 0.5, 0, 1, 0.9, 1);
    ball(0.33, pal[0], 0, 1.08, 0.02);
    ball(0.09, '#fff', -0.12, 1.15, 0.28); ball(0.09, '#fff', 0.12, 1.15, 0.28);
    ball(0.045, '#222', -0.12, 1.15, 0.36); ball(0.045, '#222', 0.12, 1.15, 0.36);
    ball(0.12, pal[1], -0.26, 1.38, 0, 0.6, 1.4, 0.6); ball(0.12, pal[1], 0.26, 1.38, 0, 0.6, 1.4, 0.6);
    ball(0.14, pal[2], -0.48, 0.55, 0.1, 1.4, 0.6, 0.8); ball(0.14, pal[2], 0.48, 0.55, 0.1, 1.4, 0.6, 0.8);
    ball(0.16, pal[3], -0.2, 0.05, 0.1, 1.2, 0.5, 1.4); ball(0.16, pal[3], 0.2, 0.05, 0.1, 1.2, 0.5, 1.4);
    for (let i = 0; i < 5; i++) ball(0.07, pal[1], Math.cos(i) * 0.3, 0.6 + Math.sin(i * 2) * 0.2, 0.42);
  } else { // 塔／花瓶
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector2(0.25 + Math.sin(t * Math.PI * 1.5) * 0.18 + (1 - t) * 0.12, t * 1.2)); }
    const vase = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat(pal[0])); g.add(vase);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ball(0.06, pal[(i % 3) + 1], Math.cos(a) * 0.38, 0.45, Math.sin(a) * 0.38); }
    for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6), mat('#2d6a4f')); st.position.set((i - 1) * 0.1, 1.45, 0); st.rotation.z = (i - 1) * 0.3; g.add(st); ball(0.1, pal[i + 1], (i - 1) * 0.28, 1.75, 0); }
  }
  return g;
}

let rnd;
// 由唔同角度影相（模擬老師用手機影嘅多角度相）
export function renderSampleViews(seed, n = 6, size = 640) {
  if (!rnd) { rnd = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); rnd.outputColorSpace = THREE.SRGBColorSpace; }
  rnd.setSize(size, size, false);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f3efe8');
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfc0, 2)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 3, 2); scene.add(d);
  const m = buildSampleModel(seed); scene.add(m);
  const box = new THREE.Box3().setFromObject(m); const c = box.getCenter(new THREE.Vector3()); const r = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  const out = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; cam.position.set(c.x + Math.sin(a) * r * 1.9, c.y + r * 0.45, c.z + Math.cos(a) * r * 1.9); cam.lookAt(c); rnd.render(scene, cam); out.push(rnd.domElement.toDataURL('image/jpeg', 0.85)); }
  scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  return out;
}
