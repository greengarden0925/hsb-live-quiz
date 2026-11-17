// 吉祥物「熊熊助教」：用 three.js 基本幾何體組成的原創 Q 版台灣黑熊。
// 只在老師端（投影）顯示。對外只有 createMascot(container, bubbleEl) → { set(scene, opts), setTension(on), dispose() }。
import * as THREE from 'three';

// ---------- 每題的裝扮／動作／特效（越後面越進階） ----------
// 題數不同時依進度挑關卡，最後一題一定是最高級。
export const TIERS = [
  { name: '揮手打招呼', outfit: [], action: 'wave', fx: 'sparkle', line: '第一題，暖身一下！' },
  { name: '黑框眼鏡', outfit: ['glasses'], action: 'think', fx: 'question', line: '嗯…仔細讀題喔' },
  { name: '口罩防疫', outfit: ['mask'], action: 'hop', fx: 'hearts', line: '公衛人，戴好口罩！' },
  { name: '醫師頭鏡', outfit: ['headMirror'], action: 'sway', fx: 'notes', line: '看診中…選哪個呢？' },
  { name: '學士帽', outfit: ['gradCap'], action: 'nod', fx: 'ribbons', line: '國考重點來了！' },
  { name: '英雄披風', outfit: ['cape'], action: 'fly', fx: 'wind', line: '衝啊！一起飛！' },
  { name: '酷墨鏡', outfit: ['sunglasses', 'cape'], action: 'spin', fx: 'confetti', line: '這題很酷，你會的' },
  { name: '彩虹圍巾', outfit: ['scarf', 'sunglasses'], action: 'flip', fx: 'rainbow', line: '後空翻！再加把勁！' },
  { name: '王冠', outfit: ['crown', 'scarf', 'cape'], action: 'dance', fx: 'fireworks', line: '接近終點，衝刺！' },
  { name: '黃金熊熊', outfit: ['crown', 'halo', 'cape', 'gold'], action: 'dance', fx: 'goldStorm', line: '最終題！全力以赴！' },
];
export function tierFor(i, n) {
  if (n <= 1) return TIERS.length - 1;
  return Math.round((i / (n - 1)) * (TIERS.length - 1));
}

