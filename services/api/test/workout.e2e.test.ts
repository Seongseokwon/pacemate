import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createTestApp } from './test-app.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const date = '2026-11-17';
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const db = createTestPrisma();
let app: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${date}T03:00:00Z`) });
  app = await createTestApp();
});
beforeEach(async () => {
  await resetDatabase(db);
  for (const id of [user, other]) await db.user.create({ data: { id, authProvider: 'google', termsAgreedAt: new Date(), privacyAgreedAt: new Date(), healthDataAgreedAt: new Date(), consentVersion: '1' } });
});
afterAll(async () => { vi.useRealTimers(); await app.app.close(); await db.$disconnect(); });

test('기록 연결, 페이스, 진행률과 삭제 후 훈련 상태 (AC-F07-01~04)', async () => {
  const plan = await db.trainingPlan.create({ data: { userId: user, status: 'active', kind: 'race_prep', goalDistance: 'ten_k', startDate: day('2026-11-16'), endDate: day('2026-12-20'), engineVersion: 'test' } });
  const session = await db.plannedSession.create({ data: { userId: user, planId: plan.id, date: day(date), type: 'easy', distanceKm: 5, weekNumber: 1 } });
  const body = { date, distanceKm: 5, durationSec: 1800, plannedSessionId: session.id };
  const saved = await app.call('post', '/v1/workouts', user, body);
  expect(saved.status).toBe(201);
  expect(saved.body).toMatchObject({ workout: { paceSecPerKm: 360 }, weekProgress: { completed: 1, planned: 1 } });
  expect((await app.call('get', `/v1/sessions/${session.id}`, user)).body.status).toBe('completed');
  const replacement = await app.call('post', '/v1/workouts', user, { ...body, confirmDuplicate: true });
  expect(replacement.status).toBe(201);
  expect((await db.workoutLog.findUniqueOrThrow({ where: { id: saved.body.workout.id } })).plannedSessionId).toBeNull();
  await app.call('delete', `/v1/workouts/${replacement.body.workout.id}`, user);
  expect((await app.call('delete', `/v1/workouts/${saved.body.workout.id}`, other)).status).toBe(404);
  expect((await app.call('delete', `/v1/workouts/${saved.body.workout.id}`, user)).status).toBe(204);
  expect((await app.call('get', `/v1/sessions/${session.id}`, user)).body.status).toBe('planned');
});

test('동시 중복 요청, 이상 페이스 확인과 통계 (F07-R03, F07-R08)', async () => {
  const body = { date, distanceKm: 5, durationSec: 1800 };
  const results = await Promise.all([app.call('post', '/v1/workouts', user, body), app.call('post', '/v1/workouts', user, body)]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect((await app.call('post', '/v1/workouts', user, { ...body, durationSec: 60 })).body.code).toBe('PACE_OUT_OF_RANGE');
  expect((await app.call('get', '/v1/workouts/stats', user)).body).toEqual({ week: { distanceKm: 5, count: 1 }, month: { distanceKm: 5, count: 1 } });
});

test('Apple 건강 기록은 동시 가져오기에도 중복되지 않고 같은 날 훈련에 연결된다 (F07-R11)', async () => {
  const plan = await db.trainingPlan.create({ data: { userId: user, status: 'active', kind: 'race_prep', goalDistance: 'ten_k', startDate: day('2026-11-16'), endDate: day('2026-12-20'), engineVersion: 'test' } });
  const session = await db.plannedSession.create({ data: { userId: user, planId: plan.id, date: day(date), type: 'easy', distanceKm: 5, weekNumber: 1 } });
  const body = { externalId: '33333333-3333-4333-8333-333333333333', date, startedAt: '2026-11-17T00:00:00.000Z', endedAt: '2026-11-17T00:30:00.000Z', distanceKm: 5, durationSec: 1800, averageHeartRate: 140 };
  const results = await Promise.all([app.call('post', '/v1/workouts/healthkit', user, body), app.call('post', '/v1/workouts/healthkit', user, body)]);
  expect(results.map((r) => r.body.imported).sort()).toEqual([false, true]);
  expect((await app.call('get', '/v1/workouts', user)).body.items).toMatchObject([{ source: 'healthkit', plannedSessionId: session.id, averageHeartRate: 140 }]);
  expect((await app.call('post', '/v1/workouts/healthkit', other, body)).body.imported).toBe(true);
  const id = (await app.call('get', '/v1/workouts', user)).body.items[0].id;
  await app.call('patch', `/v1/workouts/${id}`, user, { distanceKm: 5.2 });
  expect((await app.call('post', '/v1/workouts/healthkit', user, body)).body.imported).toBe(false);
  await app.call('delete', `/v1/workouts/${id}`, user);
  expect((await app.call('post', '/v1/workouts/healthkit', user, body)).body.imported).toBe(false);
  expect((await app.call('post', '/v1/workouts/healthkit', user, { ...body, externalId: '44444444-4444-4444-8444-444444444444', distanceKm: 10, durationSec: 600 })).body.imported).toBe(false);
});

test('Apple 건강 가져오기는 비슷한 수동 기록을 보존하고 미래 날짜를 거절한다 (F07-R11)', async () => {
  const body = { externalId: '33333333-3333-4333-8333-333333333333', date, startedAt: '2026-11-17T00:00:00.000Z', endedAt: '2026-11-17T00:30:00.000Z', distanceKm: 5, durationSec: 1800, averageHeartRate: null };
  await app.call('post', '/v1/workouts', user, { date, distanceKm: 5, durationSec: 1800 });
  expect((await app.call('post', '/v1/workouts/healthkit', user, body)).body.imported).toBe(true);
  expect((await app.call('get', '/v1/workouts/stats', user)).body.week).toEqual({ distanceKm: 5, count: 1 });
  const items = (await app.call('get', '/v1/workouts', user)).body.items;
  expect((await app.call('get', `/v1/workouts/${items[0].id}/similar`, user)).body.items).toHaveLength(1);
  expect((await app.call('patch', `/v1/workouts/${items[0].id}`, user, { separateRun: true })).status).toBe(200);
  expect((await app.call('get', '/v1/workouts/stats', user)).body.week.count).toBe(2);
  expect((await app.call('post', '/v1/workouts/healthkit', user, { ...body, date: '2026-11-18' })).status).toBe(400);
});

test('Apple 건강 기록은 생략한 훈련과 종료된 계획에 연결하지 않는다 (F07-R11)', async () => {
  const planData = { userId: user, kind: 'race_prep' as const, goalDistance: 'ten_k' as const, startDate: day('2026-11-16'), endDate: day('2026-12-20'), engineVersion: 'test' };
  const active = await db.trainingPlan.create({ data: { ...planData, status: 'active' } });
  const ended = await db.trainingPlan.create({ data: { ...planData, status: 'ended' } });
  await db.plannedSession.create({ data: { userId: user, planId: active.id, date: day(date), type: 'easy', distanceKm: 5, weekNumber: 1, isSkipped: true } });
  await db.plannedSession.create({ data: { userId: user, planId: ended.id, date: day(date), type: 'easy', distanceKm: 5, weekNumber: 1 } });
  const result = await app.call('post', '/v1/workouts/healthkit', user, { externalId: '33333333-3333-4333-8333-333333333333', date, startedAt: '2026-11-17T00:00:00.000Z', endedAt: '2026-11-17T00:30:00.000Z', distanceKm: 5, durationSec: 1800, averageHeartRate: null });
  expect(result.body.imported).toBe(true);
  expect((await app.call('get', '/v1/workouts', user)).body.items[0].plannedSessionId).toBeNull();
});

test('통증 기록을 저장하면 휴식을 권한다', async () => {
  const result = await app.call('post', '/v1/workouts', user, { date, distanceKm: 5, durationSec: 1800, memo: '무릎이 아파요' });
  expect(result.body.coachLine).toMatchObject({ code: 'WORKOUT_PAIN', text: expect.stringContaining('쉬') });
});

test('후보 정렬과 기록 수정·페이지 조회는 사용자별로 제한된다 (F07-R04, F07-R06)', async () => {
  const plan = await db.trainingPlan.create({ data: { userId: user, status: 'active', kind: 'race_prep', goalDistance: 'ten_k', startDate: day('2026-11-16'), endDate: day('2026-12-20'), engineVersion: 'test' } });
  const earlier = await db.plannedSession.create({ data: { userId: user, planId: plan.id, date: day('2026-11-16'), type: 'easy', distanceKm: 5, weekNumber: 1 } });
  const same = await db.plannedSession.create({ data: { userId: user, planId: plan.id, date: day(date), type: 'easy', distanceKm: 5, weekNumber: 1 } });
  const candidates = await app.call('get', `/v1/workouts/link-candidates?date=${date}`, user);
  expect(candidates.body.items.map((s: { id: string }) => s.id)).toEqual([same.id, earlier.id]);
  const first = await app.call('post', '/v1/workouts', user, { date, distanceKm: 5, durationSec: 1800 });
  const second = await app.call('post', '/v1/workouts', user, { date: '2026-11-16', distanceKm: 4, durationSec: 1500 });
  const id = first.body.workout.id;
  expect((await app.call('patch', `/v1/workouts/${id}`, other, { rpe: 5 })).status).toBe(404);
  expect((await app.call('patch', `/v1/workouts/${id}`, user, { plannedSessionId: same.id, rpe: 5 })).body).toMatchObject({ plannedSessionId: same.id, rpe: 5 });
  const page = await app.call('get', '/v1/workouts?limit=1', user);
  expect(page.body).toMatchObject({ items: [{ id }], hasMore: true });
  expect((await app.call('get', `/v1/workouts?limit=1&before=${id}`, user)).body).toMatchObject({ items: [{ id: second.body.workout.id }], hasMore: false });
  expect((await app.call('post', '/v1/workouts', user, { date: '2026-11-18', distanceKm: 5, durationSec: 1800 })).status).toBe(400);
});

test('Apple 건강 기록은 가져온 순서에 관계없이 가장 가까운 훈련에 연결된다 (F07-R11)', async () => {
  const plan = await db.trainingPlan.create({ data: { userId: user, status: 'active', kind: 'race_prep', goalDistance: 'ten_k', startDate: day('2026-11-16'), endDate: day('2026-12-20'), engineVersion: 'test' } });
  const session = await db.plannedSession.create({ data: { userId: user, planId: plan.id, date: day(date), type: 'easy', distanceKm: 10, weekNumber: 1 } });
  const body = { date, startedAt: '2026-11-17T00:00:00.000Z', endedAt: '2026-11-17T01:00:00.000Z', averageHeartRate: null };
  await app.call('post', '/v1/workouts/healthkit', user, { ...body, externalId: '33333333-3333-4333-8333-333333333333', distanceKm: 2, durationSec: 720 });
  await app.call('post', '/v1/workouts/healthkit', user, { ...body, externalId: '44444444-4444-4444-8444-444444444444', distanceKm: 10, durationSec: 3600 });
  const rows = await db.workoutLog.findMany({ where: { userId: user } });
  expect(rows.find((row) => row.distanceKm.toNumber() === 10)?.plannedSessionId).toBe(session.id);
  expect(rows.find((row) => row.distanceKm.toNumber() === 2)?.plannedSessionId).toBeNull();
});

test('동시에 연결을 바꿔도 한 기록만 훈련에 연결된다 (DI-10)', async () => {
  const plan = await db.trainingPlan.create({ data: { userId: user, status: 'active', kind: 'race_prep', goalDistance: 'ten_k', startDate: day('2026-11-16'), endDate: day('2026-12-20'), engineVersion: 'test' } });
  const session = await db.plannedSession.create({ data: { userId: user, planId: plan.id, date: day(date), type: 'easy', distanceKm: 5, weekNumber: 1 } });
  const a = await app.call('post', '/v1/workouts', user, { date, distanceKm: 5, durationSec: 1800 });
  const b = await app.call('post', '/v1/workouts', user, { date, distanceKm: 6, durationSec: 2100 });
  const results = await Promise.all([a, b].map((item) => app.call('patch', `/v1/workouts/${item.body.workout.id}`, user, { plannedSessionId: session.id })));
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  expect(await db.workoutLog.count({ where: { userId: user, plannedSessionId: session.id } })).toBe(1);
});

test('사용자가 고른 연결과 자유 러닝은 이후 건강 기록이 와도 유지된다 (F07-R11)', async () => {
  const plan = await db.trainingPlan.create({ data: { userId: user, status: 'active', kind: 'race_prep', goalDistance: 'ten_k', startDate: day('2026-11-16'), endDate: day('2026-12-20'), engineVersion: 'test' } });
  const session = await db.plannedSession.create({ data: { userId: user, planId: plan.id, date: day(date), type: 'easy', distanceKm: 10, weekNumber: 1 } });
  const body = { date, startedAt: '2026-11-17T00:00:00.000Z', endedAt: '2026-11-17T01:00:00.000Z', averageHeartRate: null };
  await app.call('post', '/v1/workouts/healthkit', user, { ...body, externalId: '44444444-4444-4444-8444-444444444444', distanceKm: 10, durationSec: 3600 });
  const first = await db.workoutLog.findFirstOrThrow({ where: { userId: user } });
  await app.call('patch', `/v1/workouts/${first.id}`, user, { plannedSessionId: null });
  await app.call('post', '/v1/workouts/healthkit', user, { ...body, externalId: '33333333-3333-4333-8333-333333333333', distanceKm: 2, durationSec: 720 });
  expect((await db.workoutLog.findUniqueOrThrow({ where: { id: first.id } })).plannedSessionId).toBeNull();
  expect((await db.workoutLog.findFirstOrThrow({ where: { userId: user, distanceKm: 2 } })).plannedSessionId).toBe(session.id);
});
