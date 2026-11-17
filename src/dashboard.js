// 課程 Dashboard：老師登入後讀 Firebase 的 rooms／banks／roster，做作答分析。?demo=1 用隨機示範資料預覽版面。
import { collectAttempts, episodeSummary, questionStats, conceptStats, studentStats, speedQuadrant, median } from './analytics.js';
import { barChart, scatter, optionBars, pct } from './charts.js';
import { displayId } from './keys.js';
import { $, esc, stamp } from './ui.js';

const D = { rooms: {}, banks: {}, roster: {}, excluded: new Set(), ep: '' };
const demo = new URLSearchParams(location.search).has('demo');

// ---------- 讀資料 ----------
async function loadFirebase() {
  const { auth, db } = await import('./firebase.js');
  const { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } = await import('firebase/auth');
  const { ref, get } = await import('firebase/database');
  $('#d-btn-login').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => { $('#d-err').textContent = '登入失敗：' + e.message; });
  onAuthStateChanged(auth, async (user) => {
    $('#d-loading').hidden = true;
    if (!user || user.isAnonymous) { $('#d-login').hidden = false; return; }
    const isAdmin = (await get(ref(db, `admins/${user.uid}`))).val() === true;
    if (!isAdmin) { $('#d-login').hidden = false; $('#d-err').textContent = '此帳號不是老師帳號。'; return; }
    $('#d-login').hidden = true; $('#d-loading').hidden = false;
    const [rooms, banks, roster] = await Promise.all(['rooms', 'banks', 'roster'].map((p) => get(ref(db, p)).then((s) => s.val() || {}).catch(() => ({}))));
    Object.assign(D, { rooms, banks, roster });
    $('#d-loading').hidden = true;
    start();
  });
}

// 示範資料：固定亂數種子，每次產生一樣的結果
function demoData() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const eps = ['V01', 'V02', 'V03', 'V05', 'V07'];
  const banks = {}, rooms = {}, roster = {};
  const concepts = ['定義', '理論架構', '情境判斷', '國考陷阱', '政策應用', '研究證據', '名詞辨析', '模式比較'];
  eps.forEach((ep, e) => {
    banks[ep] = { title: `示範單元 ${e + 1}`, questions: concepts.map((c, i) => ({ q: `示範題 ${ep}-${i + 1}：關於${c}的敘述何者正確？`, options: ['選項一', '選項二', '選項三', '選項四'], answer: i % 4, timeLimit: 20, concept: `${c}`, source: i % 2 ? '講義' : '改寫自國考' })) };
  });
  const N = 36;
  const ability = [], speed = [];
  for (let i = 1; i <= N; i++) { roster['sD' + String(i).padStart(3, '0')] = { name: `學生${String(i).padStart(2, '0')}` }; ability.push(0.3 + rnd() * 0.65); speed.push(0.4 + rnd() * 1.2); }
  eps.forEach((ep, e) => {
    const pin = String(100000 + e), players = {}, answers = {}, reveal = {};
    Object.keys(roster).forEach((sk, i) => { if (rnd() < 0.88) players['u' + i] = { studentId: sk, name: roster[sk].name }; });
    banks[ep].questions.forEach((q, qi) => {
      const hard = qi === 3 ? 0.35 : qi === 6 ? 0.15 : 0;
      const startAt = 1e6 * (qi + 1); reveal['q' + qi] = { answer: q.answer, startAt, timeLimit: 20 };
      answers['q' + qi] = {};
      Object.keys(players).forEach((uid) => {
        if (rnd() < 0.05) return;
        const i = Number(uid.slice(1)), ok = rnd() < ability[i] - hard;
        const guessFast = ability[i] < 0.45 && speed[i] < 0.8;
        const choice = ok ? q.answer : (rnd() < 0.6 ? (q.answer + 1) % 4 : Math.floor(rnd() * 4));
        const t = Math.min(20000, (guessFast ? 2500 : 6000 + rnd() * 9000) * speed[i]);
        answers['q' + qi][uid] = { choice, at: startAt + t };
      });
    });
    rooms[pin] = { meta: { ep, title: banks[ep].title, createdAt: Date.UTC(2026, 9, 6 + e * 7, 1), status: 'final' }, players, answers, reveal };
  });
  return { rooms, banks, roster };
}

