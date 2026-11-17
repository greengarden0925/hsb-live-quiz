export const $ = (sel) => document.querySelector(sel);
export function show(id) {
  document.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.id !== id; });
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const LABELS = ['A', 'B', 'C', 'D'];
export const SHAPES = ['▲', '◆', '●', '■'];
export function choiceButtonsHtml(options, { disabled = false } = {}) {
  return options.map((o, i) => `<button class="choice c${i}" data-i="${i}" ${disabled ? 'disabled' : ''}><span class="shape">${SHAPES[i]}</span><span class="lbl">${LABELS[i]}</span><span class="txt">${esc(o)}</span></button>`).join('');
}
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
export function localDateTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
