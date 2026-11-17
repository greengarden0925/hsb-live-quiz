# 健康社會行為學 課堂即時搶答工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出 Kahoot 式課堂搶答工具：老師選集數開場、學生掃 QR 以學號登入、限時作答、每題公布答案與前 5 名、最後排行榜，成績寫入 Google Sheet；題庫先做 V00–V05。

**Architecture:** 靜態網頁（GitHub Pages，`docs/` 資料夾）＋ Firebase Realtime Database（Spark 免費方案）做即時同步；沒有伺服器端程式，計分由老師端執行，防作弊由資料庫安全規則強制；Google Apps Script 只負責讀名單與每場結束寫成績。題庫只存在 Firebase 老師專屬路徑與本 Claude 專案，**不進 GitHub**。

**Tech Stack:** Firebase JS SDK 13.4.0（modular）、esbuild 0.28.2（打包）、qrcode-generator 2.0.4、Vitest 5.1.0、@firebase/rules-unit-testing 6.0.0、firebase-tools 15.36.0（模擬器）、GitHub Actions（actions/checkout@v7、setup-node@v7、setup-java@v6，Java 21）、Google Apps Script、python-docx 1.2.0。

**設計規格：** 專案文件 `claude/健康社會行為學_課堂即時搶答工具_設計規格_20261117-0945.md`

**已知環境限制：** Claude 工作環境無法下載 Firebase 模擬器（storage.googleapis.com 被擋，已實測）。因此計分測試在本機跑，**安全規則測試與 40 人模擬在 GitHub Actions 上跑**（Task 3 起）。

**命名慣例：** 學號在資料庫中的鍵一律加前綴 `s`（例：學號 `1131001` → 鍵 `s1131001`），避免純數字鍵被 Realtime Database 轉成陣列；題目鍵一律 `q0`、`q1`…，理由相同。畫面顯示時去掉前綴。

---

## 檔案結構

```
hsb-live-quiz/                      （GitHub repo，公開）
├─ package.json                     依賴與指令
├─ vitest.config.js                 測試設定（檔案依序執行）
├─ firebase.json                    模擬器與規則檔位置
├─ database.rules.json              安全規則（防作弊、保護答案與名單）
├─ .gitignore                       排除 node_modules、banks/
├─ .github/workflows/test.yml       CI：在模擬器上跑全部測試
├─ src/
│  ├─ scoring.js                    純函式：計分、彙整、排名、選項統計
│  ├─ bank-schema.js                純函式：題庫格式驗證（網頁與工具共用）
│  ├─ keys.js                       學號鍵與題目鍵轉換
│  ├─ ui.js                         DOM 小工具（$, show, esc, 標籤）
│  ├─ firebase-config.js            Firebase 網頁設定（公開值，Task 5 產生）
│  ├─ firebase.js                   初始化 app/auth/db
│  ├─ play.js                       學生端邏輯
│  └─ host.js                       老師端邏輯
├─ docs/                            GitHub Pages 網站根目錄
│  ├─ index.html                    入口（老師端／學生端連結）
│  ├─ play.html                     學生端畫面
│  ├─ host.html                     老師端畫面
│  ├─ style.css                     共用樣式（投影與手機）
│  └─ dist/                         esbuild 輸出（play.js、host.js，需提交）
├─ tests/
│  ├─ scoring.test.js               計分單元測試（本機即可跑）
│  ├─ bank-schema.test.js           題庫驗證單元測試（本機即可跑）
│  ├─ rules.test.js                 安全規則測試（需模擬器，CI）
│  └─ load.test.js                  40 人同時作答模擬（需模擬器，CI）
├─ apps-script/Code.gs              Google Sheet 端程式（手動貼到 Apps Script）
├─ tools/
│  ├─ validate-bank.mjs             題庫檢查（格式＋與前後測重複＋答案分布）
│  └─ bank-to-docx.py               題庫轉 Word 對照表
└─ design/                          規格與計畫副本
```

題庫 JSON 與 Word 存在 Claude 工作目錄 `/home/claude/banks/`（不在 repo 內）與 Claude 專案。

---

### Task 1: 建立專案骨架與計分模組（TDD）

**Files:**
- Create: `/home/claude/hsb-live-quiz/package.json`、`vitest.config.js`、`.gitignore`
- Create: `src/scoring.js`、`src/keys.js`
- Test: `tests/scoring.test.js`

- [ ] **Step 1: 建立資料夾與 package.json**

```bash
mkdir -p /home/claude/hsb-live-quiz/{src,docs/dist,tests,apps-script,tools,design,.github/workflows}
cd /home/claude/hsb-live-quiz && git init -b main
```

`package.json`：
```json
{
  "name": "hsb-live-quiz",
  "private": true,
  "type": "module",
  "scripts": {
    "test:unit": "vitest run tests/scoring.test.js tests/bank-schema.test.js",
    "test:emu": "firebase emulators:exec --only database --project demo-hsb-quiz \"vitest run\"",
    "build": "esbuild src/host.js src/play.js --bundle --format=esm --minify --target=es2020 --outdir=docs/dist"
  },
  "dependencies": {
    "firebase": "13.4.0",
    "qrcode-generator": "2.0.4"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "6.0.0",
    "esbuild": "0.28.2",
    "firebase-tools": "15.36.0",
    "vitest": "5.1.0"
  }
}
```

