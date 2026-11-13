import { db, DuplicateError } from './data.js?v=20261113b';
import { SITE_NAME } from './config.js?v=20261113b';
import { STICKERS, PHRASES, THEMES, themeColors, stickerUrl, gradeLabel } from './constants.js?v=20261113b';
import { $, $$, esc, toast, store, show, personLabel, hourLabel } from './ui.js?v=20261113b';

// S.code：學生連結代碼（冇就係老師模式）
const S = { code: null, link: null, teacher: null, galleries: [], cur: null, hall: null, hallArts: [], reactions: {}, me: store.get('gallery-me'), viewer: null, modalIdx: -1, modalDispose: null, poll: null };

// ---------- 資料來源：學生經連結／老師直接 ----------
const src = {
  galleries: () => (S.code ? db.linkGalleries(S.code) : db.listGalleries()),
  full: (id) => (S.code ? db.linkGalleryFull(S.code, id) : db.getGalleryFull(id)),
  reactions: (ids) => (S.code ? db.linkReactions(S.code, ids) : db.listReactions(ids)),
  add: (r) => (S.code ? db.linkAddReaction(S.code, r) : db.addReaction(r)),
  lookup: async (c, n) => (S.code ? db.linkLookupStudent(S.code, c, n) : (await db.listStudents()).find((s) => s.class_name === c && Number(s.number) === Number(n))?.name || null),
  classes: async () => (S.code ? db.linkClasses(S.code) : [...new Set((await db.listStudents()).map((s) => s.class_name))].sort()),
};
const media = { url: (p) => db.mediaUrl(p), db };
const homeHash = () => (S.code ? `s-${S.code}` : 'admin');
const galleryHash = (id) => (S.code ? `s-${S.code}-g-${id}` : `t-g-${id}`);

// ---------- 字型 ----------
async function ensureFonts(text) {
  if (!document.fonts?.load) return;
  const t = (text || '') + '0123456789件作品返大堂入去參觀共個讚準備中號班屆《》→←3D相片°';
  const jobs = ['900 40px "Noto Sans TC"', '700 40px "Noto Sans TC"', '500 40px "Noto Sans TC"', '900 40px "Chiron GoRound TC"'].map((f) => document.fonts.load(f, t).catch(() => {}));
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 3000))]);
}

// ---------- 路由 ----------
async function route() {
  const h = location.hash.slice(1);
  closeModal(); stopPoll();
  if (h === 'admin') { const m = await import('./admin.js?v=20261113b'); m.openAdmin(); return; }
  let m = h.match(/^s-([a-z0-9]{4,16})(?:-g-(.+))?$/);
  if (m) {
    S.me = store.get('gallery-me');
    if (S.code !== m[1] || !S.link) { S.code = m[1]; S.link = await db.getLink(S.code).catch(() => null); }
    if (!S.link) return renderLanding('呢條連結已經停用或者唔存在，請問返老師拎新連結。');
    return m[2] ? openGallery(m[2]) : renderHome();
  }
  m = h.match(/^t-g-(.+)$/);
  if (m) {
    S.code = null; S.link = null; S.teacher = await db.getTeacher().catch(() => null);
    if (!S.teacher?.approved) { location.hash = 'admin'; return; }
    S.me = { cls: '老師', no: S.teacher.name || S.teacher.email, name: S.teacher.name || '老師' };
    return openGallery(m[1]);
  }
  renderLanding();
}
window.addEventListener('hashchange', route);

