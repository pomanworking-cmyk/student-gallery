// 資料層：有 Supabase 設定就用雲端，冇就用試用模式（只存喺呢部機）
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=20261113c';
import { drawSampleArt } from './sample-art.js?v=20261113c';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const now = () => new Date().toISOString();
export const newCode = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(8)); r.forEach((v) => (s += a[v % a.length])); return s; };

export class DuplicateError extends Error {}
const isMissingColumn = (e) => e.code === 'PGRST204' || e.code === '42703' || /column .* does not exist|Could not find the .* column/i.test(e.message || '');

export function galleryVisible(g, link) { return g.grade === 'all' || (link.grades || []).includes(String(g.grade)); }
export function classInGrades(cls, grades) { const c = String(cls || '')[0]; return !/[0-9]/.test(c) || grades.includes(c); }

// ---------- 共用：縮細相片 ----------
export async function resizeImage(file, max = 2000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
  } finally { URL.revokeObjectURL(url); }
}

// ================= 試用模式 =================
const LS_KEY = 'student-gallery-demo-v3';
let memStore = null;
const memImages = new Map();
function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open('student-gallery-demo', 1); r.onupgradeneeded = () => r.result.createObjectStore('images'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  });
}
async function idbPut(key, blob) {
  memImages.set(key, blob);
  try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('images', 'readwrite'); t.objectStore('images').put(blob, key); t.oncomplete = res; t.onerror = rej; }); } catch (e) {}
}
async function idbGet(key) {
  if (memImages.has(key)) return memImages.get(key);
  try { const db = await idb(); return await new Promise((res) => { const q = db.transaction('images').objectStore('images').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; }
}
async function idbDel(key) { memImages.delete(key); try { (await idb()).transaction('images', 'readwrite').objectStore('images').delete(key); } catch (e) {} }

const DEMO_T = 'demo-teacher';
function seed() {
  const g1 = { id: 'demo-city', owner_id: DEMO_T, title: '我的夢想城市', edition: '第3屆', subtitle: '四年級視藝科作品展', grade: '4', theme: 'kids', colors: {}, room_size: 4, light: { mode: 'off' }, created_at: now(), sort: 0 };
  const g3 = { id: 'demo-clay', owner_id: DEMO_T, title: '黏土小宇宙', edition: '第1屆', subtitle: '四年級立體創作', grade: '4', theme: 'minimal', colors: {}, room_size: 20, light: { mode: 'fixed', hour: 15, student: true }, created_at: now(), sort: 1 };
  const g2 = { id: 'demo-color', owner_id: DEMO_T, title: '色彩的旋律', edition: '第1屆', subtitle: '五年級 · 5C', grade: '5', theme: 'colorful', colors: {}, room_size: 20, light: { mode: 'cycle', student: false }, created_at: now(), sort: 2 };
  const halls = [
    { id: 'demo-4a', gallery_id: g1.id, name: '4A', sort: 0 }, { id: 'demo-4b', gallery_id: g1.id, name: '4B', sort: 1 },
    { id: 'demo-4all', gallery_id: g3.id, name: '四年級全級', sort: 0 },
    { id: 'demo-5c', gallery_id: g2.id, name: '5C', sort: 0 },
  ];
  const names = ['陳小明', '李嘉欣', '黃子晴', '張浩然', '林曉彤', '何俊傑', '吳心悅', '鄭家樂', '梁詠詩', '周子軒', '謝悅晴', '馮皓朗'];
  const titles = ['會飛的房子', '彩虹大街', '海底城市', '森林小鎮', '星空之城', '甜品王國', '未來車站', '我的屋企', '雲上公園', '機械花園', '晚霞', '跳舞的顏色'];
  const students = []; const artworks = []; let k = 0;
  for (const cls of ['4A', '4B', '5C']) names.slice(0, 8).forEach((n, i) => students.push({ owner_id: DEMO_T, class_name: cls, number: i + 1, name: cls === '4A' ? n : names[(i + (cls === '4B' ? 4 : 2)) % names.length] }));
  const nameOf = (cls, no) => students.find((s) => s.class_name === cls && s.number === no)?.name;
  for (const h of [halls[0], halls[1], halls[3]]) {
    for (let i = 1; i <= 6; i++) { artworks.push({ id: 'demo-art-' + k, hall_id: h.id, kind: 'flat', student_class: h.name, student_no: i, student_name: nameOf(h.name, i), title: titles[k % titles.length], image_path: 'gen:' + k, photo_paths: [], model_path: null, sort: i, created_at: now() }); k++; }
  }
  // 立體作品
  artworks.push({ id: 'demo-3d-0', hall_id: 'demo-4a', kind: 'model', student_class: '4A', student_no: 7, student_name: nameOf('4A', 7), title: '我的小怪獸', image_path: 'genview:0:0', photo_paths: [], model_path: 'genmodel:0', sort: 7, created_at: now() });
  const clay = [['4A', 8, 'model', 2, '小怪獸樂團'], ['4B', 2, 'photos', 1, '花之塔'], ['4B', 5, 'model', 1, '彩色花瓶'], ['4A', 3, 'photos', 0, '開心怪獸'], ['4A', 6, 'flat', 0, '設計草圖']];
  clay.forEach(([cls, no, kind, s, t], i) => artworks.push({ id: 'demo-clay-' + i, hall_id: 'demo-4all', kind, student_class: cls, student_no: no, student_name: nameOf(cls, no), title: t,
    image_path: kind === 'flat' ? 'gen:' + (i + 3) : `genview:${s}:0`, photo_paths: kind === 'photos' ? [0, 1, 2, 3, 4, 5].map((v) => `genview:${s}:${v}`) : [], model_path: kind === 'model' ? 'genmodel:' + s : null, sort: i, created_at: now() }));
  const reactions = [
    { id: uid(), artwork_id: 'demo-art-0', sticker: 'love', phrase: '我好鍾意你用嘅顏色！', from_class: '4B', from_no: '2', from_name: nameOf('4B', 2), created_at: now() },
    { id: uid(), artwork_id: 'demo-art-0', sticker: 'idea', phrase: '好有想像力！', from_class: '4A', from_no: '3', from_name: nameOf('4A', 3), created_at: now() },
    { id: uid(), artwork_id: 'demo-clay-0', sticker: 'wow', phrase: '好有創意！', from_class: '老師', from_no: '陳老師', from_name: '陳老師', created_at: now() },
  ];
  const links = [
    { id: 'demo-link-4', owner_id: DEMO_T, code: 'demo4yr', label: '四年級學生', grades: ['4'], active: true, created_at: now() },
    { id: 'demo-link-5', owner_id: DEMO_T, code: 'demo5yr', label: '5C 班', grades: ['5'], active: true, created_at: now() },
  ];
  const teachers = [{ id: DEMO_T, email: 'demo@school.edu.hk', name: '示範老師', approved: true, is_owner: true, created_at: now() }];
  return { galleries: [g1, g3, g2], halls, artworks, students, reactions, links, teachers, settings: {} };
}

class DemoBackend {
  mode = 'demo';
  async init() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) memStore = JSON.parse(raw); } catch (e) {}
    if (!memStore) { memStore = seed(); this._save(); }
  }
  _save() { try { localStorage.setItem(LS_KEY, JSON.stringify(memStore)); } catch (e) {} }
  get s() { return memStore; }
  _withHalls(g) { return { ...g, halls: this.s.halls.filter((h) => h.gallery_id === g.id).sort((a, b) => a.sort - b.sort).map((h) => ({ ...h, count: this.s.artworks.filter((a) => a.hall_id === h.id).length })) }; }
  _full(id) {
    const gallery = this.s.galleries.find((g) => g.id === id); if (!gallery) return null;
    const halls = this.s.halls.filter((h) => h.gallery_id === id).sort((a, b) => a.sort - b.sort);
    const ids = new Set(halls.map((h) => h.id));
    return { gallery, halls, artworks: this.s.artworks.filter((a) => ids.has(a.hall_id)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)) };
  }
  // ---- 學生（經連結）----
  _link(code) { return this.s.links.find((l) => l.code === code && l.active) || null; }
  async getLink(code) { const l = this._link(code); if (!l) return null; const t = this.s.teachers.find((t) => t.id === l.owner_id); return { ...l, teacher_name: t?.name || '' }; }
  async linkGalleries(code) { const l = this._link(code); if (!l) return []; return this.s.galleries.filter((g) => g.owner_id === l.owner_id && galleryVisible(g, l)).sort((a, b) => a.sort - b.sort).map((g) => this._withHalls(g)); }
  async linkGalleryFull(code, gid) { const l = this._link(code); const g = this.s.galleries.find((x) => x.id === gid); if (!l || !g || g.owner_id !== l.owner_id || !galleryVisible(g, l)) return null; return this._full(gid); }
  async linkReactions(code, ids) { return this.listReactions(ids); }
  async linkAddReaction(code, r) { if (!this._link(code)) throw new Error('連結已經停用'); return this.addReaction(r); }
  async linkLookupStudent(code, cls, no) { const l = this._link(code); return this.s.students.find((s) => s.owner_id === l?.owner_id && s.class_name === cls && Number(s.number) === Number(no))?.name || null; }
  async linkClasses(code) { const l = this._link(code); if (!l) return []; return [...new Set(this.s.students.filter((s) => s.owner_id === l.owner_id && classInGrades(s.class_name, l.grades)).map((s) => s.class_name))].sort(); }
  // ---- 老師 ----
  async getTeacher() { return this.s.teachers[0]; }
  async signInGoogle() { return this.s.teachers[0]; }
  async signInEmail() { return this.s.teachers[0]; }
  async signOut() {}
  async listGalleries() { return [...this.s.galleries].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((g) => this._withHalls(g)); }
  async getGalleryFull(id) { return this._full(id); }
  async listReactions(ids) { const set = new Set(ids); return this.s.reactions.filter((r) => set.has(r.artwork_id)); }
  async addReaction(r) {
    if (this.s.reactions.some((x) => x.artwork_id === r.artwork_id && x.from_class === r.from_class && String(x.from_no) === String(r.from_no))) throw new DuplicateError();
    const row = { ...r, id: uid(), created_at: now() }; this.s.reactions.push(row); this._save(); return row;
  }
  async deleteReaction(id) { this.s.reactions = this.s.reactions.filter((r) => r.id !== id); this._save(); }
  async listRecentReactions(limit = 200) { return [...this.s.reactions].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((r) => ({ ...r, artworks: this.s.artworks.find((a) => a.id === r.artwork_id) || null })); }
  async listStudents() { return [...this.s.students]; }
  async replaceClassRoster(cls, rows) { this.s.students = this.s.students.filter((s) => s.class_name !== cls).concat(rows.map((r) => ({ owner_id: DEMO_T, class_name: cls, number: r.number, name: r.name }))); this._save(); }
  async saveGallery(g) {
    const { halls, ...row } = g;
    if (!row.id) { const n = { ...row, id: uid(), owner_id: DEMO_T, created_at: now(), sort: this.s.galleries.length }; this.s.galleries.push(n); this._save(); return n; }
    const i = this.s.galleries.findIndex((x) => x.id === row.id); this.s.galleries[i] = { ...this.s.galleries[i], ...row }; this._save(); return this.s.galleries[i];
  }
  async deleteGallery(id) { for (const h of this.s.halls.filter((h) => h.gallery_id === id)) await this.deleteHall(h.id); this.s.galleries = this.s.galleries.filter((g) => g.id !== id); this._save(); }
  async saveHall(h) {
    if (!h.id) { h = { ...h, id: uid() }; this.s.halls.push(h); } else { const i = this.s.halls.findIndex((x) => x.id === h.id); this.s.halls[i] = { ...this.s.halls[i], ...h }; }
    this._save(); return h;
  }
  async deleteHall(id) { for (const a of this.s.artworks.filter((a) => a.hall_id === id)) await this.deleteArtwork(a); this.s.halls = this.s.halls.filter((h) => h.id !== id); this._save(); }
  async _store(blob) { const id = uid(); await idbPut(id, blob); return 'idb:' + id; }
  async addArtwork({ kind, files, cover }, meta) {
    const row = { ...meta, kind, id: uid(), photo_paths: [], model_path: null, created_at: now() };
    if (kind === 'flat') { row.image_path = await this._store(await resizeImage(files[0])); row.thumb_path = await this._store(await resizeImage(files[0], 800)); }
    else if (kind === 'photos') { for (const f of files) row.photo_paths.push(await this._store(await resizeImage(f, 1600))); row.image_path = row.photo_paths[0]; }
    else { row.model_path = await this._store(files[0]); row.image_path = cover ? await this._store(await resizeImage(cover, 1200)) : null; }
    this.s.artworks.push(row); this._save(); return row;
  }
  async updateArtwork(a) { const i = this.s.artworks.findIndex((x) => x.id === a.id); this.s.artworks[i] = { ...this.s.artworks[i], ...a }; this._save(); }
  async deleteArtwork(a) {
    for (const p of [a.image_path, a.thumb_path, a.model_path, ...(a.photo_paths || [])]) if (p?.startsWith('idb:')) await idbDel(p.slice(4));
    this.s.artworks = this.s.artworks.filter((x) => x.id !== a.id); this.s.reactions = this.s.reactions.filter((r) => r.artwork_id !== a.id); this._save();
  }
  async listLinks() { return [...this.s.links]; }
  async saveLink(l) {
    if (!l.id) { const n = { ...l, id: uid(), owner_id: DEMO_T, code: newCode(), active: true, created_at: now() }; this.s.links.push(n); this._save(); return n; }
    const i = this.s.links.findIndex((x) => x.id === l.id); this.s.links[i] = { ...this.s.links[i], ...l }; this._save(); return this.s.links[i];
  }
  async deleteLink(id) { this.s.links = this.s.links.filter((l) => l.id !== id); this._save(); }
  async listTeachers() { return [...this.s.teachers]; }
  async updateTeacher() {}
  async getSetting(k) { return this.s.settings?.[k] || ''; }
  async saveSetting(k, v) { (this.s.settings ||= {})[k] = v; this._save(); }
  async resetDemo() { memStore = seed(); this._save(); }
  async storageUsage() {
    let total = 0, files = 0;
    for (const a of this.s.artworks) for (const p of [a.image_path, a.thumb_path, a.model_path, ...(a.photo_paths || [])]) if (p?.startsWith('idb:')) { const b = await idbGet(p.slice(4)); if (b) { total += b.size; files++; } }
    return { total_bytes: total, my_bytes: total, files };
  }
  async backupData() { return { galleries: this.s.galleries, halls: this.s.halls, artworks: this.s.artworks, reactions: this.s.reactions, students: this.s.students }; }
  async setThumb(a, blob) { const p = await this._store(blob); await this.updateArtwork({ id: a.id, thumb_path: p }); return p; }
  // ---- 媒體 ----
  _cache = new Map();
  async mediaUrl(p) {
    if (!p) return '';
    if (this._cache.has(p)) return this._cache.get(p);
    let url = '';
    if (p.startsWith('gen:')) url = drawSampleArt(Number(p.slice(4)));
    else if (p.startsWith('genview:')) { const [, s, i] = p.split(':'); const { renderSampleViews } = await import('./sample-model.js?v=20261113c'); const views = renderSampleViews(Number(s)); views.forEach((v, j) => this._cache.set(`genview:${s}:${j}`, v)); url = views[Number(i)]; }
    else if (p.startsWith('idb:')) { const b = await idbGet(p.slice(4)); url = b ? URL.createObjectURL(b) : drawSampleArt(1); }
    else url = p;
    this._cache.set(p, url); return url;
  }
  async loadModel(p) {
    if (p.startsWith('genmodel:')) { const { buildSampleModel } = await import('./sample-model.js?v=20261113c'); return { object: buildSampleModel(Number(p.slice(9))) }; }
    const b = await idbGet(p.slice(4)); if (!b) throw new Error('搵唔到模型檔'); return { buffer: await b.arrayBuffer() };
  }
}