// ---------- 材質 ----------
function toonGradient() {
  const data = new Uint8Array([120, 190, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const GRAD = toonGradient();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...extra });

// ---------- 粒子貼圖（canvas 自繪，不用外部圖） ----------
function makeTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function starPath(g, cx, cy, r1, r2, n = 5) {
  g.beginPath();
  for (let k = 0; k < n * 2; k++) {
    const r = k % 2 ? r2 : r1, a = (Math.PI * k) / n - Math.PI / 2;
    g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  g.closePath();
}
const TEX = {
  star: makeTexture((g) => { g.fillStyle = '#fff'; starPath(g, 32, 32, 30, 12); g.fill(); }),
  sparkle: makeTexture((g) => { g.fillStyle = '#fff'; starPath(g, 32, 32, 31, 5, 4); g.fill(); }),
  heart: makeTexture((g) => {
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 56);
    g.bezierCurveTo(2, 36, 6, 6, 32, 20); g.bezierCurveTo(58, 6, 62, 36, 32, 56); g.fill();
  }),
  dot: makeTexture((g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, '#fff'); r.addColorStop(0.4, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }),
  square: makeTexture((g) => { g.fillStyle = '#fff'; g.fillRect(14, 22, 36, 20); }),
  question: makeTexture((g) => { g.fillStyle = '#fff'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 32, 36); }),
  note: makeTexture((g) => { g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♪', 32, 36); }),
  streak: makeTexture((g) => {
    const l = g.createLinearGradient(0, 0, 64, 0);
    l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(0.5, '#fff'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.fillRect(0, 28, 64, 8);
  }),
  drop: makeTexture((g) => {
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(52, 34, 50, 58, 32, 58); g.bezierCurveTo(14, 58, 12, 34, 32, 6); g.fill();
  }),
};
const PALETTE = [0xff5d73, 0x4cc9f0, 0xffd166, 0x06d6a0, 0xb388ff, 0xff9f1c];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- 熊本體 ----------
// 依「台灣黑熊 Mascot 轉面圖」重建：圓胖梨形身體、寬圓頭、米色粗 V 字、
// 白眼珠＋大黑瞳（兩顆高光）、粉腮紅、棕褐口鼻＋微笑、棕褐耳內／掌心／腳掌、背後小圓尾。
export const BEAR_COLORS = { BLACK: 0x1f1f27, TAN: 0xd7a87a, CREAM: 0xfff4de, PINK: 0xe07b94, WHITE: 0xffffff };
export function buildBear() {
  const { BLACK, TAN, CREAM, PINK } = BEAR_COLORS;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const bodyMat = toon(BLACK, { emissive: 0x12121a });
  const tanMat = toon(TAN);
  const ell = (mat, rx, ry, rz, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat);
    m.scale.set(rx, ry, rz); m.position.set(x, y, z); parent.add(m); return m;
  };

  // 軀幹：上身 + 較寬的下腹（梨形），在 y=0 著地
  const BELLY = { rx: 1.0, ry: 0.72, rz: 0.96, cy: 0.72 };
  const UPPER = { rx: 0.84, ry: 0.96, rz: 0.84, cy: 1.1 };
  const torso = ell(bodyMat, UPPER.rx, UPPER.ry, UPPER.rz, 0, UPPER.cy, 0, body);
  ell(bodyMat, BELLY.rx, BELLY.ry, BELLY.rz, 0, BELLY.cy, 0, body);
  // 取軀幹表面的 z，讓 V 字貼著肚子
  const surfZ = (x, y) => {
    const f = (E) => { const v = 1 - (x / E.rx) ** 2 - ((y - E.cy) / E.ry) ** 2; return v > 0 ? E.rz * Math.sqrt(v) : 0; };
    return Math.max(f(UPPER), f(BELLY));
  };

  // 胸前米色 V 字：粗、兩端圓、尖端略圓
  const pts = [];
  for (let k = 0; k <= 28; k++) {
    const x = -0.43 + (0.86 * k) / 28;
    const y = 0.78 + 1.3 * (Math.sqrt(x * x + 0.018) - Math.sqrt(0.018));
    pts.push(new THREE.Vector3(x, y + 0.02, surfZ(x, y) + 0.01));
  }
  const vMat = toon(CREAM);
  const chestV = new THREE.Group();
  chestV.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 56, 0.095, 14, false), vMat));
  for (const p of [pts[0], pts[pts.length - 1]]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), vMat); cap.position.copy(p); chestV.add(cap);
  }
  body.add(chestV);

  // 小圓尾
  ell(bodyMat, 0.2, 0.2, 0.18, 0, 0.62, -0.93, body);

  // 頭：寬圓、略扁
  const head = new THREE.Group(); head.position.y = 2.08; body.add(head);
  ell(bodyMat, 0.84, 0.74, 0.78, 0, 0, 0, head);
  for (const s of [-1, 1]) {
    const ear = ell(bodyMat, 0.27, 0.27, 0.17, 0.6 * s, 0.58, -0.04, head); ear.rotation.z = -0.25 * s;
    const inner = ell(tanMat, 0.15, 0.15, 0.06, 0.6 * s, 0.57, 0.1, head); inner.rotation.z = -0.25 * s;
  }
  // 棕褐口鼻（略突出）、黑鼻、微笑
  ell(tanMat, 0.44, 0.36, 0.34, 0, -0.24, 0.6, head);
  const nose = ell(toon(0x14141a), 0.12, 0.085, 0.08, 0, -0.07, 0.93, head);
  nose.rotation.x = -0.1;
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 24, Math.PI), toon(0x4a2a1a));
  mouth.position.set(0, -0.3, 0.945); mouth.rotation.z = Math.PI; head.add(mouth);
  // 眼睛：白眼珠＋大黑瞳＋兩顆高光；粉腮紅
  const eyes = [];
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(0.32 * s, 0.1, 0.69); eye.rotation.y = 0.28 * s; head.add(eye);
    ell(toon(0xffffff), 0.15, 0.15, 0.07, 0, 0, 0, eye);
    ell(toon(0x050507), 0.1, 0.105, 0.06, 0, -0.005, 0.03, eye);
    const g1 = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), glintMat); g1.position.set(0.035, 0.045, 0.085); eye.add(g1);
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), glintMat); g2.position.set(-0.04, -0.04, 0.085); eye.add(g2);
    eyes.push(eye);
    const blush = ell(toon(PINK), 0.15, 0.115, 0.04, 0.585 * s, -0.12, 0.535, head); blush.rotation.y = 0.74 * s;
  }

  // 四肢（以關節為軸心；手臂短胖，掌心棕褐）
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(0.78 * s, 1.4, 0.04); body.add(sh);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.28, 10, 20), bodyMat); a.position.y = -0.3; sh.add(a);
    const paw = ell(tanMat, 0.15, 0.15, 0.08, 0, -0.5, 0.2, sh); paw.rotation.x = -0.2;
    return sh;
  });
  // 腿＋圓腳，腳尖前有棕褐腳掌
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group(); hip.position.set(0.52 * s, 0.5, 0.14); body.add(hip);
    ell(bodyMat, 0.33, 0.2, 0.42, 0, -0.3, 0.2, hip);
    ell(tanMat, 0.2, 0.14, 0.05, 0, -0.27, 0.6, hip);
    return hip;
  });

  return { root, body, head, torso, eyes, arms, legs, bodyMat };
}

