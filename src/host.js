import { auth, db } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { ref, get, set, update, remove, onValue, off, serverTimestamp, query, orderByChild, equalTo } from 'firebase/database';
import qrcode from 'qrcode-generator';
import { buildResults, rankResults, countChoices } from './scoring.js';
import { validateBank } from './bank-schema.js';
import { qKey, displayId } from './keys.js';
import { $, show, esc, LABELS, choiceButtonsHtml, stamp, localDateTime } from './ui.js';

const S = { uid: null, cfg: {}, banks: {}, pin: null, bank: null, meta: null, current: null, players: {}, presence: 0, answeredNow: 0, offset: 0, timer: null, busy: false, rows: [], watched: [] };
// ---------- 吉祥物（延遲載入，失敗不影響搶答） ----------
const M = { obj: null, last: ['idle', {}], off: false };
try { M.off = localStorage.getItem('hsb-mascot-off') === '1'; } catch (e) { /* 無痕模式 */ }
function mascot(name, opts = {}) {
  M.last = [name, opts];
  if (M.obj) M.obj.set(name, opts);
}
function mascotTension(on) { if (M.obj) M.obj.setTension(on); }
function startMascot() {
  if (M.off || M.obj || M.loading) return;
  M.loading = true;
  import('./mascot.js').then(({ createMascot }) => {
    $('#mascot-wrap').hidden = false;
    document.body.classList.add('has-mascot');
    M.obj = createMascot($('#mascot'), $('#mascot-bubble'));
    M.obj.set(...M.last);
  }).catch(() => { $('#mascot-wrap').hidden = true; }).finally(() => { M.loading = false; });
}
function toggleMascot() {
  M.off = !M.off;
  try { localStorage.setItem('hsb-mascot-off', M.off ? '1' : '0'); } catch (e) { /* 無痕模式 */ }
  $('#mascot-toggle').textContent = M.off ? '顯示熊熊' : '隱藏熊熊';
  if (M.off) {
    if (M.obj) { M.obj.dispose(); M.obj = null; }
    $('#mascot-wrap').hidden = true; document.body.classList.remove('has-mascot');
  } else startMascot();
}
$('#mascot-toggle').onclick = toggleMascot;

const roomRef = (p) => ref(db, `rooms/${S.pin}/${p}`);
const serverNow = () => Date.now() + S.offset;

onValue(ref(db, '.info/serverTimeOffset'), (s) => { S.offset = s.val() || 0; });

// ---------- 登入 ----------
$('#btn-login').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => { $('#login-err').textContent = '登入失敗：' + e.message; });
onAuthStateChanged(auth, async (user) => {
  if (!user) return show('s-login');
  // 同一瀏覽器開過學生端會留下匿名身分；老師端只接受 Google 登入
  if (user.isAnonymous) { $('#login-err').textContent = ''; return show('s-login'); }
  S.uid = user.uid;
  const isAdmin = (await get(ref(db, `admins/${user.uid}`))).val() === true;
  if (!isAdmin) { $('#login-err').textContent = `此帳號尚未設為老師。請把這個 UID 加入資料庫 /admins：\n${user.uid}`; return show('s-login'); }
  S.cfg = (await get(ref(db, 'config'))).val() || {};
  $('#mascot-toggle').hidden = false;
  $('#mascot-toggle').textContent = M.off ? '顯示熊熊' : '隱藏熊熊';
  startMascot();
  await loadSetup();
});

// ---------- 建立／接續 ----------
async function loadSetup() {
  S.banks = (await get(ref(db, 'banks'))).val() || {};
  const eps = Object.keys(S.banks).sort();
  $('#ep').innerHTML = eps.length
    ? eps.map((ep) => `<option value="${esc(ep)}">${esc(ep)} ${esc(S.banks[ep].title)}（${S.banks[ep].questions.length} 題）</option>`).join('')
    : '<option value="">尚未上傳題庫</option>';
  const mine = (await get(query(ref(db, 'rooms'), orderByChild('meta/hostUid'), equalTo(S.uid)))).val() || {};
  const open = Object.entries(mine).filter(([, rm]) => rm.meta && rm.meta.status !== 'final');
  $('#resume').innerHTML = open.length
    ? open.map(([pin, rm]) => `<li><button class="link" data-pin="${pin}">接續 ${pin}（${esc(rm.meta.ep)}，狀態 ${esc(rm.meta.status)}，第 ${rm.meta.qIndex + 1} 題）</button></li>`).join('')
    : '<li>沒有未結束的場次</li>';
  $('#resume').querySelectorAll('button').forEach((b) => (b.onclick = () => resumeRoom(b.dataset.pin)));
  $('#panel').hidden = true;
  mascot('idle');
  show('s-setup');
}

