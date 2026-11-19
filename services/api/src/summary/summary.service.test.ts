import { Test } from '@nestjs/testing';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestPrisma, resetDatabase } from '../../test/test-db.js';
import { PrismaService } from '../db/prisma.service.js';
import { SummaryService } from './summary.service.js';

const prisma = createTestPrisma();
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
// 목요일. 이번 주는 11/16(월)~11/22(일)
const TODAY = '2026-11-19';
const day = (date: string) => new Date(`${date}T00:00:00Z`);

let service: SummaryService;

async function seedUser(id: string) {
  const now = new Date();
  await prisma.user.create({ data: { id, authProvider: 'google', termsAgreedAt: now, privacyAgreedAt: now, healthDataAgreedAt: now, consentVersion: '1' } });
  return prisma.trainingPlan.create({
    data: { userId: id, status: 'active', kind: 'race_prep', goalDistance: 'ten_k', startDate: day('2026-11-09'), endDate: day('2026-12-31'), engineVersion: 'test' },
  });
}

async function session(planId: string, userId: string, date: string, extra: { type?: 'easy' | 'race'; isSkipped?: boolean } = {}) {
  return prisma.plannedSession.create({ data: { planId, userId, date: day(date), type: extra.type ?? 'easy', distanceKm: 5, weekNumber: 2, isSkipped: extra.isSkipped ?? false } });
}

async function workout(userId: string, date: string, distanceKm: number, plannedSessionId?: string) {
  await prisma.workoutLog.create({ data: { userId, date: day(date), distanceKm, durationSec: 1800, source: 'app', plannedSessionId } });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${TODAY}T03:00:00Z`) });
  await resetDatabase(prisma);
  const moduleRef = await Test.createTestingModule({ providers: [SummaryService, { provide: PrismaService, useValue: prisma }] }).compile();
  service = moduleRef.get(SummaryService);
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.$disconnect();
});

describe('SummaryService.weeklyNumbers', () => {
  test('그 주의 계획·기록 데이터와 일치한다. 대회와 생략한 훈련은 세지 않는다 (AC-F08-01, F08-R01)', async () => {
    const plan = await seedUser(USER);
    const mon = await session(plan.id, USER, '2026-11-16');
    await session(plan.id, USER, '2026-11-18'); // 놓친 훈련
    await session(plan.id, USER, '2026-11-20');
    await session(plan.id, USER, '2026-11-21', { isSkipped: true });
    await session(plan.id, USER, '2026-11-22', { type: 'race' });
    await session(plan.id, USER, '2026-11-24'); // 다음 주
    await workout(USER, '2026-11-16', 5.2, mon.id);
    await workout(USER, '2026-11-17', 3.15); // 훈련에 연결되지 않은 기록도 거리에 더한다
    await workout(USER, '2026-11-09', 10); // 지난주

    const numbers = await service.weeklyNumbers(USER, '2026-11-16');

    expect(numbers).toMatchObject({ weekStart: '2026-11-16', plannedCount: 3, completedCount: 1, totalDistanceKm: 8.35 });
    expect(numbers.completionRate).toBeCloseTo(1 / 3);
    // 다음 훈련은 오늘 이후의 생략·완료되지 않은 첫 훈련이다
    expect(numbers.nextSession).toMatchObject({ date: '2026-11-20', status: 'planned' });
  });

  test('계획도 기록도 없는 주는 0이고, 다른 사용자의 데이터는 세지 않는다 (DI-07)', async () => {
    const plan = await seedUser(OTHER);
    await session(plan.id, OTHER, '2026-11-20');
    await workout(OTHER, '2026-11-17', 5);
    await seedUser(USER);

    expect(await service.weeklyNumbers(USER, '2026-11-16')).toEqual({
      weekStart: '2026-11-16',
      plannedCount: 0,
      completedCount: 0,
      totalDistanceKm: 0,
      completionRate: 0,
      nextSession: null,
    });
  });
});