// ---------- 配件 ----------
function buildOutfits(bear) {
  const o = {};
  const gold = toon(0xffc93c, { emissive: 0x6b4a00 });
  // 黑框眼鏡
  o.glasses = new THREE.Group();
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 10, 28), toon(0xff6b6b));
    ring.position.set(0.3 * s, 0.12, 0.8); o.glasses.add(ring);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), toon(0xff6b6b));
  bridge.rotation.z = Math.PI / 2; bridge.position.set(0, 0.15, 0.84); o.glasses.add(bridge);
  // 口罩
  o.mask = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), toon(0x9fd8f5));
  cloth.scale.set(1.3, 0.9, 0.95); cloth.position.set(0, -0.24, 0.7); o.mask.add(cloth);
  for (const dy of [-0.08, 0.04]) {
    const fold = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.012, 6, 30, Math.PI * 0.7), toon(0x6fb7e0));
    fold.position.set(0, -0.16 + dy, 0.68); fold.rotation.set(0, 0, Math.PI * 1.15); fold.scale.set(1.1, 0.25, 1); o.mask.add(fold);
  }
  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 20, Math.PI), toon(0xffffff));
    strap.position.set(0.55 * s, 0, 0.35); strap.rotation.y = (Math.PI / 2) * s; o.mask.add(strap);
  }
  // 醫師頭鏡
  o.headMirror = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.045, 8, 40), toon(0x333a44));
  band.rotation.x = Math.PI / 2 - 0.25; band.position.y = 0.35; o.headMirror.add(band);
  const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 28), toon(0xdfe6ee, { emissive: 0x334455 }));
  mirror.rotation.x = Math.PI / 2 - 0.3; mirror.position.set(0, 0.55, 0.72); o.headMirror.add(mirror);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), toon(0x111111)); hole.position.set(0, 0.555, 0.745); hole.rotation.x = -0.3; o.headMirror.add(hole);
  // 學士帽
  o.gradCap = new THREE.Group();
  const capBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.28, 24), toon(0x1b1f3b)); capBase.position.y = 0.72; o.gradCap.add(capBase);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.06, 1.35), toon(0x1b1f3b)); board.position.y = 0.88; board.rotation.y = Math.PI / 4; o.gradCap.add(board);
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.45, 8), gold); tassel.position.set(0.62, 0.66, 0.2); o.gradCap.add(tassel);
  // 披風（掛在身體上，會飄動）
  const capeGeo = new THREE.PlaneGeometry(2.2, 1.9, 12, 12);
  o.cape = new THREE.Mesh(capeGeo, toon(0xe63946, { side: THREE.DoubleSide }));
  o.cape.position.set(0, 0.9, -0.97); o.cape.userData.base = capeGeo.attributes.position.array.slice();
  o.capeOnBody = true;
  // 墨鏡
  o.sunglasses = new THREE.Group();
  // 彩色墨鏡：桃紅鏡片＋金色鏡框（避免黑色鏡片在黑熊臉上看不見）
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.05, 24), toon(0xff4fa3, { emissive: 0x7a1048, emissiveIntensity: 0.6 }));
    lens.rotation.x = Math.PI / 2; lens.position.set(0.3 * s, 0.13, 0.8); lens.scale.set(1.2, 1, 0.85); o.sunglasses.add(lens);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 28), toon(0xffc93c, { emissive: 0x6b4a00 }));
    rim.position.set(0.3 * s, 0.13, 0.82); rim.scale.set(1.2, 0.85, 1); o.sunglasses.add(rim);
    const shine = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    shine.position.set(0.3 * s - 0.08, 0.19, 0.835); o.sunglasses.add(shine);
  }
  const sbar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), toon(0xffc93c, { emissive: 0x6b4a00 })); sbar.position.set(0, 0.24, 0.82); o.sunglasses.add(sbar);
  // 彩虹圍巾
  o.scarf = new THREE.Group();
  PALETTE.slice(0, 4).forEach((c, k) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.075, 10, 40), toon(c));
    ring.rotation.x = Math.PI / 2; ring.scale.set(1, 0.92, 1); ring.position.y = 1.5 - k * 0.07; o.scarf.add(ring);
  });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.08), toon(PALETTE[0])); tail.position.set(0.4, 1.1, 0.8); tail.rotation.z = 0.2; o.scarf.add(tail);
  o.scarfOnBody = true;
  // 王冠
  o.crown = new THREE.Group();
  const cband = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.42, 0.25, 28, 1, true), new THREE.MeshToonMaterial({ color: 0xffc93c, emissive: 0x6b4a00, gradientMap: GRAD, side: THREE.DoubleSide }));
  cband.position.y = 0.82; o.crown.add(cband);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 8), gold);
    spike.position.set(Math.sin(a) * 0.44, 1.05, Math.cos(a) * 0.44); o.crown.add(spike);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), toon(PALETTE[k], { emissive: PALETTE[k], emissiveIntensity: 0.4 }));
    gem.position.set(Math.sin(a) * 0.46, 0.82, Math.cos(a) * 0.46); o.crown.add(gem);
  }
  // 光環
  o.halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 10, 40), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  o.halo.rotation.x = Math.PI / 2; o.halo.position.y = 1.35;

  const onBody = new Set(['cape', 'scarf']);
  for (const [k, v] of Object.entries(o)) {
    if (!(v instanceof THREE.Object3D)) continue;
    v.visible = false;
    (onBody.has(k) ? bear.body : bear.head).add(v);
  }
  return o;
}

