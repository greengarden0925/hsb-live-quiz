import { describe, it, expect } from 'vitest';
import { collectAttempts, episodeSummary, questionStats, conceptStats, studentStats, speedQuadrant, median } from '../src/analytics.js';

const banks = {
  V01: {
    title: '健康',
    questions: [
      { q: '題一', options: ['a', 'b', 'c', 'd'], answer: 2, timeLimit: 20, concept: '概念甲', source: '改寫自 110 年國考第 16 題' },
      { q: '題二', options: ['a', 'b', 'c', 'd'], answer: 0, timeLimit: 20, concept: '概念乙', source: '講義 V01' },
    ],
  },
};
const rooms = {
  111111: {
    meta: { ep: 'V01', title: '健康', createdAt: 1000, status: 'final', qCount: 2 },
    players: { u1: { studentId: 's001', name: '甲' }, u2: { studentId: 's002', name: '乙' }, u3: { studentId: 's003', name: '丙' } },
    reveal: { q0: { answer: 2, startAt: 0, timeLimit: 20 }, q1: { answer: 0, startAt: 100000, timeLimit: 20 } },
    answers: {
      q0: { u1: { choice: 2, at: 4000 }, u2: { choice: 1, at: 2000 } },
      q1: { u1: { choice: 0, at: 110000 }, u2: { choice: 0, at: 116000 }, u3: { choice: 3, at: 101000 } },
    },
  },
  // 沒有任何已公布題目的場次（例如剛建立就放棄）不算
  222222: { meta: { ep: 'V01', title: '健康', createdAt: 2000, status: 'lobby', qCount: 2 }, players: {} },
};
const roster = { s001: { name: '甲' }, s002: { name: '乙' }, s003: { name: '丙' }, s004: { name: '丁' } };

describe('collectAttempts', () => {
  const { attempts, sessions } = collectAttempts(rooms, banks);
  it('只收已公布題目的作答，並算出對錯與秒數', () => {
    expect(attempts).toHaveLength(5);
    const a = attempts.find((x) => x.studentId === 's001' && x.qIndex === 0);
    expect(a).toMatchObject({ correct: true, elapsedMs: 4000, concept: '概念甲', fromExam: true, ep: 'V01' });
    expect(attempts.find((x) => x.studentId === 's002' && x.qIndex === 0).correct).toBe(false);
  });
  it('只列出有公布題目的場次，並記下進場人數', () => {
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ pin: '111111', ep: 'V01', players: 3, revealed: 2 });
  });
});

describe('彙整', () => {
  const { attempts, sessions } = collectAttempts(rooms, banks);
  it('episodeSummary 算出每集答對率', () => {
    const [v01] = episodeSummary(attempts, sessions, banks);
    expect(v01).toMatchObject({ ep: 'V01', sessions: 1, students: 3, attempts: 5 });
    expect(v01.accuracy).toBeCloseTo(3 / 5);
  });
  it('questionStats 算出選項分布、未作答與最常見錯誤選項', () => {
    const qs = questionStats(attempts, sessions, banks);
    const q0 = qs.find((q) => q.qIndex === 0);
    expect(q0.counts).toEqual([0, 1, 1, 0]);
    expect(q0.noAnswer).toBe(1);
    expect(q0.accuracy).toBeCloseTo(1 / 2);
    expect(q0.topWrong).toBe(1);
    const q1 = qs.find((q) => q.qIndex === 1);
    expect(q1.accuracy).toBeCloseTo(2 / 3);
    expect(q1.avgSec).toBeCloseTo((10 + 16 + 1) / 3);
  });
  it('conceptStats 依答對率由低到高排序', () => {
    const cs = conceptStats(attempts);
    expect(cs.map((c) => c.concept)).toEqual(['概念甲', '概念乙']);
  });
  it('studentStats 含缺席學生、出席率與弱項', () => {
    const ss = studentStats(attempts, sessions, roster);
    expect(ss).toHaveLength(4);
    const ding = ss.find((s) => s.studentId === 's004');
    expect(ding).toMatchObject({ attended: 0, attempts: 0, accuracy: null });
    const yi = ss.find((s) => s.studentId === 's002');
    expect(yi.attended).toBe(1);
    expect(yi.accuracy).toBeCloseTo(1 / 2);
    expect(yi.weakConcepts).toEqual(['概念甲']);
    // 丙用 1 秒就答錯：快速答錯
    const bing = ss.find((s) => s.studentId === 's003');
    expect(bing.fastWrongRate).toBeCloseTo(1);
  });
});

describe('速度分析', () => {
  it('median 處理奇偶數', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(null);
  });
  it('speedQuadrant 依中位數切四象限', () => {
    const cut = { sec: 10, acc: 0.6 };
    expect(speedQuadrant({ avgSec: 5, accuracy: 0.9 }, cut)).toBe('熟練');
    expect(speedQuadrant({ avgSec: 15, accuracy: 0.9 }, cut)).toBe('思考型');
    expect(speedQuadrant({ avgSec: 5, accuracy: 0.3 }, cut)).toBe('可能用猜');
    expect(speedQuadrant({ avgSec: 15, accuracy: 0.3 }, cut)).toBe('需要協助');
  });
});
