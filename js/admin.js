// 老師管理頁
import { db, resizeImage } from './data.js?v=20261113d';
import { THEMES, themeColors, stickerUrl, GRADES, gradeLabel } from './constants.js?v=20261113d';
import { $, $$, esc, toast, confirmBox, show, personLabel, hourLabel } from './ui.js?v=20261113d';

const A = { tab: 'galleries', view: 'list', gallery: null, hallId: null, roster: [], teacher: null };
let root;
const siteUrl = () => location.origin + location.pathname;

export async function openAdmin() {
  show('screen-admin'); root = $('#screen-admin');
  document.documentElement.style.setProperty('--accent', '#d9480f');
  root.innerHTML = '<div class="adm"><p class="muted">載入中…</p></div>';
  const t = await db.getTeacher().catch(() => null);
  if (!t) return renderLogin();
  if (!t.approved) return renderPending(t);
  A.teacher = t; renderShell();
}

const G_ICON = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function renderLogin() {
  root.innerHTML = `<div class="adm"><div class="card" style="max-width:400px;margin:40px auto">
    <h2 style="margin-top:0">老師登入</h2><p class="muted">第一次登入嘅老師要等管理員批核。</p>
    <button class="google-btn" id="g-login">${G_ICON} 用 Google 帳戶登入</button>
    <details style="margin-top:16px"><summary class="muted" style="cursor:pointer">用電郵同密碼登入</summary>
    <form id="login" class="who-form" style="margin-top:12px"><label>電郵<input type="email" id="lg-email" required autocomplete="username"></label>
    <label>密碼<input type="password" id="lg-pw" required autocomplete="current-password"></label>
    <button class="btn primary big">登入</button></form></details>
    <p style="margin-top:16px"><a href="#" class="link-quiet">← 返回</a></p></div></div>`;
  $('#g-login').onclick = async () => { try { await db.signInGoogle(); } catch (e) { toast('Google 登入失敗：' + e.message, 5000); } };
  $('#login').onsubmit = async (e) => { e.preventDefault(); try { await db.signInEmail($('#lg-email').value, $('#lg-pw').value); openAdmin(); } catch (err) { toast('登入失敗：' + err.message, 4000); } };
}

function renderPending(t) {
  root.innerHTML = `<div class="adm"><div class="card" style="max-width:420px;margin:40px auto;text-align:center">
    <img src="${stickerUrl('curious')}" alt="" style="width:90px"><h2>等緊批核</h2>
    <p class="muted">你已經用 <b>${esc(t.email)}</b> 登記咗。請叫負責嘅老師喺「老師帳戶」入面批准你，之後重新整理呢頁就用得。</p>
    <button class="btn ghost" id="logout">登出</button></div></div>`;
  $('#logout').onclick = async () => { await db.signOut(); renderLogin(); };
}

function renderShell() {
  const t = A.teacher;
  root.innerHTML = `<div class="adm">
    <div class="adm-head"><h1>老師管理</h1>
      ${db.mode === 'cloud' ? `<span class="muted" style="font-size:13px">${esc(t.name || t.email)}</span><button class="btn ghost small" id="logout">登出</button>` : '<a class="btn ghost small" href="#">← 返回</a>'}
    </div>
    ${db.mode === 'demo' ? `<div class="notice"><b>而家係試用模式</b>：你改嘅嘢只會存喺呢部機嘅瀏覽器。設定好 Supabase 之後，就會變成真正共享嘅畫廊，每位老師都可以用 Google 登入。 <button class="btn small ghost" id="reset-demo">重設示範資料</button></div>` : ''}
    <div class="tabs">
      <button class="tab" data-t="galleries">畫廊同作品</button>
      <button class="tab" data-t="links">學生連結</button>
      <button class="tab" data-t="roster">學生名單</button>
      <button class="tab" data-t="reactions">讚賞紀錄</button>
      <button class="tab" data-t="tools">空間同備份</button>
      ${t.is_owner ? '<button class="tab" data-t="teachers">老師帳戶</button>' : ''}
    </div>
    <div id="adm-body"></div></div>`;
  $('#logout')?.addEventListener('click', async () => { await db.signOut(); location.hash = ''; });
  $('#reset-demo')?.addEventListener('click', async () => { if (await confirmBox('清除你喺試用模式加嘅所有嘢，重新載入示範資料？', '重設')) { await db.resetDemo(); toast('已重設'); A.view = 'list'; renderTab(); } });
  $$('.tabs .tab', root).forEach((b) => (b.onclick = () => { A.tab = b.dataset.t; A.view = 'list'; renderTab(); }));
  renderTab();
}

function renderTab() {
  $$('.adm > .tabs .tab', root).forEach((b) => b.classList.toggle('on', b.dataset.t === A.tab));
  const body = $('#adm-body');
  if (A.tab === 'links') return renderLinks(body);
  if (A.tab === 'roster') return renderRoster(body);
  if (A.tab === 'reactions') return renderReactions(body);
  if (A.tab === 'teachers') return renderTeachers(body);
  if (A.tab === 'tools') return renderTools(body);
  if (A.view === 'edit') return renderEditor(body);
  if (A.view === 'arts') return renderArts(body);
  return renderGalleryList(body);
}