// ---------- 粒子系統 ----------
class Particles {
  constructor(scene, max = 260) {
    this.scene = scene; this.list = [];
    this.max = max;
  }
  spawn({ tex = 'star', color = pick(PALETTE), pos, vel, life = 1.6, size = 0.3, gravity = 0, spin = 0, fade = true, grow = 0 }) {
    if (this.list.length >= this.max) this.kill(this.list[0]);
    const m = new THREE.SpriteMaterial({ map: TEX[tex], color, transparent: true, depthWrite: false, blending: tex === 'dot' ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(m);
    s.position.copy(pos); s.scale.setScalar(size);
    this.scene.add(s);
    this.list.push({ s, vel, life, age: 0, size, gravity, spin, fade, grow });
  }
  kill(p) { this.scene.remove(p.s); p.s.material.dispose(); this.list.splice(this.list.indexOf(p), 1); }
  update(dt) {
    for (const p of [...this.list]) {
      p.age += dt;
      if (p.age >= p.life) { this.kill(p); continue; }
      p.vel.y -= p.gravity * dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.s.material.rotation += p.spin * dt;
      const k = p.age / p.life;
      if (p.fade) p.s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (p.grow) p.s.scale.setScalar(p.size * (1 + p.grow * k));
    }
  }
  clear() { [...this.list].forEach((p) => this.kill(p)); }
}
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);

// 每種特效：每幀呼叫一次，rate 依強度（0~1）調整
const FX = {
  none() {},
  sparkle(P, dt, s) { if (Math.random() < dt * 6 * s) P.spawn({ tex: 'sparkle', color: 0xfff3b0, pos: v3(rnd(-1.6, 1.6), rnd(0.4, 3.2), rnd(-0.3, 0.8)), vel: v3(0, 0.2, 0), life: 1, size: rnd(0.15, 0.3), spin: 2, grow: -0.6 }); },
  question(P, dt, s) { if (Math.random() < dt * 2.5 * s) P.spawn({ tex: 'question', color: pick([0x4cc9f0, 0xb388ff, 0xffd166]), pos: v3(rnd(0.6, 1.3), 2.9, 0.3), vel: v3(rnd(0.1, 0.4), 0.6, 0), life: 1.8, size: rnd(0.35, 0.5), spin: rnd(-1, 1) }); },
  hearts(P, dt, s) { if (Math.random() < dt * 5 * s) P.spawn({ tex: 'heart', color: pick([0xff5d73, 0xff8fa3, 0xff4d6d]), pos: v3(rnd(-1, 1), rnd(1.5, 2.5), 0.6), vel: v3(rnd(-0.3, 0.3), rnd(0.6, 1.1), 0), life: 2, size: rnd(0.25, 0.4) }); },
  notes(P, dt, s) { if (Math.random() < dt * 4 * s) P.spawn({ tex: 'note', color: pick(PALETTE), pos: v3(rnd(-1.4, 1.4), rnd(1.2, 2.8), 0.4), vel: v3(rnd(-0.5, 0.5), rnd(0.4, 0.8), 0), life: 2, size: rnd(0.3, 0.45), spin: rnd(-2, 2) }); },
  ribbons(P, dt, s) { if (Math.random() < dt * 10 * s) P.spawn({ tex: 'square', color: pick(PALETTE), pos: v3(rnd(-2, 2), 3.8, rnd(-0.5, 0.8)), vel: v3(rnd(-0.3, 0.3), rnd(-0.9, -0.5), 0), life: 4, size: rnd(0.15, 0.25), spin: rnd(-6, 6) }); },
  wind(P, dt, s) {
    if (Math.random() < dt * 12 * s) P.spawn({ tex: 'streak', color: 0xffffff, pos: v3(rnd(-2.5, -1.5), rnd(0, 3.2), 0.5), vel: v3(rnd(3, 5), 0, 0), life: 0.9, size: rnd(0.5, 0.9) });
    FX.sparkle(P, dt, s);
  },
  confetti(P, dt, s) { if (Math.random() < dt * 24 * s) P.spawn({ tex: Math.random() < 0.5 ? 'square' : 'star', color: pick(PALETTE), pos: v3(rnd(-2.2, 2.2), 4, rnd(-0.5, 1)), vel: v3(rnd(-0.5, 0.5), rnd(-1.4, -0.6), 0), life: 4, size: rnd(0.15, 0.28), spin: rnd(-8, 8) }); },
  rainbow(P, dt, s, t) {
    if (Math.random() < dt * 30 * s) {
      const a = t * 4 + Math.random() * 0.3;
      P.spawn({ tex: 'dot', color: PALETTE[Math.floor(t * 8) % PALETTE.length], pos: v3(Math.cos(a) * 1.7, 1.5 + Math.sin(a) * 1.7, 0.2), vel: v3(0, 0, 0), life: 1.2, size: 0.45, grow: -0.7 });
    }
    FX.confetti(P, dt, s * 0.4);
  },
  fireworks(P, dt, s) {
    if (Math.random() < dt * 1.4 * s) burst(P, v3(rnd(-1.8, 1.8), rnd(2.6, 3.6), 0), 28);
    FX.sparkle(P, dt, s);
  },
  goldStorm(P, dt, s) {
    if (Math.random() < dt * 2.2 * s) burst(P, v3(rnd(-2, 2), rnd(2.4, 3.8), 0), 36, [0xffd166, 0xffe066, 0xffffff, 0xff9f1c]);
    if (Math.random() < dt * 16 * s) P.spawn({ tex: 'star', color: pick([0xffd166, 0xffe066, 0xfff3b0]), pos: v3(rnd(-2.2, 2.2), 4, rnd(-0.5, 1)), vel: v3(0, rnd(-1.2, -0.6), 0), life: 4, size: rnd(0.18, 0.32), spin: rnd(-4, 4) });
  },
  sweat(P, dt, s) { if (Math.random() < dt * 3 * s) P.spawn({ tex: 'drop', color: 0x7cc6ff, pos: v3(0.7, 2.5, 0.5), vel: v3(0.3, 0.4, 0), gravity: 2.5, life: 0.9, size: 0.22 }); },
};
function burst(P, at, n, colors = PALETTE) {
  const c = pick(colors);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, sp = rnd(1.4, 2.2);
    P.spawn({ tex: 'dot', color: Math.random() < 0.3 ? 0xffffff : c, pos: at.clone(), vel: v3(Math.cos(a) * sp, Math.sin(a) * sp, rnd(-0.3, 0.3)), gravity: 1.6, life: rnd(1, 1.5), size: rnd(0.2, 0.32) });
  }
}

