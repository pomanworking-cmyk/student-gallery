// 3D 畫廊場景：大堂（門口大標題＋各班通道）同展廳
import * as THREE from 'three';
import { themeColors, COLORFUL_PANELS, FONT, KIDS_FONT, stickerUrl } from './constants.js?v=20261113f';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';

// 寫實材質（textures/ 入面嘅檔案係程序生成，可以自由使用）
const TEX = {};
const texLoader = new THREE.TextureLoader();
function pbr(name, srgb) {
  if (!TEX[name]) { const e = { clones: [], loaded: false }; e.tex = texLoader.load(`textures/${name}.jpg`, () => { e.loaded = true; e.clones.forEach((c) => (c.needsUpdate = true)); });
    e.tex.wrapS = e.tex.wrapT = THREE.RepeatWrapping; e.tex.anisotropy = 8; if (srgb) e.tex.colorSpace = THREE.SRGBColorSpace; TEX[name] = e; }
  return TEX[name];
}
function pbrSet(base, rx, ry, albedo = true) {
  const r = (e) => { const c = e.tex.clone(); c.repeat.set(rx, ry); if (e.loaded) c.needsUpdate = true; else e.clones.push(c); return c; };
  return { map: albedo ? r(pbr(base + '_albedo', true)) : null, normalMap: r(pbr(base + '_normal')), roughnessMap: r(pbr(base + '_rough')) };
}

const EYE = 1.6;
const SPEED = 2.6;

function shade(hex, amt) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt))); return '#' + c.getHexString(); }
function isDark(hex) { const c = new THREE.Color(hex); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) < 0.55; }

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

export function normalizeLight(l) { l = l || {}; return { mode: ['fixed', 'real', 'cycle'].includes(l.mode) ? l.mode : 'off', hour: Number.isFinite(Number(l.hour)) ? Number(l.hour) : 15, student: !!l.student }; }

// 由時間（0–24）計出太陽方向、顏色同室內光暗
export function sunState(h) {
  const th = ((h - 6) / 12) * Math.PI; const elev = Math.sin(th); const up = Math.max(0, elev);
  const dir = new THREE.Vector3(Math.cos(th) * 0.95, Math.max(0.14, elev * 0.9), 0.3).normalize();
  const dayF = smooth(-0.12, 0.25, elev); const warm = 1 - smooth(0.15, 0.6, up);
  const sky = up > 0.02 ? mixC('#ffb27a', '#8ec9ff', smooth(0.08, 0.5, up)) : mixC('#0b1230', '#ffb27a', smooth(-0.2, 0.02, elev));
  return { dir, dayF, night: 1 - dayF, sunColor: mixC('#fff3dc', '#ff9a4d', warm), sunI: smooth(0, 0.2, up) * 2.6, amb: 0.5 + 0.7 * dayF, hemi: 0.3 + 0.75 * dayF, ambColor: mixC('#8ea3dc', '#ffffff', dayF), sky };
}

