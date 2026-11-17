// 用法：node tools/validate-bank.mjs <前後測題庫.json> <題庫1.json> [題庫2.json ...]
import { readFileSync } from 'node:fs';
import { validateBank, charLen } from '../src/bank-schema.js';

const [prepostPath, ...files] = process.argv.slice(2);
if (!prepostPath || !files.length) { console.error('用法：node tools/validate-bank.mjs <前後測.json> <題庫.json...>'); process.exit(2); }
const norm = (s) => String(s).replace(/[\s，。、？?！!「」（）()：:；;]/g, '');
const prepost = JSON.parse(readFileSync(prepostPath, 'utf8'));
const used = new Set(prepost.flatMap((ep) => [...ep.pre, ...ep.post].map((q) => norm(q.q))));

// 各集可用的歷屆國考題數（歷屆國考題對照表 V00–V40）；國考改寫題至少 min(3, 可用題數)
const EXAM_AVAILABLE = { V00: 0, V01: 6, V02: 5, V03: 7, V04: 8, V05: 5, V06: 1, V07: 14, V08: 6, V09: 6, V10: 9, V11: 0, V12: 7, V13: 4, V14: 2, V15: 7, V16: 9, V17: 4, V18: 14, V19: 6, V20: 8, V21: 0, V22: 0, V23: 13, V24: 6, V25: 1, V26: 1, V27: 6, V28: 7, V29: 1, V30: 0, V31: 12, V32: 11, V33: 0, V34: 1, V35: 9, V36: 5, V37: 13, V38: 7, V39: 8, V40: 11 };

let failed = false;
for (const f of files) {
  const bank = JSON.parse(readFileSync(f, 'utf8'));
  const errors = validateBank(bank);
  const warnings = [];
  bank.questions.forEach((q, i) => {
    if (used.has(norm(q.q))) errors.push(`第 ${i + 1} 題 題幹與前後測重複`);
    q.options.forEach((o, k) => { if (charLen(o) > 20) warnings.push(`第 ${i + 1} 題 選項 ${'ABCD'[k]} 超過 20 字（${charLen(o)}）`); });
  });
  const dist = [0, 0, 0, 0];
  bank.questions.forEach((q) => dist[q.answer]++);
  const maxPer = Math.ceil(bank.questions.length / 4) + 1;
  if (dist.some((n) => n > maxPer) || dist.some((n) => n === 0)) errors.push(`答案分布不均 A/B/C/D = ${dist.join('/')}`);
  const examCount = bank.questions.filter((q) => /國考/.test(q.source)).length;
  const minExam = Math.min(3, EXAM_AVAILABLE[bank.ep] ?? 3);
  if (examCount < minExam) errors.push(`改寫自國考的題目只有 ${examCount} 題（至少 ${minExam} 題）`);
  console.log(`\n== ${f}（${bank.ep}，${bank.questions.length} 題，答案分布 ${dist.join('/')}，國考改寫 ${examCount} 題）`);
  errors.forEach((e) => console.log('  ✗ ' + e));
  warnings.forEach((w) => console.log('  ! ' + w));
  if (!errors.length) console.log('  ✓ 通過');
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