// ---------- 畫廊列表 ----------
async function renderGalleryList(body) {
  body.innerHTML = '<div class="panel"><p class="muted">載入中…</p></div>';
  const gs = await db.listGalleries();
  const mine = gs.filter((g) => !g.owner_id || g.owner_id === A.teacher.id);
  const others = gs.filter((g) => g.owner_id && g.owner_id !== A.teacher.id);
  const item = (g) => `<div class="list-item"><div class="grow"><div class="t">${esc(g.edition || '')} ${esc(g.title)} <span class="chip">${esc(gradeLabel(g.grade) || '未設年級')}</span></div>
      <div class="s">${g.teachers?.name ? esc(g.teachers.name) + ' · ' : ''}${esc(THEMES[g.theme]?.name || '')} · ${g.room_size === 0 ? '唔分房' : `每室 ${g.room_size ?? 20} 件`}${g.light?.mode && g.light.mode !== 'off' ? ' · ☀️ 陽光' : ''} · 通道：${g.halls.map((h) => `${esc(h.name)}（${h.count || 0}）`).join('、') || '（未有）'}</div></div>
      <div class="row"><button class="btn small primary" data-arts="${g.id}">上傳／管理作品</button><button class="btn small ghost" data-edit="${g.id}">設定</button>
      <a class="btn small ghost" href="#t-g-${g.id}">參觀</a><button class="btn small ghost" data-del="${g.id}" style="color:var(--danger)">刪除</button></div></div>`;
  body.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h2 style="margin:0">我嘅畫廊</h2><button class="btn primary" id="new-g">＋ 新增畫廊</button></div>
    ${mine.length ? mine.map(item).join('') : '<p class="muted">未有畫廊，撳「新增畫廊」開始。</p>'}</div>
    ${others.length ? `<div class="panel"><h2>其他老師嘅畫廊</h2>${others.map(item).join('')}</div>` : ''}`;
  $('#new-g').onclick = () => { A.gallery = { title: '', edition: '', subtitle: '', grade: '4', theme: 'minimal', colors: {}, room_size: 20, light: { mode: 'off', hour: 15, student: false }, halls: [] }; A.view = 'edit'; renderTab(); };
  $$('[data-edit]', body).forEach((b) => (b.onclick = () => { A.gallery = structuredClone(gs.find((g) => g.id === b.dataset.edit)); A.view = 'edit'; renderTab(); }));
  $$('[data-arts]', body).forEach((b) => (b.onclick = () => { A.gallery = gs.find((g) => g.id === b.dataset.arts); A.hallId = A.gallery.halls[0]?.id; A.view = 'arts'; renderTab(); }));
  $$('[data-del]', body).forEach((b) => (b.onclick = async () => {
    const g = gs.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox(`真係要刪除「${g.title}」？入面所有作品同讚賞都會一齊刪除，冇得復原。`, '刪除'))) return;
    try { await db.deleteGallery(g.id); toast('已刪除'); renderTab(); } catch (e) { toast('刪除失敗：' + e.message); }
  }));
}

// ---------- 畫廊設定 ----------
function renderEditor(body) {
  const g = A.gallery; g.colors ||= {};
  const light = { mode: 'off', hour: 15, student: false, ...(g.light || {}) };
  const cur = () => themeColors(g);
  body.innerHTML = `<div class="panel"><h2>${g.id ? '畫廊設定' : '新增畫廊'}</h2>
    <div class="row" style="margin-bottom:12px">
      <label class="field">作品名稱（門口大標題）<input id="f-title" value="${esc(g.title)}" placeholder="例如：我的夢想城市" maxlength="30"></label>
      <label class="field" style="max-width:150px">第幾屆<input id="f-ed" value="${esc(g.edition)}" placeholder="例如：第3屆" maxlength="12"></label>
      <label class="field" style="max-width:150px">年級<select id="f-grade">${GRADES.map((n) => `<option value="${n}" ${String(g.grade) === n ? 'selected' : ''}>${gradeLabel(n)}</option>`).join('')}<option value="all" ${g.grade === 'all' ? 'selected' : ''}>全校</option></select></label>
    </div>
    <label class="field" style="margin-bottom:16px">副題<small>例如「四年級視藝科作品展」</small><input id="f-sub" value="${esc(g.subtitle)}" maxlength="40"></label>
    <label class="field" style="margin-bottom:16px">通道（班別）<small>用逗號分開，每個名都會變成門口一條通道。全級一齊展覽可以寫「四年級全級」，或者分開寫「4A, 4B, 4C」。</small>
      <input id="f-halls" value="${esc((g.halls || []).map((h) => h.name).join(', '))}" placeholder="4A, 4B, 4C"></label>
    <div class="row" style="margin-bottom:16px;align-items:flex-start">
      <label class="field" style="max-width:260px">每間展室最多幾多件作品<small>超過呢個數就會自動分成相連嘅展室。填 0 即係唔分房，全部放喺一條長廊。</small>
        <input id="f-room" type="number" inputmode="numeric" min="0" max="60" value="${esc(g.room_size ?? 20)}"></label>
      <div class="field">陽光模式<small>天花會開天窗，陽光同影會跟時間變化。</small>
        <select id="f-light">${[['off', '關閉（普通室內燈光）'], ['fixed', '固定時間'], ['real', '跟香港而家嘅真實時間'], ['cycle', '一日循環（朝早到夜晚慢慢變）']].map(([v, n]) => `<option value="${v}" ${light.mode === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <div id="f-hour-wrap" style="margin-top:8px"><input id="f-hour" type="range" min="6" max="21" step="0.5" value="${light.hour}" style="width:100%;padding:0"><div id="f-hour-lab" style="font-weight:400"></div></div>
        <label id="f-lstu-wrap" style="display:flex;gap:8px;align-items:center;font-weight:400;margin-top:8px"><input id="f-lstu" type="checkbox" style="width:auto" ${light.student ? 'checked' : ''}>容許學生自己調校陽光時間</label>
      </div>
    </div>
    <div class="field" style="margin-bottom:8px">風格</div>
    <div class="theme-pick">${Object.entries(THEMES).map(([k, t]) => `<button class="theme-opt ${g.theme === k ? 'on' : ''}" data-th="${k}"><div class="sw"><i style="background:${t.bg}"></i><i style="background:${t.wall}"></i><i style="background:${t.floor}"></i><i style="background:${t.accent}"></i></div><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>
    <div class="row" style="justify-content:space-between;margin:16px 0 8px"><div class="field" style="flex:none">自訂顏色</div><button class="btn small ghost" id="reset-col">用返風格預設</button></div>
    <div class="colors">${[['wall', '牆身'], ['floor', '地板'], ['bg', '背景'], ['accent', '重點色']].map(([k, n]) => `<label>${n}<input type="color" data-c="${k}" value="${cur()[k]}"></label>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:20px"><button class="btn ghost" id="cancel">取消</button><button class="btn primary" id="save">儲存</button></div></div>`;
  const sync = () => { g.title = $('#f-title').value.trim(); g.edition = $('#f-ed').value.trim(); g.subtitle = $('#f-sub').value.trim(); g.grade = $('#f-grade').value; g._hallsText = $('#f-halls').value;
    g.room_size = Math.max(0, Math.min(60, Math.floor(Number($('#f-room').value) || 0)));
    g.light = { mode: $('#f-light').value, hour: Number($('#f-hour').value), student: $('#f-lstu').checked }; };
  const lightUi = () => { const m = $('#f-light').value; $('#f-hour-wrap').style.display = m === 'fixed' ? '' : 'none'; $('#f-lstu-wrap').style.display = m === 'off' ? 'none' : 'flex'; $('#f-hour-lab').textContent = hourLabel(Number($('#f-hour').value)); };
  $('#f-light').onchange = lightUi; $('#f-hour').oninput = lightUi; lightUi();
  if (g._hallsText !== undefined) $('#f-halls').value = g._hallsText;
  $$('.theme-opt', body).forEach((b) => (b.onclick = () => { sync(); g.theme = b.dataset.th; g.colors = {}; renderEditor(body); }));
  $$('[data-c]', body).forEach((i) => (i.oninput = () => (g.colors[i.dataset.c] = i.value)));
  $('#reset-col').onclick = () => { sync(); g.colors = {}; renderEditor(body); };
  $('#cancel').onclick = () => { A.view = 'list'; renderTab(); };
  $('#save').onclick = async () => {
    sync();
    if (!g.title) return toast('請輸入作品名稱');
    const names = [...new Set(($('#f-halls').value || '').split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean))];
    if (!names.length) return toast('最少要有一條通道（班別）');
    const old = g.halls || [];
    const removed = old.filter((h) => !names.includes(h.name));
    if (removed.length && !(await confirmBox(`你移除咗通道：${removed.map((h) => h.name).join('、')}。入面嘅作品都會刪除，確定？`, '確定'))) return;
    $('#save').disabled = true;
    try {
      const { halls, teachers, _hallsText, ...row } = g;
      const saved = await db.saveGallery(row);
      for (const h of removed) await db.deleteHall(h.id);
      for (let i = 0; i < names.length; i++) {
        const ex = old.find((h) => h.name === names[i]);
        await db.saveHall(ex ? { id: ex.id, gallery_id: saved.id, name: names[i], sort: i } : { gallery_id: saved.id, name: names[i], sort: i });
      }
      toast('已儲存'); A.view = 'list'; renderTab();
    } catch (e) { toast('儲存失敗：' + e.message, 5000); $('#save').disabled = false; }
  };
}

// ---------- 作品管理 ----------
function parseFilename(fn) {
  const base = fn.replace(/\.[^.]+$/, '').trim();
  let m = base.match(/^(\d[A-Za-z])[\s_\-.]+(\d{1,2})[\s_\-.]*(.*)$/);
  if (m) return { cls: m[1].toUpperCase(), no: Number(m[2]), name: m[3].trim() };
  m = base.match(/^(\d{1,2})[\s_\-.]+(.*)$/) || base.match(/^(\d{1,2})$/);
  if (m) return { no: Number(m[1]), name: (m[2] || '').trim() };
  return {};
}
const KIND_LABEL = { flat: '平面', photos: '360° 相片', model: '3D 作品' };

async function renderArts(body) {
  const full = await db.getGalleryFull(A.gallery.id);
  if (!full) { A.view = 'list'; return renderTab(); }
  A.roster = await db.listStudents().catch(() => []);
  const halls = full.halls; if (!halls.find((h) => h.id === A.hallId)) A.hallId = halls[0]?.id;
  const hall = halls.find((h) => h.id === A.hallId);
  const arts = full.artworks.filter((a) => a.hall_id === A.hallId).sort((a, b) => (Number(a.student_no) || 999) - (Number(b.student_no) || 999));
  const defCls = hall && hall.name.length <= 4 ? hall.name : '';
  A.kind ||= 'flat';
  body.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(full.gallery.edition || '')} ${esc(full.gallery.title)}</h2><button class="btn small ghost" id="back">← 返回列表</button></div>
    <div class="tabs" style="margin:14px 0 0">${halls.map((h) => `<button class="tab ${h.id === A.hallId ? 'on' : ''}" data-h="${h.id}">${esc(h.name)}</button>`).join('')}</div></div>
    ${hall ? `<div class="panel"><h2>上傳作品到「${esc(hall.name)}」</h2>
      <div class="kind-seg">
        <button data-k="flat">🖼️ 平面作品<small>一次揀好多張，每張就係一件作品</small></button>
        <button data-k="photos">🔄 立體：多角度相片<small>一件作品揀 3 至 12 張唔同角度嘅相</small></button>
        <button data-k="model">🧊 立體：3D 掃描檔<small>由 Scaniverse 等 app 匯出嘅 .glb 檔</small></button>
      </div>
      <p class="muted" id="kind-tip" style="font-size:14px;margin-top:0"></p>
      <div class="row" style="margin-bottom:12px"><label class="field" style="max-width:200px">呢批作品嘅班別<input id="batch-cls" value="${esc(defCls)}" placeholder="例如 4A"></label></div>
      <label class="drop"><input type="file" id="files" multiple hidden><span id="drop-txt"></span></label>
      <div id="pending" class="art-grid" style="margin-top:12px"></div>
      <div class="row hidden" id="up-row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="upload-all">全部上傳</button></div></div>
    <div class="panel"><h2>已展出（${arts.length}）</h2><div class="art-grid" id="existing"></div>${arts.length ? '' : '<p class="muted">未有作品</p>'}</div>` : '<div class="panel"><p class="muted">呢個畫廊未有通道，請先去「設定」加班別。</p></div>'}`;
  $('#back').onclick = () => { A.view = 'list'; renderTab(); };
  $$('[data-h]', body).forEach((b) => (b.onclick = () => { A.hallId = b.dataset.h; renderArts(body); }));
  if (!hall) return;

  const nameFor = (cls, no) => A.roster.find((r) => r.class_name === cls && Number(r.number) === Number(no))?.name || '';
  const fieldsHtml = (it) => `<div class="f"><input data-k="student_class" value="${esc(it.student_class || '')}" placeholder="班別"><input data-k="student_no" type="number" inputmode="numeric" value="${esc(it.student_no ?? '')}" placeholder="學號">
      <input class="full" data-k="student_name" value="${esc(it.student_name || '')}" placeholder="姓名"><input class="full" data-k="title" value="${esc(it.title || '')}" placeholder="作品題目（可留空）"></div>`;

  // 已有作品
  const ex = $('#existing');
  for (const a of arts) {
    const card = document.createElement('div'); card.className = 'art-card';
    card.innerHTML = `<div class="thumb">${a.kind !== 'flat' && a.kind ? `<span class="kind-badge">${KIND_LABEL[a.kind]}</span>` : ''}</div>${fieldsHtml(a)}<div class="acts"><span class="status"></span><button class="btn small ghost" data-del style="color:var(--danger)">刪除</button></div>`;
    ex.appendChild(card);
    if (a.image_path) db.mediaUrl(a.image_path).then((u) => ($('.thumb', card).style.backgroundImage = `url("${u}")`));
    $$('input', card).forEach((inp) => (inp.onchange = async () => {
      const k = inp.dataset.k; let v = inp.value.trim(); if (k === 'student_no') v = v ? Number(v) : null;
      a[k] = v;
      if (k === 'student_no' || k === 'student_class') { const n = nameFor(a.student_class, a.student_no); if (n && !a.student_name) { a.student_name = n; $('[data-k=student_name]', card).value = n; } }
      const st = $('.status', card);
      try { await db.updateArtwork({ id: a.id, student_class: a.student_class, student_no: a.student_no, student_name: a.student_name, title: a.title }); st.textContent = '已儲存'; st.className = 'status ok'; } catch (e) { st.textContent = '儲存失敗'; st.className = 'status err'; }
    }));
    $('[data-del]', card).onclick = async () => { if (!(await confirmBox(`刪除 ${personLabel(a.student_class, a.student_no, a.student_name)} 嘅作品？`, '刪除'))) return; await db.deleteArtwork(a); card.remove(); toast('已刪除'); };
  }

  // 上傳
  const pending = [];
  const setKind = (k) => {
    A.kind = k;
    $$('.kind-seg button', body).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    const f = $('#files');
    if (k === 'model') { f.accept = '.glb,model/gltf-binary'; f.multiple = true; $('#drop-txt').textContent = '🧊 撳呢度揀 .glb 檔（可以一次揀幾個）'; $('#kind-tip').innerHTML = '用 Scaniverse 掃描，然後揀「Export → GLB」匯出。每個檔最好細過 40MB，匯出時揀較低嘅材質解像度（例如 2K）就會細好多。系統會自動幫你影一張封面相。'; }
    else if (k === 'photos') { f.accept = 'image/*'; f.multiple = true; $('#drop-txt').textContent = '🔄 撳呢度揀「同一件作品」嘅多角度相（3 至 12 張）'; $('#kind-tip').innerHTML = '圍住作品每隔一段距離影一張，例如每 45° 影一張，一共 8 張。最好用同一個背景同高度，咁樣轉起上嚟最順。'; }
    else { f.accept = 'image/*'; f.multiple = true; $('#drop-txt').textContent = '📷 撳呢度揀相（或者拖相入嚟）'; $('#kind-tip').innerHTML = '小貼士：將檔案名改做「學號 姓名」（例如 <b>12 陳小明.jpg</b>），系統會自動幫你填好。只寫學號都得，系統會喺學生名單搵返個名。'; }
  };
  $$('.kind-seg button', body).forEach((b) => (b.onclick = () => { if (pending.length && b.dataset.k !== A.kind) return toast('請先上傳或者移除未上傳嘅作品'); setKind(b.dataset.k); }));
  setKind(A.kind);

  const addCard = (item, thumbs) => {
    const card = document.createElement('div'); card.className = 'art-card'; item.card = card;
    card.innerHTML = `<div class="thumb"><span class="kind-badge">${KIND_LABEL[item.kind]}</span></div>${thumbs ? '<div class="strip"></div>' : ''}${fieldsHtml(item)}<div class="acts"><span class="status">未上傳</span><button class="btn small ghost" data-rm>移除</button></div>`;
    $$('input', card).forEach((inp) => (inp.oninput = () => {
      item[inp.dataset.k] = inp.value.trim();
      if (inp.dataset.k !== 'student_name' && inp.dataset.k !== 'title' && item.student_no) { const n = nameFor(item.student_class, item.student_no); if (n) { item.student_name = n; $('[data-k=student_name]', card).value = n; } }
    }));
    $('[data-rm]', card).onclick = () => { pending.splice(pending.indexOf(item), 1); card.remove(); $('#up-row').classList.toggle('hidden', !pending.length); };
    $('#pending').appendChild(card); $('#up-row').classList.remove('hidden');
    return card;
  };
  const baseItem = (f) => { const p = parseFilename(f.name); const it = { student_class: p.cls || $('#batch-cls').value.trim(), student_no: p.no || '', student_name: p.name || '', title: '' }; if (!it.student_name && it.student_no) it.student_name = nameFor(it.student_class, it.student_no); return it; };

  const addFiles = async (fileList) => {
    const files = [...fileList];
    if (A.kind === 'flat') {
      for (const f of files.filter((f) => f.type.startsWith('image/'))) { const it = { ...baseItem(f), kind: 'flat', files: [f] }; pending.push(it); const c = addCard(it); $('.thumb', c).style.backgroundImage = `url("${URL.createObjectURL(f)}")`; }
    } else if (A.kind === 'photos') {
      const imgs = files.filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (imgs.length < 2) return toast('多角度相片最少要揀 2 張');
      if (imgs.length > 12) return toast('最多 12 張');
      const it = { ...baseItem(imgs[0]), kind: 'photos', files: imgs }; pending.push(it); const c = addCard(it, true);
      $('.thumb', c).style.backgroundImage = `url("${URL.createObjectURL(imgs[0])}")`;
      $('.strip', c).innerHTML = imgs.map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
    } else {
      const { snapshotGLBFile } = await import('./modal-viewer.js?v=20261113d');
      for (const f of files) {
        if (!/\.glb$/i.test(f.name)) { toast(`「${f.name}」唔係 .glb 檔`); continue; }
        if (f.size > 48 * 1024 * 1024) { toast(`「${f.name}」太大（${(f.size / 1048576).toFixed(0)}MB），請匯出細啲嘅版本`); continue; }
        const it = { ...baseItem(f), kind: 'model', files: [f], cover: null }; pending.push(it); const c = addCard(it);
        $('.status', c).textContent = '整緊封面…';
        try { const blob = await snapshotGLBFile(f); it.cover = new File([blob], 'cover.jpg', { type: 'image/jpeg' }); $('.thumb', c).style.backgroundImage = `url("${URL.createObjectURL(blob)}")`; $('.status', c).textContent = `未上傳 · ${(f.size / 1048576).toFixed(1)}MB`; }
        catch (e) { $('.status', c).textContent = '讀唔到呢個 3D 檔'; $('.status', c).className = 'status err'; it.bad = true; }
      }
    }
  };
  $('#files').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  const drop = $('.drop', body);
  drop.ondragover = (e) => e.preventDefault(); drop.ondrop = (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); };
  $('#batch-cls').oninput = () => pending.forEach((it) => { it.student_class = $('#batch-cls').value.trim(); $('[data-k=student_class]', it.card).value = it.student_class; });
  $('#upload-all').onclick = async () => {
    const missing = pending.find((it) => !it.student_name);
    if (missing) { toast('有作品未填姓名'); $('[data-k=student_name]', missing.card).focus(); return; }
    if (pending.some((it) => it.bad)) return toast('有 3D 檔讀唔到，請先移除');
    const bytes = pending.reduce((t, it) => t + it.files.reduce((u, f) => u + (it.kind === 'model' ? f.size : Math.min(f.size, 600 * 1024)), 0), 0);
    const warn = await checkSpaceBeforeUpload(bytes);
    if (warn && !(await confirmBox(warn + ' 仍然上載？', '上載'))) return;
    $('#upload-all').disabled = true;
    let ok = 0; const total = pending.length;
    for (const [i, it] of [...pending].entries()) {
      const st = $('.status', it.card); st.textContent = '上傳中…'; st.className = 'status';
      try {
        await db.addArtwork({ kind: it.kind, files: it.files, cover: it.cover }, { hall_id: hall.id, student_class: it.student_class, student_no: it.student_no ? Number(it.student_no) : null, student_name: it.student_name, title: it.title, sort: arts.length + i });
        st.textContent = '完成'; st.className = 'status ok'; ok++;
      } catch (e) { st.textContent = '失敗：' + e.message; st.className = 'status err'; }
    }
    toast(`上傳咗 ${ok} 件作品`);
    if (ok === total) renderArts(body); else $('#upload-all').disabled = false;
  };
}

// ---------- 學生連結 ----------
function qrDataUrl(text, cell = 6) { try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createDataURL(cell, 2); } catch (e) { return ''; } }

async function renderLinks(body) {
  body.innerHTML = '<div class="panel"><p class="muted">載入中…</p></div>';
  const [links, gs] = await Promise.all([db.listLinks(), db.listGalleries()]);
  const myLinks = links.filter((l) => !l.owner_id || l.owner_id === A.teacher.id);
  const myGs = gs.filter((g) => !g.owner_id || g.owner_id === A.teacher.id);
  const gradeChecks = (sel, name) => `<div class="grade-checks">${GRADES.map((n) => `<label><input type="checkbox" name="${name}" value="${n}" ${sel.includes(n) ? 'checked' : ''}>${gradeLabel(n)}</label>`).join('')}</div>`;
  const visibleFor = (l) => myGs.filter((g) => g.grade === 'all' || l.grades.includes(String(g.grade)));
  body.innerHTML = `<div class="panel"><h2>學生連結</h2>
    <p class="muted" style="margin-top:-6px;font-size:14px">每條連結都可以設定學生睇到邊幾級嘅作品，例如只剔「四年級」，學生就只會見到你設定為四年級嘅畫廊。想俾佢哋睇其他級，喺下面多剔一級就即刻生效，唔使換連結。</p>
    <div id="link-list"></div></div>
    <div class="panel"><h2>開一條新連結</h2>
      <label class="field" style="margin-bottom:10px">名稱（俾你自己認）<input id="nl-label" placeholder="例如：4A 班學生" maxlength="30"></label>
      <div class="field" style="margin-bottom:6px">可以睇到嘅年級</div>${gradeChecks([], 'nl-g')}
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="nl-save">開連結</button></div></div>`;
  const list = $('#link-list');
  if (!myLinks.length) list.innerHTML = '<p class="muted">未有連結。</p>';
  for (const l of myLinks) {
    const url = `${siteUrl()}#s-${l.code}`;
    const card = document.createElement('div'); card.className = 'link-card';
    const vis = visibleFor(l);
    card.innerHTML = `<div><div class="row"><b style="font-size:17px">${esc(l.label || '（未命名）')}</b>${l.active ? '' : '<span class="chip" style="background:#ffe3e3">已停用</span>'}</div>
      <div class="url">${esc(url)}</div>${gradeChecks(l.grades, 'g-' + l.id)}
      <div class="s muted" style="font-size:13px;margin-top:8px">學生而家睇到：${vis.length ? vis.map((g) => esc(g.title)).join('、') : '（未有畫廊）'}</div>
      <div class="row" style="margin-top:10px"><button class="btn small primary" data-copy>複製連結</button><button class="btn small ghost" data-qr>放大 QR code</button><a class="btn small ghost" href="#s-${l.code}">試用</a>
      <button class="btn small ghost" data-act>${l.active ? '停用' : '重新啟用'}</button><button class="btn small ghost" data-del style="color:var(--danger)">刪除</button></div></div>
      <img class="qr" alt="QR code" src="${qrDataUrl(url, 4)}">`;
    list.appendChild(card);
    $$(`input[name="g-${l.id}"]`, card).forEach((cb) => (cb.onchange = async () => {
      l.grades = $$(`input[name="g-${l.id}"]:checked`, card).map((x) => x.value);
      try { await db.saveLink({ id: l.id, grades: l.grades }); toast('已更新，學生重新整理就會見到'); $('.s', card).innerHTML = '學生而家睇到：' + (visibleFor(l).map((g) => esc(g.title)).join('、') || '（未有畫廊）'); } catch (e) { toast('更新失敗：' + e.message); }
    }));
    $('[data-copy]', card).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('已複製'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('.url', card)); getSelection().removeAllRanges(); getSelection().addRange(r); toast('已選取連結，請按複製'); } };
    $('[data-qr]', card).onclick = () => {
      const d = document.createElement('div'); d.className = 'qr-big';
      d.innerHTML = `<h2>${esc(l.label || '學生作品畫廊')}</h2><img alt="QR code" src="${qrDataUrl(url, 12)}"><div class="muted">用手機鏡頭掃描就可以入畫廊</div><button class="btn ghost">關閉</button>`;
      document.body.appendChild(d); $('button', d).onclick = () => d.remove();
    };
    $('[data-act]', card).onclick = async () => { await db.saveLink({ id: l.id, active: !l.active }); renderLinks(body); };
    $('[data-del]', card).onclick = async () => { if (await confirmBox('刪除呢條連結？用緊呢條連結嘅學生會入唔到畫廊。', '刪除')) { await db.deleteLink(l.id); renderLinks(body); } };
  }
  $('#nl-save').onclick = async () => {
    const grades = $$('input[name="nl-g"]:checked', body).map((x) => x.value);
    if (!grades.length) return toast('請最少剔一個年級');
    try { await db.saveLink({ label: $('#nl-label').value.trim() || grades.map(gradeLabel).join('、') + '學生', grades }); toast('已開新連結'); renderLinks(body); } catch (e) { toast('開唔到：' + e.message); }
  };
}

