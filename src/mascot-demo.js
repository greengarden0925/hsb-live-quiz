// 吉祥物預覽頁：不用開場次就能看每一題的裝扮與特效
import { createMascot, TIERS } from './mascot.js';

const m = createMascot(document.getElementById('mascot'), document.getElementById('mascot-bubble'));
const n = TIERS.length;
const btns = [
  ['等候室', () => m.set('lobby')],
  ...TIERS.map((t, i) => [`第 ${i + 1} 題｜${t.name}`, () => m.set('question', { i, n })]),
  ['倒數緊張', () => m.setTension(true)],
  ['公布：答對 85%', () => m.set('reveal', { rate: 0.85 })],
  ['公布：答對 55%', () => m.set('reveal', { rate: 0.55 })],
  ['公布：答對 20%', () => m.set('reveal', { rate: 0.2 })],
  ['排行榜', () => m.set('board')],
  ['最終頒獎', () => m.set('final')],
];
const box = document.getElementById('demo-btns');
btns.forEach(([label, fn], k) => {
  const b = document.createElement('button');
  b.textContent = label; b.dataset.k = k;
  b.onclick = fn;
  box.appendChild(b);
});
m.set('lobby');
window.__mascot = m;
