export const charLen = (s) => [...String(s ?? '')].length;
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

export function validateBank(bank) {
  const errors = [];
  if (!bank || typeof bank !== 'object') return ['題庫不是物件'];
  if (!/^V\d{2}$/.test(bank.ep || '')) errors.push('ep 必須是 V00–V40 格式');
  if (!nonEmpty(bank.title)) errors.push('title 不可空白');
  const qs = Array.isArray(bank.questions) ? bank.questions : [];
  if (qs.length < 8 || qs.length > 10) errors.push(`題數必須 8–10 題（目前 ${qs.length}）`);
  const ids = new Set();
  qs.forEach((x, i) => {
    const tag = `第 ${i + 1} 題`;
    if (!new RegExp(`^${bank.ep}-L\\d{2}$`).test(x.id || '') || ids.has(x.id)) errors.push(`${tag} id 格式錯誤或重複`);
    ids.add(x.id);
    if (!nonEmpty(x.q)) errors.push(`${tag} 題幹空白`);
    if (!Array.isArray(x.options) || x.options.length !== 4 || !x.options.every(nonEmpty)) errors.push(`${tag} 選項必須是 4 個非空字串`);
    else if (new Set(x.options.map((o) => o.trim())).size !== 4) errors.push(`${tag} 選項重複`);
    if (![0, 1, 2, 3].includes(x.answer)) errors.push(`${tag} answer 必須是 0–3`);
    if (!nonEmpty(x.explanation) || charLen(x.explanation) > 40) errors.push(`${tag} 詳解必須 1–40 字`);
    const needed = charLen(x.q) > 60 ? 30 : 20;
    if (x.timeLimit !== needed) errors.push(`${tag} 限時應為 ${needed} 秒（題幹 ${charLen(x.q)} 字）`);
    if (!nonEmpty(x.concept)) errors.push(`${tag} concept 空白`);
    if (!nonEmpty(x.source)) errors.push(`${tag} source 空白`);
  });
  return errors;
}