// ---------- 入口 ----------
async function renderLanding(msg) {
  show('screen-landing'); document.title = SITE_NAME;
  $('#landing-title').textContent = SITE_NAME;
  const body = $('#landing-body');
  if (msg) { body.innerHTML = `<p class="muted">${esc(msg)}</p><a class="btn ghost" href="#admin">老師登入</a>`; return; }
  if (db.mode === 'demo') {
    body.innerHTML = `<p class="muted">而家係試用模式。學生平時會用老師俾嘅專屬連結入嚟，只會見到指定年級嘅作品。試吓用下面嘅示範連結：</p>
      <div class="landing-btns"><a class="btn primary big" href="#s-demo4yr">四年級學生連結</a><a class="btn ghost big" href="#s-demo5yr">5C 班學生連結</a><a class="btn ghost big" href="#admin">老師管理</a></div>`;
    return;
  }
  const t = await db.getTeacher().catch(() => null);
  if (t?.approved) { location.hash = 'admin'; return; }
  body.innerHTML = `<p class="muted">請用老師俾你嘅連結或者 QR code 入嚟參觀。</p><a class="btn ghost" href="#admin">我係老師，登入</a>`;
}

// ---------- 學生首頁（連結可見嘅畫廊） ----------
async function renderHome() {
  show('screen-home');
  document.title = SITE_NAME; $('#site-name').textContent = SITE_NAME;
  $('.home-sub').textContent = S.link ? `${S.link.label || ''}${S.link.teacher_name ? ' · ' + S.link.teacher_name : ''}` : '';
  $('#mode-badge').innerHTML = db.mode === 'demo' ? '<span class="badge">試用模式</span>' : '';
  $('#home-admin').classList.toggle('hidden', db.mode !== 'demo');
  const list = $('#gallery-list'); list.innerHTML = '<div class="empty">載入中…</div>';
  try { S.galleries = await src.galleries(); } catch (e) { list.innerHTML = `<div class="empty">載入唔到畫廊：${esc(e.message)}</div>`; return; }
  if (!S.galleries.length) { list.innerHTML = '<div class="empty">暫時未有開放俾你嘅畫廊。</div>'; return; }
  list.innerHTML = S.galleries.map((g) => {
    const c = themeColors(g); const dark = isDarkHex(c.bg);
    return `<button class="g-card" data-id="${esc(g.id)}">
      <div class="g-cover" style="background:${c.bg};color:${dark ? '#fff' : (g.theme === 'minimal' ? '#1f1d1a' : c.accent)}">
        <div class="ed">${esc(g.edition || '')}</div><div class="tt">${esc(g.title)}</div>
        <div class="doors">${(g.halls || []).slice(0, 8).map(() => '<span></span>').join('')}</div>
      </div>
      <div class="g-info"><div class="sub">${esc(gradeLabel(g.grade))}${g.subtitle ? ' · ' + esc(g.subtitle) : ''}</div>
      <div class="chips">${(g.halls || []).map((h) => `<span class="chip">${esc(h.name)}</span>`).join('')}</div></div>
    </button>`;
  }).join('');
  $$('.g-card', list).forEach((b) => (b.onclick = () => (location.hash = galleryHash(b.dataset.id))));
}
function isDarkHex(h) { const n = parseInt(h.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55; }

// ---------- 開畫廊 ----------
async function openGallery(id) {
  let full;
  try { full = await src.full(id); } catch (e) { toast('載入唔到：' + e.message); location.hash = homeHash(); return; }
  if (!full) { toast('呢個畫廊冇開放俾呢條連結'); location.hash = homeHash(); return; }
  if (S.cur?.gallery.id !== full.gallery.id) S.viewer?.setSunOverride(null);
  S.cur = full;
  const c = themeColors(full.gallery);
  document.documentElement.style.setProperty('--accent', full.gallery.theme === 'minimal' ? '#1f1d1a' : c.accent);
  document.title = `${full.gallery.title}｜${SITE_NAME}`;
  if (!S.me) return askWho(() => enter3D());
  enter3D();
}

// ---------- 你係邊個 ----------
async function askWho(done) {
  show('screen-who');
  $('#who-gallery-name').textContent = S.cur ? `${S.cur.gallery.edition || ''} ${S.cur.gallery.title}` : '';
  let classes = [];
  try { classes = await src.classes(); } catch (e) {}
  if (!classes.length) classes = (S.cur?.halls || []).map((h) => h.name).filter((n) => n.length <= 4);
  $('#who-class').innerHTML = '<option value="">請揀班別</option>' + classes.map((c) => `<option>${esc(c)}</option>`).join('');
  let pending = null;
  const reset = () => { pending = null; $('#who-confirm').classList.add('hidden'); $('#who-name-wrap').classList.add('hidden'); };
  $('#who-class').onchange = reset; $('#who-no').oninput = reset;
  $$('.seg-btn').forEach((b) => (b.onclick = () => {
    $$('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    $('#who-student').classList.toggle('hidden', b.dataset.who !== 'student');
    $('#who-teacher').classList.toggle('hidden', b.dataset.who !== 'teacher');
  }));
  $('#who-student').onsubmit = async (e) => {
    e.preventDefault();
    const cls = $('#who-class').value, no = Number($('#who-no').value);
    if (!cls || !no) return toast('請揀班別同輸入學號');
    if (pending && pending.cls === cls && pending.no === no) {
      const name = pending.name || $('#who-name').value.trim();
      if (!name) return toast('請輸入你嘅名');
      setMe({ cls, no: String(no), name }); return done();
    }
    let name = null; try { name = await src.lookup(cls, no); } catch (e) {}
    pending = { cls, no, name: name || '' };
    if (name) { $('#who-confirm').innerHTML = `你係 <b>${esc(cls)} ${no}號 ${esc(name)}</b> 嗎？<br><small class="muted">啱嘅話再撳一下「入去參觀」</small>`; $('#who-confirm').classList.remove('hidden'); }
    else { $('#who-name-wrap').classList.remove('hidden'); $('#who-name').focus(); }
  };
  $('#who-teacher').onsubmit = (e) => { e.preventDefault(); const n = $('#who-tname').value.trim(); if (!n) return; setMe({ cls: '老師', no: n, name: n }); done(); };
  $('#who-back').onclick = () => (location.hash = homeHash());
}
function setMe(me) { S.me = me; store.set('gallery-me', me); updateMeChip(); }
function updateMeChip() { $('#hud-me').textContent = S.me ? '👤 ' + personLabel(S.me.cls, S.me.cls === '老師' ? '' : S.me.no, S.me.name) : '👤 登記'; }

// ---------- 3D ----------
async function fade(fn) { const f = $('#fade'); f.classList.add('on'); await new Promise((r) => setTimeout(r, 350)); try { await fn(); } finally { f.classList.remove('on'); } }

async function ensureViewer() {
  if (S.viewer) return S.viewer;
  const { Gallery3D } = await import('./gallery3d.js?v=20261113b');
  S.viewer = new Gallery3D($('#three-host'), { onArt: (a) => openModal(S.hallArts.findIndex((x) => x.id === a.id)), onEnterHall: (h) => enterHall(h), onExitHall: () => exitHall(), onRoom: (k, n, counts) => updateRoomChip(k, n, counts) });
  setupHudPanels();
  setupJoystick();
  $('#btn-prev').onclick = () => S.viewer.step(-1);
  $('#btn-next').onclick = () => S.viewer.step(1);
  $('#btn-home').onclick = () => (location.hash = homeHash());
  $('#hud-me').onclick = () => { if (S.code) askWho(() => show('screen-3d')); };
  return S.viewer;
}

let hintTimer;
function hint(msg) { const h = $('#hud-hint'); h.textContent = msg; h.style.opacity = 1; clearTimeout(hintTimer); hintTimer = setTimeout(() => (h.style.opacity = 0), 5000); }

async function enter3D() {
  show('screen-3d'); updateMeChip(); stopPoll();
  const v = await ensureViewer();
  const { gallery, halls, artworks } = S.cur;
  $('#hud-title').textContent = `${gallery.edition || ''} ${gallery.title}`;
  await fade(async () => {
    await ensureFonts(gallery.title + gallery.subtitle + gallery.edition + halls.map((h) => h.name).join(''));
    const counts = {}; artworks.forEach((a) => (counts[a.hall_id] = (counts[a.hall_id] || 0) + 1));
    await v.loadLobby(gallery, halls, counts); S.hall = null;
    $('#hud-nav').classList.add('hidden'); $('#hud-room').classList.add('hidden'); closePanels(); updateSunChip();
  });
  hint(halls.length > 1 ? '揀一條通道行入去，或者直接撳門口' : '行入門口，或者直接撳門口');
}

async function enterHall(hall) {
  const v = S.viewer;
  const arts = S.cur.artworks.filter((a) => a.hall_id === hall.id).sort((a, b) => (Number(a.student_no) || 999) - (Number(b.student_no) || 999) || (a.sort ?? 0) - (b.sort ?? 0));
  S.hall = hall;
  await fade(async () => {
    let rs = [];
    try { rs = await src.reactions(arts.map((a) => a.id)); } catch (e) {}
    S.reactions = {}; rs.forEach((r) => (S.reactions[r.artwork_id] ||= []).push(r));
    await ensureFonts(arts.map((a) => (a.title || '') + (a.student_name || '') + (a.student_class || '')).join('') + hall.name + S.cur.gallery.title);
    await v.loadHall(S.cur.gallery, hall, arts, S.reactions, media);
    S.hallArts = v.arts.map((e) => e.art); // 跟展廳次序
    $('#hud-nav').classList.toggle('hidden', !arts.length); updateSunChip();
  });
  hint(arts.length ? '撳「›」跳去下一件，撳作品可以睇近啲同送讚' : '呢度暫時未有作品');
  startPoll();
}

async function exitHall() {
  const hall = S.hall;
  await enter3D();
  if (hall && S.viewer?.doors) { const d = S.viewer.doors.find((x) => x.hall.id === hall.id); if (d) { S.viewer.pos.set(d.x, 1.6, -S.viewer.lobbyInfo.D / 2 + 2.2); S.viewer.yaw = Math.PI; S.viewer.pitch = 0; } }
}

// ---------- 展室選單同陽光 ----------
let roomState = { k: 0, n: 1, counts: [] }, sunTimer;
function closePanels() { $('#room-menu').classList.add('hidden'); $('#sun-panel').classList.add('hidden'); clearInterval(sunTimer); }
function updateRoomChip(k, n, counts) {
  roomState = { k, n, counts };
  const chip = $('#hud-room'); chip.classList.toggle('hidden', n < 2); chip.textContent = `🚪 展室 ${k + 1}/${n} ▾`;
  if (!$('#room-menu').classList.contains('hidden')) renderRoomMenu();
}
function renderRoomMenu() {
  const m = $('#room-menu');
  m.innerHTML = roomState.counts.map((c, i) => `<button data-r="${i}" class="${i === roomState.k ? 'on' : ''}">展室 ${i + 1}<span>${c} 件作品</span></button>`).join('');
  $$('button', m).forEach((b) => (b.onclick = async () => { closePanels(); await fade(async () => S.viewer.goToRoom(Number(b.dataset.r))); }));
}
function canSun() { const l = S.cur?.gallery.light; return !!l && l.mode && l.mode !== 'off' && (l.student || !S.code); }
function updateSunChip() {
  const chip = $('#hud-sun'); const ok = canSun() && S.viewer?.sunInfo().on;
  chip.classList.toggle('hidden', !ok); if (ok) chip.textContent = hourLabel(S.viewer.sunInfo().hour).split(' ')[0] + ' 陽光';
}
function setupHudPanels() {
  $('#hud-room').onclick = () => { const m = $('#room-menu'); const open = m.classList.contains('hidden'); closePanels(); if (open) { renderRoomMenu(); m.classList.remove('hidden'); } };
  const lab = () => { const i = S.viewer.sunInfo(); $('#sun-lab').textContent = hourLabel(i.hour); $('#sun-reset').classList.toggle('hidden', !i.override); if (document.activeElement !== $('#sun-range')) $('#sun-range').value = Math.max(5.5, Math.min(21, i.hour)); updateSunChip(); };
  $('#hud-sun').onclick = () => { const p = $('#sun-panel'); const open = p.classList.contains('hidden'); closePanels(); if (open) { p.classList.remove('hidden'); lab(); sunTimer = setInterval(lab, 500); } };
  $('#sun-range').oninput = (e) => { S.viewer.setSunOverride(Number(e.target.value)); lab(); };
  $$('.sun-presets button').forEach((b) => (b.onclick = () => { S.viewer.setSunOverride(Number(b.dataset.h)); $('#sun-range').value = b.dataset.h; lab(); }));
  $('#sun-reset').onclick = () => { S.viewer.setSunOverride(null); lab(); };
  $('#three-host').addEventListener('pointerdown', closePanels);
}

// 每 15 秒睇吓有冇新讚賞
function startPoll() {
  stopPoll();
  S.poll = setInterval(async () => {
    if (document.hidden || !S.hall) return;
    try { const rs = await src.reactions(S.hallArts.map((a) => a.id)); rs.forEach(addReactionLocal); } catch (e) {}
  }, 15000);
}
function stopPoll() { if (S.poll) clearInterval(S.poll); S.poll = null; }

function setupJoystick() {
  const j = $('#joystick'), k = $('.knob', j); let id = null; const R = 46;
  const set = (e) => { const r = j.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } k.style.transform = `translate(${dx}px,${dy}px)`; S.viewer.setMove(dx / R, -dy / R); };
  j.addEventListener('pointerdown', (e) => { id = e.pointerId; j.setPointerCapture(id); set(e); });
  j.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; k.style.transform = ''; S.viewer.setMove(0, 0); };
  j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
}

