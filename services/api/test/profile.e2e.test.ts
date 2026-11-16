import type { ClassifyLevel } from '@pacemate/training-engine';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LEVEL_CLASSIFIER, unavailableLevelClassifier } from '../src/profile/level-classifier.js';
import { createTestApp } from './test-app.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROFILE = { experience: 'under_6m', continuousRun: 'under_30m', recentWeeklyKm: 12.5, weeklyRunCount: 3, preferredWeekdays: [1, 3, 6] };

const prisma = createTestPrisma();
const classifyLevel = vi.fn<ClassifyLevel>(() => 'novice');
let t: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  t = await createTestApp({ override: (builder) => builder.overrideProvider(LEVEL_CLASSIFIER).useValue(classifyLevel) });
});

beforeEach(async () => {
  await resetDatabase(prisma);
  classifyLevel.mockClear();
  const now = new Date();
  for (const id of [USER_A, USER_B]) {
    await prisma.user.create({
      data: { id, authProvider: 'google', termsAgreedAt: now, privacyAgreedAt: now, healthDataAgreedAt: now, consentVersion: '1' },
    });
  }
});

afterAll(async () => {
  await t.app.close();
  await prisma.$disconnect();
});

const save = (body: object, user = USER_A) => t.call('put', '/v1/profile', user, body);

describe('PUT /v1/profile (F02)', () => {
  test('프로필을 저장하고 Training Engine이 분류한 수준을 돌려준다 (F02-R04, TE-G01)', async () => {
    const res = await save(PROFILE);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...PROFILE, recentRecord: null, level: 'novice' });
    expect(classifyLevel).toHaveBeenCalledWith({ ...PROFILE, recentPaceSecPerKm: null, recentRecordKm: null });
    expect((await t.call('get', '/v1/profile', USER_A)).body).toEqual(res.body);
  });

  test('"잘 모르겠어요"는 0과 구분해 빈 값으로 저장한다 (F02-R03, TE-G05)', async () => {
    expect((await save({ ...PROFILE, recentWeeklyKm: undefined })).body.recentWeeklyKm).toBeNull();
    expect((await save({ ...PROFILE, recentWeeklyKm: 0 })).body.recentWeeklyKm).toBe(0);
  });

  test('최근 기록은 km당 페이스로 환산해 저장한다', async () => {
    const record = await save({ ...PROFILE, recentRecord: { distanceKm: 5, durationSec: 1800 } });
    expect(record.body.recentRecord).toEqual({ distanceKm: 5, durationSec: 1800 });
    expect((await prisma.runnerProfile.findUniqueOrThrow({ where: { userId: USER_A } })).recentPaceSecPerKm).toBe(360);

    const pace = await save({ ...PROFILE, recentRecord: { paceSecPerKm: 400 } });
    expect(pace.body.recentRecord).toEqual({ paceSecPerKm: 400 });
  });

  test.each([
    ['필수 항목이 빠진 경우', { ...PROFILE, experience: undefined }, 'experience'],
    ['주간 횟수가 범위를 벗어난 경우', { ...PROFILE, weeklyRunCount: 6 }, 'weeklyRunCount'],
    ['주간 거리가 범위를 벗어난 경우', { ...PROFILE, recentWeeklyKm: 100.1 }, 'recentWeeklyKm'],
    ['요일이 주간 횟수보다 적은 경우', { ...PROFILE, preferredWeekdays: [1, 3] }, 'preferredWeekdays'],
    ['같은 요일을 두 번 고른 경우', { ...PROFILE, preferredWeekdays: [1, 1, 3] }, 'preferredWeekdays'],
    ['기록의 페이스가 비정상인 경우', { ...PROFILE, recentRecord: { distanceKm: 42, durationSec: 60 } }, 'recentRecord'],
  ])('%s 거절하고 저장하지 않는다 (AC-F02-01, AC-F02-02)', async (_name, body, field) => {
    const res = await save(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.fields).toHaveProperty(field);
    expect(await prisma.runnerProfile.count()).toBe(0);
  });

  test('활성 계획이 없으면 다시 저장할 수 있고, 있으면 PLAN_ACTIVE다 (F02-R05)', async () => {
    await save(PROFILE);
    expect((await save({ ...PROFILE, weeklyRunCount: 2 })).body.weeklyRunCount).toBe(2);

    await prisma.trainingPlan.create({
      data: {
        userId: USER_A,
        status: 'active',
        goalDistance: 'half',
        startDate: new Date('2026-11-16'),
        endDate: new Date('2027-02-07'),
        engineVersion: 'test',
      },
    });
    const res = await save(PROFILE);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PLAN_ACTIVE');
    expect((await t.call('get', '/v1/profile', USER_A)).body.weeklyRunCount).toBe(2);
  });
});

describe('GET /v1/profile', () => {
  test('프로필이 없으면 404이고, 다른 사용자의 프로필은 보이지 않는다 (DI-07)', async () => {
    await save(PROFILE, USER_A);

    const res = await t.call('get', '/v1/profile', USER_B);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

test('분류 함수가 없는 기본 구현은 임의의 수준을 돌려주지 않는다', () => {
  expect(() => unavailableLevelClassifier({ ...PROFILE, recentPaceSecPerKm: null } as never)).toThrow();
});
