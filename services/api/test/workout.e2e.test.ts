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
  expect((await app.call('post', '/v1/workouts', user, { ...body, confirmDuplicate: true })).body.code).toBe('SESSION_ALREADY_COMPLETED');
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
  const body = { date, distanceKm: 5, durationSec: 1800, averageHeartRate: 140 };
  const results = await Promise.all([app.call('post', '/v1/workouts/healthkit', user, body), app.call('post', '/v1/workouts/healthkit', user, body)]);
  expect(results.map((r) => r.body.imported).sort()).toEqual([false, true]);
  expect((await app.call('get', '/v1/workouts', user)).body.items).toMatchObject([{ source: 'healthkit', plannedSessionId: session.id, averageHeartRate: 140 }]);
  expect((await app.call('post', '/v1/workouts/healthkit', other, body)).body.imported).toBe(true);
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
