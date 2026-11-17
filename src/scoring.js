export const MAX_POINTS = 1000;

// 答對才計分：1000 × (1 − t/T/2)，t 夾在 0..T
export function questionPoints(isCorrect, elapsedMs, timeLimitSec) {
  if (!isCorrect) return 0;
  const T = timeLimitSec * 1000;
  const t = Math.min(Math.max(elapsedMs, 0), T);
  return Math.round(MAX_POINTS * (1 - t / T / 2));
}

export function countChoices(answersForQuestion) {
  const counts = [0, 0, 0, 0];
  for (const a of Object.values(answersForQuestion || {})) {
    if ([0, 1, 2, 3].includes(a && a.choice)) counts[a.choice] += 1;
  }
  return counts;
}

// players: {uid:{studentId,name}}；answers: {qKey:{uid:{choice,at}}}；reveals: {qKey:{answer,startAt,timeLimit}}
export function buildResults({ players = {}, answers = {}, reveals = {} }) {
  const byStudent = new Map();
  for (const [uid, p] of Object.entries(players)) {
    if (!byStudent.has(p.studentId)) {
      byStudent.set(p.studentId, { studentId: p.studentId, name: p.name, uids: [], total: 0, correct: 0, totalTime: 0, perQ: {} });
    }
    byStudent.get(p.studentId).uids.push(uid);
  }
  for (const [key, rv] of Object.entries(reveals)) {
    const qa = answers[key] || {};
    for (const row of byStudent.values()) {
      const uid = row.uids.find((u) => qa[u]);
      if (!uid) continue;
      const a = qa[uid];
      const limitMs = rv.timeLimit * 1000;
      const elapsedMs = Math.min(Math.max(a.at - rv.startAt, 0), limitMs);
      const correct = a.choice === rv.answer;
      const points = questionPoints(correct, elapsedMs, rv.timeLimit);
      row.perQ[key] = { choice: a.choice, correct, elapsedMs, points };
      row.total += points;
      if (correct) { row.correct += 1; row.totalTime += elapsedMs; }
    }
  }
  return [...byStudent.values()].map(({ uids, ...rest }) => rest);
}

export function rankResults(rows) {
  return [...rows]
    .sort((a, b) => b.total - a.total || a.totalTime - b.totalTime || String(a.studentId).localeCompare(String(b.studentId)))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