// ---------- 學生名單 ----------
async function renderRoster(body) {
  const all = (await db.listStudents().catch(() => [])).filter((s) => !s.owner_id || s.owner_id === A.teacher.id);
  const byClass = {}; all.forEach((s) => (byClass[s.class_name] ||= []).push(s));
  body.innerHTML = `<div class="panel"><h2>學生名單</h2>
    <p class="muted" style="margin-top:-6px;font-size:14px">學生入畫廊時揀班別、輸入學號，系統就會喺呢度搵返佢個名。可以直接由 Excel 複製「學號」同「姓名」兩欄貼落嚟。班別要用數字開頭（例如 4A），系統先知係邊一級。</p>
    <div class="chips" style="margin-bottom:14px">${Object.keys(byClass).sort().map((c) => `<button class="chip" data-c="${esc(c)}" style="border:0;cursor:pointer">${esc(c)}（${byClass[c].length}人）</button>`).join('') || '<span class="muted">未有名單</span>'}</div>
    <label class="field" style="max-width:200px;margin-bottom:10px">班別<input id="r-cls" placeholder="例如 4A"></label>
    <label class="field">名單（每行一個：學號 姓名）<textarea id="r-list" rows="12" placeholder="1 陳小明&#10;2 李嘉欣&#10;3 黃子晴"></textarea></label>
    <div class="row" style="justify-content:space-between;margin-top:12px"><button class="btn ghost" id="r-del" style="color:var(--danger)">刪除呢班名單</button><button class="btn primary" id="r-save">儲存呢班名單</button></div></div>`;
  $$('[data-c]', body).forEach((b) => (b.onclick = () => { const c = b.dataset.c; $('#r-cls').value = c; $('#r-list').value = byClass[c].sort((a, b) => a.number - b.number).map((s) => `${s.number} ${s.name}`).join('\n'); }));
  $('#r-save').onclick = async () => {
    const cls = $('#r-cls').value.trim().toUpperCase(); if (!cls) return toast('請輸入班別');
    const rows = []; const bad = [];
    $('#r-list').value.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => { const m = l.match(/^(\d{1,3})[\s,，\t.、]+(.+)$/); if (m) rows.push({ number: Number(m[1]), name: m[2].trim() }); else bad.push(l); });
    if (bad.length) return toast(`有 ${bad.length} 行睇唔明，例如「${bad[0]}」。格式要係「學號 姓名」`, 5000);
    const nums = rows.map((r) => r.number); if (new Set(nums).size !== nums.length) return toast('有重複學號');
    try { await db.replaceClassRoster(cls, rows); toast(`已儲存 ${cls} 共 ${rows.length} 人`); renderRoster(body); } catch (e) { toast('儲存失敗：' + e.message); }
  };
  $('#r-del').onclick = async () => { const cls = $('#r-cls').value.trim().toUpperCase(); if (!cls || !byClass[cls]) return toast('請先揀一班'); if (await confirmBox(`刪除 ${cls} 嘅學生名單？`, '刪除')) { await db.replaceClassRoster(cls, []); renderRoster(body); } };
}