// ================= 雲端模式（Supabase） =================
class CloudBackend {
  mode = 'cloud';
  async init() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/.test(SUPABASE_URL)) throw new Error('js/config.js 入面嘅 SUPABASE_URL 唔啱，應該係 https://xxxx.supabase.co（Supabase 嘅 Project URL），唔係 GitHub 網址');
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
    await this.sb.auth.getSession();
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
  }
  _chk({ data, error }) { if (error) throw error; return data; }
  async _rpc(fn, args) { return this._chk(await this.sb.rpc(fn, args)); }
  // ---- 學生（經連結，全部用 RPC）----
  async getLink(code) { return this._rpc('link_info', { p_code: code }); }
  async linkGalleries(code) { return (await this._rpc('link_galleries', { p_code: code })) || []; }
  async linkGalleryFull(code, gid) { return this._rpc('link_gallery', { p_code: code, p_gallery: gid }); }
  async linkReactions(code, ids) { return ids.length ? (await this._rpc('link_reactions', { p_code: code, p_ids: ids })) || [] : []; }
  async linkAddReaction(code, r) {
    const { data, error } = await this.sb.rpc('link_add_reaction', { p_code: code, p_artwork: r.artwork_id, p_sticker: r.sticker, p_phrase: r.phrase, p_from_class: r.from_class, p_from_no: String(r.from_no), p_from_name: r.from_name });
    if (error) { if (error.code === '23505') throw new DuplicateError(); throw error; } return data;
  }
  async linkLookupStudent(code, cls, no) { return this._rpc('link_lookup_student', { p_code: code, p_class: cls, p_no: Number(no) }); }
  async linkClasses(code) { return (await this._rpc('link_classes', { p_code: code })) || []; }
  // ---- 老師 ----
  async getTeacher() {
    const { data } = await this.sb.auth.getUser(); if (!data?.user) return null;
    const { data: t } = await this.sb.from('teachers').select('*').eq('id', data.user.id).maybeSingle();
    return t ? t : { id: data.user.id, email: data.user.email, approved: false, pending: true };
  }
  async signInGoogle() {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw error;
  }
  async signInEmail(email, password) { const { error } = await this.sb.auth.signInWithPassword({ email, password }); if (error) throw error; return this.getTeacher(); }
  async signOut() { await this.sb.auth.signOut(); }
  async listGalleries() {
    const gs = this._chk(await this.sb.from('galleries').select('*, halls(*, artworks(count)), teachers(name)').order('sort').order('created_at', { ascending: false }));
    gs.forEach((g) => { g.halls.sort((a, b) => a.sort - b.sort); g.halls.forEach((h) => { h.count = h.artworks?.[0]?.count || 0; delete h.artworks; }); });
    return gs;
  }
  async getGalleryFull(id) {
    const gallery = this._chk(await this.sb.from('galleries').select('*').eq('id', id).maybeSingle()); if (!gallery) return null;
    const halls = this._chk(await this.sb.from('halls').select('*').eq('gallery_id', id).order('sort'));
    const artworks = halls.length ? this._chk(await this.sb.from('artworks').select('*').in('hall_id', halls.map((h) => h.id)).order('sort').order('created_at')) : [];
    return { gallery, halls, artworks };
  }
  async listReactions(ids) { const out = []; for (let i = 0; i < ids.length; i += 100) out.push(...this._chk(await this.sb.from('reactions').select('*').in('artwork_id', ids.slice(i, i + 100)))); return out; }
  async addReaction(r) { const { data, error } = await this.sb.from('reactions').insert(r).select().single(); if (error) { if (error.code === '23505') throw new DuplicateError(); throw error; } return data; }
  async deleteReaction(id) { this._chk(await this.sb.from('reactions').delete().eq('id', id)); }
  async listRecentReactions(limit = 200) { return this._chk(await this.sb.from('reactions').select('*, artworks(student_class,student_no,student_name,title)').order('created_at', { ascending: false }).limit(limit)); }
  async listStudents() { return this._chk(await this.sb.from('students').select('*').order('class_name').order('number')); }
  async replaceClassRoster(cls, rows) {
    const me = (await this.sb.auth.getUser()).data.user.id;
    this._chk(await this.sb.from('students').delete().eq('owner_id', me).eq('class_name', cls));
    if (rows.length) this._chk(await this.sb.from('students').insert(rows.map((r) => ({ owner_id: me, class_name: cls, number: r.number, name: r.name }))));
  }
  async saveGallery(g) {
    const { halls, teachers, ...row } = g;
    const res = await this.sb.from('galleries').upsert(row).select().single();
    if (res.error && isMissingColumn(res.error)) throw new Error('資料庫要先更新：請喺 Supabase 嘅 SQL Editor 執行 supabase/update-2.sql，然後再儲存');
    return this._chk(res);
  }
  async _removePaths(arts) { const ps = arts.flatMap((a) => [a.image_path, a.thumb_path, a.model_path, ...(a.photo_paths || [])]).filter(Boolean); for (let i = 0; i < ps.length; i += 100) await this.sb.storage.from('artworks').remove(ps.slice(i, i + 100)); }
  async deleteGallery(id) { const f = await this.getGalleryFull(id); await this._removePaths(f?.artworks || []); this._chk(await this.sb.from('galleries').delete().eq('id', id)); }
  async saveHall(h) { return this._chk(await this.sb.from('halls').upsert(h).select().single()); }
  async deleteHall(id) { await this._removePaths(this._chk(await this.sb.from('artworks').select('*').eq('hall_id', id))); this._chk(await this.sb.from('halls').delete().eq('id', id)); }
  async _upload(blob, hallId, ext, type) {
    const me = (await this.sb.auth.getUser()).data.user.id;
    const path = `${me}/${hallId}/${uid()}.${ext}`;
    const up = await this.sb.storage.from('artworks').upload(path, blob, { contentType: type }); if (up.error) throw up.error; return path;
  }
  async addArtwork({ kind, files, cover }, meta) {
    const row = { ...meta, kind, photo_paths: [], model_path: null };
    if (kind === 'flat') { row.image_path = await this._upload(await resizeImage(files[0]), meta.hall_id, 'jpg', 'image/jpeg'); row.thumb_path = await this._upload(await resizeImage(files[0], 800), meta.hall_id, 'jpg', 'image/jpeg'); }
    else if (kind === 'photos') { for (const f of files) row.photo_paths.push(await this._upload(await resizeImage(f, 1600), meta.hall_id, 'jpg', 'image/jpeg')); row.image_path = row.photo_paths[0]; }
    else { row.model_path = await this._upload(files[0], meta.hall_id, 'glb', 'model/gltf-binary'); row.image_path = cover ? await this._upload(await resizeImage(cover, 1200), meta.hall_id, 'jpg', 'image/jpeg') : null; }
    let res = await this.sb.from('artworks').insert(row).select().single();
    if (res.error && isMissingColumn(res.error) && row.thumb_path) { // 資料庫未更新：唔用預覽圖都照樣上載
      await this.sb.storage.from('artworks').remove([row.thumb_path]); const { thumb_path, ...rest } = row;
      res = await this.sb.from('artworks').insert(rest).select().single();
    }
    return this._chk(res);
  }
  async updateArtwork(a) { const { id, ...rest } = a; this._chk(await this.sb.from('artworks').update(rest).eq('id', id)); }
  async deleteArtwork(a) { await this._removePaths([a]); this._chk(await this.sb.from('artworks').delete().eq('id', a.id)); }
  async listLinks() { return this._chk(await this.sb.from('links').select('*').order('created_at')); }
  async storageUsage() {
    const { data, error } = await this.sb.rpc('storage_usage');
    if (error) { if (/storage_usage|function/i.test(error.message) || error.code === 'PGRST202') throw new Error('NEED_UPDATE_3'); throw error; }
    return data;
  }
  async _all(table, sel = '*') { const out = []; for (let i = 0; ; i += 1000) { const rows = this._chk(await this.sb.from(table).select(sel).range(i, i + 999)); out.push(...rows); if (rows.length < 1000) return out; } }
  async backupData() {
    const [galleries, halls, artworks, reactions, students] = await Promise.all(['galleries', 'halls', 'artworks', 'reactions', 'students'].map((t) => this._all(t)));
    return { galleries, halls, artworks, reactions, students };
  }
  async setThumb(a, blob) {
    const path = await this._upload(blob, a.hall_id, 'jpg', 'image/jpeg');
    const { error } = await this.sb.from('artworks').update({ thumb_path: path }).eq('id', a.id);
    if (error) { await this.sb.storage.from('artworks').remove([path]); if (isMissingColumn(error)) throw new Error('資料庫要先更新：請喺 Supabase 嘅 SQL Editor 執行 supabase/update-2.sql'); throw error; }
    return path;
  }
  async saveLink(l) {
    if (l.id) { const { id, ...rest } = l; return this._chk(await this.sb.from('links').update(rest).eq('id', id).select().single()); }
    return this._chk(await this.sb.from('links').insert({ ...l, code: newCode(), active: true }).select().single());
  }
  async deleteLink(id) { this._chk(await this.sb.from('links').delete().eq('id', id)); }
  async listTeachers() { return this._chk(await this.sb.from('teachers').select('*').order('created_at')); }
  async updateTeacher(id, patch) { this._chk(await this.sb.from('teachers').update(patch).eq('id', id)); }
  async getSetting(k) { const r = this._chk(await this.sb.from('settings').select('value').eq('key', k).maybeSingle()); return r?.value || ''; }
  async saveSetting(k, v) { this._chk(await this.sb.from('settings').upsert({ key: k, value: v })); }
  // ---- 媒體 ----
  async mediaUrl(p) { return p ? this.sb.storage.from('artworks').getPublicUrl(p).data.publicUrl : ''; }
  async loadModel(p) { const r = await fetch(await this.mediaUrl(p)); if (!r.ok) throw new Error('下載模型失敗'); return { buffer: await r.arrayBuffer() }; }
}

export const db = (SUPABASE_URL && SUPABASE_ANON_KEY) ? new CloudBackend() : new DemoBackend();
