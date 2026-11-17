// 手刻 SVG 小圖表：單色長條、散佈圖（含四象限），共用一個 hover 提示框
const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

let tip;
function tooltip() {
  if (!tip) { tip = document.createElement('div'); tip.className = 'viz-tip'; tip.hidden = true; document.body.appendChild(tip); }
  return tip;
}
function bindTip(el, html) {
  el.addEventListener('mousemove', (e) => {
    const t = tooltip(); t.innerHTML = html; t.hidden = false;
    const w = t.offsetWidth;
    t.style.left = `${Math.min(window.innerWidth - w - 8, e.clientX + 14)}px`;
    t.style.top = `${e.clientY + 14}px`;
  });
  el.addEventListener('mouseleave', () => { tooltip().hidden = true; });
}

// data: [{label, value(0–1), tip}]；直條、0–100% 軸
export function barChart(el, data, { height = 240, threshold = null } = {}) {
  const W = Math.max(360, el.clientWidth || 720), H = height, L = 44, R = 12, T = 12, B = 34;
  const iw = W - L - R, ih = H - T - B, n = data.length || 1;
  const bw = Math.min(42, (iw / n) * 0.62), gap = iw / n;
  const y = (v) => T + ih - v * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="長條圖">`;
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" class="${g === 0 ? 'viz-base' : 'viz-grid'}"/>`;
    s += `<text x="${L - 6}" y="${y(g) + 4}" class="viz-tick" text-anchor="end">${g * 100}%</text>`;
  }
  if (threshold != null) s += `<line x1="${L}" x2="${W - R}" y1="${y(threshold)}" y2="${y(threshold)}" class="viz-ref"/><text x="${W - R}" y="${y(threshold) - 4}" class="viz-tick" text-anchor="end">${threshold * 100}%</text>`;
  data.forEach((d, i) => {
    const cx = L + gap * i + gap / 2, v = d.value ?? 0, top = y(v), h = Math.max(0, T + ih - top);
    const r = Math.min(4, h);
    // 上緣圓角、底部貼齊基線
    s += `<path class="viz-bar" data-i="${i}" d="M${cx - bw / 2},${T + ih} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${T + ih} Z"/>`;
    s += `<rect class="viz-hit" data-i="${i}" x="${cx - gap / 2}" y="${T}" width="${gap}" height="${ih}"/>`;
    s += `<text x="${cx}" y="${H - 12}" class="viz-tick" text-anchor="middle">${esc(d.label)}</text>`;
  });
  s += '</svg>';
  el.innerHTML = s;
  el.querySelectorAll('.viz-hit').forEach((h) => {
    const d = data[h.dataset.i];
    bindTip(h, d.tip || `<b>${esc(d.label)}</b><br>${pct(d.value)}`);
    h.addEventListener('mouseenter', () => el.querySelector(`.viz-bar[data-i="${h.dataset.i}"]`).classList.add('on'));
    h.addEventListener('mouseleave', () => el.querySelector(`.viz-bar[data-i="${h.dataset.i}"]`).classList.remove('on'));
  });
}

// points: [{x, y(0–1), label, tip}]；cut: {x, y} 畫中位數十字線與四象限名稱
export function scatter(el, points, { xLabel = '', yLabel = '', cut = null, quadrants = null, height = 320 } = {}) {
  const W = Math.max(360, el.clientWidth || 720), H = height, L = 48, R = 16, T = 16, B = 40;
  const iw = W - L - R, ih = H - T - B;
  const xmax = Math.max(1, ...points.map((p) => p.x)) * 1.08;
  const X = (v) => L + (v / xmax) * iw, Y = (v) => T + ih - v * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="散佈圖">`;
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}" class="${g === 0 ? 'viz-base' : 'viz-grid'}"/><text x="${L - 6}" y="${Y(g) + 4}" class="viz-tick" text-anchor="end">${g * 100}%</text>`;
  }
  const step = xmax > 20 ? 5 : xmax > 8 ? 2 : 1;
  for (let v = 0; v <= xmax; v += step) s += `<text x="${X(v)}" y="${T + ih + 16}" class="viz-tick" text-anchor="middle">${v}</text>`;
  s += `<text x="${L + iw / 2}" y="${H - 4}" class="viz-axis" text-anchor="middle">${esc(xLabel)}</text>`;
  s += `<text x="12" y="${T + ih / 2}" class="viz-axis" text-anchor="middle" transform="rotate(-90 12 ${T + ih / 2})">${esc(yLabel)}</text>`;
  if (cut) {
    s += `<line x1="${X(cut.x)}" x2="${X(cut.x)}" y1="${T}" y2="${T + ih}" class="viz-ref"/><line x1="${L}" x2="${W - R}" y1="${Y(cut.y)}" y2="${Y(cut.y)}" class="viz-ref"/>`;
    if (quadrants) {
      const q = quadrants; // [左上, 右上, 左下, 右下]
      s += `<text x="${L + 6}" y="${T + 14}" class="viz-quad">${esc(q[0])}</text><text x="${W - R - 6}" y="${T + 14}" class="viz-quad" text-anchor="end">${esc(q[1])}</text>`;
      s += `<text x="${L + 6}" y="${T + ih - 6}" class="viz-quad">${esc(q[2])}</text><text x="${W - R - 6}" y="${T + ih - 6}" class="viz-quad" text-anchor="end">${esc(q[3])}</text>`;
    }
  }
  points.forEach((p, i) => { s += `<circle class="viz-dot" data-i="${i}" cx="${X(p.x)}" cy="${Y(p.y)}" r="5"/>`; });
  s += '</svg>';
  el.innerHTML = s;
  el.querySelectorAll('.viz-dot').forEach((c) => {
    const p = points[c.dataset.i];
    bindTip(c, p.tip || `<b>${esc(p.label)}</b>`);
  });
}

// 選項分布小長條（表格內用）：正解藍色、其他灰色，並標 ✓
export function optionBars(counts, answer) {
  const max = Math.max(1, ...counts);
  return `<div class="optbars">${counts.map((c, i) => `<div class="optbar"><span class="optlbl">${'ABCD'[i]}${i === answer ? '✓' : ''}</span><span class="optfill ${i === answer ? 'ok' : ''}" style="width:${Math.round((c / max) * 100)}%"></span><span class="optn">${c}</span></div>`).join('')}</div>`;
}
