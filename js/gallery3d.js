// 3D 畫廊場景：大堂（門口大標題＋各班通道）同展廳
import * as THREE from 'three';
import { themeColors, COLORFUL_PANELS, FONT, KIDS_FONT, stickerUrl } from './constants.js?v=20261113a';

const EYE = 1.6;
const SPEED = 2.6;

function shade(hex, amt) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt))); return '#' + c.getHexString(); }
function isDark(hex) { const c = new THREE.Color(hex); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) < 0.55; }

export class Gallery3D {
  constructor(host, handlers) {
    this.host = host; this.h = handlers;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    this.root.clear();
    this.disposables.forEach((d) => d.dispose?.()); this.disposables = [];
    this.clickables = []; this.arts = []; this.pedestals = []; this.glide = null;
  }
  _track(o) { this.disposables.push(o); return o; }
  _mat(color, opts = {}) { return this._track(new THREE.MeshLambertMaterial({ color, ...opts })); }
  _basic(opts) { return this._track(new THREE.MeshBasicMaterial(opts)); }
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
    const hemi = new THREE.HemisphereLight(0xffffff, 0xf3efe8, 1.3); this.root.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, 1.4); this.root.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.5); dir.position.set(2, 6, 3); this.root.add(dir);
  }

  // 房間：地板、天花、牆（牆可以有門口洞）
  _room({ W, D, H, holes = {} }) {
    const col = this.colors;
    const floorTex = this._floorTexture(this.theme, col.floor); floorTex.repeat.set(W / 4, D / 4);
    const floor = this._plane(W, D, this._mat(0xffffff, { map: floorTex })); floor.rotation.x = -Math.PI / 2; this.root.add(floor);
    const ceil = this._plane(W, D, this._mat(shade(col.wall, 0.04))); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; this.root.add(ceil);
    // 天花燈條
    const lightMat = this._basic({ color: 0xffffff });
    for (let z = -D / 2 + 2; z <= D / 2 - 2; z += 4) { const l = this._box(Math.min(W * 0.5, 3), 0.04, 0.35, lightMat); l.position.set(0, H - 0.03, z); this.root.add(l); }
    const wallMat = this._mat(col.wall, { side: THREE.DoubleSide });
    const mkWall = (len, holeList, pos, rotY) => {
      const s = new THREE.Shape(); s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, H); s.lineTo(-len / 2, H); s.closePath();
      (holeList || []).forEach((hl) => { const p = new THREE.Path(); p.moveTo(hl.x - hl.w / 2, 0.001); p.lineTo(hl.x - hl.w / 2, hl.h); p.lineTo(hl.x + hl.w / 2, hl.h); p.lineTo(hl.x + hl.w / 2, 0.001); p.closePath(); s.holes.push(p); });
      const m = new THREE.Mesh(this._track(new THREE.ShapeGeometry(s)), wallMat); m.position.copy(pos); m.rotation.y = rotY; this.root.add(m);
      // 踢腳線
      const segs = []; let start = -len / 2;
      [...(holeList || [])].sort((a, b) => a.x - b.x).forEach((hl) => { segs.push([start, hl.x - hl.w / 2]); start = hl.x + hl.w / 2; }); segs.push([start, len / 2]);
      const bbMat = this._mat(shade(col.accent, this.theme === 'minimal' ? 0.6 : 0));
      segs.forEach(([a, b]) => { if (b - a < 0.01) return; const bb = this._box(b - a, 0.12, 0.03, bbMat); bb.position.set((a + b) / 2, 0.06, 0.015); const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotY; g.add(bb); this.root.add(g); });
    };
    mkWall(W, holes.front, new THREE.Vector3(0, 0, -D / 2), 0);
    mkWall(W, holes.back, new THREE.Vector3(0, 0, D / 2), Math.PI);
    mkWall(D, holes.left, new THREE.Vector3(-W / 2, 0, 0), Math.PI / 2);
    mkWall(D, holes.right, new THREE.Vector3(W / 2, 0, 0), -Math.PI / 2);
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
  async loadLobby(gallery, halls, counts) {
    this._clear(); this.mode = 'lobby'; this._setupWorld(gallery);
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
      const tunnel = this._box(doorW, doorH, tunnelLen, tMat); tunnel.position.set(x, doorH / 2, -D / 2 - tunnelLen / 2); this.root.add(tunnel);
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
  }

  // ---------- 展廳 ----------
  async loadHall(gallery, hall, artworks, reactionsByArt, media) {
    this._clear(); this.mode = 'hall'; this._setupWorld(gallery); this.hall = hall; this.media = media;
    const col = this.colors;
    const spacing = 3.7, W = 8.2, H = 4.6;
    const flats = artworks.filter((a) => (a.kind || 'flat') === 'flat');
    const objs = artworks.filter((a) => a.kind === 'model' || a.kind === 'photos');
    const pairs = Math.ceil(flats.length / 2);
    const rows = Math.max(pairs, objs.length + (flats.length ? 0.5 : 0));
    const D = Math.max(11, rows * spacing + 6.5);
    const doorW = 2.2, doorH = 3;
    this._room({ W, D, H, holes: { back: [{ x: 0, w: doorW, h: doorH }] } });
    // 出口
    const exitC = this._textCanvas({ w: 512, h: 700, bg: shade(col.bg, -0.05), lines: [{ text: '← 返大堂', size: 80, color: isDark(col.bg) ? '#fff' : '#333', weight: 800 }] });
    const exit = this._plane(doorW, doorH, this._basic({ map: this._canvasTex(exitC) }));
    exit.position.set(0, doorH / 2, D / 2 + 1.2); exit.rotation.y = Math.PI; exit.userData = { type: 'exit' }; this.root.add(exit); this.clickables.push(exit);
    const tun = this._box(doorW, doorH, 1.2, this._mat(shade(col.wall, -0.06), { side: THREE.BackSide })); tun.position.set(0, doorH / 2, D / 2 + 0.6); this.root.add(tun);
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
    const z0 = D / 2 - 3.6;
    const entries = [];
    flats.forEach((a, i) => {
      const side = i % 2 === 0 ? 'left' : 'right';
      const z = z0 - Math.floor(i / 2) * spacing;
      const g = new THREE.Group();
      if (side === 'left') { g.position.set(-W / 2 + 0.01, 0, z); g.rotation.y = Math.PI / 2; }
      else { g.position.set(W / 2 - 0.01, 0, z); g.rotation.y = -Math.PI / 2; }
      entries.push({ art: a, group: g, type: 'wall', z, order: side === 'left' ? 0 : 1, normal: new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0) });
    });
    objs.forEach((a, j) => {
      const z = z0 - (flats.length ? spacing / 2 : 0) - j * spacing;
      const x = objs.length > 1 ? (j % 2 ? 1.1 : -1.1) : 0;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      entries.push({ art: a, group: g, type: 'pedestal', x, z, order: 2, normal: new THREE.Vector3(0, 0, 1) });
    });
    entries.sort((a, b) => b.z - a.z || a.order - b.order);
    entries.forEach((e, i) => {
      e.index = i; this.root.add(e.group); this.arts.push(e);
      if (e.type === 'wall') this._buildArt(e, i, (a) => media.url(a.image_path));
      else this._buildPedestal(e, i);
      this._buildStickers(e, reactionsByArt[e.art.id] || []);
    });
    this.pedestals = entries.filter((e) => e.type === 'pedestal');
    this.bounds = { minX: -W / 2 + 0.6, maxX: W / 2 - 0.6, minZ: -D / 2 + 0.6, maxZ: D / 2 - 0.5, backZ: D / 2 };
    this.pos.set(0, EYE, D / 2 - 1.3); this.yaw = 0; this.pitch = 0;
    this.currentArt = -1;
  }

  // 立體作品展台
  _buildPedestal(entry, i) {
    const g = entry.group; const a = entry.art; const col = this.colors;
    const pedCol = this.theme === 'minimal' ? '#fbfaf7' : this.theme === 'kids' ? ['#ef476f', '#06d6a0', '#118ab2', '#ffb703', '#9b5de5'][i % 5] : COLORFUL_PANELS[i % COLORFUL_PANELS.length];
    const ped = this._box(0.8, 1, 0.8, this._mat(pedCol)); ped.position.y = 0.5; g.add(ped);
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
      (a.photo_paths || []).slice(0, 12).forEach((p, k) => this.media.url(p).then((u) => this.loader.load(u, (t) => {
        if (!g.parent) { t.dispose(); return; } this._track(t); t.colorSpace = THREE.SRGBColorSpace; entry.photos[k] = t;
        if (k === 0) { pic.material.map = t; pic.material.needsUpdate = true; const asp = t.image.width / t.image.height; const w = asp >= 1 ? 0.8 : 0.8 * asp, h = asp >= 1 ? 0.8 / asp : 0.8; pic.scale.set(w / 0.8, h / 0.8, 1); back.scale.set((w + 0.04) / 0.84, (h + 0.04) / 0.84, 1); pic.position.y = back.position.y = h / 2 + 0.02; }
      })));
    } else {
      entry.modelState = 'idle';
      // 未載入前顯示一個灰色佔位
      const ph = this._box(0.3, 0.3, 0.3, this._mat('#d9d4cc')); ph.position.y = 0.2; holder.add(ph); entry.placeholder = ph;
    }
  }

  _loadPedestalModel(entry) {
    entry.modelState = 'loading';
    import('./models.js?v=20261113a').then(({ loadArtModel, normalize }) => loadArtModel(this.media.db, entry.art.model_path).then((obj) => {
      if (!entry.group.parent) return;
      const m = normalize(obj, 0.85); entry.holder.remove(entry.placeholder); entry.holder.add(m); entry.model = m; entry.modelState = 'ready';
    })).catch((e) => { console.warn('模型載入失敗', e); entry.modelState = 'error'; if (entry.placeholder) entry.placeholder.material.color.set('#e8a0a0'); });
  }

  _buildArt(entry, i, imageSrc) {
    const { group: g, art } = entry; const col = this.colors;
    const maxW = 1.9, maxH = 1.55, cy = 1.72;
    const holder = new THREE.Group(); g.add(holder);
    const place = (aspect, tex) => {
      holder.clear();
      let w = maxW, h = w / aspect; if (h > maxH) { h = maxH; w = h * aspect; }
      // 主題特色
      if (this.theme === 'colorful') {
        const panel = this._plane(w + 1.1, h + 1.4, this._mat(COLORFUL_PANELS[i % COLORFUL_PANELS.length])); panel.position.set(0, cy - 0.1, 0.005); holder.add(panel);
      }
      if (this.theme === 'minimal') {
        const glowC = document.createElement('canvas'); glowC.width = glowC.height = 256; const gx = glowC.getContext('2d'); const grd = gx.createRadialGradient(128, 110, 10, 128, 128, 128); grd.addColorStop(0, 'rgba(255,248,230,.55)'); grd.addColorStop(1, 'rgba(255,248,230,0)'); gx.fillStyle = grd; gx.fillRect(0, 0, 256, 256);
        const glow = this._plane(w + 2.2, h + 2.2, this._basic({ map: this._canvasTex(glowC), transparent: true, depthWrite: false })); glow.position.set(0, cy + 0.15, 0.004); holder.add(glow);
      }
      const frameCol = this.theme === 'minimal' ? '#2a2420' : this.theme === 'kids' ? ['#ef476f', '#06d6a0', '#118ab2', '#ffb703', '#9b5de5'][i % 5] : '#ffffff';
      const fw = this.theme === 'kids' ? 0.12 : this.theme === 'colorful' ? 0.09 : 0.05;
      const mat = this.theme === 'minimal' ? 0.12 : 0;
      entry.size = { w, h, edge: w / 2 + fw + mat };
      const frame = this._box(w + 2 * (fw + mat), h + 2 * (fw + mat), 0.06, this._mat(frameCol)); frame.position.set(0, cy, 0.03); holder.add(frame);
      if (mat) { const m = this._plane(w + 2 * mat, h + 2 * mat, this._basic({ color: '#fbfaf7' })); m.position.set(0, cy, 0.061); holder.add(m); }
      const pic = this._plane(w, h, this._basic({ map: tex || null, color: tex ? 0xffffff : 0xdddddd })); pic.position.set(0, cy, 0.064);
      pic.userData = { type: 'art', index: entry.index }; holder.add(pic); this.clickables.push(pic);
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
    imageSrc(art).then((url) => {
      this.loader.load(url, (tex) => {
        if (!g.parent) { tex.dispose(); return; }
        this._track(tex); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        // 清走舊嘅 clickables
        this.clickables = this.clickables.filter((c) => !holder.children.includes(c));
        place(tex.image.width / tex.image.height, tex);
      });
    });
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
    if (this.mode !== 'hall' || !this.arts.length) return;
    i = (i + this.arts.length) % this.arts.length; this.currentArt = i;
    const e = this.arts[i];
    const wp = e.type === 'pedestal' ? e.group.localToWorld(new THREE.Vector3(0, 1.35, 0)) : e.group.localToWorld(new THREE.Vector3(e.stickerGroup?.children.length ? 0.45 : 0, 1.7, 0));
    const portrait = this.camera.aspect < 1;
    const target = wp.clone().addScaledVector(e.normal, e.type === 'pedestal' ? (portrait ? 2.7 : 2.5) : (portrait ? 3.4 : 2.9)); target.y = EYE;
    const look = wp.clone().sub(target);
    let yaw = Math.atan2(-look.x, -look.z);
    let dy = yaw - this.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    this.glide = { from: this.pos.clone(), to: target, yaw0: this.yaw, yaw1: this.yaw + dy, p0: this.pitch, p1: 0.02, t: 0, dur: 0.9 };
  }
  step(dir) {
    if (this.mode !== 'hall' || !this.arts.length) return;
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
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.glide) {
      const g = this.glide; g.t += dt / g.dur; const t = Math.min(1, g.t); const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.pos.lerpVectors(g.from, g.to, e); this.yaw = g.yaw0 + (g.yaw1 - g.yaw0) * e; this.pitch = g.p0 + (g.p1 - g.p0) * e;
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
      if (e.art.kind === 'model') { if (e.modelState === 'idle' && dz < 10) this._loadPedestalModel(e); if (e.model) e.model.rotation.y += dt * 0.45; if (e.placeholder && !e.model) e.placeholder.rotation.y += dt; }
      else if (e.billboard) {
        const wp = e.group.position; e.billboard.rotation.y = Math.atan2(this.pos.x - wp.x, this.pos.z - wp.z);
        e.photoT += dt; const n = e.photos.filter(Boolean).length;
        if (n > 1 && e.photoT > 0.9) { e.photoT = 0; e.photoIdx = (e.photoIdx + 1) % e.photos.length; const t = e.photos[e.photoIdx]; if (t) { e.photoMesh.material.map = t; e.photoMesh.material.needsUpdate = true; } }
      }
    }
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
    } else if (this.mode === 'hall') {
      p.x = Math.max(b.minX, Math.min(b.maxX, p.x)); p.z = Math.max(b.minZ, p.z);
      for (const e of this.pedestals || []) { const dx = p.x - e.x, dz = p.z - e.z, r = 0.75; if (Math.abs(dx) < r && Math.abs(dz) < r) { if (r - Math.abs(dx) < r - Math.abs(dz)) p.x = e.x + Math.sign(dx || 1) * r; else p.z = e.z + Math.sign(dz || 1) * r; } }
      if (Math.abs(p.x) < 0.8 && p.z > b.maxZ) {
        if (p.z > b.backZ + 0.2 && !this._entering) { this._entering = true; this.h.onExitHall?.(); setTimeout(() => (this._entering = false), 1500); }
        p.z = Math.min(b.backZ + 1, p.z);
      } else p.z = Math.min(b.maxZ, p.z);
    }
  }
}