`vitest.config.js`：
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 },
});
```

`.gitignore`：
```
node_modules/
banks/
*.log
```

Run: `cd /home/claude/hsb-live-quiz && npm install`
Expected: 產生 `package-lock.json`，無 ERR。

- [ ] **Step 2: 寫 keys.js（很小，直接寫）**

`src/keys.js`：
```js
// 學號 → 資料庫鍵（加 s 前綴）；只允許英數字
export function normalizeStudentId(input) {
  return String(input || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export const studentKey = (studentId) => 's' + normalizeStudentId(studentId);
export const displayId = (key) => String(key).replace(/^s/, '');
export const qKey = (index) => 'q' + index;
```

- [ ] **Step 3: 寫失敗的計分測試**

`tests/scoring.test.js`：
```js
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
```

- [ ] **Step 4: 執行確認失敗**

Run: `npx vitest run tests/scoring.test.js`
Expected: FAIL（`Failed to load url ../src/scoring.js` 或 not a function）

- [ ] **Step 5: 實作 scoring.js**

`src/scoring.js`：
```js
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
```

- [ ] **Step 6: 執行確認通過**

Run: `npx vitest run tests/scoring.test.js`
Expected: 全部 PASS（16 tests）

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: scoring module with tests"
```

---

### Task 2: 題庫格式驗證（TDD，網頁與工具共用）

**Files:**
- Create: `src/bank-schema.js`
- Test: `tests/bank-schema.test.js`

- [ ] **Step 1: 寫失敗的測試**

`tests/bank-schema.test.js`：
```js
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
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/bank-schema.test.js`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 bank-schema.js**

`src/bank-schema.js`：
```js
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
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test:unit`
Expected: scoring 與 bank-schema 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: bank schema validation"
```

---

### Task 3: 建立 GitHub repo 並接上 CI

**Files:**
- Create: `.github/workflows/test.yml`、`firebase.json`
- Create: `design/`（規格與計畫副本）

- [ ] **Step 1: 寫 firebase.json**

```json
{
  "database": { "rules": "database.rules.json" },
  "emulators": { "database": { "host": "127.0.0.1", "port": 9000 }, "ui": { "enabled": false } }
}
```

暫時建立允許全拒的規則檔，讓 CI 可以先跑起來（Task 4 改寫）：
`database.rules.json`：
```json
{ "rules": { ".read": false, ".write": false } }
```

- [ ] **Step 2: 寫 CI workflow**

`.github/workflows/test.yml`：
```yaml
name: test
on: [push, pull_request, workflow_dispatch]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - uses: actions/setup-java@v6
        with: { distribution: temurin, java-version: '21' }
      - run: npm ci
      - run: npm run test:emu
```

- [ ] **Step 3: 複製規格與計畫到 design/**

```bash
cp "/home/claude/健康社會行為學_課堂即時搶答工具_設計規格_20261117-0945.md" design/spec.md
cp "/home/claude/健康社會行為學_課堂即時搶答工具_實作計畫_20261117-1015.md" design/plan.md
git add -A && git commit -m "ci: emulator test workflow"
```

- [ ] **Step 4: 在使用者的 GitHub 建立公開 repo（Chrome）**

1. 載入 claude-in-chrome 工具（一次 ToolSearch 載入核心工具組），先讀 `chrome-browser` skill。
2. `tabs_context_mcp` → 開新分頁 → `https://github.com/new`。
3. 確認右上角登入帳號，記下帳號名稱為 **GH_USER**。
4. Repository name：`hsb-live-quiz`；Public；不要勾選 README／.gitignore／license。按 Create repository。

- [ ] **Step 5: 取得推送權限並推送**

呼叫 `mcp__claude-code-remote__add_repo`（owner = GH_USER，repo = `hsb-live-quiz`，access = `push`），依工具回傳的方式設定 remote 後：
```bash
cd /home/claude/hsb-live-quiz
git remote add origin https://github.com/GH_USER/hsb-live-quiz.git   # 若 add_repo 已提供 remote 指令則照其指示
git push -u origin main
```
Expected: push 成功。

- [ ] **Step 6: 確認 CI 綠燈**

Chrome 開 `https://github.com/GH_USER/hsb-live-quiz/actions`，等最新一次 `test` 完成。
Expected: 綠燈（目前 test:emu 會跑 scoring、bank-schema 兩個檔案並通過，證明模擬器在 CI 能下載與啟動）。若失敗，讀 log 修正後再推。

---

### Task 4: 安全規則（CI 上 TDD）

**Files:**
- Modify: `database.rules.json`
- Test: `tests/rules.test.js`

- [ ] **Step 1: 寫失敗的規則測試**

`tests/rules.test.js`：
```js
import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

const PIN = '123456';
const TS = { '.sv': 'timestamp' };
let env;
const as = (uid) => env.authenticatedContext(uid).database();
const anon = () => env.unauthenticatedContext().database();
const room = (p) => `rooms/${PIN}/${p}`;

async function seed(extra = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      admins: { teacher: true, teacher2: true },
      config: { sheetToken: 'secret' },
      banks: { V00: { title: 't', questions: [] } },
      roster: { s001: { name: '王小明' }, s002: { name: '李小華' } },
      rooms: { [PIN]: { meta: { ep: 'V00', title: 't', hostUid: 'teacher', status: 'lobby', qIndex: -1, qCount: 2, createdAt: 1 } } },
      ...extra,
    });
  });
}
async function join(uid, sk, name) {
  await as(uid).ref(room(`claims/${sk}`)).set(uid);
  await as(uid).ref(room(`players/${uid}`)).set({ studentId: sk, name, joinedAt: TS });
}
async function openQuestion(i = 0, timeLimit = 20) {
  await as('teacher').ref(`rooms/${PIN}`).update({
    current: { qIndex: i, qKey: `q${i}`, text: '題', options: ['a', 'b', 'c', 'd'], timeLimit, startAt: TS },
    'meta/status': 'question',
    'meta/qIndex': i,
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hsb-quiz',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
beforeEach(async () => { await env.clearDatabase(); await seed(); });
afterAll(async () => { await env.cleanup(); });

describe('題庫、設定、名單', () => {
  it('學生讀不到題庫與設定', async () => {
    await assertFails(as('stu').ref('banks').get());
    await assertFails(as('stu').ref('config').get());
  });
  it('老師讀得到題庫與設定', async () => {
    await assertSucceeds(as('teacher').ref('banks').get());
    await assertSucceeds(as('teacher').ref('config').get());
  });
  it('學生無法列出整份名單，但可讀單筆', async () => {
    await assertFails(as('stu').ref('roster').get());
    await assertSucceeds(as('stu').ref('roster/s001').get());
  });
  it('未登入者讀不到單筆名單', async () => {
    await assertFails(anon().ref('roster/s001').get());
  });
  it('學生不能寫名單，老師可以', async () => {
    await assertFails(as('stu').ref('roster/s009').set({ name: 'x' }));
    await assertSucceeds(as('teacher').ref('roster/s009').set({ name: 'x' }));
  });
  it('使用者只能讀自己的 admins 節點', async () => {
    await assertSucceeds(as('stu').ref('admins/stu').get());
    await assertFails(as('stu').ref('admins/teacher').get());
  });
});

describe('場次與綁定', () => {
  it('老師可建立新場次；學生不行', async () => {
    const meta = { ep: 'V01', title: 't', hostUid: 'teacher', status: 'lobby', qIndex: -1, qCount: 8, createdAt: TS };
    await assertSucceeds(as('teacher').ref('rooms/654321/meta').set(meta));
    await assertFails(as('stu').ref('rooms/777777/meta').set({ ...meta, hostUid: 'stu' }));
  });
  it('其他老師不能接管別人的場次', async () => {
    await assertFails(as('teacher2').ref(room('meta/status')).set('final'));
  });
  it('學生可綁定名單內學號；同學號第二人失敗；名單外學號失敗', async () => {
    await assertSucceeds(as('stuA').ref(room('claims/s001')).set('stuA'));
    await assertFails(as('stuB').ref(room('claims/s001')).set('stuB'));
    await assertFails(as('stuB').ref(room('claims/s999')).set('stuB'));
  });
  it('不能替別人綁定', async () => {
    await assertFails(as('stuA').ref(room('claims/s002')).set('stuB'));
  });
  it('進場需先綁定且姓名相符、時間為伺服器時間', async () => {
    await assertFails(as('stuA').ref(room('players/stuA')).set({ studentId: 's001', name: '王小明', joinedAt: TS }));
    await as('stuA').ref(room('claims/s001')).set('stuA');
    await assertFails(as('stuA').ref(room('players/stuA')).set({ studentId: 's001', name: '冒名者', joinedAt: TS }));
    await assertFails(as('stuA').ref(room('players/stuA')).set({ studentId: 's001', name: '王小明', joinedAt: 5 }));
    await assertSucceeds(as('stuA').ref(room('players/stuA')).set({ studentId: 's001', name: '王小明', joinedAt: TS }));
  });
  it('老師可解除綁定；學生不能刪別人的綁定', async () => {
    await as('stuA').ref(room('claims/s001')).set('stuA');
    await assertFails(as('stuB').ref(room('claims/s001')).remove());
    await assertSucceeds(as('teacher').ref(room('claims/s001')).remove());
  });
  it('學生不能寫 meta、current、reveal、scores', async () => {
    await assertFails(as('stuA').ref(room('meta/status')).set('final'));
    await assertFails(as('stuA').ref(room('current')).set({ qIndex: 0, qKey: 'q0', text: 'x', options: ['a', 'b', 'c', 'd'], timeLimit: 20, startAt: TS }));
    await assertFails(as('stuA').ref(room('reveal/q0')).set({ answer: 0 }));
    await assertFails(as('stuA').ref(room('scores/s001')).set({ total: 99999 }));
  });
  it('學生只能寫自己的 presence', async () => {
    await assertSucceeds(as('stuA').ref(room('presence/stuA')).set(true));
    await assertFails(as('stuA').ref(room('presence/stuB')).set(true));
  });
});

describe('作答', () => {
  beforeEach(async () => { await join('stuA', 's001', '王小明'); await join('stuB', 's002', '李小華'); });

  it('作答中可答一次，不能改答案', async () => {
    await openQuestion(0);
    await assertSucceeds(as('stuA').ref(room('answers/q0/stuA')).set({ choice: 2, at: TS }));
    await assertFails(as('stuA').ref(room('answers/q0/stuA')).set({ choice: 1, at: TS }));
  });
  it('不能自己填時間', async () => {
    await openQuestion(0);
    await assertFails(as('stuA').ref(room('answers/q0/stuA')).set({ choice: 2, at: 123 }));
  });
  it('選項必須是 0–3', async () => {
    await openQuestion(0);
    await assertFails(as('stuA').ref(room('answers/q0/stuA')).set({ choice: 4, at: TS }));
    await assertFails(as('stuA').ref(room('answers/q0/stuA')).set({ choice: 1.5, at: TS }));
  });
  it('不能加多餘欄位', async () => {
    await openQuestion(0);
    await assertFails(as('stuA').ref(room('answers/q0/stuA')).set({ choice: 1, at: TS, points: 1000 }));
  });
  it('不能答非目前題目', async () => {
    await openQuestion(0);
    await assertFails(as('stuA').ref(room('answers/q1/stuA')).set({ choice: 1, at: TS }));
  });
  it('不能替別人作答', async () => {
    await openQuestion(0);
    await assertFails(as('stuA').ref(room('answers/q0/stuB')).set({ choice: 1, at: TS }));
  });
  it('未進場者不能作答', async () => {
    await openQuestion(0);
    await assertFails(as('stranger').ref(room('answers/q0/stranger')).set({ choice: 1, at: TS }));
  });
  it('公布後不能作答', async () => {
    await openQuestion(0);
    await as('teacher').ref(room('meta/status')).set('reveal');
    await assertFails(as('stuA').ref(room('answers/q0/stuA')).set({ choice: 1, at: TS }));
  });
  it('逾時（超過限時＋1 秒）不能作答', async () => {
    await openQuestion(0);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref(room('current/startAt')).set(Date.now() - 22000);
    });
    await assertFails(as('stuA').ref(room('answers/q0/stuA')).set({ choice: 1, at: TS }));
  });
  it('current.startAt 必須是伺服器時間', async () => {
    await assertFails(as('teacher').ref(room('current')).set({ qIndex: 0, qKey: 'q0', text: '題', options: ['a', 'b', 'c', 'd'], timeLimit: 20, startAt: 1 }));
  });
  it('學生讀得到題目，但答案只在公布後才出現', async () => {
    await openQuestion(0);
    const cur = await assertSucceeds(as('stuA').ref(room('current')).get());
    if ('answer' in cur.val()) throw new Error('current 不應含答案');
    const rv = await as('stuA').ref(room('reveal/q0')).get();
    if (rv.exists()) throw new Error('公布前不應有 reveal');
  });
});
```

- [ ] **Step 2: 推送確認 CI 失敗**

```bash
git add -A && git commit -m "test: security rules spec" && git push
```
Chrome 看 Actions。Expected: `rules.test.js` 大量 FAIL（目前規則全拒，assertSucceeds 會失敗）。

- [ ] **Step 3: 實作安全規則**

`database.rules.json`：
```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "admins": {
      "$uid": { ".read": "auth != null && auth.uid === $uid" }
    },
    "config": {
      ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true"
    },
    "banks": {
      ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true"
    },
    "roster": {
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
      "$sid": { ".read": "auth != null" }
    },
    "rooms": {
      ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
      ".indexOn": ["meta/hostUid"],
      "$pin": {
        ".read": "auth != null",
        "meta": {
          ".write": "auth != null && root.child('admins').child(auth.uid).val() === true && (!data.exists() || data.child('hostUid').val() === auth.uid)",
          ".validate": "newData.hasChildren(['ep','title','hostUid','status','qIndex','qCount']) && newData.child('hostUid').val() === auth.uid && newData.child('status').val().matches(/^(lobby|question|reveal|leaderboard|final)$/)"
        },
        "current": {
          ".write": "auth != null && root.child('rooms').child($pin).child('meta/hostUid').val() === auth.uid",
          ".validate": "newData.hasChildren(['qIndex','qKey','text','options','timeLimit','startAt']) && newData.child('startAt').val() === now && newData.child('timeLimit').isNumber() && newData.child('timeLimit').val() >= 5 && newData.child('timeLimit').val() <= 120"
        },
        "reveal": {
          ".write": "auth != null && root.child('rooms').child($pin).child('meta/hostUid').val() === auth.uid"
        },
        "scores": {
          ".write": "auth != null && root.child('rooms').child($pin).child('meta/hostUid').val() === auth.uid"
        },
        "claims": {
          "$sid": {
            ".write": "auth != null && ((!data.exists() && newData.val() === auth.uid && root.child('roster').child($sid).exists()) || (!newData.exists() && root.child('rooms').child($pin).child('meta/hostUid').val() === auth.uid))"
          }
        },
        "players": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid && !data.exists() && newData.exists()",
            ".validate": "newData.hasChildren(['studentId','name','joinedAt']) && root.child('rooms').child($pin).child('claims').child(newData.child('studentId').val()).val() === auth.uid && root.child('roster').child(newData.child('studentId').val()).child('name').val() === newData.child('name').val() && newData.child('joinedAt').val() === now"
          }
        },
        "presence": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid",
            ".validate": "newData.val() === true"
          }
        },
        "answers": {
          "$q": {
            "$uid": {
              ".write": "auth != null && auth.uid === $uid && !data.exists() && newData.exists()",
              ".validate": "newData.hasChildren(['choice','at']) && (newData.child('choice').val() === 0 || newData.child('choice').val() === 1 || newData.child('choice').val() === 2 || newData.child('choice').val() === 3) && newData.child('at').val() === now && root.child('rooms').child($pin).child('meta/status').val() === 'question' && root.child('rooms').child($pin).child('current/qKey').val() === $q && now <= root.child('rooms').child($pin).child('current/startAt').val() + root.child('rooms').child($pin).child('current/timeLimit').val() * 1000 + 1000 && root.child('rooms').child($pin).child('players').child(auth.uid).exists()",
              "choice": { ".validate": true },
              "at": { ".validate": true },
              "$other": { ".validate": false }
            }
          }
        }
      }
    }
  }
}
```

注意：`meta` 的 `.validate` 會在 `update({'meta/status': ...})` 時以「合併後的 meta」檢查，所以部分更新也會通過，只要 hostUid 等欄位仍在。

- [ ] **Step 4: 推送確認 CI 綠燈**

```bash
git add -A && git commit -m "feat: security rules" && git push
```
Expected: Actions 全部 PASS。若有失敗，讀 log：最常見是規則語法錯（log 會顯示行號）或測試期待與規則不符；修規則（不要改測試的期待，除非期待與規格不符）。

---

### Task 5: 40 人同時作答模擬（CI）

**Files:**
- Test: `tests/load.test.js`

- [ ] **Step 1: 寫模擬測試**

`tests/load.test.js`：
```js
import { readFileSync } from 'node:fs';
import { it, beforeAll, afterAll, expect } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { buildResults, rankResults } from '../src/scoring.js';

const PIN = '424242';
const TS = { '.sv': 'timestamp' };
const N = 40;
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hsb-quiz',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
  await env.clearDatabase();
  const roster = {};
  for (let i = 0; i < N; i++) roster[`s${1000 + i}`] = { name: `學生${i}` };
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      admins: { teacher: true },
      roster,
      rooms: { [PIN]: { meta: { ep: 'V00', title: 't', hostUid: 'teacher', status: 'lobby', qIndex: -1, qCount: 1, createdAt: 1 } } },
    });
  });
});
afterAll(async () => { await env.cleanup(); });

it('40 人同時進場、同時作答，無漏記', async () => {
  const dbs = Array.from({ length: N }, (_, i) => env.authenticatedContext(`u${i}`).database());
  await Promise.all(dbs.map(async (db, i) => {
    await db.ref(`rooms/${PIN}/claims/s${1000 + i}`).set(`u${i}`);
    await db.ref(`rooms/${PIN}/players/u${i}`).set({ studentId: `s${1000 + i}`, name: `學生${i}`, joinedAt: TS });
  }));

  const host = env.authenticatedContext('teacher').database();
  await host.ref(`rooms/${PIN}`).update({
    current: { qIndex: 0, qKey: 'q0', text: '題', options: ['a', 'b', 'c', 'd'], timeLimit: 20, startAt: TS },
    'meta/status': 'question',
    'meta/qIndex': 0,
  });

  const results = await Promise.allSettled(dbs.map((db, i) => db.ref(`rooms/${PIN}/answers/q0/u${i}`).set({ choice: i % 4, at: TS })));
  const failed = results.filter((r) => r.status === 'rejected');
  expect(failed.length).toBe(0);

  const snap = (await host.ref(`rooms/${PIN}`).get()).val();
  expect(Object.keys(snap.players).length).toBe(N);
  expect(Object.keys(snap.answers.q0).length).toBe(N);

  const rows = rankResults(buildResults({
    players: snap.players,
    answers: snap.answers,
    reveals: { q0: { answer: 0, startAt: snap.current.startAt, timeLimit: 20 } },
  }));
  expect(rows.length).toBe(N);
  expect(rows.filter((r) => r.correct === 1).length).toBe(N / 4);
  expect(rows[0].total).toBeGreaterThanOrEqual(500);
});
```

- [ ] **Step 2: 推送確認 CI 綠燈**

```bash
git add -A && git commit -m "test: 40-player load simulation" && git push
```
Expected: Actions PASS（scoring、bank-schema、rules、load 四個檔）。

---

### Task 6: 建立 Firebase 專案並取得網頁設定（Chrome）

**Files:**
- Create: `src/firebase-config.js`、`src/firebase.js`

- [ ] **Step 1: 建立專案**

Chrome 開 `https://console.firebase.google.com/`（使用者的 Google 帳號）：
1. 新增專案 → 名稱 `hsb-live-quiz`（若 ID 被占用，接受系統給的 ID，記為 **PROJECT_ID**）→ 關閉 Google Analytics → 建立。
2. 確認方案顯示 **Spark**（不要升級、不要綁帳單）。

- [ ] **Step 2: 啟用 Realtime Database**

Build → Realtime Database → 建立資料庫 → 位置選畫面上列出的亞洲選項（以控制台實際列出的為準）→ 以「鎖定模式」開始。記下資料庫網址為 **DB_URL**。

- [ ] **Step 3: 啟用登入方式**

Build → Authentication → 開始使用 → Sign-in method：啟用「匿名」與「Google」（Google 的支援電子郵件選使用者本人）。
Authentication → 設定 → 已授權網域：新增 `GH_USER.github.io`。

- [ ] **Step 4: 註冊網頁應用程式**

專案設定 → 一般 → 你的應用程式 → 網頁（`</>`）→ 暱稱 `hsb-live-quiz-web`（不勾 Hosting）→ 複製畫面上的 `firebaseConfig` 物件值。

- [ ] **Step 5: 寫設定檔**

`src/firebase-config.js`（以 Step 4 複製到的實際值填入；這些是公開值，可提交）：
```js
export const firebaseConfig = {
  apiKey: '（Step 4 的 apiKey）',
  authDomain: '（Step 4 的 authDomain）',
  databaseURL: '（DB_URL）',
  projectId: '（PROJECT_ID）',
  storageBucket: '（Step 4 的 storageBucket）',
  messagingSenderId: '（Step 4 的 messagingSenderId）',
  appId: '（Step 4 的 appId）',
};
```
執行者必須把括號內文字替換為實際值後才能提交；提交前執行 `grep -c '（' src/firebase-config.js`，Expected: `0`。

`src/firebase.js`：
```js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { firebaseConfig } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
```

- [ ] **Step 6: 部署安全規則（Chrome 貼上）**

Realtime Database → 規則分頁 → 把 `database.rules.json` 全文貼上取代 → 發布。
Expected: 發布成功、無語法錯誤提示。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: firebase web config" && git push
```

---

### Task 7: 共用樣式與 UI 小工具

**Files:**
- Create: `src/ui.js`、`docs/style.css`、`docs/index.html`

- [ ] **Step 1: ui.js**

```js
export const $ = (sel) => document.querySelector(sel);
export function show(id) {
  document.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.id !== id; });
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const LABELS = ['A', 'B', 'C', 'D'];
export const SHAPES = ['▲', '◆', '●', '■'];
export function choiceButtonsHtml(options, { disabled = false } = {}) {
  return options.map((o, i) => `<button class="choice c${i}" data-i="${i}" ${disabled ? 'disabled' : ''}><span class="shape">${SHAPES[i]}</span><span class="lbl">${LABELS[i]}</span><span class="txt">${esc(o)}</span></button>`).join('');
}
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
export function localDateTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
```

- [ ] **Step 2: style.css**

```css
:root { --a:#e21b3c; --b:#1368ce; --c:#d89e00; --d:#26890c; --bg:#f4f1fa; --ink:#222; --brand:#46178f; }
* { box-sizing: border-box; }
body { margin:0; font-family: "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif; background:var(--bg); color:var(--ink); }
main { max-width: 1200px; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.6rem; } button { font: inherit; cursor: pointer; }
.btn, section > button { background: var(--brand); color:#fff; border:0; border-radius:10px; padding:12px 22px; font-size:1.1rem; margin:6px 4px; }
.secondary { background:#777 !important; }
.link { background:none; border:0; color:var(--brand); text-decoration:underline; padding:0 4px; }
input, select { font-size:1.3rem; padding:10px; border-radius:8px; border:2px solid #ccc; width:100%; max-width:420px; }
.err { color:#c00; white-space: pre-line; } .msg { white-space: pre-line; }
.choices { display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:12px; }
.choice { display:flex; align-items:center; gap:10px; border:0; border-radius:12px; color:#fff; padding:16px; min-height:84px; text-align:left; font-size:1.15rem; }
.choice.c0{background:var(--a)} .choice.c1{background:var(--b)} .choice.c2{background:var(--c)} .choice.c3{background:var(--d)}
.choice .shape { font-size:1.6rem; } .choice .lbl { font-weight:700; } .choice[disabled]{ opacity:.45; }
.choice.picked { outline: 6px solid #000; opacity:1; } .choice.correct { outline: 6px solid #fff; box-shadow:0 0 0 10px #2ecc71; opacity:1; }
.timer { font-size:2.4rem; font-weight:800; color:var(--brand); }
.qtext { font-size:1.35rem; font-weight:700; line-height:1.5; }
.bars { display:grid; grid-template-columns: repeat(4,1fr); gap:16px; align-items:end; height:260px; margin:16px 0; }
.bar { border-radius:8px 8px 0 0; color:#fff; text-align:center; font-weight:800; font-size:1.4rem; padding-top:6px; min-height:36px; }
.board { list-style:none; padding:0; font-size:1.5rem; } .board li { display:flex; justify-content:space-between; background:#fff; margin:8px 0; padding:12px 18px; border-radius:10px; }
.podium { display:flex; justify-content:center; align-items:end; gap:16px; margin:20px 0; }
.podium div { background:var(--brand); color:#fff; width:200px; text-align:center; border-radius:10px 10px 0 0; padding:12px; font-size:1.3rem; }
.podium .p1{height:220px} .podium .p2{height:170px} .podium .p3{height:130px}
#qr svg { width: 360px; height: 360px; background:#fff; }
.pin { font-size:4rem; font-weight:900; letter-spacing:.2em; color:var(--brand); }
.players { display:flex; flex-wrap:wrap; gap:8px; list-style:none; padding:0; } .players li { background:#fff; padding:6px 12px; border-radius:20px; }
table { border-collapse: collapse; width:100%; background:#fff; } td, th { border:1px solid #ddd; padding:6px 10px; text-align:left; }
/* 投影用：老師端字更大 */
body.host .qtext { font-size:2.2rem; } body.host .choice { font-size:1.6rem; min-height:110px; } body.host .timer { font-size:4rem; }
@media (max-width: 600px) { .choices { grid-template-columns: 1fr; } .choice { min-height:64px; } }
```

- [ ] **Step 3: index.html**

```html
<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>健康社會行為學 課堂搶答</title><link rel="stylesheet" href="style.css"></head>
<body><main>
<h1>健康社會行為學 課堂搶答</h1>
<p><a class="btn" href="play.html">學生：輸入場次碼進場</a></p>
<p><a href="host.html">老師端</a></p>
</main></body></html>
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: shared ui and styles"
```

---

### Task 8: 學生端（play）

**Files:**
- Create: `docs/play.html`、`src/play.js`

- [ ] **Step 1: play.html**

```html
<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>課堂搶答｜學生</title><link rel="stylesheet" href="style.css"></head>
<body class="play"><main>
<p id="conn" class="err"></p>
<section id="s-loading" data-screen><h1>連線中…</h1></section>
<section id="s-pin" data-screen hidden><h1>輸入場次碼</h1><input id="pin" inputmode="numeric" maxlength="6" autocomplete="off"><button id="btn-pin">下一步</button><p class="err" id="pin-err"></p></section>
<section id="s-id" data-screen hidden><h1>輸入學號</h1><input id="sid" autocomplete="off" autocapitalize="characters"><button id="btn-sid">查詢</button><p class="err" id="sid-err"></p></section>
<section id="s-confirm" data-screen hidden><h1>你是 <span id="confirm-name"></span> 嗎？</h1><button id="btn-yes">是，進場</button><button id="btn-no" class="secondary">不是，重新輸入</button><p class="err" id="confirm-err"></p></section>
<section id="s-wait" data-screen hidden><h1 id="wait-msg">已進場，等待老師開始…</h1><p id="me-line"></p></section>
<section id="s-question" data-screen hidden><div class="timer" id="p-timer"></div><p class="qtext" id="p-q"></p><div class="choices" id="p-choices"></div><p id="p-status"></p></section>
<section id="s-result" data-screen hidden><h1 id="r-title"></h1><p id="r-detail"></p><p id="r-expl"></p><p id="r-rank"></p></section>
</main><script type="module" src="dist/play.js"></script></body></html>
```

- [ ] **Step 2: play.js**

```js
import { auth, db } from './firebase.js';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { ref, get, set, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { questionPoints } from './scoring.js';
import { studentKey, normalizeStudentId, displayId } from './keys.js';
import { $, show, esc, LABELS, choiceButtonsHtml } from './ui.js';

const S = { uid: null, pin: null, sk: null, name: null, offset: 0, meta: null, current: null, timer: null, joined: false };
const r = (p) => ref(db, `rooms/${S.pin}/${p}`);
const serverNow = () => Date.now() + S.offset;

onValue(ref(db, '.info/serverTimeOffset'), (s) => { S.offset = s.val() || 0; });
onValue(ref(db, '.info/connected'), (s) => {
  $('#conn').textContent = s.val() ? '' : '網路中斷，正在重新連線…';
  if (s.val() && S.joined) markPresent();
});

signInAnonymously(auth).catch((e) => { $('#conn').textContent = '無法連線：' + e.message; });

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  S.uid = user.uid;
  const pin = new URLSearchParams(location.search).get('pin');
  if (pin) await choosePin(pin); else show('s-pin');
});

$('#btn-pin').onclick = () => choosePin($('#pin').value.trim());
async function choosePin(pin) {
  $('#pin-err').textContent = '';
  if (!/^\d{6}$/.test(pin)) { show('s-pin'); $('#pin-err').textContent = '場次碼是 6 位數字'; return; }
  const meta = (await get(ref(db, `rooms/${pin}/meta`))).val();
  if (!meta) { show('s-pin'); $('#pin-err').textContent = '找不到這個場次'; return; }
  if (meta.status === 'final') { show('s-pin'); $('#pin-err').textContent = '這個場次已經結束'; return; }
  S.pin = pin;
  const me = (await get(r(`players/${S.uid}`))).val();
  if (me) { S.sk = me.studentId; S.name = me.name; return enterGame(); }
  show('s-id');
}

$('#btn-sid').onclick = async () => {
  $('#sid-err').textContent = '';
  const id = normalizeStudentId($('#sid').value);
  if (!id) { $('#sid-err').textContent = '請輸入學號'; return; }
  const sk = studentKey(id);
  const row = (await get(ref(db, `roster/${sk}`))).val();
  if (!row) { $('#sid-err').textContent = '查無此學號，請確認或洽老師'; return; }
  S.sk = sk; S.name = row.name;
  $('#confirm-name').textContent = row.name;
  show('s-confirm');
};
$('#btn-no').onclick = () => { $('#sid').value = ''; show('s-id'); };
$('#btn-yes').onclick = async () => {
  $('#confirm-err').textContent = '';
  const claimRef = r(`claims/${S.sk}`);
  const owner = (await get(claimRef)).val();
  try {
    if (owner && owner !== S.uid) throw new Error('taken');
    if (!owner) await set(claimRef, S.uid);
    await set(r(`players/${S.uid}`), { studentId: S.sk, name: S.name, joinedAt: serverTimestamp() });
    enterGame();
  } catch (e) {
    $('#confirm-err').textContent = e.message === 'taken' || String(e.code).includes('PERMISSION')
      ? '此學號已在其他裝置登入。若是你換了手機，請請老師「解除綁定」後再試。'
      : '進場失敗：' + e.message;
  }
};

function markPresent() {
  const pr = r(`presence/${S.uid}`);
  onDisconnect(pr).remove();
  set(pr, true);
}

function enterGame() {
  S.joined = true;
  markPresent();
  $('#me-line').textContent = `${displayId(S.sk)} ${S.name}`;
  onValue(r('meta'), (s) => { S.meta = s.val(); route(); });
  onValue(r('current'), (s) => { S.current = s.val(); route(); });
}

async function route() {
  const m = S.meta; if (!m) return;
  clearInterval(S.timer);
  if (m.status === 'lobby') { $('#wait-msg').textContent = '已進場，等待老師開始…'; return show('s-wait'); }
  if (m.status === 'question' && S.current && S.current.qIndex === m.qIndex) return renderQuestion();
  if (m.status === 'reveal') return renderReveal();
  if (m.status === 'leaderboard' || m.status === 'final') return renderRank(m.status === 'final');
}

async function renderQuestion() {
  const c = S.current;
  $('#p-q').textContent = `第 ${c.qIndex + 1} 題：${c.text}`;
  const mine = (await get(r(`answers/${c.qKey}/${S.uid}`))).val();
  $('#p-choices').innerHTML = choiceButtonsHtml(c.options, { disabled: !!mine });
  $('#p-status').textContent = mine ? `已作答 ${LABELS[mine.choice]}，等待公布` : '';
  if (mine) $(`#p-choices .choice[data-i="${mine.choice}"]`).classList.add('picked');
  $('#p-choices').querySelectorAll('.choice').forEach((b) => (b.onclick = () => answer(Number(b.dataset.i))));
  const end = c.startAt + c.timeLimit * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - serverNow()) / 1000));
    $('#p-timer').textContent = left;
    if (left === 0) { clearInterval(S.timer); $('#p-choices').querySelectorAll('.choice').forEach((b) => (b.disabled = true)); }
  };
  tick(); S.timer = setInterval(tick, 200);
  show('s-question');
}

async function answer(i) {
  const c = S.current;
  $('#p-choices').querySelectorAll('.choice').forEach((b) => (b.disabled = true));
  try {
    await set(r(`answers/${c.qKey}/${S.uid}`), { choice: i, at: serverTimestamp() });
    $(`#p-choices .choice[data-i="${i}"]`).classList.add('picked');
    $('#p-status').textContent = `已作答 ${LABELS[i]}，等待公布`;
  } catch {
    $('#p-status').textContent = '時間到，未計分';
  }
}

async function renderReveal() {
  const key = 'q' + S.meta.qIndex;
  const rv = (await get(r(`reveal/${key}`))).val();
  if (!rv) return;
  const mine = (await get(r(`answers/${key}/${S.uid}`))).val();
  const correct = !!mine && mine.choice === rv.answer;
  const pts = mine ? questionPoints(correct, mine.at - rv.startAt, rv.timeLimit) : 0;
  $('#r-title').textContent = !mine ? '未作答' : correct ? '答對了！' : '答錯了';
  $('#r-detail').innerHTML = `正確答案：<b>${LABELS[rv.answer]}</b>${mine ? `　你的答案：${LABELS[mine.choice]}` : ''}　本題得分：${pts}`;
  $('#r-expl').textContent = rv.explanation || '';
  $('#r-rank').textContent = '';
  show('s-result');
}

async function renderRank(final) {
  const sc = (await get(r(`scores/${S.sk}`))).val();
  $('#r-title').textContent = final ? '測驗結束' : '目前排名';
  $('#r-detail').innerHTML = sc ? `第 <b>${sc.rank}</b> 名　總分 ${sc.total}　答對 ${sc.correct} 題` : '尚無成績';
  $('#r-expl').textContent = '';
  $('#r-rank').textContent = final ? '請看大螢幕的排行榜' : '等待下一題…';
  show('s-result');
}
```

- [ ] **Step 3: 建立暫時的 host.js 並打包**

`build` 指令同時打包 host.js 與 play.js，所以先建立暫時檔（Task 9 會覆寫）：
```bash
echo 'export {};' > src/host.js
npm run build
```
Expected: 產生 `docs/dist/play.js` 與 `docs/dist/host.js`，無 error。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: student play page"
```

---

### Task 9: 老師端（host）

**Files:**
- Create: `docs/host.html`
- Create (覆寫): `src/host.js`

- [ ] **Step 1: host.html**

```html
<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>課堂搶答｜老師端</title><link rel="stylesheet" href="style.css"></head>
<body class="host"><main>
<details id="panel" hidden><summary id="panel-sum">學生名單</summary><ul class="players" id="panel-list"></ul></details>

<section id="s-login" data-screen><h1>老師登入</h1><button id="btn-login">使用 Google 帳號登入</button><p class="err" id="login-err"></p></section>

<section id="s-setup" data-screen hidden>
  <h1>建立場次</h1>
  <select id="ep"></select> <button id="btn-create">建立場次</button>
  <h2>接續未結束的場次</h2><ul id="resume"></ul>
  <h2>管理</h2>
  <button id="btn-roster" class="secondary">從 Google Sheet 同步名單</button>
  <label class="btn secondary">上傳題庫 JSON<input id="bank-files" type="file" accept=".json" multiple hidden></label>
  <p class="msg" id="setup-msg"></p>
</section>

<section id="s-lobby" data-screen hidden>
  <h1 id="lobby-title"></h1>
  <div style="display:flex;gap:32px;align-items:center;flex-wrap:wrap">
    <div id="qr"></div>
    <div><p>掃 QR code，或開啟網址輸入場次碼</p><div class="pin" id="lobby-pin"></div><p id="lobby-url"></p><h2 id="lobby-count"></h2></div>
  </div>
  <ul class="players" id="lobby-players"></ul>
  <button id="btn-start">開始第 1 題</button>
</section>

<section id="s-question" data-screen hidden>
  <div style="display:flex;justify-content:space-between;align-items:center"><div class="timer" id="h-timer"></div><h2 id="h-answered"></h2></div>
  <p class="qtext" id="h-q"></p><div class="choices" id="h-choices"></div>
  <button id="btn-close" class="secondary">提前結束作答</button>
</section>

<section id="s-reveal" data-screen hidden>
  <p class="qtext" id="rv-q"></p>
  <div class="bars" id="rv-bars"></div>
  <div class="choices" id="rv-choices"></div>
  <h2 id="rv-expl"></h2>
  <button id="btn-board">看排名</button>
</section>

<section id="s-board" data-screen hidden>
  <h1>目前前 5 名</h1><ol class="board" id="board"></ol>
  <button id="btn-next">下一題</button>
</section>

<section id="s-final" data-screen hidden>
  <h1 id="final-title">最終排行榜</h1>
  <div class="podium" id="podium"></div>
  <p class="msg" id="sheet-msg"></p>
  <button id="btn-csv" class="secondary">下載 CSV</button> <button id="btn-resend" class="secondary" hidden>重新寫入 Google Sheet</button> <button id="btn-home" class="secondary">回到建立場次</button>
  <table id="final-table"></table>
</section>
</main><script type="module" src="dist/host.js"></script></body></html>
```

- [ ] **Step 2: host.js**

```js
import { auth, db } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { ref, get, set, update, remove, onValue, off, serverTimestamp, query, orderByChild, equalTo } from 'firebase/database';
import qrcode from 'qrcode-generator';
import { buildResults, rankResults, countChoices } from './scoring.js';
import { validateBank } from './bank-schema.js';
import { qKey, displayId } from './keys.js';
import { $, show, esc, LABELS, choiceButtonsHtml, stamp, localDateTime } from './ui.js';

const S = { uid: null, cfg: {}, banks: {}, pin: null, bank: null, meta: null, current: null, players: {}, presence: 0, answeredNow: 0, offset: 0, timer: null, busy: false, rows: [], watched: [] };
const roomRef = (p) => ref(db, `rooms/${S.pin}/${p}`);
const serverNow = () => Date.now() + S.offset;

onValue(ref(db, '.info/serverTimeOffset'), (s) => { S.offset = s.val() || 0; });

// ---------- 登入 ----------
$('#btn-login').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => { $('#login-err').textContent = '登入失敗：' + e.message; });
onAuthStateChanged(auth, async (user) => {
  if (!user) return show('s-login');
  S.uid = user.uid;
  const isAdmin = (await get(ref(db, `admins/${user.uid}`))).val() === true;
  if (!isAdmin) { $('#login-err').textContent = `此帳號尚未設為老師。請把這個 UID 加入資料庫 /admins：\n${user.uid}`; return show('s-login'); }
  S.cfg = (await get(ref(db, 'config'))).val() || {};
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
    if (leftMs <= -1200) closeQuestion(); // 規則允許 1 秒緩衝，多等 0.2 秒再收卷
  }, 200);
  show('s-question');
}

function maybeEarlyClose() {
  if (S.meta && S.meta.status === 'question' && S.presence > 0 && S.answeredNow >= S.presence) closeQuestion();
}
$('#btn-close').onclick = () => closeQuestion();

async function closeQuestion() {
  if (S.busy) return; S.busy = true;
  clearInterval(S.timer);
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
  show('s-final');
  sendToSheet();
}
$('#btn-home').onclick = () => { S.watched.forEach((rf) => off(rf)); S.watched = []; S.rows = []; loadSetup(); };
```

- [ ] **Step 3: 打包**

Run: `npm run build`
Expected: `docs/dist/host.js`、`docs/dist/play.js` 產生，無 error。

- [ ] **Step 4: 以靜態檢查確認 DOM id 都存在**

```bash
node -e "
const fs=require('fs');
for (const [js,html] of [['src/host.js','docs/host.html'],['src/play.js','docs/play.html']]) {
  const ids=[...fs.readFileSync(js,'utf8').matchAll(/\\$\\('#([\\w-]+)/g)].map(m=>m[1]);
  const h=fs.readFileSync(html,'utf8');
  const miss=[...new Set(ids)].filter(id=>!h.includes('id=\"'+id+'\"'));
  console.log(js, miss.length? 'MISSING: '+miss.join(','):'OK');
}"
```
Expected: 兩行都 `OK`。

- [ ] **Step 5: 跑單元測試與 Commit、推送**

```bash
npm run test:unit && git add -A && git commit -m "feat: host page" && git push
```
Expected: 本機 PASS；Actions PASS。

---

### Task 10: Google Sheet 與 Apps Script

**Files:**
- Create: `apps-script/Code.gs`

- [ ] **Step 1: Code.gs**

```javascript
// 健康社會行為學 課堂搶答：名單讀取與成績寫入
const SHEETS = {
  roster: { name: '名單', head: ['學號', '姓名'] },
  detail: { name: '作答明細', head: ['日期時間', '場次碼', '集數', '學號', '姓名', '題號', '概念', '選項', '正確答案', '對錯', '作答秒數', '得分'] },
  rank: { name: '成績排名', head: ['日期時間', '場次碼', '集數', '學號', '姓名', '答對題數', '總分', '名次'] },
};

// 第一次手動執行：建立三個分頁與金鑰，金鑰顯示在執行紀錄
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(SHEETS).forEach((s) => {
    const sh = ss.getSheetByName(s.name) || ss.insertSheet(s.name);
    sh.getRange(1, 1, 1, s.head.length).setValues([s.head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid());
  Logger.log('TOKEN = ' + props.getProperty('TOKEN'));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function token_() { return PropertiesService.getScriptProperties().getProperty('TOKEN'); }

function doGet(e) {
  if (!e.parameter.token || e.parameter.token !== token_()) return json_({ ok: false, error: 'unauthorized' });
  if (e.parameter.action !== 'roster') return json_({ ok: false, error: 'unknown action' });
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.roster.name);
  const values = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues() : [];
  const roster = values
    .map((r) => ({ studentId: String(r[0]).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), name: String(r[1]).trim() }))
    .filter((r) => r.studentId && r.name);
  return json_({ ok: true, roster });
}

// 同一場次重送時先刪舊列（冪等）
function replaceRows_(sheetName, pin, rows) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const last = sh.getLastRow();
  if (last > 1) {
    const pins = sh.getRange(2, 2, last - 1, 1).getDisplayValues();
    for (let i = pins.length - 1; i >= 0; i--) if (pins[i][0] === pin) sh.deleteRow(i + 2);
  }
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body.token || body.token !== token_()) return json_({ ok: false, error: 'unauthorized' });
    const pin = String(body.pin);
    const detail = replaceRows_(SHEETS.detail.name, pin, body.detail || []);
    const rank = replaceRows_(SHEETS.rank.name, pin, body.rank || []);
    return json_({ ok: true, detail, rank });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
```

（場次碼欄存成文字比對：`getDisplayValues` 取字串，避免 6 位數被當數字比對失敗。）

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: apps script for roster and results" && git push
```

- [ ] **Step 3: 建立 Sheet 並部署（Chrome）**

1. Chrome 開 `https://sheets.new` → 檔名 `健康社會行為學_課堂搶答成績`。
2. 擴充功能 → Apps Script → 刪除預設內容，貼上 `apps-script/Code.gs` 全文 → 儲存。
3. 函式選 `setup` → 執行 → 依提示授權（**停下來請使用者按授權**）→ 執行紀錄複製 `TOKEN = …` 的值，記為 **SHEET_TOKEN**。
4. 部署 → 新增部署作業 → 類型「網頁應用程式」→ 執行身分「我」→ 存取權「任何人」→ 部署 → 複製網址（`https://script.google.com/macros/s/…/exec`），記為 **SHEET_URL**。
5. 回到 Sheet 的「名單」分頁：請使用者貼上修課名單（學號、姓名兩欄）。**這是需要使用者提供的資料**；試行前可先放 3 筆測試資料（例：`T001 測試甲`、`T002 測試乙`、`T003 測試丙`）。

- [ ] **Step 4: 驗證 Apps Script 端點**

Chrome 開 `SHEET_URL?action=roster&token=錯的`
Expected: `{"ok":false,"error":"unauthorized"}`
Chrome 開 `SHEET_URL?action=roster&token=SHEET_TOKEN`
Expected: `{"ok":true,"roster":[...]}` 且筆數等於名單分頁資料列數。

- [ ] **Step 5: 寫入 Firebase 設定與老師帳號（Chrome）**

1. 開 `https://GH_USER.github.io/hsb-live-quiz/host.html`（Task 11 部署後才有；若尚未部署，先做 Task 11 Step 1–2 再回來）→ 用 Google 登入 → 畫面顯示 UID，複製，記為 **TEACHER_UID**。
2. Firebase 控制台 → Realtime Database → 資料分頁：新增
   - `admins/TEACHER_UID` = `true`（布林）
   - `config/sheetUrl` = SHEET_URL（字串）
   - `config/sheetToken` = SHEET_TOKEN（字串）
3. 重新整理 host.html。Expected: 進入「建立場次」畫面；按「從 Google Sheet 同步名單」顯示「名單已同步：N 人」。

---

### Task 11: 部署 GitHub Pages

- [ ] **Step 1: 確認 dist 已建置並提交**

```bash
npm run build && git add -A && git commit -m "build: dist" --allow-empty && git push
```

- [ ] **Step 2: 開啟 Pages（Chrome）**

`https://github.com/GH_USER/hsb-live-quiz/settings/pages` → Source：Deploy from a branch → Branch：`main`、資料夾 `/docs` → Save。等 1–3 分鐘。
Expected: 頁面顯示 `Your site is live at https://GH_USER.github.io/hsb-live-quiz/`。

- [ ] **Step 3: 冒煙測試**

Chrome 開 `https://GH_USER.github.io/hsb-live-quiz/play.html`
Expected: 顯示「輸入場次碼」，`read_console_messages` 無錯誤（特別是沒有 `auth/unauthorized-domain`；若有，回 Task 6 Step 3 補授權網域）。

---

### Task 12: 題庫工具（驗證與 Word 對照表）

**Files:**
- Create: `tools/validate-bank.mjs`、`tools/bank-to-docx.py`

- [ ] **Step 1: validate-bank.mjs**

```js
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
```

- [ ] **Step 2: 用不合格的樣本確認會失敗**

```bash
mkdir -p /tmp/bankcheck && cat > /tmp/bankcheck/bad.json <<'EOF'
{"ep":"V00","title":"t","questions":[{"id":"V00-L01","q":"公共衛生師法於哪一年經立法院三讀通過？","options":["2018 年","2019 年","2020 年","2021 年"],"answer":2,"explanation":"2020 年三讀。","timeLimit":20,"concept":"立法","source":"講義"}]}
EOF
node tools/validate-bank.mjs /home/claude/banks/prepost.json /tmp/bankcheck/bad.json; echo "exit=$?"
```
（先用 Projects 工具 `project_read` 讀 `claude/健康社會行為學_前後測題庫_V00-V05_20261110.json`，存成 `/home/claude/banks/prepost.json`。）
Expected: 顯示「題數必須 8–10 題」「題幹與前後測重複」「答案分布不均」「國考改寫 0 題」，`exit=1`。

- [ ] **Step 3: bank-to-docx.py**

```python
# 用法：python3 tools/bank-to-docx.py <輸出.docx> <題庫1.json> [題庫2.json ...]
import json, sys
from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn

out, files = sys.argv[1], sys.argv[2:]
doc = Document()
style = doc.styles['Normal']
style.font.name = 'Microsoft JhengHei'
style.element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft JhengHei')
style.font.size = Pt(10)
doc.add_heading('健康社會行為學 課堂搶答題庫（審閱用）', level=0)
L = 'ABCD'
for f in files:
    bank = json.load(open(f, encoding='utf-8'))
    doc.add_heading(f"{bank['ep']} {bank['title']}（{len(bank['questions'])} 題）", level=1)
    t = doc.add_table(rows=1, cols=7)
    t.style = 'Table Grid'
    for c, h in zip(t.rows[0].cells, ['題號', '題幹與選項', '答案', '詳解', '限時', '概念', '出處']):
        c.text = h
    for i, q in enumerate(bank['questions'], 1):
        row = t.add_row().cells
        row[0].text = str(i)
        row[1].text = q['q'] + '\n' + '\n'.join(f"({L[k]}) {o}" for k, o in enumerate(q['options']))
        row[2].text = L[q['answer']]
        row[3].text = q['explanation']
        row[4].text = f"{q['timeLimit']} 秒"
        row[5].text = q['concept']
        row[6].text = q['source']
doc.save(out)
print('saved', out)
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: bank validation and docx tools" && git push
```

---

### Task 13: 出 V00–V05 課堂搶答題庫（內容工作，需使用者審閱）

**Files:**
- Create: `/home/claude/banks/V0X_課堂搶答題庫_<YYYYMMDD-HHMM>.json`（X = 0–5，時間為生成時間）
- Create: `/home/claude/banks/V00-V05_課堂搶答題庫_審閱_<YYYYMMDD-HHMM>.docx`

每一集重複 Step 1–4：

- [ ] **Step 1: 讀素材**

`project_read`：`claude/健康社會行為學_講義_V00-V05_20261112-2230.md`（該集段落）、`claude/健康社會行為學_歷屆國考題對照表_V00-V40_20261112-2330.md`（該集段落）、該集教案 `claude/V0X_…_教案_….md`（用 `project_info` 找實際檔名）。已讀過的前後測題庫見 Task 12 Step 2。

- [ ] **Step 2: 出題**

依設計規格第 8 節規則出 8–10 題；每題 `source` 填講義頁碼或「改寫自 1XX 年國考」。講義與網路資料不一致、或涉及法規與政策的題目，用 WebSearch 查證最新版本，並在對話中列出查證來源。**不憑記憶出題。**

- [ ] **Step 3: 驗證**

Run: `node tools/validate-bank.mjs /home/claude/banks/prepost.json /home/claude/banks/V0X_課堂搶答題庫_*.json`
Expected: `✓ 通過`（有 `!` 選項過長警告時，能縮就縮）。

- [ ] **Step 4: 自我審題（逐題）**

逐題確認：只有一個正確答案、干擾選項合理但明確錯誤、詳解與答案一致、縮寫第一次出現附全名。

- [ ] **Step 5: 產生 Word 並存入專案**

```bash
python3 tools/bank-to-docx.py "/home/claude/banks/V00-V05_課堂搶答題庫_審閱_$(date +%Y%m%d-%H%M).docx" /home/claude/banks/V0*_課堂搶答題庫_*.json
```
用 `project_write`（`local_path`）把 6 個 JSON 與 1 個 docx 存進專案；用 SendUserFile 把 docx 傳給使用者。

- [ ] **Step 6: 使用者審閱檢查點**

請使用者審閱 Word。依意見修改 JSON → 重跑 Step 3、5。**使用者確認前不上傳到 Firebase。**

- [ ] **Step 7: 上傳題庫（Chrome）**

host.html → 上傳題庫 JSON → 選 6 個檔。由於 Chrome 擴充功能的檔案上傳需本機檔案，使用 `mcp__claude-in-chrome__file_upload`（若不可用，請使用者從專案下載後自行選檔上傳）。
Expected: 「已上傳 V00（N 題）」×6；下拉選單出現 V00–V05。

---

### Task 14: 端到端預演與交付

- [ ] **Step 1: 線上規則抽查（Chrome）**

確認線上部署的規則與 CI 測過的一致：Firebase 控制台 → Realtime Database → 規則分頁，內容與 repo 的 `database.rules.json` 逐字相同；再用「規則遊樂場」（Rules Playground）：
- 模擬讀取 `/banks`，已驗證身分 UID `x`、提供者 anonymous → Expected: 拒絕
- 模擬讀取 `/roster`，UID `x` → Expected: 拒絕
- 模擬讀取 `/roster/sT001`，UID `x` → Expected: 允許

- [ ] **Step 2: 實機預演（需使用者參與）**

1. 使用者電腦開 host.html 投影 → 建立 V00 場次。
2. 使用者與 2–3 位助理／學生用手機掃投影幕上的 QR code，以測試學號登入。
3. 跑完整場：確認倒數同步、提前收卷、長條圖、詳解、前 5 名、頒獎台。
4. 刻意測試：一支手機重新整理（應回到原身分）、一支手機換瀏覽器登入同學號（應被擋）→ 老師按解除綁定 → 可登入。
5. 結束後確認 Google Sheet「作答明細」「成績排名」寫入正確；按「下載 CSV」確認檔名與內容。

- [ ] **Step 3: 若 Sheet 寫入在瀏覽器端讀不到回應（CORS）**

若 Step 2 的 Sheet 實際有寫入、但畫面顯示「寫入失敗：Failed to fetch」（瀏覽器讀不到 Apps Script 的回應），把 `src/host.js` 的 `sendToSheet` catch 區塊改成下面這樣，讓老師知道要去 Sheet 確認，而不是誤以為沒寫入（Apps Script 端已做重送冪等，按重新寫入不會重複）：
```js
  } catch (err) {
    const maybeSent = err instanceof TypeError; // 網路層錯誤：請求可能已送達但讀不到回應
    $('#sheet-msg').textContent = maybeSent
      ? '已送出，但瀏覽器讀不到 Google Sheet 的回應。請打開 Sheet 確認是否已寫入；沒有的話按「重新寫入」或下載 CSV。'
      : `寫入 Google Sheet 失敗：${err.message}\n成績仍保存在資料庫，可按「重新寫入」或下載 CSV。`;
    $('#btn-resend').hidden = false;
  }
```
執行 `npm run build`、推送後重測，並在使用說明中寫明。

- [ ] **Step 4: 交付文件**

把以下存進 Claude 專案（`project_write`），檔名帶時間：
- `健康社會行為學_課堂搶答工具_使用說明_<YYYYMMDD-HHMM>.md`：網址（host、play）、開場步驟、名單更新方式、題庫上傳方式、解除綁定、成績位置、常見問題。
- 本計畫與規格的最終版。

- [ ] **Step 5: 推送最終版**

```bash
git add -A && git commit -m "docs: final" && git push
```

---

## 規格對照（自我檢查）

| 規格要求 | 對應 Task |
|---|---|
| 選集數開場、6 位數場次碼、QR | 9 |
| 學號＋名單比對、一號一機、解除綁定 | 4（規則）、8、9 |
| 題目同時顯示大螢幕與手機 | 8、9 |
| 計分 1000→500、同分規則 | 1 |
| 公布答案＋長條圖＋詳解＋前 5 名、最終頒獎台 | 9 |
| 提前收卷、斷線重連、遲到、老師端接續 | 8、9 |
| 防作弊（一次作答、伺服器時間、逾時、不能讀答案） | 4 |
| 名單不可整份下載、題庫不進 GitHub、金鑰不在網頁 | 4、10、.gitignore |
| Google Sheet 三分頁、重送冪等、CSV 備份 | 9、10 |
| 40 人模擬 | 5 |
| 題庫格式、出題規則、Word 審閱、使用者確認後上傳 | 2、12、13 |
| 80 連線警告 | 9（renderPlayers） |
| 檔名含集數與時間、存入專案 | 9（CSV）、13、14 |
