// 試用模式用嘅示範作品（用程式畫出嚟，模仿小朋友蠟筆畫）
function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

export function drawSampleArt(seed) {
  const r = rng(seed + 7);
  const portrait = seed % 3 === 1;
  const W = portrait ? 600 : 800, H = portrait ? 800 : 600;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const pal = [['#ffb703', '#fb8500', '#219ebc', '#8ecae6', '#023047'], ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#073b4c'], ['#f72585', '#7209b7', '#3a0ca3', '#4cc9f0', '#4361ee'], ['#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25'], ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557']][seed % 5];
  const pick = () => pal[Math.floor(r() * pal.length)];
  const scene = seed % 4;
  // 紙張
  x.fillStyle = '#fffdf6'; x.fillRect(0, 0, W, H);
  const crayon = (fn, color, w = 6) => {
    x.strokeStyle = color; x.fillStyle = color; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round';
    for (let k = 0; k < 2; k++) { x.save(); x.translate((r() - .5) * 3, (r() - .5) * 3); x.globalAlpha = k ? 0.55 : 0.85; fn(); x.restore(); }
  };
  const scribbleFill = (px, py, w, h, color) => {
    x.save(); x.beginPath(); x.rect(px, py, w, h); x.clip();
    x.strokeStyle = color; x.lineWidth = 9; x.globalAlpha = .7;
    for (let i = -h; i < w + h; i += 9) { x.beginPath(); x.moveTo(px + i + (r() - .5) * 6, py); x.lineTo(px + i - h + (r() - .5) * 6, py + h); x.stroke(); }
    x.restore();
  };
  if (scene === 2) { // 海底
    scribbleFill(0, 0, W, H, '#8ecae6'); scribbleFill(0, H * .78, W, H * .22, '#e9c46a');
    for (let i = 0; i < 6; i++) { const fx = r() * W * .8 + 40, fy = r() * H * .6 + 60, s = 30 + r() * 40, col = pick();
      crayon(() => { x.beginPath(); x.ellipse(fx, fy, s, s * .6, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(fx + s * .9, fy); x.lineTo(fx + s * 1.6, fy - s * .5); x.lineTo(fx + s * 1.6, fy + s * .5); x.fill(); }, col);
      crayon(() => { x.beginPath(); x.arc(fx - s * .5, fy - s * .1, 5, 0, 7); x.fillStyle = '#222'; x.fill(); }, '#222'); }
    for (let i = 0; i < 5; i++) { const sx = r() * W; crayon(() => { x.beginPath(); x.moveTo(sx, H); for (let y = H; y > H * .5; y -= 20) x.lineTo(sx + Math.sin(y / 20) * 15, y); x.stroke(); }, '#2a9d8f', 8); }
  } else {
    scribbleFill(0, 0, W, H * .7, scene === 3 ? '#3a0ca3' : '#bde0fe');
    scribbleFill(0, H * .7, W, H * .3, scene === 3 ? '#1b263b' : '#95d5b2');
    if (scene === 3) { for (let i = 0; i < 30; i++) { const sx = r() * W, sy = r() * H * .6; crayon(() => { x.beginPath(); x.arc(sx, sy, 3 + r() * 4, 0, 7); x.fill(); }, '#ffd166'); } }
    else { crayon(() => { x.beginPath(); x.arc(W * .82, H * .16, 50, 0, 7); x.fill(); for (let a = 0; a < 12; a++) { x.beginPath(); x.moveTo(W * .82 + Math.cos(a / 2) * 65, H * .16 + Math.sin(a / 2) * 65); x.lineTo(W * .82 + Math.cos(a / 2) * 95, H * .16 + Math.sin(a / 2) * 95); x.stroke(); } }, '#ffb703'); }
    if (scene === 1) { const cols = ['#e63946', '#fb8500', '#ffd166', '#06d6a0', '#118ab2', '#7209b7'];
      cols.forEach((col, i) => crayon(() => { x.beginPath(); x.arc(W * .4, H * .72, W * .42 - i * 18, Math.PI, 0); x.stroke(); }, col, 16)); }
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const bw = W / n * (.6 + r() * .3), bx = i * W / n + (W / n - bw) / 2, bh = H * (.2 + r() * .4), by = H * .78 - bh, col = pick();
      scribbleFill(bx, by, bw, bh, col);
      crayon(() => { x.strokeRect(bx, by, bw, bh); }, '#333', 4);
      crayon(() => { x.beginPath(); x.moveTo(bx - 8, by); x.lineTo(bx + bw / 2, by - bw * .5); x.lineTo(bx + bw + 8, by); x.closePath(); x.fill(); }, pick());
      for (let wy = by + 18; wy < by + bh - 30; wy += 38) for (let wx = bx + 12; wx < bx + bw - 22; wx += 30)
        crayon(() => { x.fillRect(wx, wy, 16, 20); }, scene === 3 ? '#ffd166' : '#fff', 3);
    }
    for (let i = 0; i < 3; i++) { const tx = r() * W, ty = H * .86; crayon(() => { x.fillRect(tx - 6, ty - 40, 12, 50); }, '#8d5524'); crayon(() => { x.beginPath(); x.arc(tx, ty - 55, 30, 0, 7); x.fill(); }, '#2d6a4f'); }
  }
  return c.toDataURL('image/jpeg', 0.85);
}