// ---------- 主畫面 ----------
function start() {
  $('#d-main').hidden = false;
  const sessions = collectAttempts(D.rooms, D.banks).sessions;
  const eps = [...new Set(sessions.map((s) => s.ep))].sort();
  $('#f-ep').innerHTML = '<option value="">全部集數</option>' + eps.map((e) => `<option value="${e}">${e} ${esc((D.banks[e] || {}).title || '')}</option>`).join('');
  $('#f-ep').onchange = (e) => { D.ep = e.target.value; render(); };
  $('#f-sess').innerHTML = sessions.map((s) => `<label class="sess"><input type="checkbox" value="${s.pin}" checked> ${fmtDate(s.date)}｜${esc(s.ep)}｜場次 ${s.pin}｜${s.players} 人｜${s.revealed} 題</label>`).join('') || '<p class="muted">還沒有任何場次</p>';
  $('#f-sess').querySelectorAll('input').forEach((cb) => (cb.onchange = () => { cb.checked ? D.excluded.delete(cb.value) : D.excluded.add(cb.value); render(); }));
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== b.dataset.tab));
    render();
  }));
  $('#btn-export').onclick = exportCsv;
  window.addEventListener('resize', () => { clearTimeout(D.rt); D.rt = setTimeout(render, 200); });
  render();
}

