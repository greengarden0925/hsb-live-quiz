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
    await assertSucceeds(as('teacher').ref('roster').get());
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