$('#bank-files').onchange = async (e) => {
  const msgs = [];
  for (const f of e.target.files) {
    try {
      const bank = JSON.parse(await f.text());
      const errors = validateBank(bank);
      if (errors.length) { msgs.push(`${f.name}：格式錯誤\n  ${errors.join('\n  ')}`); continue; }
      await set(ref(db, `banks/${bank.ep}`), bank);
      msgs.push(`${f.name}：已上傳 ${bank.ep}（${bank.questions.length} 題）`);
    } catch (err) { msgs.push(`${f.name}：無法讀取（${err.message}）`); }
  }
  e.target.value = '';
  await loadSetup();
  $('#setup-msg').textContent = msgs.join('\n');
};

$('#btn-roster').onclick = async () => {
  try {
    if (!S.cfg.sheetUrl || !S.cfg.sheetToken) throw new Error('資料庫 /config 尚未設定 sheetUrl 與 sheetToken');
    const res = await fetch(`${S.cfg.sheetUrl}?action=roster&token=${encodeURIComponent(S.cfg.sheetToken)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    const obj = {};
    for (const row of data.roster) obj['s' + row.studentId] = { name: row.name };
    await set(ref(db, 'roster'), obj);
    $('#setup-msg').textContent = `名單已同步：${data.roster.length} 人`;
  } catch (err) { $('#setup-msg').textContent = '名單同步失敗：' + err.message; }
};

$('#btn-create').onclick = async () => {
  const ep = $('#ep').value; if (!ep) return;
  let pin = null;
  for (let i = 0; i < 20; i++) {
    const cand = String(Math.floor(100000 + Math.random() * 900000));
    if (!(await get(ref(db, `rooms/${cand}/meta`))).exists()) { pin = cand; break; }
  }
  if (!pin) { $('#setup-msg').textContent = '無法產生場次碼，請再試一次'; return; }
  S.pin = pin; S.bank = S.banks[ep];
  await set(roomRef('meta'), { ep, title: S.bank.title, hostUid: S.uid, createdAt: serverTimestamp(), status: 'lobby', qIndex: -1, qCount: S.bank.questions.length });
  watchRoom();
  enterLobby();
};

async function resumeRoom(pin) {
  S.pin = pin;
  const meta = (await get(roomRef('meta'))).val();
  S.bank = S.banks[meta.ep];
  if (!S.bank) { $('#setup-msg').textContent = `題庫 ${meta.ep} 不存在，無法接續`; return; }
  watchRoom();
  S.meta = meta;
  if (meta.status === 'lobby') return enterLobby();
  if (meta.status === 'question') {
    S.current = (await get(roomRef('current'))).val();
    return showQuestion();
  }
  if (meta.status === 'reveal') return showReveal();
  if (meta.status === 'leaderboard') return showBoard();
}

// ---------- 監看名單與連線 ----------
function watchRoom() {
  S.watched.forEach((rf) => off(rf));
  const pl = roomRef('players'), pr = roomRef('presence'), mt = roomRef('meta');
  S.watched = [pl, pr, mt];
  onValue(mt, (s) => { S.meta = s.val(); });
  onValue(pl, (s) => { S.players = s.val() || {}; renderPlayers(); });
  onValue(pr, (s) => { S.presence = Object.keys(s.val() || {}).length; renderPlayers(); maybeEarlyClose(); });
  $('#panel').hidden = false;
}

function renderPlayers() {
  const list = Object.values(S.players);
  const html = list.map((p) => `<li>${esc(displayId(p.studentId))} ${esc(p.name)} <button class="link" data-sk="${esc(p.studentId)}">解除綁定</button></li>`).join('');
  $('#lobby-count').textContent = `已進場 ${list.length} 人（連線中 ${S.presence} 人）`;
  $('#panel-sum').textContent = `學生名單（已進場 ${list.length}，連線中 ${S.presence}）${S.presence >= 80 ? '⚠ 接近免費方案 100 連線上限' : ''}`;
  $('#lobby-players').innerHTML = list.map((p) => `<li>${esc(p.name)}</li>`).join('');
  $('#panel-list').innerHTML = html;
  $('#panel-list').querySelectorAll('button').forEach((b) => (b.onclick = () => unbind(b)));
}

async function unbind(btn) {
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = '確定解除？'; return; }
  await remove(roomRef(`claims/${btn.dataset.sk}`));
  btn.textContent = '已解除，請學生用新手機重新登入';
  btn.disabled = true;
}

// ---------- 等候室 ----------
function enterLobby() {
  const url = new URL(`play.html?pin=${S.pin}`, location.href).href;
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  $('#qr').innerHTML = qr.createSvgTag({ cellSize: 10, margin: 2, scalable: true });
  $('#lobby-title').textContent = `${S.bank.ep} ${S.bank.title}`;
  $('#lobby-pin').textContent = S.pin;
  $('#lobby-url').textContent = url;
  mascot('lobby');
  show('s-lobby');
}
$('#btn-start').onclick = () => startQuestion(0);

// ---------- 作答 ----------
async function startQuestion(i) {
  const q = S.bank.questions[i];
  await update(ref(db, `rooms/${S.pin}`), {
    current: { qIndex: i, qKey: qKey(i), text: q.q, options: q.options, timeLimit: q.timeLimit, startAt: serverTimestamp() },
    'meta/status': 'question',
    'meta/qIndex': i,
  });
  S.current = (await get(roomRef('current'))).val();
  S.meta = { ...S.meta, status: 'question', qIndex: i }; // 不等 meta 監聽回來，避免提前收卷判斷用到舊狀態
  showQuestion();
}

function showQuestion() {
  const c = S.current;
  S.busy = false;
  S.answeredNow = 0;
  $('#h-q').textContent = `第 ${c.qIndex + 1} / ${S.bank.questions.length} 題：${c.text}`;
  $('#h-choices').innerHTML = choiceButtonsHtml(c.options, { disabled: true });
  if (S.ansRef) off(S.ansRef); // 移除上一題的作答監聽
  const ansRef = roomRef(`answers/${c.qKey}`);
  S.ansRef = ansRef;
  S.watched.push(ansRef);
  onValue(ansRef, (s) => {
    S.answeredNow = Object.keys(s.val() || {}).length;
    $('#h-answered').textContent = `已作答 ${S.answeredNow} / ${S.presence}`;
    maybeEarlyClose();
  });
  const end = c.startAt + c.timeLimit * 1000;
  clearInterval(S.timer);
  S.timer = setInterval(() => {
    const leftMs = end - serverNow();
    $('#h-timer').textContent = Math.max(0, Math.ceil(leftMs / 1000));
    mascotTension(leftMs > 0 && leftMs <= 5000);
    if (leftMs <= -1200) closeQuestion(); // 規則允許 1 秒緩衝，多等 0.2 秒再收卷
  }, 200);
  mascot('question', { i: c.qIndex, n: S.bank.questions.length });
  show('s-question');
}

function maybeEarlyClose() {
  if (S.meta && S.meta.status === 'question' && S.presence > 0 && S.answeredNow >= S.presence) closeQuestion();
}
$('#btn-close').onclick = () => closeQuestion();

async function closeQuestion() {
  if (S.busy) return; S.busy = true;
  clearInterval(S.timer);
  mascotTension(false);
  const c = S.current, q = S.bank.questions[c.qIndex];
  const qa = (await get(roomRef(`answers/${c.qKey}`))).val() || {};
  await update(ref(db, `rooms/${S.pin}`), {
    [`reveal/${c.qKey}`]: { answer: q.answer, explanation: q.explanation, counts: countChoices(qa), startAt: c.startAt, timeLimit: c.timeLimit },
    'meta/status': 'reveal',
  });
  showReveal();
}

// ---------- 公布 ----------
async function showReveal() {
  const i = S.meta ? S.meta.qIndex : S.current.qIndex;
  const q = S.bank.questions[i];
  const rv = (await get(roomRef(`reveal/${qKey(i)}`))).val();
  const max = Math.max(1, ...rv.counts);
  $('#rv-q').textContent = `第 ${i + 1} 題：${q.q}`;
  $('#rv-bars').innerHTML = rv.counts.map((n, k) => `<div class="bar choice c${k}" style="height:${Math.round((n / max) * 100)}%">${LABELS[k]} ${n}</div>`).join('');
  $('#rv-choices').innerHTML = choiceButtonsHtml(q.options, { disabled: true });
  $(`#rv-choices .choice[data-i="${q.answer}"]`).classList.add('correct');
  $('#rv-expl').textContent = `✔ ${LABELS[q.answer]}｜${q.explanation}`;
  const total = rv.counts.reduce((a, b) => a + b, 0);
  mascot('reveal', { rate: total ? rv.counts[q.answer] / total : null });
  show('s-reveal');
}
$('#btn-board').onclick = () => computeScores().then(showBoard);

// ---------- 計分與排名 ----------
async function computeScores() {
  const room = (await get(ref(db, `rooms/${S.pin}`))).val();
  S.rows = rankResults(buildResults({ players: room.players || {}, answers: room.answers || {}, reveals: room.reveal || {} }));
  const scores = {};
  for (const row of S.rows) scores[row.studentId] = { name: row.name, total: row.total, correct: row.correct, totalTime: row.totalTime, rank: row.rank };
  await update(ref(db, `rooms/${S.pin}`), { scores, 'meta/status': S.meta.qIndex + 1 >= S.bank.questions.length ? 'final' : 'leaderboard' });
}

async function showBoard() {
  if (!S.rows.length) await computeScoresReadOnly();
  const last = S.meta.qIndex + 1 >= S.bank.questions.length;
  if (last) return showFinal();
  $('#board').innerHTML = S.rows.slice(0, 5).map((r) => `<li><span>${r.rank}. ${esc(r.name)}</span><span>${r.total}</span></li>`).join('');
  $('#btn-next').textContent = `下一題（第 ${S.meta.qIndex + 2} 題）`;
  mascot('board');
  show('s-board');
}
async function computeScoresReadOnly() {
  const room = (await get(ref(db, `rooms/${S.pin}`))).val();
  S.meta = room.meta;
  S.rows = rankResults(buildResults({ players: room.players || {}, answers: room.answers || {}, reveals: room.reveal || {} }));
}
$('#btn-next').onclick = () => startQuestion(S.meta.qIndex + 1);

// ---------- 結束：頒獎、Sheet、CSV ----------
function buildSheetPayload() {
  const dt = localDateTime();
  const detail = [], rank = [];
  for (const r of S.rows) {
    S.bank.questions.forEach((q, i) => {
      const a = r.perQ[qKey(i)];
      detail.push([dt, S.pin, S.bank.ep, displayId(r.studentId), r.name, i + 1, q.concept, a ? LABELS[a.choice] : '', LABELS[q.answer], a && a.correct ? 'O' : 'X', a ? (a.elapsedMs / 1000).toFixed(1) : '', a ? a.points : 0]);
    });
    rank.push([dt, S.pin, S.bank.ep, displayId(r.studentId), r.name, r.correct, r.total, r.rank]);
  }
  return { token: S.cfg.sheetToken, pin: S.pin, detail, rank };
}

async function sendToSheet() {
  $('#btn-resend').hidden = true;
  $('#sheet-msg').textContent = '正在寫入 Google Sheet…';
  try {
    if (!S.cfg.sheetUrl) throw new Error('尚未設定 /config/sheetUrl');
    const res = await fetch(S.cfg.sheetUrl, { method: 'POST', body: JSON.stringify(buildSheetPayload()) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    $('#sheet-msg').textContent = `已寫入 Google Sheet：明細 ${data.detail} 列、排名 ${data.rank} 列`;
  } catch (err) {
    $('#sheet-msg').textContent = `寫入 Google Sheet 失敗：${err.message}\n成績仍保存在資料庫，可按「重新寫入」或下載 CSV。`;
    $('#btn-resend').hidden = false;
  }
}
$('#btn-resend').onclick = sendToSheet;

$('#btn-csv').onclick = () => {
  const p = buildSheetPayload();
  const head1 = ['日期時間', '場次碼', '集數', '學號', '姓名', '題號', '概念', '選項', '正確答案', '對錯', '作答秒數', '得分'];
  const head2 = ['日期時間', '場次碼', '集數', '學號', '姓名', '答對題數', '總分', '名次'];
  const toCsv = (rows) => rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const csv = '﻿' + toCsv([head2, ...p.rank]) + '\r\n\r\n' + toCsv([head1, ...p.detail]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${S.bank.ep}_課堂搶答成績_${S.pin}_${stamp()}.csv`;
  a.click();
};

function showFinal() {
  const top = S.rows.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const cls = ['p2', 'p1', 'p3'];
  $('#final-title').textContent = `${S.bank.ep} ${S.bank.title}｜最終排行榜`;
  $('#podium').innerHTML = order.map((r, k) => (r ? `<div class="${cls[k]}">${r.rank}<br>${esc(r.name)}<br>${r.total}</div>` : '')).join('');
  $('#final-table').innerHTML = '<tr><th>名次</th><th>姓名</th><th>答對</th><th>總分</th></tr>' + S.rows.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.correct}</td><td>${r.total}</td></tr>`).join('');
  mascot('final');
  show('s-final');
  sendToSheet();
}
$('#btn-home').onclick = () => { S.watched.forEach((rf) => off(rf)); S.watched = []; S.rows = []; loadSetup(); };