const fmtDate = (ms) => { if (!ms) return '—'; const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const sec = (v) => (v == null ? '—' : `${v.toFixed(1)} 秒`);
const badge = (kind, text) => `<span class="badge ${kind}">${kind === 'critical' ? '⚠' : kind === 'warning' ? '!' : '✓'} ${esc(text)}</span>`;

function current() {
  const rooms = Object.fromEntries(Object.entries(D.rooms).filter(([pin, r]) => !D.excluded.has(pin) && (!D.ep || (r.meta && r.meta.ep === D.ep))));
  const { attempts, sessions } = collectAttempts(rooms, D.banks);
  return { attempts, sessions };
}

function render() {
  const { attempts, sessions } = current();
  const total = collectAttempts(D.rooms, D.banks).sessions.length;
  $('#f-sess-sum').textContent = `納入的場次（${total - D.excluded.size}／${total}）`;
  const tab = document.querySelector('.tabs button.on').dataset.tab;
  if (tab === 't-overview') renderOverview(attempts, sessions);
  if (tab === 't-questions') renderQuestions(attempts, sessions);
  if (tab === 't-students') renderStudents(attempts, sessions);
  if (tab === 't-speed') renderSpeed(attempts, sessions);
}

function tiles(el, items) {
  el.innerHTML = items.map(([k, v, sub]) => `<div class="tile"><div class="tile-k">${esc(k)}</div><div class="tile-v">${v}</div>${sub ? `<div class="tile-s">${esc(sub)}</div>` : ''}</div>`).join('');
}

function renderOverview(attempts, sessions) {
  const eps = episodeSummary(attempts, sessions, D.banks);
  const students = new Set(sessions.flatMap((s) => s.studentIds));
  const acc = attempts.length ? attempts.filter((a) => a.correct).length / attempts.length : null;
  tiles($('#tiles'), [['場次', sessions.length, `${eps.length} 集`], ['參與學生', students.size, `名單 ${Object.keys(D.roster).length} 人`], ['作答筆數', attempts.length], ['平均答對率', pct(acc)]]);
  barChart($('#c-ep'), eps.map((e) => ({ label: e.ep, value: e.accuracy, tip: `<b>${esc(e.ep)} ${esc(e.title)}</b><br>答對率 ${pct(e.accuracy)}<br>${e.sessions} 場、${e.students} 人、${e.attempts} 筆作答` })), { threshold: 0.6 });
  $('#tb-ep').innerHTML = '<tr><th>集數</th><th>單元</th><th class="num">場次</th><th class="num">學生</th><th class="num">作答</th><th class="num">答對率</th><th class="num">平均秒數</th></tr>' +
    eps.map((e) => `<tr><td>${esc(e.ep)}</td><td>${esc(e.title)}</td><td class="num">${e.sessions}</td><td class="num">${e.students}</td><td class="num">${e.attempts}</td><td class="num">${pct(e.accuracy)}</td><td class="num">${sec(e.avgSec)}</td></tr>`).join('');
  const bySess = {};
  attempts.forEach((a) => { (bySess[a.pin] ||= []).push(a); });
  $('#tb-sess').innerHTML = '<tr><th>日期</th><th>集數</th><th>場次碼</th><th class="num">人數</th><th class="num">題數</th><th class="num">答對率</th></tr>' +
    [...sessions].reverse().map((s) => { const xs = bySess[s.pin] || []; return `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.ep)}</td><td>${s.pin}</td><td class="num">${s.players}</td><td class="num">${s.revealed}</td><td class="num">${pct(xs.length ? xs.filter((x) => x.correct).length / xs.length : null)}</td></tr>`; }).join('');
}

function renderQuestions(attempts, sessions) {
  const cs = conceptStats(attempts);
  $('#tb-concept').innerHTML = '<tr><th>集數</th><th>概念</th><th>來源</th><th class="num">作答</th><th class="num">答對率</th><th>判讀</th></tr>' +
    cs.slice(0, 15).map((c) => `<tr><td>${esc(c.ep)}</td><td>${esc(c.concept)}</td><td>${c.fromExam ? '國考考點' : '講義'}</td><td class="num">${c.n}</td><td class="num">${pct(c.accuracy)}</td><td>${c.accuracy < 0.5 ? badge('critical', '需加強') : c.accuracy < 0.7 ? badge('warning', '再複習') : badge('good', '已掌握')}</td></tr>`).join('');
  const qs = questionStats(attempts, sessions, D.banks);
  $('#tb-q').innerHTML = '<tr><th>題</th><th>題目</th><th>選項分布</th><th class="num">答對率</th><th class="num">未作答</th><th>主要誘答</th></tr>' +
    qs.map((q) => `<tr><td>${esc(q.ep)}-${q.qIndex + 1}</td><td class="qtxt">${esc(q.text)}<div class="muted">${esc(q.concept)}${q.fromExam ? '｜國考考點' : ''}</div></td><td>${optionBars(q.counts, q.answer)}</td><td class="num">${pct(q.accuracy)}</td><td class="num">${q.noAnswer}</td><td>${q.topWrong == null ? '—' : `${'ABCD'[q.topWrong]}．${esc(q.options[q.topWrong] || '')}`}</td></tr>`).join('');
}

function studentFlag(s) {
  const lowAtt = s.sessionsTotal && s.attended / s.sessionsTotal < 0.5;
  const lowAcc = s.attempts >= 5 && s.accuracy < 0.5;
  if (lowAtt || lowAcc) return ['critical', '需關懷'];
  if (s.accuracy != null && s.accuracy < 0.7) return ['warning', '留意'];
  if (s.accuracy == null) return ['warning', '無作答'];
  return ['good', '良好'];
}

function renderStudents(attempts, sessions) {
  const ss = studentStats(attempts, sessions, D.roster);
  const care = ss.filter((s) => studentFlag(s)[1] === '需關懷').length;
  tiles($('#tiles-stu'), [['學生數', ss.length], ['需關懷', care, '出席或答對率低於 50%'], ['全班答對率中位數', pct(median(ss.filter((s) => s.accuracy != null).map((s) => s.accuracy)))]]);
  $('#tb-stu').innerHTML = '<tr><th>學號</th><th>姓名</th><th class="num">出席</th><th class="num">作答</th><th class="num">答對率</th><th class="num">平均秒數</th><th class="num">快速答錯</th><th>弱項概念</th><th>狀態</th></tr>' +
    ss.map((s, i) => { const [k, t] = studentFlag(s); return `<tr><td>${esc(displayId(s.studentId))}</td><td><button class="link" data-i="${i}">${esc(s.name)}</button></td><td class="num">${s.attended}/${s.sessionsTotal}</td><td class="num">${s.attempts}</td><td class="num">${pct(s.accuracy)}</td><td class="num">${sec(s.avgSec)}</td><td class="num">${pct(s.fastWrongRate)}</td><td>${esc(s.weakConcepts.slice(0, 3).join('、'))}${s.weakConcepts.length > 3 ? '…' : ''}</td><td>${badge(k, t)}</td></tr>`; }).join('');
  $('#tb-stu').querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => showStudent(ss[b.dataset.i])));
}

