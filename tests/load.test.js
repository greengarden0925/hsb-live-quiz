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
