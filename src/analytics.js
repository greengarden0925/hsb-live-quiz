// 課程 dashboard 的分析邏輯（純函式，不碰 Firebase，方便測試）
import { qKey } from './keys.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// 用時不到限時 25% 就答錯，視為「快速答錯」（可能用猜）
export const FAST_RATIO = 0.25;

// rooms → 每一筆作答（只算已公布答案的題目）＋ 場次清單
export function collectAttempts(rooms = {}, banks = {}) {
  const attempts = [], sessions = [];
  for (const [pin, room] of Object.entries(rooms)) {
    const meta = room.meta || {}, reveals = room.reveal || {}, bank = banks[meta.ep];
    const revealedKeys = Object.keys(reveals);
    if (!revealedKeys.length) continue;
    const players = room.players || {};
    const uidToStudent = {};
    for (const [uid, p] of Object.entries(players)) uidToStudent[uid] = p;
    const studentIds = new Set(Object.values(players).map((p) => p.studentId));
    sessions.push({ pin, ep: meta.ep, title: meta.title, date: meta.createdAt || 0, status: meta.status, players: studentIds.size, revealed: revealedKeys.length, studentIds: [...studentIds] });
    for (const key of revealedKeys) {
      const rv = reveals[key], qIndex = Number(key.slice(1)), q = bank ? bank.questions[qIndex] : null;
      const seen = new Set();
      for (const [uid, a] of Object.entries((room.answers || {})[key] || {})) {
        const p = uidToStudent[uid];
        if (!p || seen.has(p.studentId)) continue; // 同一學生換手機重登，只算第一筆
        seen.add(p.studentId);
        const limitMs = rv.timeLimit * 1000;
        attempts.push({
          pin, ep: meta.ep, date: meta.createdAt || 0, qIndex, qKey: key,
          studentId: p.studentId, name: p.name,
          choice: a.choice, correct: a.choice === rv.answer,
          elapsedMs: Math.min(Math.max(a.at - rv.startAt, 0), limitMs), timeLimit: rv.timeLimit,
          concept: q ? q.concept : '（題庫已移除）', qText: q ? q.q : '', fromExam: q ? /國考/.test(q.source) : false,
        });
      }
    }
  }
  sessions.sort((a, b) => a.date - b.date);
  return { attempts, sessions };
}

const groupBy = (xs, f) => xs.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
const acc = (xs) => (xs.length ? xs.filter((x) => x.correct).length / xs.length : null);
const avgSec = (xs) => { const v = mean(xs.map((x) => x.elapsedMs)); return v == null ? null : v / 1000; };

export function episodeSummary(attempts, sessions, banks = {}) {
  const byEp = groupBy(attempts, (a) => a.ep), sessByEp = groupBy(sessions, (s) => s.ep);
  return Object.keys(sessByEp).sort().map((ep) => {
    const xs = byEp[ep] || [];
    return {
      ep, title: (banks[ep] && banks[ep].title) || sessByEp[ep][0].title || '',
      sessions: sessByEp[ep].length, students: new Set(sessByEp[ep].flatMap((s) => s.studentIds)).size,
      attempts: xs.length, accuracy: acc(xs), avgSec: avgSec(xs),
    };
  });
}

export function questionStats(attempts, sessions, banks = {}) {
  const byQ = groupBy(attempts, (a) => `${a.ep}|${a.qIndex}`);
  const out = [];
  for (const [k, xs] of Object.entries(byQ)) {
    const [ep, qi] = k.split('|'), qIndex = Number(qi), q = banks[ep] && banks[ep].questions[qIndex];
    const counts = [0, 0, 0, 0];
    xs.forEach((x) => { if (counts[x.choice] != null) counts[x.choice] += 1; });
    const shown = sessions.filter((s) => s.ep === ep).reduce((n, s) => n + s.players, 0);
    const answer = q ? q.answer : null;
    let topWrong = null;
    counts.forEach((c, i) => { if (i !== answer && c > 0 && (topWrong == null || c > counts[topWrong])) topWrong = i; });
    out.push({
      ep, qIndex, key: qKey(qIndex), text: q ? q.q : xs[0].qText, options: q ? q.options : [], answer,
      concept: xs[0].concept, fromExam: xs[0].fromExam,
      n: xs.length, noAnswer: Math.max(0, shown - xs.length), counts, accuracy: acc(xs), avgSec: avgSec(xs),
      avgSecCorrect: avgSec(xs.filter((x) => x.correct)), avgSecWrong: avgSec(xs.filter((x) => !x.correct)), topWrong,
    });
  }
  return out.sort((a, b) => a.ep.localeCompare(b.ep) || a.qIndex - b.qIndex);
}

export function conceptStats(attempts) {
  const byC = groupBy(attempts, (a) => `${a.ep}|${a.concept}`);
  return Object.entries(byC)
    .map(([k, xs]) => ({ ep: k.split('|')[0], concept: xs[0].concept, n: xs.length, accuracy: acc(xs), fromExam: xs.some((x) => x.fromExam) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.n - a.n);
}

// roster：{sKey:{name}}，讓沒來的學生也列出來
export function studentStats(attempts, sessions, roster = {}) {
  const byS = groupBy(attempts, (a) => a.studentId);
  const ids = new Set([...Object.keys(roster), ...sessions.flatMap((s) => s.studentIds)]);
  return [...ids].map((id) => {
    const xs = byS[id] || [];
    const attended = sessions.filter((s) => s.studentIds.includes(id)).length;
    const byConcept = groupBy(xs, (x) => x.concept);
    const weakConcepts = Object.entries(byConcept).filter(([, cs]) => acc(cs) < 0.5).map(([c]) => c);
    const byEp = groupBy(xs, (x) => x.ep);
    return {
      studentId: id, name: (roster[id] && roster[id].name) || (xs[0] && xs[0].name) || '',
      attended, sessionsTotal: sessions.length, attempts: xs.length, accuracy: acc(xs), avgSec: avgSec(xs),
      fastWrongRate: xs.length ? xs.filter((x) => !x.correct && x.elapsedMs < x.timeLimit * 1000 * FAST_RATIO).length / xs.length : null,
      weakConcepts, perEp: Object.fromEntries(Object.entries(byEp).map(([ep, es]) => [ep, acc(es)])),
    };
  }).sort((a, b) => String(a.studentId).localeCompare(String(b.studentId)));
}

// 以全班中位數切：快／慢 × 高／低答對率
export function speedQuadrant(s, cut) {
  if (s.accuracy == null || s.avgSec == null) return null;
  const fast = s.avgSec <= cut.sec, good = s.accuracy >= cut.acc;
  if (fast && good) return '熟練';
  if (!fast && good) return '思考型';
  if (fast && !good) return '可能用猜';
  return '需要協助';
}