// ---------- 讚賞紀錄 ----------
async function renderReactions(body) {
  body.innerHTML = '<div class="panel"><p class="muted">載入中…</p></div>';
  const rs = await db.listRecentReactions(300).catch((e) => { toast(e.message); return []; });
  body.innerHTML = `<div class="panel"><h2>最近嘅讚賞（${rs.length}）</h2>${rs.length ? '' : '<p class="muted">未有讚賞</p>'}<div id="r-list"></div></div>`;
  const list = $('#r-list');
  rs.forEach((r) => {
    const a = r.artworks; const row = document.createElement('div'); row.className = 'r-item';
    row.innerHTML = `<img src="${stickerUrl(r.sticker)}" alt=""><div class="grow"><b>${esc(personLabel(r.from_class, r.from_class === '老師' ? '' : r.from_no, r.from_name))}</b> 讚 ${a ? esc(personLabel(a.student_class, a.student_no, a.student_name)) : '（已刪作品）'}<br><span class="muted">${esc(r.phrase)} · ${new Date(r.created_at).toLocaleString('zh-HK')}</span></div><button class="btn small ghost" style="color:var(--danger)">刪除</button>`;
    $('button', row).onclick = async () => { if (!(await confirmBox('刪除呢個讚賞？', '刪除'))) return; await db.deleteReaction(r.id); row.remove(); toast('已刪除'); };
    list.appendChild(row);
  });
}