function showStudent(s) {
  const el = $('#stu-detail');
  el.hidden = false;
  el.innerHTML = `<h2>${esc(displayId(s.studentId))} ${esc(s.name)}：各集答對率</h2><div id="c-stu" class="chart"></div><p><b>弱項概念：</b>${esc(s.weakConcepts.join('、') || '無')}</p>`;
  const eps = Object.keys(s.perEp).sort();
  barChart($('#c-stu'), eps.map((e) => ({ label: e, value: s.perEp[e], tip: `<b>${esc(e)}</b><br>答對率 ${pct(s.perEp[e])}` })), { threshold: 0.6, height: 200 });
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderSpeed(attempts, sessions) {
  const ss = studentStats(attempts, sessions, D.roster).filter((s) => s.accuracy != null);
  const cut = { sec: median(ss.map((s) => s.avgSec)), acc: median(ss.map((s) => s.accuracy)) };
  scatter($('#c-stu-speed'), ss.map((s) => ({ x: s.avgSec, y: s.accuracy, tip: `<b>${esc(s.name)}</b><br>答對率 ${pct(s.accuracy)}<br>平均 ${sec(s.avgSec)}<br>${speedQuadrant(s, cut)}` })),
    { xLabel: '平均作答秒數', yLabel: '答對率', cut: ss.length ? { x: cut.sec, y: cut.acc } : null, quadrants: ['熟練', '思考型', '可能用猜', '需要協助'] });
  const groups = { 熟練: [], 思考型: [], 可能用猜: [], 需要協助: [] };
  ss.forEach((s) => { const q = speedQuadrant(s, cut); if (q) groups[q].push(s.name); });
  $('#quad-lists').innerHTML = Object.entries(groups).map(([k, v]) => `<div class="quad"><h3>${k}（${v.length}）</h3><p>${esc(v.join('、') || '—')}</p></div>`).join('');
  const qs = questionStats(attempts, sessions, D.banks);
  scatter($('#c-q-speed'), qs.map((q) => ({ x: q.avgSec, y: q.accuracy, tip: `<b>${esc(q.ep)}-${q.qIndex + 1}</b> ${esc(q.concept)}<br>答對率 ${pct(q.accuracy)}<br>平均 ${sec(q.avgSec)}` })),
    { xLabel: '平均作答秒數', yLabel: '答對率', cut: qs.length ? { x: median(qs.map((q) => q.avgSec)), y: median(qs.map((q) => q.accuracy)) } : null });
  $('#tb-qspeed').innerHTML = '<tr><th>題</th><th>概念</th><th class="num">答對者平均</th><th class="num">答錯者平均</th><th class="num">答對率</th></tr>' +
    qs.map((q) => `<tr><td>${esc(q.ep)}-${q.qIndex + 1}</td><td>${esc(q.concept)}</td><td class="num">${sec(q.avgSecCorrect)}</td><td class="num">${sec(q.avgSecWrong)}</td><td class="num">${pct(q.accuracy)}</td></tr>`).join('');
}

// ---------- 匯出 ----------
function exportCsv() {
  const { attempts, sessions } = current();
  const toCsv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const p = (v) => (v == null ? '' : (v * 100).toFixed(1));
  const ss = studentStats(attempts, sessions, D.roster);
  const qs = questionStats(attempts, sessions, D.banks);
  const csv = '﻿' +
    toCsv([['學生分析'], ['學號', '姓名', '出席場次', '總場次', '作答題數', '答對率%', '平均秒數', '快速答錯%', '弱項概念', '狀態'],
      ...ss.map((s) => [displayId(s.studentId), s.name, s.attended, s.sessionsTotal, s.attempts, p(s.accuracy), s.avgSec == null ? '' : s.avgSec.toFixed(1), p(s.fastWrongRate), s.weakConcepts.join('、'), studentFlag(s)[1]])]) +
    '\r\n\r\n' +
    toCsv([['題目分析'], ['集數', '題號', '概念', '題目', '作答人數', '未作答', '答對率%', '平均秒數', 'A', 'B', 'C', 'D', '正解', '主要誘答'],
      ...qs.map((q) => [q.ep, q.qIndex + 1, q.concept, q.text, q.n, q.noAnswer, p(q.accuracy), q.avgSec == null ? '' : q.avgSec.toFixed(1), ...q.counts, 'ABCD'[q.answer] || '', q.topWrong == null ? '' : 'ABCD'[q.topWrong]])]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `課程Dashboard_作答分析${D.ep ? '_' + D.ep : ''}_${stamp()}.csv`;
  a.click();
}

if (demo) {
  Object.assign(D, demoData());
  $('#demo-banner').hidden = false; $('#d-loading').hidden = true;
  start();
} else loadFirebase();
