// 作品詳情入面嘅 3D 檢視同多角度相片
import * as THREE from 'three';
import { OrbitControls } from '../vendor/jsm/controls/OrbitControls.js';
import { loadArtModel, normalize, parseGLB } from './models.js?v=20261113e';

export function openModelView(host, db, path) {
  host.innerHTML = '<div class="mv-hint">用手指拖動可以轉，兩隻手指可以放大縮細</div><div class="mv-loading">載入緊 3D 作品…</div>';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'mv-canvas'; host.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a2724');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555048, 2.2));
  const d1 = new THREE.DirectionalLight(0xffffff, 2); d1.position.set(2, 3, 2); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.8); d2.position.set(-2, 1, -2); scene.add(d2);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ color: '#3a3632', roughness: 1 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 50); cam.position.set(0, 0.9, 2.3);
  const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(0, 0.45, 0); ctl.enableDamping = true; ctl.autoRotate = true; ctl.autoRotateSpeed = 1.6; ctl.minDistance = 0.4; ctl.maxDistance = 5;
  ctl.addEventListener('start', () => (ctl.autoRotate = false));
  let alive = true;
  const size = () => { const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const ro = new ResizeObserver(size); ro.observe(host); size();
  renderer.setAnimationLoop(() => { ctl.update(); renderer.render(scene, cam); });
  loadArtModel(db, path).then((obj) => { if (!alive) return; scene.add(normalize(obj, 1)); host.querySelector('.mv-loading')?.remove(); })
    .catch((e) => { const l = host.querySelector('.mv-loading'); if (l) l.textContent = '載入唔到 3D 作品：' + e.message; });
  return () => { alive = false; ro.disconnect(); renderer.setAnimationLoop(null); ctl.dispose(); scene.traverse((o) => { o.geometry?.dispose(); }); renderer.dispose(); host.innerHTML = ''; };
}

export function openPhotoSpin(host, urls) {
  host.innerHTML = `<img class="ps-img" alt=""><div class="ps-bar"><button class="ps-play" aria-label="播放">⏸</button><div class="ps-dots">${urls.map((_, i) => `<button data-i="${i}"></button>`).join('')}</div></div><div class="mv-hint">左右拖動就可以轉睇唔同角度</div>`;
  const img = host.querySelector('.ps-img'); const dots = [...host.querySelectorAll('.ps-dots button')];
  urls.forEach((u) => { const i = new Image(); i.src = u; }); // 預先載入
  let i = 0, playing = true;
  const show = (k) => { i = (k + urls.length) % urls.length; img.src = urls[i]; dots.forEach((d, j) => d.classList.toggle('on', j === i)); };
  show(0);
  const timer = setInterval(() => playing && show(i + 1), 900);
  const play = host.querySelector('.ps-play');
  const setPlay = (v) => { playing = v; play.textContent = v ? '⏸' : '▶'; };
  play.onclick = (e) => { e.stopPropagation(); setPlay(!playing); };
  dots.forEach((d) => (d.onclick = (e) => { e.stopPropagation(); setPlay(false); show(Number(d.dataset.i)); }));
  let drag = null;
  img.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, i }; img.setPointerCapture(e.pointerId); setPlay(false); e.preventDefault(); });
  img.addEventListener('pointermove', (e) => { if (!drag) return; const step = Math.round((e.clientX - drag.x) / 40); show(drag.i - step); });
  img.addEventListener('pointerup', () => (drag = null)); img.addEventListener('pointercancel', () => (drag = null));
  return () => { clearInterval(timer); host.innerHTML = ''; };
}

// 由 GLB 自動影一張封面相
export async function snapshotGLBFile(file, size = 800) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.outputColorSpace = THREE.SRGBColorSpace; r.setSize(size, size, false);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f3efe8');
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfc0, 2.2)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 3, 2); scene.add(d);
  scene.add(normalize(await parseGLB(await file.arrayBuffer()), 1));
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 50); cam.position.set(1.1, 0.95, 1.9); cam.lookAt(0, 0.45, 0);
  r.render(scene, cam);
  const blob = await new Promise((ok) => r.domElement.toBlob(ok, 'image/jpeg', 0.88));
  r.dispose(); return blob;
}