// ---------- 動作：回傳目標姿勢 ----------
const BASE = { y: 0, ry: 0, rx: 0, rz: 0, hx: 0, hz: 0, aLx: 0, aLz: 0.25, aRx: 0, aRz: -0.25, lL: 0, lR: 0, sq: 1 };
const ACTIONS = {
  idle: (t) => ({ y: Math.sin(t * 2) * 0.04, hz: Math.sin(t * 1.3) * 0.06 }),
  wave: (t) => ({ y: Math.sin(t * 2) * 0.04, aRz: -2.5 + Math.sin(t * 9) * 0.45, hz: 0.12, aLz: 0.3 }),
  think: (t) => ({ hz: 0.22 + Math.sin(t * 1.5) * 0.05, hx: 0.1, aRx: -2.1, aRz: 0.55, y: Math.sin(t * 1.8) * 0.03, ry: Math.sin(t * 0.8) * 0.15 }),
  hop: (t) => { const h = Math.abs(Math.sin(t * 5)); return { y: h * 0.45, sq: 1 + (1 - h) * 0.08 - 0.04, aLz: 0.6 + h * 0.8, aRz: -0.6 - h * 0.8, lL: -h * 0.3, lR: -h * 0.3 }; },
  sway: (t) => ({ rz: Math.sin(t * 3.5) * 0.18, hz: -Math.sin(t * 3.5) * 0.15, aLz: 1 + Math.sin(t * 3.5) * 0.6, aRz: -1 + Math.sin(t * 3.5) * 0.6, y: Math.abs(Math.sin(t * 3.5)) * 0.1 }),
  nod: (t) => ({ hx: Math.max(0, Math.sin(t * 5)) * 0.35, aRx: -1.2, aRz: -0.5, aLx: -1.2, aLz: 0.5, y: Math.sin(t * 2.5) * 0.04 }),
  fly: (t) => ({ y: 0.55 + Math.sin(t * 2) * 0.2, rx: 0.25, rz: Math.sin(t * 1.2) * 0.12, aRz: -2.9, aRx: -0.4, aLz: 0.9, lL: 0.4, lR: 0.2 }),
  spin: (t) => ({ ry: t * 4, y: Math.abs(Math.sin(t * 4)) * 0.2, aLz: 1.6, aRz: -1.6 }),
  flip: (t) => { const c = (t % 2.4) / 2.4; const k = c < 0.45 ? c / 0.45 : 1; const jump = Math.sin(Math.min(1, c / 0.45) * Math.PI); return { rx: -k * Math.PI * 2, y: jump * 1.1, aLz: 2.4, aRz: -2.4, lL: -jump * 0.8, lR: -jump * 0.8 }; },
  dance: (t) => ({ y: Math.abs(Math.sin(t * 6)) * 0.3, ry: Math.sin(t * 3) * 0.5, rz: Math.sin(t * 6) * 0.1, aLz: 1.4 + Math.sin(t * 6) * 1.1, aRz: -1.4 + Math.sin(t * 6 + 1) * 1.1, lL: Math.sin(t * 6) * 0.4, lR: -Math.sin(t * 6) * 0.4, hz: Math.sin(t * 6) * 0.15 }),
  cheer: (t) => { const h = Math.abs(Math.sin(t * 6)); return { y: h * 0.6, aLz: 2.7, aRz: -2.7, aLx: Math.sin(t * 12) * 0.3, aRx: -Math.sin(t * 12) * 0.3, lL: -h * 0.4, lR: -h * 0.4 }; },
  clap: (t) => ({ aLz: -0.25 + Math.sin(t * 14) * 0.3, aRz: 0.25 - Math.sin(t * 14) * 0.3, aLx: -1.4, aRx: -1.4, y: Math.sin(t * 3) * 0.05, hz: Math.sin(t * 2) * 0.1 }),
  comfort: (t) => ({ hz: 0.25, hx: 0.15, aRx: -2.6, aRz: -0.2, aLz: 0.9 + Math.sin(t * 4) * 0.4, y: Math.sin(t * 2) * 0.03 }),
  nervous: (t) => ({ y: Math.sin(t * 2) * 0.03, rz: Math.sin(t * 40) * 0.04, aLx: -1, aLz: -0.2, aRx: -1, aRz: 0.2, hz: Math.sin(t * 20) * 0.05 }),
};