// ---------- 作品詳情 ----------
async function openModal(i) {
  if (i < 0 || !S.hallArts.length) return;
  S.modalIdx = (i + S.hallArts.length) % S.hallArts.length;
  const a = S.hallArts[S.modalIdx];
  $('#modal-art').classList.remove('hidden');
  S.modalDispose?.(); S.modalDispose = null;
  const view = $('#art-view'); view.className = 'art-view'; view.innerHTML = '';
  $('#art-title').textContent = a.title ? `《${a.title}》` : '（無題）';
  $('#art-author').textContent = personLabel(a.student_class, a.student_no, a.student_name);
  renderPraise(a);
  const idx = S.modalIdx;
  if (a.kind === 'model') {
    view.classList.add('is-3d');
    const { openModelView } = await import('./modal-viewer.js?v=20261113b');
    if (S.modalIdx === idx) S.modalDispose = openModelView(view, db, a.model_path);
  } else if (a.kind === 'photos') {
    view.classList.add('is-3d');
    const urls = await Promise.all((a.photo_paths || []).map((p) => db.mediaUrl(p)));
    const { openPhotoSpin } = await import('./modal-viewer.js?v=20261113b');
    if (S.modalIdx === idx) S.modalDispose = openPhotoSpin(view, urls);
  } else {
    const img = document.createElement('img'); img.alt = ''; img.src = await db.mediaUrl(a.image_path); view.appendChild(img);
    view.onclick = (e) => {
      if (view.classList.contains('is-3d')) return;
      const zoomed = view.classList.toggle('zoom');
      if (zoomed) { const r = view.getBoundingClientRect(); requestAnimationFrame(() => { view.scrollLeft = ((e.clientX - r.left) / r.width) * (view.scrollWidth - r.width); view.scrollTop = ((e.clientY - r.top) / r.height) * (view.scrollHeight - r.height); }); }
    };
  }
}
function closeModal() { $('#modal-art').classList.add('hidden'); S.modalIdx = -1; S.modalDispose?.(); S.modalDispose = null; }
$('#modal-art').addEventListener('click', (e) => { if (e.target.id === 'modal-art' || e.target.closest('[data-close]')) closeModal(); });
$('#art-prev').onclick = () => openModal(S.modalIdx - 1);
$('#art-next').onclick = () => openModal(S.modalIdx + 1);
document.addEventListener('keydown', (e) => {
  if ($('#modal-art').classList.contains('hidden')) return;
  if (e.key === 'Escape') closeModal(); if (e.key === 'ArrowRight') openModal(S.modalIdx + 1); if (e.key === 'ArrowLeft') openModal(S.modalIdx - 1);
});