// ---------- 老師帳戶（只限管理員） ----------
async function renderTeachers(body) {
  const [ts, domain] = await Promise.all([db.listTeachers(), db.getSetting('allowed_domain').catch(() => '')]);
  body.innerHTML = `<div class="panel"><h2>老師帳戶</h2>
    <p class="muted" style="margin-top:-6px;font-size:14px">其他老師用 Google 登入一次之後，就會出現喺呢度，你批准咗佢先可以用。每位老師只會見到同管理自己嘅畫廊、連結同學生名單。</p>
    <div id="t-list"></div></div>
    <div class="panel"><h2>自動批准</h2><p class="muted" style="margin-top:-6px;font-size:14px">填學校電郵嘅網域（例如 <b>school.edu.hk</b>），用呢個網域登入嘅老師就會自動獲批准。留空就要逐個人批准。</p>
    <div class="row"><input id="dom" value="${esc(domain)}" placeholder="school.edu.hk" style="flex:1;min-width:200px"><button class="btn primary" id="dom-save">儲存</button></div></div>`;
  const list = $('#t-list');
  ts.forEach((t) => {
    const row = document.createElement('div'); row.className = 'list-item';
    row.innerHTML = `<div class="grow"><div class="t">${esc(t.name || '（未有名）')} ${t.is_owner ? '<span class="chip">管理員</span>' : ''}</div><div class="s">${esc(t.email)} · ${t.approved ? '✅ 已批准' : '⏳ 等緊批准'}</div></div>
      ${t.is_owner ? '' : `<button class="btn small ${t.approved ? 'ghost' : 'primary'}">${t.approved ? '取消權限' : '批准'}</button>`}`;
    $('button', row)?.addEventListener('click', async () => { await db.updateTeacher(t.id, { approved: !t.approved }); renderTeachers(body); });
    list.appendChild(row);
  });
  $('#dom-save').onclick = async () => { await db.saveSetting('allowed_domain', $('#dom').value.trim().replace(/^@/, '').toLowerCase()); toast('已儲存'); };
}