// ---------- 主程式 ----------
export function createMascot(container, bubbleEl) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    container.hidden = true; // 舊電腦沒有 WebGL 就不顯示，不影響搶答
    return { set() {}, setTension() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 1.9, 9.2); camera.lookAt(0, 1.6, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 6); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xb388ff, 1.2); rim.position.set(-4, 3, -3); scene.add(rim);

  // 地面陰影
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; scene.add(shadow);

  const bear = buildBear(); scene.add(bear.root);
  const outfits = buildOutfits(bear);
  const P = new Particles(scene);

  const state = { action: 'idle', fx: 'none', strength: 0.5, tension: false, burstOnce: null, gold: false };
  const pose = { ...BASE };

  function setOutfit(list) {
    for (const [k, v] of Object.entries(outfits)) if (v instanceof THREE.Object3D) v.visible = list.includes(k);
    state.gold = list.includes('gold');
    bear.bodyMat.color.set(state.gold ? 0x8a6a1a : BEAR_COLORS.BLACK);
    bear.bodyMat.emissive.set(state.gold ? 0x5a3f00 : 0x12121a);
  }

  let bubbleTimer = null;
  function say(text, ms = 3500) {
    if (!bubbleEl) return;
    bubbleEl.textContent = text;
    bubbleEl.classList.add('on');
    clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(() => bubbleEl.classList.remove('on'), ms);
  }

  let lastTier = 0;
  // scene：idle | lobby | question | reveal | board | final
  function set(name, opts = {}) {
    state.tension = false;
    if (name === 'idle') { setOutfit([]); state.action = 'idle'; state.fx = 'none'; say('', 1); return; }
    if (name === 'lobby') { setOutfit([]); state.action = 'wave'; state.fx = 'sparkle'; state.strength = 0.6; say('掃 QR code 進來玩吧！', 0); return; }
    if (name === 'question') {
      const tier = TIERS[tierFor(opts.i, opts.n)];
      lastTier = tierFor(opts.i, opts.n);
      setOutfit(tier.outfit); state.action = tier.action; state.fx = tier.fx;
      state.strength = 0.4 + 0.6 * (opts.n > 1 ? opts.i / (opts.n - 1) : 1);
      burst(P, v3(0, 2.4, 0.5), 20 + lastTier * 4);
      say(tier.line);
      return;
    }
    if (name === 'reveal') {
      const r = opts.rate;
      if (r == null) { state.action = 'idle'; state.fx = 'none'; say('沒有人作答…'); return; }
      const pct = Math.round(r * 100);
      if (r >= 0.7) { state.action = 'cheer'; state.fx = 'confetti'; state.strength = 1; burst(P, v3(0, 3, 0.5), 40); say(`全班答對 ${pct}%，太強了！`); }
      else if (r >= 0.4) { state.action = 'clap'; state.fx = 'sparkle'; state.strength = 0.8; say(`答對 ${pct}%，不錯喔！看一下詳解`); }
      else { state.action = 'comfort'; state.fx = 'none'; say(`答對 ${pct}%，這題是陷阱，記下來！`); }
      return;
    }
    if (name === 'board') { state.action = 'dance'; state.fx = 'notes'; state.strength = 0.8; say('看看誰領先！'); return; }
    if (name === 'final') {
      setOutfit(['crown', 'halo', 'cape', 'gold']); state.action = 'cheer'; state.fx = 'goldStorm'; state.strength = 1.2;
      for (let k = 0; k < 3; k++) burst(P, v3(rnd(-1.5, 1.5), rnd(2.5, 3.5), 0), 40);
      say('恭喜大家完成挑戰！', 0);
    }
  }
  function setTension(on) {
    if (on === state.tension) return;
    state.tension = on;
    if (on) say('快沒時間了！', 2000);
  }

  // 尺寸
  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let raf = 0, t = 0, prev = performance.now();
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now(); const dt = Math.min(0.05, (now - prev) / 1000); prev = now; t += dt;
    const act = state.tension ? 'nervous' : state.action;
    const target = { ...BASE, ...ACTIONS[act](t) };
    const k = 1 - Math.pow(0.0005, dt); // 平滑過渡
    for (const key of Object.keys(BASE)) {
      // 連續旋轉（spin/flip）不平滑，避免繞圈時回頭
      if ((act === 'spin' && key === 'ry') || (act === 'flip' && key === 'rx')) pose[key] = target[key];
      else pose[key] += (target[key] - pose[key]) * k;
    }
    if (act !== 'spin' && Math.abs(pose.ry) > Math.PI) pose.ry = pose.ry % (Math.PI * 2);
    if (act !== 'flip' && Math.abs(pose.rx) > Math.PI) pose.rx = pose.rx % (Math.PI * 2);

    const b = bear;
    b.root.position.y = pose.y;
    b.body.rotation.set(pose.rx, pose.ry, pose.rz);
    // 繞身體中心（離地 1.2）轉，翻跟斗時不會甩出去
    b.body.position.set(0, 1.2 - 1.2 * Math.cos(pose.rx), -1.2 * Math.sin(pose.rx));
    b.root.scale.set(2 - pose.sq, pose.sq, 2 - pose.sq);
    b.head.rotation.set(pose.hx, 0, pose.hz);
    // 左臂 aLz 正值往外張；右臂 aRz 負值往外張（左右鏡像）
    b.arms[0].rotation.set(pose.aLx, 0, -pose.aLz);
    b.arms[1].rotation.set(pose.aRx, 0, -pose.aRz);
    b.legs[0].rotation.x = pose.lL; b.legs[1].rotation.x = pose.lR;
    shadow.scale.setScalar(1 - Math.min(0.5, pose.y * 0.4));

    // 眨眼
    const blink = (t % 3.7) < 0.12 ? 0.1 : 1;
    b.eyes.forEach((e) => (e.scale.y = blink));

    // 披風飄動
    if (outfits.cape.visible) {
      const pos = outfits.cape.geometry.attributes.position, base = outfits.cape.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const down = (0.95 - y) / 1.9; // 0 在肩、1 在下襬
        pos.array[i * 3 + 2] = base[i * 3 + 2] - down * (0.35 + 0.15 * Math.sin(t * 6 + x * 2 + y * 3));
      }
      pos.needsUpdate = true;
    }
    if (outfits.halo.visible) outfits.halo.position.y = 1.35 + Math.sin(t * 3) * 0.05;

    FX[state.tension ? 'sweat' : state.fx](P, dt, state.strength, t);
    P.update(dt);
    renderer.render(scene, camera);
  }
  frame();

  return {
    set, setTension, say,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); P.clear(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