function renderPraise(a) {
  const list = (S.reactions[a.id] || []).slice().sort((x, y) => y.created_at.localeCompare(x.created_at));
  $('#praise-count').textContent = list.length ? `（${list.length}）` : '';
  $('#praise-list').innerHTML = list.length ? list.map((r) => `<li><img src="${stickerUrl(r.sticker)}" alt=""><div><div class="who">${esc(personLabel(r.from_class, r.from_class === '老師' ? '' : r.from_no, r.from_name))}</div><div class="what">${esc(r.phrase)}</div></div></li>`).join('') : '<li class="muted">未有人讚，做第一個啦！</li>';
  const box = $('#praise-box'); const me = S.me;
  if (!me) { box.innerHTML = `<div class="praise-panel"><button class="btn primary big" id="who-btn">登記之後就可以送讚</button></div>`; $('#who-btn').onclick = () => { closeModal(); askWho(() => show('screen-3d')); }; return; }
  if (me.cls === a.student_class && String(me.no) === String(a.student_no)) { box.innerHTML = `<div class="praise-done"><img src="${stickerUrl('shy')}" alt="">呢件係你嘅作品！睇吓大家點樣讚你～</div>`; return; }
  const mine = list.find((r) => r.from_class === me.cls && String(r.from_no) === String(me.no));
  if (mine) { box.innerHTML = `<div class="praise-done"><img src="${stickerUrl(mine.sticker)}" alt="">你讚咗佢：${esc(mine.phrase)}</div>`; return; }
  const pick = { sticker: null, phrase: null };
  box.innerHTML = `<div class="praise-panel"><h4>① 揀一張貼紙</h4><div class="sticker-grid">${STICKERS.map((s) => `<button class="sticker-opt" data-s="${s.id}"><img src="${stickerUrl(s.id)}" alt="">${esc(s.label)}</button>`).join('')}</div>
    <h4>② 揀一句讚佢嘅說話</h4><div class="phrase-wrap">${PHRASES.map((p) => `<button class="phrase-opt">${esc(p)}</button>`).join('')}</div>
    <button class="btn primary big" id="send-praise" disabled>送俾 ${esc(a.student_name || '佢')} 💌</button></div>`;
  const upd = () => ($('#send-praise').disabled = !(pick.sticker && pick.phrase));
  $$('.sticker-opt', box).forEach((b) => (b.onclick = () => { $$('.sticker-opt', box).forEach((x) => x.classList.toggle('on', x === b)); pick.sticker = b.dataset.s; upd(); }));
  $$('.phrase-opt', box).forEach((b) => (b.onclick = () => { $$('.phrase-opt', box).forEach((x) => x.classList.toggle('on', x === b)); pick.phrase = b.textContent; upd(); }));
  $('#send-praise').onclick = async () => {
    $('#send-praise').disabled = true;
    try {
      const row = await src.add({ artwork_id: a.id, sticker: pick.sticker, phrase: pick.phrase, from_class: me.cls, from_no: String(me.no), from_name: me.name });
      addReactionLocal(row);
      const f = $('#fly'); f.innerHTML = `<img src="${stickerUrl(pick.sticker)}" alt="">`; setTimeout(() => (f.innerHTML = ''), 1200);
      toast('已經貼咗喺佢件作品隔籬！');
    } catch (e) {
      if (e instanceof DuplicateError) toast('你已經讚過呢件作品啦'); else toast('送唔到：' + e.message);
      $('#send-praise').disabled = false;
    }
  };
}

function addReactionLocal(r) {
  const arr = (S.reactions[r.artwork_id] ||= []);
  if (arr.some((x) => x.id === r.id)) return;
  arr.push(r);
  S.viewer?.updateReactions(r.artwork_id, arr);
  const a = S.hallArts[S.modalIdx];
  if (a && a.id === r.artwork_id) renderPraise(a);
}

// ---------- 開始 ----------
(async () => {
  try { await db.init(); } catch (e) { toast('連接唔到資料庫：' + e.message, 6000); }
  route();
})();