// ---------- 空間同備份 ----------
const FREE_LIMIT = 1024 * 1024 * 1024; // Supabase 免費版：1GB
const fmtMB = (b) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(2) + ' GB' : (b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0) + ' MB');
const STICKER_NAME = { love: '好鍾意', wow: '好厲害', idea: '好有創意', cool: '好有型', giggle: '好得意', touched: '好感動', yum: '好吸引', curious: '點畫㗎？', shy: '好溫馨', peek: '想睇多次' };
const KIND_NAME = { flat: '平面', photos: '多角度相片', model: '3D 掃描' };

export async function checkSpaceBeforeUpload(bytes) {
  try { const u = await db.storageUsage(); if (u && u.total_bytes + bytes > FREE_LIMIT * 0.98) return `儲存空間就嚟滿（已用 ${fmtMB(u.total_bytes)}／1 GB），今次上載可能會失敗。可以先喺「空間同備份」睇吓，或者刪除舊畫廊。`; } catch (e) {}
  return null;
}

async function renderTools(body) {
  body.innerHTML = `<div class="panel"><h2>儲存空間</h2><div id="space">載入中…</div></div>
    <div class="panel"><h2>備份做 Excel</h2>
      <p class="muted" style="margin-top:-6px;font-size:14px">一次過下載所有畫廊、作品、學生名單同讚賞紀錄。建議每個學期尾做一次，用嚟保存紀錄。（只包括資料同相片連結，唔包括相片檔案本身。）</p>
      <button class="btn primary" id="bk">⬇️ 下載 Excel 備份</button> <span class="status" id="bk-st"></span></div>
    <div class="panel"><h2>補做預覽圖</h2>
      <p class="muted" style="margin-top:-6px;font-size:14px">2026 年 11 月 13 日之前上載嘅平面作品冇細預覽圖，展廳載入會慢啲、用多啲流量。撳下面個掣就會自動補做（每張大約 0.1 MB）。</p>
      <div id="th">檢查緊…</div></div>
    <div class="panel"><h2>自動保持運作</h2>
      <p class="muted" style="margin-top:-6px;font-size:14px">Supabase 免費版連續 7 日冇人用就會暫停。GitHub 已經設定好每日自動連一次資料庫，你唔使做任何嘢。想確認嘅話，可以去 GitHub repo 嘅 <b>Actions</b> 分頁，睇吓「保持 Supabase 運作」有冇綠色 ✓。</p></div>`;

  // 空間
  (async () => {
    const el = $('#space');
    try {
      const u = await db.storageUsage();
      if (!u) { el.innerHTML = '<p class="muted">睇唔到（只有已批准嘅老師先睇到）</p>'; return; }
      const pct = Math.min(100, (u.total_bytes / FREE_LIMIT) * 100);
      const col = pct > 90 ? 'var(--danger)' : pct > 70 ? '#f08c00' : '#2b8a3e';
      el.innerHTML = `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:18px"><span>已用 ${fmtMB(u.total_bytes)}</span><span class="muted" style="font-weight:500;font-size:14px">免費上限 1 GB</span></div>
        <div style="height:14px;background:#f1ece3;border-radius:99px;overflow:hidden;margin:8px 0"><div style="height:100%;width:${Math.max(pct, 1)}%;background:${col}"></div></div>
        <div class="muted" style="font-size:14px">共 ${u.files} 個檔案${db.mode === 'cloud' && u.my_bytes !== u.total_bytes ? `，其中你上載嘅佔 ${fmtMB(u.my_bytes)}` : ''}。大約仲可以放 ${Math.max(0, Math.floor((FREE_LIMIT - u.total_bytes) / (0.5 * 1024 ** 2)))} 張平面作品。</div>
        ${pct > 70 ? `<div class="notice" style="margin:10px 0 0">空間用咗 ${pct.toFixed(0)}%。可以刪除舊畫廊，或者喺 Supabase 升級 Pro（每月 US$25，100 GB）。</div>` : ''}`;
    } catch (e) {
      el.innerHTML = e.message === 'NEED_UPDATE_3' ? '<div class="notice" style="margin:0">要先更新資料庫先睇到：喺 Supabase 嘅 SQL Editor 執行 <code>supabase/update-3.sql</code>（GitHub repo 入面有）。</div>' : `<p class="status err">讀取失敗：${esc(e.message)}</p>`;
    }
  })();

  // 備份
  $('#bk').onclick = async () => {
    const st = $('#bk-st'); $('#bk').disabled = true; st.className = 'status'; st.textContent = '整理緊…';
    try {
      await loadXLSX();
      const d = await db.backupData();
      const gById = Object.fromEntries(d.galleries.map((g) => [g.id, g])); const hById = Object.fromEntries(d.halls.map((h) => [h.id, h])); const aById = Object.fromEntries(d.artworks.map((a) => [a.id, a]));
      const url = async (p) => (p && !p.startsWith('gen') && !p.startsWith('idb:') ? await db.mediaUrl(p) : '');
      const arts = []; for (const a of d.artworks) { const h = hById[a.hall_id] || {}; const g = gById[h.gallery_id] || {};
        arts.push({ 畫廊: `${g.edition || ''} ${g.title || ''}`.trim(), 通道: h.name || '', 班別: a.student_class || '', 學號: a.student_no ?? '', 姓名: a.student_name || '', 作品題目: a.title || '', 種類: KIND_NAME[a.kind || 'flat'], 讚數: d.reactions.filter((r) => r.artwork_id === a.id).length, 相片連結: await url(a.image_path), '3D 檔連結': await url(a.model_path), 上載時間: fmtTime(a.created_at) }); }
      const reacts = d.reactions.map((r) => { const a = aById[r.artwork_id] || {}; const g = gById[(hById[a.hall_id] || {}).gallery_id] || {};
        return { 畫廊: g.title || '', 作品: a.title || '', 作者: personLabel(a.student_class, a.student_no, a.student_name), 讚賞者: personLabel(r.from_class, r.from_class === '老師' ? '' : r.from_no, r.from_name), 貼紙: STICKER_NAME[r.sticker] || r.sticker, 讚美詞: r.phrase, 時間: fmtTime(r.created_at) }; }).sort((x, y) => y.時間.localeCompare(x.時間));
      const gals = d.galleries.map((g) => ({ 作品名稱: g.title, 第幾屆: g.edition || '', 副題: g.subtitle || '', 年級: gradeLabel(g.grade), 風格: THEMES[g.theme]?.name || '', 通道: d.halls.filter((h) => h.gallery_id === g.id).map((h) => h.name).join('、'), 作品數: d.artworks.filter((a) => (hById[a.hall_id] || {}).gallery_id === g.id).length }));
      const studs = [...d.students].sort((a, b) => a.class_name.localeCompare(b.class_name) || a.number - b.number).map((s) => ({ 班別: s.class_name, 學號: s.number, 姓名: s.name,
        作品數: d.artworks.filter((a) => a.student_class === s.class_name && Number(a.student_no) === s.number).length,
        收到讚數: d.reactions.filter((r) => { const a = aById[r.artwork_id]; return a && a.student_class === s.class_name && Number(a.student_no) === s.number; }).length,
        送出讚數: d.reactions.filter((r) => r.from_class === s.class_name && Number(r.from_no) === s.number).length }));
      const X = window.XLSX; const wb = X.utils.book_new();
      const add = (rows, name, empty) => { const ws = X.utils.json_to_sheet(rows.length ? rows : [{ [empty]: '（未有資料）' }]); const keys = Object.keys(rows[0] || { [empty]: '' }); ws['!cols'] = keys.map((k) => ({ wch: Math.min(50, Math.max(8, k.length * 2 + 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? '').length + 2))) })); X.utils.book_append_sheet(wb, ws, name); };
      add(gals, '畫廊', '作品名稱'); add(arts, '作品', '畫廊'); add(studs, '學生', '班別'); add(reacts, '讚賞紀錄', '畫廊');
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
      X.writeFile(wb, `學生作品畫廊備份-${day}.xlsx`);
      st.className = 'status ok'; st.textContent = `完成：${d.galleries.length} 個畫廊、${d.artworks.length} 件作品、${d.reactions.length} 個讚賞`;
    } catch (e) { st.className = 'status err'; st.textContent = '備份失敗：' + e.message; }
    $('#bk').disabled = false;
  };

  // 補做預覽圖
  (async () => {
    const el = $('#th');
    let d; try { d = await db.backupData(); } catch (e) { el.innerHTML = `<p class="status err">${esc(e.message)}</p>`; return; }
    const need = d.artworks.filter((a) => (a.kind || 'flat') === 'flat' && !a.thumb_path && a.image_path);
    if (!need.length) { el.innerHTML = '<p class="status ok" style="font-size:15px">✅ 所有平面作品都有預覽圖</p>'; return; }
    el.innerHTML = `<p style="margin:0 0 10px"><b>${need.length}</b> 件作品未有預覽圖。</p><button class="btn primary" id="th-go">開始補做</button> <span class="status" id="th-st"></span>
      <div style="height:10px;background:#f1ece3;border-radius:99px;overflow:hidden;margin-top:10px" class="hidden" id="th-barw"><div id="th-bar" style="height:100%;width:0;background:#2b8a3e"></div></div>`;
    $('#th-go').onclick = async () => {
      $('#th-go').disabled = true; $('#th-barw').classList.remove('hidden'); let ok = 0, fail = 0, lastErr = '';
      for (const [i, a] of need.entries()) {
        $('#th-st').textContent = `${i + 1} / ${need.length}`;
        try { const r = await fetch(await db.mediaUrl(a.image_path)); if (!r.ok) throw new Error('下載唔到原圖'); await db.setThumb(a, await resizeImage(await r.blob(), 800)); ok++; }
        catch (e) { fail++; lastErr = e.message; if (/資料庫要先更新/.test(e.message)) break; }
        $('#th-bar').style.width = ((i + 1) / need.length * 100) + '%';
      }
      $('#th-st').className = fail ? 'status err' : 'status ok';
      $('#th-st').textContent = fail ? `完成 ${ok} 件，${fail} 件失敗：${lastErr}` : `✅ 完成 ${ok} 件`;
    };
  })();
}

const fmtTime = (t) => (t ? new Date(t).toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' }).slice(0, 16) : '');
let xlsxP;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  return (xlsxP ||= new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = 'vendor/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => { xlsxP = null; bad(new Error('載入唔到 Excel 工具')); }; document.head.appendChild(sc); }));
}
