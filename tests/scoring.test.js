import { describe, it, expect } from 'vitest';
import { questionPoints, buildResults, rankResults, countChoices } from '../src/scoring.js';

describe('questionPoints', () => {
  it('答錯得 0 分', () => expect(questionPoints(false, 1000, 20)).toBe(0));
  it('立刻答對得 1000 分', () => expect(questionPoints(true, 0, 20)).toBe(1000));
  it('最後一刻答對得 500 分', () => expect(questionPoints(true, 20000, 20)).toBe(500));
  it('一半時間答對得 750 分', () => expect(questionPoints(true, 10000, 20)).toBe(750));
  it('負的秒數視為 0', () => expect(questionPoints(true, -300, 20)).toBe(1000));
  it('超過限時（緩衝內）視為限時', () => expect(questionPoints(true, 20800, 20)).toBe(500));
  it('30 秒題 6 秒答對 = 900', () => expect(questionPoints(true, 6000, 30)).toBe(900));
});

describe('countChoices', () => {
  it('統計各選項人數，忽略不合法值', () => {
    const qa = { u1: { choice: 0 }, u2: { choice: 2 }, u3: { choice: 2 }, u4: { choice: 7 } };
    expect(countChoices(qa)).toEqual([1, 0, 2, 0]);
  });
  it('沒有作答時全為 0', () => expect(countChoices(undefined)).toEqual([0, 0, 0, 0]));
});

const players = {
  u1: { studentId: 's001', name: '王小明' },
  u2: { studentId: 's002', name: '李小華' },
  u3: { studentId: 's003', name: '陳大同' },
  u9: { studentId: 's003', name: '陳大同' }, // 解除綁定後換手機
};
const reveals = {
  q0: { answer: 1, startAt: 1000, timeLimit: 20 },
  q1: { answer: 3, startAt: 50000, timeLimit: 20 },
};
const answers = {
  q0: { u1: { choice: 1, at: 1000 }, u2: { choice: 1, at: 11000 }, u3: { choice: 0, at: 2000 } },
  q1: { u1: { choice: 2, at: 51000 }, u2: { choice: 3, at: 50000 }, u9: { choice: 3, at: 70000 } },
};

describe('buildResults', () => {
  const rows = buildResults({ players, answers, reveals });
  const by = Object.fromEntries(rows.map((r) => [r.studentId, r]));
  it('每個學號一列（換手機的合併）', () => expect(rows.length).toBe(3));
  it('s001：q0 1000、q1 答錯', () => {
    expect(by.s001.total).toBe(1000);
    expect(by.s001.correct).toBe(1);
    expect(by.s001.perQ.q1).toEqual({ choice: 2, correct: false, elapsedMs: 1000, points: 0 });
  });
  it('s002：750 + 1000', () => {
    expect(by.s002.total).toBe(1750);
    expect(by.s002.totalTime).toBe(10000);
  });
  it('s003：q0 答錯、q1 用新手機最後一刻答對 500', () => {
    expect(by.s003.total).toBe(500);
    expect(by.s003.perQ.q1.correct).toBe(true);
  });
  it('沒有作答的題目不出現在 perQ', () => {
    const r = buildResults({ players: { u5: { studentId: 's005', name: 'X' } }, answers, reveals });
    expect(r[0].perQ).toEqual({});
    expect(r[0].total).toBe(0);
  });
});

describe('rankResults', () => {
  it('總分高者在前；同分比答對總時間；再同分比學號', () => {
    const rows = [
      { studentId: 's003', total: 900, totalTime: 5000 },
      { studentId: 's001', total: 900, totalTime: 5000 },
      { studentId: 's002', total: 900, totalTime: 3000 },
      { studentId: 's004', total: 1200, totalTime: 9000 },
    ];
    expect(rankResults(rows).map((r) => [r.studentId, r.rank])).toEqual([
      ['s004', 1], ['s002', 2], ['s001', 3], ['s003', 4],
    ]);
  });
  it('不修改原陣列', () => {
    const rows = [{ studentId: 's2', total: 1, totalTime: 0 }, { studentId: 's1', total: 2, totalTime: 0 }];
    rankResults(rows);
    expect(rows[0].studentId).toBe('s2');
  });
});
