import { describe, it, expect } from 'vitest';
import { validateBank, charLen } from '../src/bank-schema.js';

const q = (i, over = {}) => ({
  id: `V03-L${String(i + 1).padStart(2, '0')}`,
  q: '初級評估的內容是什麼？',
  options: ['評估利害關係', '評估可用資源', '處理情緒', '改變情境'],
  answer: i % 4,
  explanation: '初級評估判斷事件對自己的利害關係。',
  timeLimit: 20,
  concept: '初級評估',
  source: '講義 p.37',
  ...over,
});
const bank = (n = 8, over = {}) => ({ ep: 'V03', title: '壓力評估', questions: Array.from({ length: n }, (_, i) => q(i)), ...over });

describe('validateBank', () => {
  it('合格題庫沒有錯誤', () => expect(validateBank(bank())).toEqual([]));
  it('集數格式錯誤', () => expect(validateBank(bank(8, { ep: 'V3' })).join()).toMatch('ep'));
  it('題數少於 8 或多於 10', () => {
    expect(validateBank(bank(7)).join()).toMatch('8–10');
    expect(validateBank(bank(11)).join()).toMatch('8–10');
  });
  it('選項不是 4 個或重複', () => {
    const b = bank(); b.questions[0].options = ['a', 'b', 'c'];
    expect(validateBank(b).join()).toMatch('4 個');
    const c = bank(); c.questions[1].options = ['a', 'a', 'c', 'd'];
    expect(validateBank(c).join()).toMatch('重複');
  });
  it('答案必須是 0–3 整數', () => {
    const b = bank(); b.questions[0].answer = 4;
    expect(validateBank(b).join()).toMatch('answer');
  });
  it('詳解超過 40 字', () => {
    const b = bank(); b.questions[0].explanation = '字'.repeat(41);
    expect(validateBank(b).join()).toMatch('40');
  });
  it('題幹超過 60 字必須限時 30 秒，否則 20 秒', () => {
    const b = bank(); b.questions[0].q = '題'.repeat(61);
    expect(validateBank(b).join()).toMatch('30');
    b.questions[0].timeLimit = 30;
    expect(validateBank(b)).toEqual([]);
    const c = bank(); c.questions[0].timeLimit = 30;
    expect(validateBank(c).join()).toMatch('20');
  });
  it('id 必須對應集數且不重複', () => {
    const b = bank(); b.questions[1].id = b.questions[0].id;
    expect(validateBank(b).join()).toMatch('id');
  });
  it('缺 concept 或 source', () => {
    const b = bank(); b.questions[0].concept = '';
    expect(validateBank(b).join()).toMatch('concept');
  });
  it('charLen 以字元計（中文 1 字算 1）', () => expect(charLen('壓力ab')).toBe(4));
});
