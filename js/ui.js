export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

export function confirmBox(msg, yes = '確定') {
  return new Promise((res) => {
    const d = $('#dialog'); $('#dialog-msg').textContent = msg; $('#dialog-yes').textContent = yes; d.classList.remove('hidden');
    const done = (v) => { d.classList.add('hidden'); $('#dialog-yes').onclick = $('#dialog-no').onclick = null; res(v); };
    $('#dialog-yes').onclick = () => done(true); $('#dialog-no').onclick = () => done(false);
  });
}

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return store._m[k] ?? null; } },
  set(k, v) { store._m[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  _m: {},
};

export function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
}

export function personLabel(cls, no, name) {
  if (cls === '老師') return name || no;
  return `${cls || ''} ${no ? no + '號 ' : ''}${name || ''}`.trim();
}