export class Gallery3D {
  constructor(host, handlers) {
    this.host = host; this.h = handlers;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    const pm = new THREE.PMREMGenerator(this.renderer); this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.sunOverride = null; this._ft = [];
    this.lowQ = window.GALLERY_QUALITY !== 'high' && ((navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2));
    if (this.lowQ) this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    // 射燈池：數量固定（換房唔使重新編譯 shader），每隔一陣搬去最近嘅作品
    this.spotPool = []; this.SPOTS = this.lowQ ? 0 : 6;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 120);
    this.camera.rotation.order = 'YXZ';
    this.scene = new THREE.Scene();
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.pos = new THREE.Vector3(0, EYE, 0); this.yaw = 0; this.pitch = 0;
    this.move = { x: 0, y: 0 }; this.keys = new Set();
    this.clickables = []; this.arts = []; this.loader = new THREE.TextureLoader(); this.loader.setCrossOrigin('anonymous');
    this.stickerTex = new Map(); this.disposables = [];
    this.glide = null; this.mode = null; this.bounds = null;
    this._bindInput();
    this._resize(); new ResizeObserver(() => this._resize()).observe(host);
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  // ---------- 共用 ----------
  _resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h); this.camera.aspect = w / h;
    this.camera.fov = w < h ? 88 : 66; this.camera.updateProjectionMatrix();
  }
  _clear() {
    (this.arts || []).forEach((e) => { e.tex?.dispose(); (e.photos || []).forEach((t) => t?.dispose()); });
    this.root.clear();
    this.disposables.forEach((d) => d.dispose?.()); this.disposables = [];
    this.clickables = []; this.arts = []; this.pedestals = []; this.glide = null;
    this.rooms = []; this.obstacles = []; this.spotPool = []; this.lightSpots = []; this._glassM = null; this._leafM = null; this.glassList = []; this._spotT = 0; this.partitions = []; this.skyPatches = []; this._glowTex = null; this.nightGlowMat = null; this.curRoom = -1; this._sunHour = null; this._ft = [];
  }
  _track(o) { this.disposables.push(o); return o; }
  _mat(color, opts = {}) { return this._track(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts })); }
  _basic(opts) { return this._track(new THREE.MeshBasicMaterial({ toneMapped: false, ...opts })); }
  _plane(w, h, mat) { return new THREE.Mesh(this._track(new THREE.PlaneGeometry(w, h)), mat); }
  _box(w, h, d, mat) { return new THREE.Mesh(this._track(new THREE.BoxGeometry(w, h, d)), mat); }
  _canvasTex(canvas) { const t = this._track(new THREE.CanvasTexture(canvas)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

  _textCanvas({ w, h, bg, lines, pad = 0.08, radius = 0 }) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; if (radius) { x.beginPath(); x.roundRect(0, 0, w, h, radius); x.fill(); } else x.fillRect(0, 0, w, h); }
    const total = lines.reduce((s, l) => s + l.size * (l.gap ?? 1.25), 0);
    let y = (h - total) / 2;
    for (const l of lines) {
      const lh = l.size * (l.gap ?? 1.25);
      x.font = `${l.weight || 700} ${l.size}px ${l.font || FONT}`; x.fillStyle = l.color; x.textAlign = 'center'; x.textBaseline = 'middle';
      let size = l.size; while (x.measureText(l.text).width > w * (1 - pad * 2) && size > 10) { size -= 2; x.font = `${l.weight || 700} ${size}px ${l.font || FONT}`; }
      if (l.letter) x.letterSpacing = l.letter + 'px';
      x.fillText(l.text, w / 2, y + lh / 2);
      x.letterSpacing = '0px';
      y += lh;
    }
    return c;
  }

  _floorTexture(theme, color) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    if (theme === 'minimal') {
      for (let i = 0; i < 8; i++) { x.fillStyle = shade(color, (i % 3 - 1) * 0.03); x.fillRect(0, i * 64, 512, 64);
        x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, i * 64, 512, 2); const off = (i * 173) % 512; x.fillRect(off, i * 64, 2, 64);
        for (let k = 0; k < 6; k++) { x.strokeStyle = 'rgba(80,50,20,.06)'; x.beginPath(); const yy = i * 64 + 8 + k * 9; x.moveTo(0, yy); x.bezierCurveTo(170, yy + 4, 340, yy - 4, 512, yy); x.stroke(); } }
    } else if (theme === 'kids') {
      const cols = [color, shade(color, 0.08), '#ffd6a5', '#caffbf'];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = cols[(i + j * 2) % cols.length]; x.fillRect(i * 128, j * 128, 128, 128); x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 4; x.strokeRect(i * 128 + 2, j * 128 + 2, 124, 124); }
    } else {
      x.fillStyle = color; x.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 260; i++) { x.fillStyle = COLORFUL_PANELS[i % COLORFUL_PANELS.length]; x.globalAlpha = .55; x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 5, 0, 7); x.fill(); }
      x.globalAlpha = 1;
    }
    const t = this._canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  _setupWorld(gallery) {
    const col = themeColors(gallery); this.colors = col; this.theme = gallery.theme || 'minimal';
    this.titleFont = this.theme === 'kids' ? KIDS_FONT : FONT;
    this.scene.background = new THREE.Color(col.bg);
    this.scene.fog = new THREE.Fog(col.bg, 18, 60);
    this.sunCfg = normalizeLight(gallery.light); this.sunOn = this.sunCfg.mode !== 'off';
    this.scene.environment = this.envMap; this.scene.environmentIntensity = 0.55;
    const hemi = new THREE.HemisphereLight(0xfffaf2, new THREE.Color(col.floor).multiplyScalar(0.6), 0.55); this.root.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, 0.35); this.root.add(amb);
    const dir = new THREE.DirectionalLight(0xfff4e6, 0.7); dir.position.set(2, 6, 3); this.root.add(dir);
    this.L = { hemi, amb, dir };
    for (let i = 0; i < this.SPOTS; i++) { const sp = new THREE.SpotLight(0xfff1dc, 0, 7.5, 0.42, 0.65, 1.6); sp.userData.on = 0; this.root.add(sp, sp.target); this.spotPool.push(sp); }
    if (this.sunOn) {
      this.root.add(dir.target);
      const sh = dir.shadow; sh.mapSize.set(2048, 2048); sh.bias = -0.0008; sh.normalBias = 0.05;
      const c = sh.camera; c.left = -20; c.right = 20; c.top = 20; c.bottom = -20; c.near = 1; c.far = 130; c.updateProjectionMatrix();
      dir.castShadow = !this.lowQ;
      const torch = new THREE.PointLight(0xffe2b8, 0, 12, 1.6); this.root.add(torch); this.L.torch = torch;
      this.nightGlowMat = this._basic({ map: this._getGlowTex(), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
    }
  }

  _glassMat() { return this._glassM ||= this._track(new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.06, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.6 })); }
  _getAOTex() {
    if (!this._aoTex) { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); this._aoTex = new THREE.CanvasTexture(c); }
    return this._aoTex;
  }
  _getGlowTex() {
    if (!this._glowTex) { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const g = x.createRadialGradient(128, 110, 10, 128, 128, 128); g.addColorStop(0, 'rgba(255,244,220,.6)'); g.addColorStop(1, 'rgba(255,244,220,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); this._glowTex = this._canvasTex(c); }
    return this._glowTex;
  }

  // ---------- 陽光 ----------
  sunInfo() { return { on: !!this.sunOn, mode: this.sunCfg?.mode, hour: this._hourNow(), override: this.sunOverride != null }; }
  setSunOverride(h) { this.sunOverride = h == null ? null : Number(h); this._sunHour = null; }
  _hourNow() {
    if (this.sunOverride != null) return this.sunOverride;
    const c = this.sunCfg || {};
    if (c.mode === 'real') { const d = new Date(Date.now() + 8 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; }
    if (c.mode === 'cycle') return 5.5 + ((performance.now() / 1000) % 120) / 120 * 15.5;
    return c.hour ?? 15;
  }
  _updateSun() {
    if (!this.sunOn) return;
    const L = this.L, h = this._hourNow();
    const tz = Math.round(this.pos.z / 3) * 3;
    if (this._sunHour == null || Math.abs(h - this._sunHour) > 0.004) {
      this._sunHour = h; const st = this._sun = sunState(h);
      L.dir.color.copy(st.sunColor); L.dir.intensity = st.sunI * 1.5;
      L.amb.intensity = st.amb * 0.3; L.amb.color.copy(st.ambColor); L.hemi.intensity = st.hemi * 0.55; L.hemi.color.copy(st.ambColor); this.scene.environmentIntensity = 0.12 + 0.5 * st.dayF; this._nightBoost = 1 + st.night * 1.6;
      this.scene.background.copy(st.sky);
      this.scene.fog.color.set(this.colors.bg).multiplyScalar(0.25 + 0.75 * st.dayF);
      L.torch.intensity = st.night * 14;
      if (this.nightGlowMat) this.nightGlowMat.opacity = st.night * 0.85;
      const fake = !L.dir.castShadow;
      for (const p of this.skyPatches) {
        const ox = -st.dir.x / st.dir.y * p.H, oz = -st.dir.z / st.dir.y * p.H;
        p.mesh.position.set(ox, 0.012, p.z + oz);
        p.mesh.visible = fake && st.sunI > 0.05 && Math.abs(ox) + p.w / 2 < p.W / 2;
        p.mesh.material.opacity = Math.min(0.4, st.sunI * 0.14); p.mesh.material.color.copy(st.sunColor);
      }
    }
    L.dir.target.position.set(0, 0, tz); L.dir.position.copy(L.dir.target.position).addScaledVector(this._sun.dir, 60);
    L.torch.position.set(this.pos.x, this.pos.y + 0.7, this.pos.z);
  }
  _setLowQ() { if (this.lowQ) return; this.lowQ = true; if (this.L?.dir) this.L.dir.castShadow = false; this._sunHour = null; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25)); for (const g of this.glassList || []) g.visible = false; }

  // 房間：地板、天花、牆（牆可以有門口洞）
  _room({ W, D, H, holes = {} }) {
    const col = this.colors;
    let floorMat;
    if (this.theme === 'kids') { const floorTex = this._floorTexture(this.theme, col.floor); floorTex.repeat.set(W / 4, D / 4); const ps = pbrSet('rubber', W / 4, D / 4, false); floorMat = this._mat(0xffffff, { map: floorTex, normalMap: ps.normalMap, roughnessMap: ps.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6) }); }
    else if (this.theme === 'colorful') { const ps = pbrSet('terrazzo', W / 3, D / 3); floorMat = this._mat(new THREE.Color(col.floor).lerp(new THREE.Color('#ffffff'), 0.08), { ...ps, roughness: 1, envMapIntensity: 1.3, normalScale: new THREE.Vector2(0.4, 0.4) }); }
    else { const ps = pbrSet('wood', W / 3.2, D / 3.2); floorMat = this._mat(new THREE.Color(col.floor).lerp(new THREE.Color('#ffffff'), 0.12), { ...ps, roughness: 1, envMapIntensity: 1.1 }); }
    const floor = this._plane(W, D, floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.root.add(floor);
    const ceilMat = this._mat(shade(col.wall, 0.04), { side: THREE.DoubleSide, roughness: 0.95 });
    if (this.sunOn) { // 天花開天窗，等陽光照入嚟
      const sw = Math.min(W * 0.42, 3.4), sd = 1.7;
      const cs = new THREE.Shape(); cs.moveTo(-W / 2, -D / 2); cs.lineTo(W / 2, -D / 2); cs.lineTo(W / 2, D / 2); cs.lineTo(-W / 2, D / 2); cs.closePath();
      const rimMat = this._mat(shade(col.wall, -0.03));
      const patchGeo = this._track(new THREE.PlaneGeometry(sw, sd));
      for (let z = -D / 2 + 4; z <= D / 2 - 3.5; z += 4) {
        const hp = new THREE.Path(); hp.moveTo(-sw / 2, z - sd / 2); hp.lineTo(-sw / 2, z + sd / 2); hp.lineTo(sw / 2, z + sd / 2); hp.lineTo(sw / 2, z - sd / 2); hp.closePath(); cs.holes.push(hp);
        [[0, z - sd / 2, sw + 0.2, 0.1], [0, z + sd / 2, sw + 0.2, 0.1], [-sw / 2, z, 0.1, sd], [sw / 2, z, 0.1, sd]].forEach(([x, zz, bw, bd]) => { const r = this._box(bw, 0.4, bd, rimMat); r.position.set(x, H + 0.2, zz); r.castShadow = true; this.root.add(r); });
        const pm = new THREE.Mesh(patchGeo, this._basic({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })); pm.rotation.x = -Math.PI / 2; pm.visible = false; this.root.add(pm);
        this.skyPatches.push({ mesh: pm, z, w: sw, W, H });
      }
      const ceil = new THREE.Mesh(this._track(new THREE.ShapeGeometry(cs)), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; ceil.castShadow = true; this.root.add(ceil);
    } else { const ceil = this._plane(W, D, ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; this.root.add(ceil); }
    // 天花燈條
    // 天花路軌燈
    const railMat = this._mat('#2b2b2b', { roughness: 0.4, metalness: 0.6 });
    [-W / 2 + 1.1, W / 2 - 1.1].forEach((x) => { const r = this._box(0.05, 0.04, D - 0.4, railMat); r.position.set(x, H - 0.03, 0); this.root.add(r); });
    const lightMat = this._basic({ color: 0xffffff });
    if (!this.sunOn) for (let z = -D / 2 + 2; z <= D / 2 - 2; z += 4) { const l = this._box(Math.min(W * 0.3, 2), 0.03, 0.25, lightMat); l.position.set(0, H - 0.02, z); this.root.add(l); }
    const wps = pbrSet('plaster', 1 / 2.5, 1 / 2.5);
    const wallMat = this._mat(col.wall, { side: THREE.DoubleSide, ...wps, roughness: 1, normalScale: new THREE.Vector2(0.5, 0.5) });
    this._aoMat ||= null; const aoMat = this._basic({ map: this._getAOTex(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.32, side: THREE.DoubleSide });
    const mkWall = (len, holeList, pos, rotY) => {
      const s = new THREE.Shape(); s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, H); s.lineTo(-len / 2, H); s.closePath();
      (holeList || []).forEach((hl) => { const p = new THREE.Path(); p.moveTo(hl.x - hl.w / 2, 0.001); p.lineTo(hl.x - hl.w / 2, hl.h); p.lineTo(hl.x + hl.w / 2, hl.h); p.lineTo(hl.x + hl.w / 2, 0.001); p.closePath(); s.holes.push(p); });
      const m = new THREE.Mesh(this._track(new THREE.ShapeGeometry(s)), wallMat); m.position.copy(pos); m.rotation.y = rotY; m.castShadow = m.receiveShadow = true; this.root.add(m);
      // 踢腳線
      const segs = []; let start = -len / 2;
      [...(holeList || [])].sort((a, b) => a.x - b.x).forEach((hl) => { segs.push([start, hl.x - hl.w / 2]); start = hl.x + hl.w / 2; }); segs.push([start, len / 2]);
      const bbMat = this._mat(shade(col.accent, this.theme === 'minimal' ? 0.6 : 0));
      segs.forEach(([a, b]) => { if (b - a < 0.01) return; const bb = this._box(b - a, 0.12, 0.03, bbMat); bb.position.set((a + b) / 2, 0.06, 0.015); const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotY; g.add(bb);
        // 牆腳陰影（假環境光遮蔽）：地板一條、牆身一條
        const ao = this._plane(b - a, 0.55, aoMat); ao.rotation.x = Math.PI / 2; ao.position.set((a + b) / 2, 0.004, 0.275); g.add(ao);
        const ao2 = this._plane(b - a, 0.5, aoMat); ao2.position.set((a + b) / 2, 0.25, 0.031); ao2.renderOrder = 1; g.add(ao2);
        this.root.add(g); });
      // 天花角位陰影
      const ao3 = this._plane(len, 0.45, aoMat); const g3 = new THREE.Group(); g3.position.copy(pos); g3.rotation.y = rotY; ao3.rotation.z = Math.PI; ao3.position.set(0, H - 0.225, 0.006); g3.add(ao3); this.root.add(g3);
    };
    mkWall(W, holes.front, new THREE.Vector3(0, 0, -D / 2), 0);
    mkWall(W, holes.back, new THREE.Vector3(0, 0, D / 2), Math.PI);
    mkWall(D, holes.left, new THREE.Vector3(-W / 2, 0, 0), Math.PI / 2);
    mkWall(D, holes.right, new THREE.Vector3(W / 2, 0, 0), -Math.PI / 2);
    this._mkWall = mkWall;
    if (this.theme === 'kids') this._bunting(W, D, H);
  }

  _bunting(W, D, H) {
    const cols = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5'];
    const mats = cols.map((c) => this._basic({ color: c, side: THREE.DoubleSide }));
    const tri = this._track(new THREE.BufferGeometry()); tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.34, 0], 3));
    const rope = (len, place) => {
      const n = Math.floor(len / 0.5);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const sag = Math.sin(t * Math.PI * Math.max(1, Math.round(len / 6))) ; const m = new THREE.Mesh(tri, mats[i % mats.length]); place(m, -len / 2 + t * len, H - 0.25 - Math.abs(sag) * 0.25); }
    };
    rope(D, (m, s, y) => { m.position.set(-W / 2 + 0.06, y, s); m.rotation.y = Math.PI / 2; this.root.add(m); });
    rope(D, (m, s, y) => { m.position.set(W / 2 - 0.06, y, s); m.rotation.y = -Math.PI / 2; this.root.add(m); });
  }

  // ---------- 大堂 ----------
  async loadLobby(gallery, halls, counts, popular = [], reactionsByArt = {}, media = null) {
    this._clear(); this.mode = 'lobby'; this._setupWorld(gallery); this.media = media;
    const col = this.colors; const n = Math.max(1, halls.length);
    const doorW = 2.3, doorH = 3.1, gap = 1.5;
    const W = Math.max(13, n * (doorW + gap) + 3), D = 13, H = 6.4;
    const xs = halls.map((_, i) => (i - (n - 1) / 2) * (doorW + gap));
    this._room({ W, D, H, holes: { front: xs.map((x) => ({ x, w: doorW, h: doorH })) } });
    // 大標題
    const dark = isDark(col.wall);
    const ink = dark ? '#ffffff' : (this.theme === 'minimal' ? '#1f1f1f' : col.accent);
    const sub = dark ? '#eeeeee' : (this.theme === 'minimal' ? '#555' : shade(col.accent, -0.15));
    const boardW = Math.min(W - 1.5, 12), boardH = boardW * 0.3;
    const titleC = this._textCanvas({ w: 2400, h: 720, bg: this.theme === 'minimal' ? null : null, lines: [
      { text: gallery.edition ? `${gallery.edition}` : '', size: 90, color: sub, weight: 500, letter: 12 },
      { text: gallery.title || '學生作品展', size: 250, color: ink, weight: 900, font: this.titleFont },
      { text: gallery.subtitle || '', size: 96, color: sub, weight: 500 },
    ] });
    const titleMat = this._basic({ map: this._canvasTex(titleC), transparent: true });
    const title = this._plane(boardW, boardW * 0.3, titleMat); title.position.set(0, doorH + 0.35 + boardH / 2, -D / 2 + 0.02); this.root.add(title);
    if (this.theme !== 'minimal') { // 標題底色牌
      const plate = this._plane(boardW + 0.6, boardH + 0.3, this._mat(this.theme === 'kids' ? '#ffffff' : shade(col.wall, -0.03))); plate.position.set(0, title.position.y, -D / 2 + 0.01); this.root.add(plate);
    } else {
      const line = this._plane(boardW * 0.35, 0.02, this._basic({ color: '#1f1f1f' })); line.position.set(0, doorH + 0.25, -D / 2 + 0.02); this.root.add(line);
    }
    // 各班通道
    halls.forEach((hall, i) => {
      const x = xs[i];
      const pc = this.theme === 'colorful' ? COLORFUL_PANELS[i % COLORFUL_PANELS.length] : this.theme === 'kids' ? ['#ef476f', '#06d6a0', '#118ab2', '#ffb703', '#9b5de5'][i % 5] : '#2b2b2b';
      // 門框
      const frameMat = this._mat(pc);
      const fl = this._box(0.14, doorH + 0.14, 0.3, frameMat); fl.position.set(x - doorW / 2 - 0.07, (doorH + 0.14) / 2, -D / 2); this.root.add(fl);
      const fr = fl.clone(); fr.position.x = x + doorW / 2 + 0.07; this.root.add(fr);
      const ft = this._box(doorW + 0.28, 0.14, 0.3, frameMat); ft.position.set(x, doorH + 0.07, -D / 2); this.root.add(ft);
      // 通道（短隧道＋發光盡頭）
      const tunnelLen = 3;
      const tMat = this._mat(shade(col.wall, -0.06), { side: THREE.BackSide });
      const tunnel = this._box(doorW, doorH, tunnelLen, tMat); tunnel.position.set(x, doorH / 2, -D / 2 - tunnelLen / 2); tunnel.castShadow = true; this.root.add(tunnel);
      const glowC = this._textCanvas({ w: 512, h: 700, bg: pc, lines: [{ text: hall.name, size: 170, color: '#fff', weight: 900, font: this.titleFont }, { text: `${counts[hall.id] || 0} 件作品`, size: 54, color: 'rgba(255,255,255,.9)', weight: 500 }, { text: '入去參觀 →', size: 50, color: 'rgba(255,255,255,.9)', weight: 700 }] });
      const glow = this._plane(doorW - 0.02, doorH - 0.02, this._basic({ map: this._canvasTex(glowC) }));
      glow.position.set(x, doorH / 2, -D / 2 - tunnelLen + 0.02); glow.userData = { type: 'door', hall }; this.root.add(glow); this.clickables.push(glow);
      // 門口上面嘅班牌
      const signC = this._textCanvas({ w: 512, h: 160, bg: pc, radius: 24, lines: [{ text: hall.name, size: 96, color: '#fff', weight: 900, font: this.titleFont }] });
      const sign = this._plane(1.3, 0.4, this._basic({ map: this._canvasTex(signC), transparent: true }));
      sign.position.set(x, doorH + 0.06, -D / 2 + 0.17); sign.userData = { type: 'door', hall }; this.root.add(sign); this.clickables.push(sign);
      // 地上箭咀
      const arrowC = document.createElement('canvas'); arrowC.width = 256; arrowC.height = 256; const ax = arrowC.getContext('2d'); ax.fillStyle = pc; ax.globalAlpha = .85; ax.beginPath(); ax.moveTo(128, 30); ax.lineTo(220, 140); ax.lineTo(160, 140); ax.lineTo(160, 230); ax.lineTo(96, 230); ax.lineTo(96, 140); ax.lineTo(36, 140); ax.closePath(); ax.fill();
      const arrow = this._plane(0.9, 0.9, this._basic({ map: this._canvasTex(arrowC), transparent: true })); arrow.rotation.x = -Math.PI / 2; arrow.position.set(x, 0.01, -D / 2 + 1.4); this.root.add(arrow);
    });
    this.doors = halls.map((hall, i) => ({ hall, x: xs[i], w: doorW }));
    this.bounds = { minX: -W / 2 + 0.5, maxX: W / 2 - 0.5, minZ: -D / 2 + 0.45, maxZ: D / 2 - 0.5, frontZ: -D / 2 };
    this.pos.set(0, EYE, D / 2 - 2.2); this.yaw = 0; this.pitch = 0.12;
    this.lobbyInfo = { D };
    this._furnishLobby(gallery, W, D, H);
    if (popular.length && media) this._popularWall(popular, reactionsByArt, W, D, H);
    this._updateSun();
  }

  // ---------- 展廳 ----------
  async loadHall(gallery, hall, artworks, reactionsByArt, media) {
    this._clear(); this.mode = 'hall'; this._setupWorld(gallery); this.hall = hall; this.media = media;
    const col = this.colors;
    const spacing = 3.7, W = 8.2, H = 4.6, doorW = 2.2, doorH = 3;
    // 分展室
    const rs = Math.max(0, Math.floor(Number(gallery.room_size ?? 20)) || 0);
    const chunks = []; if (rs > 0) for (let i = 0; i < artworks.length; i += rs) chunks.push(artworks.slice(i, i + rs)); else chunks.push(artworks);
    if (!chunks.length) chunks.push([]);
    const n = chunks.length;
    const rooms = chunks.map((list, k) => {
      const flats = list.filter((a) => (a.kind || 'flat') === 'flat');
      const objs = list.filter((a) => a.kind === 'model' || a.kind === 'photos');
      const rows = Math.max(1, Math.ceil(flats.length / 2), objs.length + (flats.length ? 0.5 : 0));
      return { flats, objs, count: list.length, depth: Math.max(9, rows * spacing + 2.2) + (k === 0 ? 1 : 0) + (k === n - 1 ? 1.5 : 0) };
    });
    const D = rooms.reduce((t, r) => t + r.depth, 0);
    let zt = D / 2; rooms.forEach((r) => { r.zTop = zt; zt -= r.depth; });
    this.rooms = rooms; this.hallDoorW = doorW;
    this._room({ W, D, H, holes: { back: [{ x: 0, w: doorW, h: doorH }] } });
    // 出口
    const exitC = this._textCanvas({ w: 512, h: 700, bg: shade(col.bg, -0.05), lines: [{ text: '← 返大堂', size: 80, color: isDark(col.bg) ? '#fff' : '#333', weight: 800 }] });
    const exit = this._plane(doorW, doorH, this._basic({ map: this._canvasTex(exitC) }));
    exit.position.set(0, doorH / 2, D / 2 + 1.2); exit.rotation.y = Math.PI; exit.userData = { type: 'exit' }; this.root.add(exit); this.clickables.push(exit);
    const tun = this._box(doorW, doorH, 1.2, this._mat(shade(col.wall, -0.06), { side: THREE.BackSide })); tun.position.set(0, doorH / 2, D / 2 + 0.6); tun.castShadow = true; this.root.add(tun);
    // 展室之間嘅間牆同門口
    const frameCol = this.theme === 'minimal' ? '#2b2b2b' : col.accent; const frameMat = this._mat(frameCol);
    const signInk = '#ffffff';
    for (let k = 1; k < n; k++) {
      const zb = rooms[k].zTop; this.partitions.push(zb);
      this._mkWall(W, [{ x: 0, w: doorW, h: doorH }], new THREE.Vector3(0, 0, zb), 0);
      const fl = this._box(0.14, doorH + 0.14, 0.3, frameMat); fl.position.set(-doorW / 2 - 0.07, (doorH + 0.14) / 2, zb); fl.castShadow = true; this.root.add(fl);
      const fr = fl.clone(); fr.position.x = doorW / 2 + 0.07; this.root.add(fr);
      const ft = this._box(doorW + 0.28, 0.14, 0.3, frameMat); ft.position.set(0, doorH + 0.07, zb); this.root.add(ft);
      const mkSign = (text, rotY, dz) => { const c = this._textCanvas({ w: 640, h: 170, bg: frameCol, radius: 28, lines: [{ text, size: 92, color: signInk, weight: 900, font: this.titleFont }] });
        const sg = this._plane(1.9, 0.5, this._basic({ map: this._canvasTex(c), transparent: true })); sg.position.set(0, doorH + 0.55, zb + dz); sg.rotation.y = rotY; this.root.add(sg); };
      mkSign(`展室 ${k + 1} →`, 0, 0.03); mkSign(`← 展室 ${k}`, Math.PI, -0.03);
    }
    // 盡頭牆：班名
    const dark = isDark(col.wall);
    const ink = dark ? '#fff' : (this.theme === 'minimal' ? '#1f1f1f' : col.accent);
    const endC = this._textCanvas({ w: 2000, h: 900, lines: [
      { text: gallery.title || '', size: 110, color: dark ? '#eee' : '#666', weight: 500 },
      { text: hall.name, size: hall.name.length > 4 ? 260 : 380, color: ink, weight: 900, font: this.titleFont },
      { text: artworks.length ? `共 ${artworks.length} 件作品` : '作品準備中…', size: 100, color: dark ? '#eee' : '#666', weight: 500 },
    ] });
    const end = this._plane(5.5, 5.5 * 0.45, this._basic({ map: this._canvasTex(endC), transparent: true }));
    end.position.set(0, 2.4, -D / 2 + 0.02); this.root.add(end);

    // 作品位置：平面作品掛兩邊牆，立體作品擺中間展台
    const all = [];
    rooms.forEach((r, k) => {
      const z0 = r.zTop - 2.7 - (k === 0 ? 1 : 0); const entries = [];
      r.flats.forEach((a, i) => {
        const side = i % 2 === 0 ? 'left' : 'right';
        const z = z0 - Math.floor(i / 2) * spacing;
        const g = new THREE.Group();
        if (side === 'left') { g.position.set(-W / 2 + 0.01, 0, z); g.rotation.y = Math.PI / 2; }
        else { g.position.set(W / 2 - 0.01, 0, z); g.rotation.y = -Math.PI / 2; }
        entries.push({ art: a, group: g, type: 'wall', z, room: k, order: side === 'left' ? 0 : 1, normal: new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0) });
      });
      r.objs.forEach((a, j) => {
        const z = z0 - (r.flats.length ? spacing / 2 : 0) - j * spacing;
        const x = r.objs.length > 1 ? (j % 2 ? 1.1 : -1.1) : 0;
        const g = new THREE.Group(); g.position.set(x, 0, z);
        entries.push({ art: a, group: g, type: 'pedestal', x, z, room: k, order: 2, normal: new THREE.Vector3(0, 0, 1) });
      });
      entries.sort((a, b) => b.z - a.z || a.order - b.order); all.push(...entries);
    });
    all.forEach((e, i) => {
      e.index = i; this.root.add(e.group); this.arts.push(e);
      if (e.type === 'wall') this._buildArt(e, i, (a) => media.url(a.thumb_path || a.image_path));
      else this._buildPedestal(e, i);
      this._buildStickers(e, reactionsByArt[e.art.id] || []);
    });
    this.pedestals = all.filter((e) => e.type === 'pedestal');
    this.pedestals.forEach((e) => this.obstacles.push({ x: e.x, z: e.z, rx: 0.75, rz: 0.75 }));
    // 射燈燈頭（路軌上）同射燈目標
    const housingMat = this._mat('#1d1d1d', { roughness: 0.35, metalness: 0.7 });
    const housingGeo = this._track(new THREE.CylinderGeometry(0.055, 0.07, 0.2, 16));
    for (const e of all) {
      const tp = e.type === 'wall' ? e.group.localToWorld(new THREE.Vector3(0, 1.75, 0)) : e.group.localToWorld(new THREE.Vector3(0, 1.4, 0));
      const lp = e.type === 'wall' ? new THREE.Vector3(Math.sign(tp.x) * (W / 2 - 1.1), H - 0.18, e.z) : new THREE.Vector3(e.x + (e.x >= 0 ? -0.9 : 0.9), H - 0.18, e.z + 1.1);
      const hs = new THREE.Mesh(housingGeo, housingMat); hs.position.copy(lp); hs.lookAt(tp); hs.rotateX(Math.PI / 2); this.root.add(hs);
      const lens = this._plane(0.09, 0.09, this._basic({ color: 0xfff6e5 })); lens.position.copy(lp).addScaledVector(tp.clone().sub(lp).normalize(), 0.105); lens.lookAt(tp); this.root.add(lens);
      this.lightSpots.push({ e, pos: lp, target: tp });
    }
    this._furnishHall(gallery, hall, rooms, W, H, D);
    this.bounds = { minX: -W / 2 + 0.6, maxX: W / 2 - 0.6, minZ: -D / 2 + 0.6, maxZ: D / 2 - 0.5, backZ: D / 2 };
    this.pos.set(0, EYE, D / 2 - 1.3); this.yaw = 0; this.pitch = 0; this._prevZ = this.pos.z;
    this.currentArt = -1;
    this._setRoom(0); this._updateSun();
  }

  // ---------- 射燈 ----------
  _updateSpots(dt) {
    if (!this.spotPool.length) return;
    this._spotT -= dt;
    if (this._spotT <= 0) {
      this._spotT = 0.25;
      const cand = this.mode === 'hall' ? this.lightSpots.filter((l) => Math.abs(l.e.room - this.curRoom) <= 1) : this.lightSpots.slice();
      cand.sort((a, b) => Math.abs(a.pos.z - this.pos.z) - Math.abs(b.pos.z - this.pos.z));
      const pick = cand.slice(0, this.spotPool.length);
      this.spotPool.forEach((sp, i) => { const l = pick[i]; sp.userData.want = l ? 1 : 0; if (l && sp.userData.ref !== l) { sp.userData.ref = l; sp.position.copy(l.pos); sp.target.position.copy(l.target); sp.target.updateMatrixWorld(); if (sp.userData.on < 0.05) sp.userData.on = 0; } });
    }
    const base = (this.sunOn ? 11 : 16) * (this._nightBoost || 1);
    for (const sp of this.spotPool) { const u = sp.userData; u.on += ((u.want || 0) - u.on) * Math.min(1, dt * 3); sp.intensity = base * u.on; }
  }

  // ---------- 擺設 ----------
  _leafMat() { return this._leafM ||= this._mat('#3f7a3a', { roughness: 0.6, side: THREE.DoubleSide }); }
  _plant(x, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale);
    const potCol = this.theme === 'minimal' ? '#e8e3da' : this.theme === 'kids' ? '#ef8354' : '#2b2b2b';
    const pot = new THREE.Mesh(this._track(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 24)), this._mat(potCol, { roughness: 0.55 })); pot.position.y = 0.25; pot.castShadow = true; g.add(pot);
    const soil = new THREE.Mesh(this._track(new THREE.CircleGeometry(0.24, 24)), this._mat('#3b2a1f')); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.47; g.add(soil);
    const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.bezierCurveTo(0.18, 0.12, 0.2, 0.45, 0, 0.62); leafShape.bezierCurveTo(-0.2, 0.45, -0.18, 0.12, 0, 0);
    const leafGeo = this._track(new THREE.ShapeGeometry(leafShape, 8)); const stemMat = this._mat('#4d6b35');
    const stemGeo = this._track(new THREE.CylinderGeometry(0.008, 0.012, 1, 6));
    for (let k = 0; k < 11; k++) {
      const a = k * 2.4 + 0.3, len = 0.55 + ((k * 37) % 7) * 0.09, tilt = 0.25 + ((k * 13) % 5) * 0.09;
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      const end = new THREE.Vector3(0, 0.45, 0).addScaledVector(dir, len);
      const st = new THREE.Mesh(stemGeo, stemMat); st.scale.y = len; st.position.set(0, 0.45, 0).addScaledVector(dir, len / 2); st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.add(st);
      const lf = new THREE.Mesh(leafGeo, this._leafMat()); lf.position.copy(end); lf.rotation.set(-0.6 - tilt * 0.6, -a + Math.PI / 2, 0, 'YXZ'); lf.castShadow = true; g.add(lf);
    }
    this.root.add(g); this.obstacles.push({ x, z, rx: 0.45 * scale, rz: 0.45 * scale });
  }
  _bench(x, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const topCol = this.theme === 'kids' ? '#ffb703' : this.theme === 'colorful' ? '#f4f1ec' : '#b98b5e';
    const ps = this.theme === 'minimal' ? pbrSet('wood', 0.6, 0.15) : {};
    const top = this._box(1.7, 0.07, 0.48, this._mat(topCol, { ...ps, roughness: ps.roughnessMap ? 1 : 0.6 })); top.position.y = 0.45; top.castShadow = top.receiveShadow = true; g.add(top);
    const legMat = this._mat('#3a3a3a', { roughness: 0.3, metalness: 0.85 });
    [-0.68, 0.68].forEach((lx) => {
      [-0.17, 0.17].forEach((lz) => { const leg = this._box(0.035, 0.42, 0.035, legMat); leg.position.set(lx, 0.21, lz); leg.castShadow = true; g.add(leg); });
      const bar = this._box(0.035, 0.035, 0.38, legMat); bar.position.set(lx, 0.06, 0); g.add(bar);
    });
    const sh = this._plane(2.1, 0.9, this._basic({ map: this._getGlowTex(), color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.006; g.add(sh);
    this.root.add(g);
    const c = Math.abs(Math.cos(rotY)) > 0.5; this.obstacles.push({ x, z, rx: c ? 1.1 : 0.5, rz: c ? 0.5 : 1.1 });
  }
  _wallPanel(x, z, rotY, lines, w = 0.75, h = 0.55) {
    const c = this._textCanvas({ w: Math.round(w * 800), h: Math.round(h * 800), bg: this.theme === 'minimal' ? '#ffffff' : '#fffdf8', radius: 10, lines });
    const m = this._plane(w, h, this._mat(0xffffff, { map: this._canvasTex(c), emissiveMap: null, roughness: 0.9 }));
    m.position.set(x, 1.55, z); m.rotation.y = rotY; this.root.add(m);
    const edge = this._box(w + 0.02, h + 0.02, 0.012, this._mat('#d9d4cc')); edge.position.copy(m.position); edge.rotation.y = rotY; edge.translateZ(-0.007); this.root.add(edge);
  }
  _furnishHall(gallery, hall, rooms, W, H, D) {
    const n = rooms.length; const ink = '#222', sub = '#666';
    rooms.forEach((r, k) => {
      const zBottom = r.zTop - r.depth;
      // 展室介紹牌（入口左邊牆）
      const first = rooms.slice(0, k).reduce((t, x) => t + x.count, 0) + 1;
      const lines = k === 0
        ? [{ text: gallery.edition || '', size: 34, color: sub, weight: 500 }, { text: gallery.title || '', size: 64, color: ink, weight: 900, font: this.titleFont }, { text: hall.name, size: 46, color: ink, weight: 700 }, { text: n > 1 ? `共 ${n} 間展室` : `共 ${r.count} 件作品`, size: 32, color: sub, weight: 500 }]
        : [{ text: `展室 ${k + 1}`, size: 72, color: ink, weight: 900, font: this.titleFont }, { text: hall.name, size: 44, color: sub, weight: 700 }, { text: r.count ? `第 ${first}–${first + r.count - 1} 件作品` : '', size: 32, color: sub, weight: 500 }];
      this._wallPanel(-W / 2 + 0.02, r.zTop - (k === 0 ? 1.4 : 0.85), Math.PI / 2, lines.filter((l) => l.text));
      // 長凳：冇展台嘅展室先擺
      if (!r.objs.length && r.depth >= 9) this._bench(0, (r.zTop + zBottom) / 2, Math.PI / 2);
      // 植物：每間展室盡頭兩個角
      this._plant(-W / 2 + 0.55, zBottom + 0.6, 1); this._plant(W / 2 - 0.55, zBottom + 0.6, 0.85 + (k % 2) * 0.2);
    });
  }
  _furnishLobby(gallery, W, D, H) {
    const col = this.colors;
    // 兩邊牆嘅掛布橫額
    const bCol = this.theme === 'minimal' ? '#1f1f1f' : col.accent;
    const title = (gallery.title || '').slice(0, 8);
    [-1, 1].forEach((sd) => {
      const c = document.createElement('canvas'); c.width = 360; c.height = 1200; const x = c.getContext('2d');
      x.fillStyle = bCol; x.fillRect(0, 0, 360, 1200);
      x.fillStyle = 'rgba(255,255,255,.92)'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `500 44px ${FONT}`; x.fillText(gallery.edition || '', 180, 110);
      const step = Math.min(150, 900 / Math.max(1, title.length)); x.font = `900 ${Math.round(step * 0.82)}px ${this.titleFont}`;
      [...title].forEach((ch, i) => x.fillText(ch, 180, 230 + step * (i + 0.5)));
      const tex = this._canvasTex(c);
      const ban = this._plane(1.1, 3.6, this._mat(0xffffff, { map: tex, roughness: 0.95, side: THREE.DoubleSide }));
      ban.position.set(sd * (W / 2 - 0.08), H - 2.2, -D / 2 + 2.6); ban.rotation.y = -sd * Math.PI / 2; this.root.add(ban);
      const rod = this._box(0.04, 0.04, 1.3, this._mat('#2b2b2b', { metalness: 0.7, roughness: 0.3 })); rod.position.set(sd * (W / 2 - 0.1), H - 0.38, -D / 2 + 2.6); this.root.add(rod);
    });
    this._plant(-W / 2 + 0.6, -D / 2 + 0.7, 1.1); this._plant(W / 2 - 0.6, -D / 2 + 0.7, 1.1);
    this._plant(-W / 2 + 0.6, D / 2 - 0.7, 0.9); this._plant(W / 2 - 0.6, D / 2 - 0.7, 0.9);
    this._bench(-W / 2 + 2.6, 0.8, Math.PI / 2); this._bench(W / 2 - 2.6, 0.8, Math.PI / 2);
  }

  // 大堂人氣之選：兩邊牆各 3 件
  _popularWall(list, reactionsByArt, W, D, H) {
    const zs = [-1.6, 0.8, 3.2]; const slots = [];
    [-1, 1].forEach((sd) => zs.forEach((z) => slots.push({ sd, z })));
    const housingMat = this._mat('#1d1d1d', { roughness: 0.35, metalness: 0.7 }); const housingGeo = this._track(new THREE.CylinderGeometry(0.055, 0.07, 0.2, 16));
    list.slice(0, 6).forEach((a, i) => {
      const sl = slots[i % 2 ? 3 + (i >> 1) : i >> 1];
      const g = new THREE.Group(); g.position.set(sl.sd * (W / 2 - 0.01), 0, sl.z); g.rotation.y = -sl.sd * Math.PI / 2;
      const e = { art: a, group: g, type: 'wall', z: sl.z, room: 0, index: i, normal: new THREE.Vector3(-sl.sd, 0, 0), popular: true };
      this.root.add(g); this.arts.push(e);
      this._buildArt(e, i, (x) => this.media.url(x.thumb_path || x.image_path), 1.35, 1.1);
      this._buildStickers(e, reactionsByArt[a.id] || []); e.load();
      const tp = g.localToWorld(new THREE.Vector3(0, 1.75, 0)); const lp = new THREE.Vector3(sl.sd * (W / 2 - 1.1), H - 0.18, sl.z);
      const hs = new THREE.Mesh(housingGeo, housingMat); hs.position.copy(lp); hs.lookAt(tp); hs.rotateX(Math.PI / 2); this.root.add(hs);
      this.lightSpots.push({ e, pos: lp, target: tp });
      if (i < 2) { // 標題牌
        const c = this._textCanvas({ w: 900, h: 220, bg: this.theme === 'minimal' ? '#1f1f1f' : this.colors.accent, radius: 30, lines: [{ text: '⭐ 人氣之選', size: 96, color: '#fff', weight: 900, font: this.titleFont }, { text: '最多同學讚嘅作品', size: 44, color: 'rgba(255,255,255,.9)', weight: 500 }] });
        const sign = this._plane(1.6, 0.39, this._basic({ map: this._canvasTex(c), transparent: true })); sign.position.set(sl.sd * (W / 2 - 0.03), 3.35, zs[1]); sign.rotation.y = -sl.sd * Math.PI / 2; this.root.add(sign);
      }
    });
  }

  // ---------- 偵測學生睇過邊件作品 ----------
  _checkSeen(dt) {
    if (!this.h.onSeen || !this.arts.length) return;
    this._seenT = (this._seenT || 0) + dt; if (this._seenT < 0.3) return; const step = this._seenT; this._seenT = 0;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    for (const e of this.arts) {
      if (e.seen || (this.mode === 'hall' && Math.abs(e.room - this.curRoom) > 0)) continue;
      const c = new THREE.Vector3(); e.group.getWorldPosition(c);
      const to = new THREE.Vector3(c.x - this.pos.x, 0, c.z - this.pos.z); const d = to.length();
      if (d < 4.2 && d > 0.3 && to.normalize().dot(fwd) > 0.55) { e.look = (e.look || 0) + step; if (e.look >= 1.2) { e.seen = true; this.h.onSeen(e.art); } }
      else e.look = 0;
    }
  }
  markSeen(ids) { const set = new Set(ids); for (const e of this.arts) if (set.has(e.art.id)) e.seen = true; }

  // ---------- 小地圖資料 ----------
  mapState() {
    if (this.mode !== 'hall' || !this.bounds) return null;
    const b = this.bounds; const W = (b.maxX - b.minX) + 1.2, D = (b.maxZ - b.minZ) + 1.1;
    return { W, D, top: b.backZ, rooms: this.rooms.map((r) => ({ zTop: r.zTop, depth: r.depth })), arts: this.arts.map((e) => { const c = new THREE.Vector3(); e.group.getWorldPosition(c); return { x: c.x, z: c.z, seen: !!e.seen, ped: e.type === 'pedestal' }; }), x: this.pos.x, z: this.pos.z, yaw: this.yaw, room: this.curRoom };
  }

  _roomAt(z) { for (let k = this.rooms.length - 1; k > 0; k--) if (z <= this.rooms[k].zTop) return k; return 0; }
  _setRoom(k) {
    if (k === this.curRoom) return; this.curRoom = k;
    for (const e of this.arts) { const d = Math.abs(e.room - k); if (d <= 1) e.load?.(); else if (d > 2) e.unload?.(); }
    this.h.onRoom?.(k, this.rooms.length, this.rooms.map((r) => r.count));
  }
  goToRoom(k) {
    if (this.mode !== 'hall' || !this.rooms[k]) return;
    this.glide = null; this.currentArt = -1;
    this.pos.set(0, EYE, this.rooms[k].zTop - (k === 0 ? 1.3 : 0.9)); this.yaw = 0; this.pitch = 0; this._prevZ = this.pos.z;
    this._setRoom(k);
  }
  _smallTex(url, max, cb) {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; cb(t); };
    im.src = url;
  }

  // 立體作品展台
  _buildPedestal(entry, i) {
    const g = entry.group; const a = entry.art; const col = this.colors;
    const pedCol = this.theme === 'minimal' ? '#fbfaf7' : this.theme === 'kids' ? ['#ef476f', '#06d6a0', '#118ab2', '#ffb703', '#9b5de5'][i % 5] : COLORFUL_PANELS[i % COLORFUL_PANELS.length];
    const ped = this._box(0.8, 1, 0.8, this._mat(pedCol)); ped.position.y = 0.5; ped.castShadow = ped.receiveShadow = true; g.add(ped);
    const top = this._box(0.86, 0.04, 0.86, this._mat(shade(pedCol, -0.08))); top.position.y = 1.02; g.add(top);
    // 撳得嘅隱形範圍
    const hit = this._box(0.9, 2.1, 0.9, this._basic({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })); hit.position.y = 1.05;
    hit.userData = { type: 'art', index: entry.index }; g.add(hit); this.clickables.push(hit);
    // 名牌（展台正面）
    const name = `${a.student_class || ''} ${a.student_no ? a.student_no + '號 ' : ''}${a.student_name || ''}`.trim();
    const labC = this._textCanvas({ w: 640, h: 200, bg: '#ffffff', radius: 14, lines: [
      { text: a.title ? `《${a.title}》` : '', size: 54, color: '#222', weight: 800 }, { text: name, size: 44, color: '#555', weight: 500 },
    ].filter((l) => l.text) });
    const lab = this._plane(0.7, 0.22, this._basic({ map: this._canvasTex(labC), transparent: true })); lab.position.set(0, 0.8, 0.402); g.add(lab);
    const tagC = this._textCanvas({ w: 256, h: 80, bg: '#1f1d1a', radius: 40, lines: [{ text: a.kind === 'model' ? '3D 作品' : '360° 相片', size: 36, color: '#fff', weight: 700 }] });
    const tag = this._plane(0.3, 0.094, this._basic({ map: this._canvasTex(tagC), transparent: true })); tag.position.set(0, 0.97, 0.402); g.add(tag);
    const holder = new THREE.Group(); holder.position.y = 1.04; g.add(holder); entry.holder = holder;
    if (a.kind === 'photos') {
      entry.photos = []; entry.photoIdx = 0; entry.photoT = 0;
      const frame = new THREE.Group(); holder.add(frame); entry.billboard = frame;
      const back = this._plane(0.84, 0.84, this._basic({ color: '#ffffff' })); back.position.set(0, 0.46, -0.003); frame.add(back);
      const pic = this._plane(0.8, 0.8, this._basic({ color: 0xffffff })); pic.position.y = 0.46; frame.add(pic); entry.photoMesh = pic;
      entry.state = 'idle'; entry.gen = 0;
      entry.load = () => {
        if (entry.state !== 'idle') return; entry.state = 'ready'; const gen = ++entry.gen;
        (a.photo_paths || []).slice(0, 12).forEach((p, k) => this.media.url(p).then((u) => this._smallTex(u, 512, (t) => {
          if (!g.parent || gen !== entry.gen) { t.dispose(); return; } entry.photos[k] = t;
          if (k === 0) { pic.material.map = t; pic.material.needsUpdate = true; const asp = t.image.width / t.image.height; const w = asp >= 1 ? 0.8 : 0.8 * asp, h = asp >= 1 ? 0.8 / asp : 0.8; pic.scale.set(w / 0.8, h / 0.8, 1); back.scale.set((w + 0.04) / 0.84, (h + 0.04) / 0.84, 1); pic.position.y = back.position.y = h / 2 + 0.02; }
        })));
      };
      entry.unload = () => { if (entry.state !== 'ready') return; entry.gen++; entry.state = 'idle'; pic.material.map = null; pic.material.needsUpdate = true; entry.photos.forEach((t) => t?.dispose()); entry.photos = []; entry.photoIdx = 0; };
    } else {
      entry.modelState = 'idle';
      // 未載入前顯示一個灰色佔位
      const ph = this._box(0.3, 0.3, 0.3, this._mat('#d9d4cc')); ph.position.y = 0.2; holder.add(ph); entry.placeholder = ph;
    }
  }

  _loadPedestalModel(entry) {
    entry.modelState = 'loading';
    import('./models.js?v=20261113f').then(({ loadArtModel, normalize }) => loadArtModel(this.media.db, entry.art.model_path).then((obj) => {
      if (!entry.group.parent) return;
      const m = normalize(obj, 0.85); m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); entry.holder.remove(entry.placeholder); entry.holder.add(m); entry.model = m; entry.modelState = 'ready';
    })).catch((e) => { console.warn('模型載入失敗', e); entry.modelState = 'error'; if (entry.placeholder) entry.placeholder.material.color.set('#e8a0a0'); });
  }

  _buildArt(entry, i, imageSrc, maxW = 1.9, maxH = 1.55) {
    const { group: g, art } = entry; const col = this.colors;
    const cy = 1.72;
    const holder = new THREE.Group(); g.add(holder);
    const place = (aspect, tex) => {
      holder.clear();
      let w = maxW, h = w / aspect; if (h > maxH) { h = maxH; w = h * aspect; }
      // 主題特色
      if (this.theme === 'colorful') {
        const panel = this._plane(w + 1.1, h + 1.4, this._mat(COLORFUL_PANELS[i % COLORFUL_PANELS.length])); panel.position.set(0, cy - 0.1, 0.005); holder.add(panel);
      }
      if (this.theme === 'minimal' && !this.SPOTS) {
        const glow = this._plane(w + 2.2, h + 2.2, this._basic({ map: this._getGlowTex(), transparent: true, depthWrite: false })); glow.position.set(0, cy + 0.15, 0.004); holder.add(glow);
      }
      if (this.nightGlowMat) { const ng = this._plane(w + 2.4, h + 2.6, this.nightGlowMat); ng.position.set(0, cy + 0.2, 0.007); holder.add(ng); }
      const frameCol = this.theme === 'minimal' ? '#2a2420' : this.theme === 'kids' ? ['#ef476f', '#06d6a0', '#118ab2', '#ffb703', '#9b5de5'][i % 5] : '#ffffff';
      const fw = this.theme === 'kids' ? 0.12 : this.theme === 'colorful' ? 0.09 : 0.05;
      const mat = this.theme === 'minimal' ? 0.12 : 0;
      entry.size = { w, h, edge: w / 2 + fw + mat };
      // 畫框：外框＋內斜邊（有立體感）
      const fMat = this._mat(frameCol, { roughness: this.theme === 'minimal' ? 0.35 : 0.5, metalness: this.theme === 'minimal' ? 0.15 : 0, envMapIntensity: 0.8 });
      const OW = w + 2 * (fw + mat), OH = h + 2 * (fw + mat);
      [[0, OH / 2 - fw / 2, OW, fw], [0, -OH / 2 + fw / 2, OW, fw], [-OW / 2 + fw / 2, 0, fw, OH - 2 * fw], [OW / 2 - fw / 2, 0, fw, OH - 2 * fw]].forEach(([x, y, bw, bh]) => { const b = this._box(bw, bh, 0.06, fMat); b.position.set(x, cy + y, 0.03); b.castShadow = true; holder.add(b); });
      const lipMat = this._mat(shade(frameCol, -0.12), { roughness: 0.5 });
      const IW = OW - 2 * fw, IH = OH - 2 * fw, lip = 0.012;
      [[0, IH / 2 - lip / 2, IW, lip], [0, -IH / 2 + lip / 2, IW, lip], [-IW / 2 + lip / 2, 0, lip, IH], [IW / 2 - lip / 2, 0, lip, IH]].forEach(([x, y, bw, bh]) => { const b = this._box(bw, bh, 0.03, lipMat); b.position.set(x, cy + y, 0.045); holder.add(b); });
      const back = this._plane(IW, IH, this._mat('#e9e6df', { roughness: 0.95 })); back.position.set(0, cy, 0.03); holder.add(back);
      if (mat) { const m = this._plane(w + 2 * mat, h + 2 * mat, this._mat('#fbfaf7', { roughness: 0.95 })); m.position.set(0, cy, 0.031); holder.add(m);
        const bev = this._plane(w + 0.012, h + 0.012, this._mat('#efe9dd', { roughness: 0.9 })); bev.position.set(0, cy, 0.0315); holder.add(bev); }
      const pic = this._plane(w, h, this._mat(0xffffff, tex ? { map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.9 } : { color: 0xdddddd }));
      pic.position.set(0, cy, mat ? 0.033 : 0.04); pic.receiveShadow = true;
      // 玻璃反光（只喺效能夠嘅裝置）
      const glass = this._plane(w + 2 * mat, h + 2 * mat, this._glassMat()); glass.position.set(0, cy, 0.052); glass.visible = !this.lowQ; holder.add(glass); (this.glassList ||= []).push(glass);
      pic.userData = { type: 'art', index: entry.index }; holder.add(pic); this.clickables.push(pic); entry.pic = pic;
      // 名牌
      const name = `${art.student_class || ''} ${art.student_no ? art.student_no + '號 ' : ''}${art.student_name || ''}`.trim();
      const labC = this._textCanvas({ w: 640, h: 200, bg: '#ffffff', radius: 14, lines: [
        { text: art.title ? `《${art.title}》` : '', size: 54, color: '#222', weight: 800 },
        { text: name, size: 44, color: '#555', weight: 500 },
      ].filter((l) => l.text) });
      const lab = this._plane(0.8, 0.25, this._basic({ map: this._canvasTex(labC), transparent: true }));
      lab.position.set(0, cy - h / 2 - fw - mat - 0.28, 0.02); lab.userData = { type: 'art', index: entry.index }; holder.add(lab); this.clickables.push(lab);
      if (entry.stickerGroup) entry.stickerGroup.position.x = entry.size.edge + 0.42;
    };
    place(4 / 3, null);
    entry.state = 'idle'; entry.gen = 0;
    entry.load = () => {
      if (entry.state !== 'idle') return; entry.state = 'loading'; const gen = ++entry.gen;
      imageSrc(art).then((url) => this.loader.load(url, (tex) => {
        if (!g.parent || gen !== entry.gen) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; entry.tex = tex; entry.state = 'ready';
        if (!entry.placed) { this.clickables = this.clickables.filter((c) => !holder.children.includes(c)); place(tex.image.width / tex.image.height, tex); entry.placed = true; }
        else { const m = entry.pic.material; m.map = tex; m.emissiveMap = tex; m.emissive.set(0xffffff); m.emissiveIntensity = 0.42; m.color.set(0xffffff); m.needsUpdate = true; }
      }, undefined, () => { if (gen === entry.gen) entry.state = 'error'; }));
    };
    entry.unload = () => {
      if (entry.state === 'loading') { entry.gen++; entry.state = 'idle'; return; }
      if (entry.state !== 'ready') return;
      { const m = entry.pic.material; m.map = null; m.emissiveMap = null; m.emissive?.set(0x000000); m.color.set(0xdddddd); m.needsUpdate = true; } entry.tex?.dispose(); entry.tex = null; entry.state = 'idle';
    };
  }

  _getStickerTex(id) {
    if (!this.stickerTex.has(id)) { const t = this.loader.load(stickerUrl(id)); t.colorSpace = THREE.SRGBColorSpace; this.stickerTex.set(id, t); }
    return this.stickerTex.get(id);
  }

  _buildStickers(entry, reactions) {
    if (entry.stickerGroup) { entry.group.remove(entry.stickerGroup); this.clickables = this.clickables.filter((c) => c.userData.group !== entry.stickerGroup); }
    const sg = new THREE.Group(); entry.stickerGroup = sg; entry.group.add(sg);
    const list = [...reactions].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const ped = entry.type === 'pedestal';
    const shown = list.slice(0, ped ? 4 : 6);
    if (ped) sg.position.set(0, 0, 0.405); else sg.position.set((entry.size ? entry.size.edge : 1.05) + 0.42, 0, 0.03);
    shown.forEach((r, k) => {
      const sz = ped ? 0.17 : 0.36;
      const s = this._plane(sz, sz, this._basic({ map: this._getStickerTex(r.sticker), transparent: true, alphaTest: 0.05 }));
      if (ped) s.position.set((k - (shown.length - 1) / 2) * 0.18, 0.5, 0.001 * k);
      else { const col = k % 2, row = Math.floor(k / 2); s.position.set(col * 0.38 - 0.1, 2.25 - row * 0.4, 0.002 * k); }
      s.rotation.z = ((k * 37) % 11 - 5) * 0.03;
      s.userData = { type: 'art', index: entry.index, group: sg }; sg.add(s); this.clickables.push(s);
    });
    if (list.length) {
      const c = this._textCanvas({ w: 320, h: 110, bg: this.colors.accent, radius: 55, lines: [{ text: `${list.length} 個讚`, size: 52, color: '#fff', weight: 800 }] });
      const b = this._plane(ped ? 0.32 : 0.5, ped ? 0.11 : 0.17, this._basic({ map: this._canvasTex(c), transparent: true }));
      if (ped) b.position.set(0, 0.3, 0.002); else b.position.set(0.09, 2.25 - Math.ceil(shown.length / 2) * 0.4 + 0.08, 0.01);
      b.userData = { type: 'art', index: entry.index, group: sg }; sg.add(b); this.clickables.push(b);
    }
  }

  updateReactions(artId, reactions) {
    const e = this.arts.find((a) => a.art.id === artId); if (e) this._buildStickers(e, reactions);
  }

  // ---------- 導航 ----------
  goToArt(i) {
    if (!this.arts.length || !this.mode) return;
    i = (i + this.arts.length) % this.arts.length; this.currentArt = i;
    const e = this.arts[i];
    const wp = e.type === 'pedestal' ? e.group.localToWorld(new THREE.Vector3(0, 1.35, 0)) : e.group.localToWorld(new THREE.Vector3(e.stickerGroup?.children.length ? 0.45 : 0, 1.7, 0));
    const portrait = this.camera.aspect < 1;
    const target = wp.clone().addScaledVector(e.normal, e.type === 'pedestal' ? (portrait ? 2.7 : 2.5) : (portrait ? 3.4 : 2.9)); target.y = EYE;
    const look = wp.clone().sub(target);
    let yaw = Math.atan2(-look.x, -look.z);
    let dy = yaw - this.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    // 跨展室嘅話，經門口行過去
    const pts = [this.pos.clone()]; const r0 = this._roomAt(this.pos.z), r1 = e.room;
    if (r1 > r0) for (let k = r0 + 1; k <= r1; k++) pts.push(new THREE.Vector3(0, EYE, this.rooms[k].zTop));
    if (r1 < r0) for (let k = r0; k > r1; k--) pts.push(new THREE.Vector3(0, EYE, this.rooms[k].zTop));
    pts.push(target);
    const segs = []; let total = 0; for (let k = 0; k < pts.length - 1; k++) { const l = pts[k].distanceTo(pts[k + 1]); segs.push(l); total += l; }
    this.glide = { pts, segs, total, yaw0: this.yaw, yaw1: this.yaw + dy, p0: this.pitch, p1: 0.02, t: 0, dur: Math.min(4, Math.max(0.9, total / 7)) };
  }
  step(dir) {
    if (!this.arts.length || !this.mode) return;
    if (this.currentArt < 0) { // 搵最近
      let best = 0, bd = 1e9; this.arts.forEach((e, i) => { const wp = new THREE.Vector3(); e.group.getWorldPosition(wp); const d = Math.abs(wp.z - this.pos.z) + (wp.z > this.pos.z + 0.5 ? 5 : 0); if (d < bd) { bd = d; best = i; } });
      this.goToArt(best); return;
    }
    this.goToArt(this.currentArt + dir);
  }
  setMove(x, y) { this.move.x = x; this.move.y = y; if (x || y) this.glide = null; }

  _bindInput() {
    const el = this.renderer.domElement; el.style.touchAction = 'none';
    let drag = null;
    el.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { this.glide = null;
        const k = e.pointerType === 'touch' ? 0.006 : 0.004;
        this.yaw += dx * k; this.pitch = Math.max(-0.7, Math.min(0.7, this.pitch + dy * k)); }
    });
    const up = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      if (moved < 8 && performance.now() - drag.t < 500) this._tap(e);
      drag = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => (drag = null));
    window.addEventListener('keydown', (e) => { if (e.target.closest?.('input,textarea,select')) return; this.keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow')) e.preventDefault(); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _tap(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, this.camera);
    const hit = rc.intersectObjects(this.clickables, false)[0];
    if (!hit) return;
    const u = hit.object.userData;
    if (u.type === 'art') { this.currentArt = u.index; this.h.onArt?.(this.arts[u.index].art); }
    else if (u.type === 'door') this.h.onEnterHall?.(u.hall);
    else if (u.type === 'exit') this.h.onExitHall?.();
  }

  _tick() {
    const raw = this.clock.getDelta(); const dt = Math.min(0.05, raw);
    if (this.sunOn && !this.lowQ && window.GALLERY_QUALITY !== 'high') { this._ft.push(raw); if (this._ft.length >= 90) { const avg = this._ft.reduce((a, b) => a + b, 0) / this._ft.length; this._ft = []; if (avg > 1 / 20) this._setLowQ(); } }
    this._prevZ = this.pos.z;
    if (this.glide) {
      const g = this.glide; g.t += dt / g.dur; const t = Math.min(1, g.t); const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      let d = e * g.total; for (let k = 0; k < g.segs.length; k++) { if (d <= g.segs[k] || k === g.segs.length - 1) { this.pos.lerpVectors(g.pts[k], g.pts[k + 1], g.segs[k] ? Math.min(1, d / g.segs[k]) : 1); break; } d -= g.segs[k]; }
      this.yaw = g.yaw0 + (g.yaw1 - g.yaw0) * e; this.pitch = g.p0 + (g.p1 - g.p0) * e;
      if (t >= 1) this.glide = null;
    } else {
      let mx = this.move.x, my = this.move.y; const k = this.keys;
      if (k.has('w') || k.has('arrowup')) my += 1; if (k.has('s') || k.has('arrowdown')) my -= 1;
      if (k.has('a')) mx -= 1; if (k.has('d')) mx += 1;
      if (k.has('arrowleft')) this.yaw += 1.8 * dt; if (k.has('arrowright')) this.yaw -= 1.8 * dt;
      if (mx || my) {
        const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        this.pos.x += (fx * my + rx * mx) * SPEED * dt; this.pos.z += (fz * my + rz * mx) * SPEED * dt;
        this.currentArt = -1;
      }
      this._collide();
    }
    if (this.mode === 'hall' && this.pedestals) for (const e of this.pedestals) {
      const dz = Math.abs(e.z - this.pos.z);
      if (e.art.kind === 'model') { if (e.modelState === 'idle' && dz < 10 && Math.abs(e.room - this.curRoom) <= 1) this._loadPedestalModel(e); if (e.model) e.model.rotation.y += dt * 0.45; if (e.placeholder && !e.model) e.placeholder.rotation.y += dt; }
      else if (e.billboard) {
        const wp = e.group.position; e.billboard.rotation.y = Math.atan2(this.pos.x - wp.x, this.pos.z - wp.z);
        e.photoT += dt; const n = e.photos.filter(Boolean).length;
        if (n > 1 && e.photoT > 0.9) { e.photoT = 0; e.photoIdx = (e.photoIdx + 1) % e.photos.length; const t = e.photos[e.photoIdx]; if (t) { e.photoMesh.material.map = t; e.photoMesh.material.needsUpdate = true; } }
      }
    }
    if (this.mode === 'hall' && this.rooms.length) this._setRoom(this._roomAt(this.pos.z));
    this._updateSun();
    this._updateSpots(dt);
    this._checkSeen(Math.min(raw, 0.5));
    this.camera.position.copy(this.pos); this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.renderer.render(this.scene, this.camera);
  }

  _collide() {
    const b = this.bounds; if (!b) return; const p = this.pos;
    if (this.mode === 'lobby') {
      const door = this.doors.find((d) => Math.abs(p.x - d.x) < d.w / 2 - 0.3);
      if (door && p.z < b.minZ) {
        p.x = Math.max(door.x - door.w / 2 + 0.3, Math.min(door.x + door.w / 2 - 0.3, p.x));
        if (p.z < b.frontZ - 0.6 && !this._entering) { this._entering = true; this.h.onEnterHall?.(door.hall); setTimeout(() => (this._entering = false), 1500); }
        p.z = Math.max(b.frontZ - 2.4, p.z);
      } else { p.z = Math.max(b.minZ, p.z); }
      p.x = Math.max(b.minX, Math.min(b.maxX, p.x)); p.z = Math.min(b.maxZ, p.z);
      for (const o of this.obstacles || []) { const dx = p.x - o.x, dz = p.z - o.z; if (Math.abs(dx) < o.rx && Math.abs(dz) < o.rz) { if (o.rx - Math.abs(dx) < o.rz - Math.abs(dz)) p.x = o.x + Math.sign(dx || 1) * o.rx; else p.z = o.z + Math.sign(dz || 1) * o.rz; } }
    } else if (this.mode === 'hall') {
      p.x = Math.max(b.minX, Math.min(b.maxX, p.x)); p.z = Math.max(b.minZ, p.z);
      for (const o of this.obstacles || []) { const dx = p.x - o.x, dz = p.z - o.z; if (Math.abs(dx) < o.rx && Math.abs(dz) < o.rz) { if (o.rx - Math.abs(dx) < o.rz - Math.abs(dz)) p.x = o.x + Math.sign(dx || 1) * o.rx; else p.z = o.z + Math.sign(dz || 1) * o.rz; } }
      const lim = this.hallDoorW / 2 - 0.35; for (const zb of this.partitions) { if (Math.abs(p.z - zb) < 0.35 && Math.abs(p.x) > lim) p.z = zb + (this._prevZ >= zb ? 0.35 : -0.35); }
      if (Math.abs(p.x) < 0.8 && p.z > b.maxZ) {
        if (p.z > b.backZ + 0.2 && !this._entering) { this._entering = true; this.h.onExitHall?.(); setTimeout(() => (this._entering = false), 1500); }
        p.z = Math.min(b.backZ + 1, p.z);
      } else p.z = Math.min(b.maxZ, p.z);
    }
  }
}
