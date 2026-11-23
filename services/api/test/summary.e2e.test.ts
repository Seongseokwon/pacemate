import { weeklySummaryResponseSchema } from '@pacemate/shared';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createTestApp } from './test-app.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

// 주간 요약 API(F08-R01, API_SPEC §3.7). 수치 계산 자체는 summary.service.test.ts가 본다
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
// 화요일. 이번 주는 11/16(월)~11/22(일)
const today = '2026-11-17';
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const db = createTestPrisma();
let app: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${today}T03:00:00Z`) });
  app = await createTestApp();
});
beforeEach(async () => {
  await resetDatabase(db);
  for (const id of [user, other]) await db.user.create({ data: { id, authProvider: 'google', termsAgreedAt: new Date(), privacyAgreedAt: new Date(), healthDataAgreedAt: new Date(), consentVersion: '1' } });
});
afterAll(async () => {
  vi.useRealTimers();
  await app.app.close();
  await db.$disconnect();
});

async function seed(userId: string) {
  const plan = await db.trainingPlan.create({ data: { userId, status: 'active', kind: 'race_prep', goalDistance: 'ten_k', startDate: day('2026-11-09'), endDate: day('2026-12-20'), engineVersion: 'test' } });
  const first = await db.plannedSession.create({ data: { userId, planId: plan.id, date: day('2026-11-16'), type: 'easy', distanceKm: 5, weekNumber: 2 } });
  await db.plannedSession.create({ data: { userId, planId: plan.id, date: day('2026-11-19'), type: 'easy', distanceKm: 6, weekNumber: 2 } });
  await db.workoutLog.create({ data: { userId, date: day('2026-11-16'), distanceKm: 5.2, durationSec: 1800, source: 'app', plannedSessionId: first.id } });
}

test('이번 주 요약을 그 주의 계획과 기록으로 계산한다 (AC-F08-01)', async () => {
  await seed(user);

  const res = await app.call('get', '/v1/summaries/weekly', user);

  expect(res.status).toBe(200);
  const body = weeklySummaryResponseSchema.parse(res.body);
  expect(body).toMatchObject({ weekStart: '2026-11-16', plannedCount: 2, completedCount: 1, totalDistanceKm: 5.2, completionRate: 0.5 });
  expect(body.nextSession?.date).toBe('2026-11-19');
});

test('1단계 출시에는 AI 피드백이 없고 무료 사용자로 알린다 (F08-R02는 2단계)', async () => {
  await seed(user);
  const body = weeklySummaryResponseSchema.parse((await app.call('get', '/v1/summaries/weekly', user)).body);
  expect(body.aiFeedback).toBeNull();
  expect(body.aiFeedbackAvailable).toBe(false);
});

test('지난주를 고를 수 있고, 다른 사용자의 데이터는 세지 않는다 (DI-07)', async () => {
  await seed(other);
  const body = weeklySummaryResponseSchema.parse((await app.call('get', '/v1/summaries/weekly?weekStart=2026-11-09', user)).body);
  expect(body).toMatchObject({ weekStart: '2026-11-09', plannedCount: 0, completedCount: 0, totalDistanceKm: 0, nextSession: null });
  expect(weeklySummaryResponseSchema.parse((await app.call('get', '/v1/summaries/weekly', user)).body).plannedCount).toBe(0);
});

test('주의 시작이 월요일이 아니면 거절한다', async () => {
  const res = await app.call('get', '/v1/summaries/weekly?weekStart=2026-11-17', user);
  expect(res.status).toBe(400);
});
