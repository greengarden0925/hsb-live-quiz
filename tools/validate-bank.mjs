// 用法：node tools/validate-bank.mjs <前後測題庫.json> <題庫1.json> [題庫2.json ...]
import { readFileSync } from 'node:fs';
import { validateBank, charLen } from '../src/bank-schema.js';

const [prepostPath, ...files] = process.argv.slice(2);
if (!prepostPath || !files.length) { console.error('用法：node tools/validate-bank.mjs <前後測.json> <題庫.json...>'); process.exit(2); }
const norm = (s) => String(s).replace(/[\s，。、？?！!「」（）()：:；;]/g, '');
const prepost = JSON.parse(readFileSync(prepostPath, 'utf8'));
const used = new Set(prepost.flatMap((ep) => [...ep.pre, ...ep.post].map((q) => norm(q.q))));

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
  if (examCount < 3) errors.push(`改寫自國考的題目只有 ${examCount} 題（至少 3 題）`);
  console.log(`\n== ${f}（${bank.ep}，${bank.questions.length} 題，答案分布 ${dist.join('/')}，國考改寫 ${examCount} 題）`);
  errors.forEach((e) => console.log('  ✗ ' + e));
  warnings.forEach((w) => console.log('  ! ' + w));
  if (!errors.length) console.log('  ✓ 通過');
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
