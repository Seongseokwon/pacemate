import { generate, validate } from '@pacemate/training-engine';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { TRAINING_ENGINE } from '../src/plan/training-engine.js';
import { createTestApp } from './test-app.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
// 화요일
const TODAY = '2026-11-17';
const day = (date: string) => new Date(`${date}T00:00:00Z`);

const prisma = createTestPrisma();
const engine = { generate: vi.fn(generate), validate: vi.fn(validate), version: 'test-version' };
let t: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  // "오늘"만 고정한다. 타이머까지 멈추면 DB 연결이 기다리다 멈춘다
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${TODAY}T03:00:00Z`) });
  t = await createTestApp({ override: (builder) => builder.overrideProvider(TRAINING_ENGINE).useValue(engine) });
});

const createProfile = (userId: string, data: { recentWeeklyKm?: number | null; preferredWeekdays?: number[] } = {}) =>
  prisma.runnerProfile.create({
    data: {
      userId,
      experience: 'under_2y',
      continuousRun: 'under_60m',
      recentWeeklyKm: 15,
      recentPaceSecPerKm: 400,
      weeklyRunCount: 3,
      preferredWeekdays: [3, 5, 7],
      level: 'novice',
      ...data,
    },
  });

beforeEach(async () => {
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
  engine.generate.mockClear();
  engine.validate.mockClear();
  await resetDatabase(prisma);
  const now = new Date();
  for (const id of [USER_A, USER_B]) {
    await prisma.user.create({
      data: { id, authProvider: 'google', termsAgreedAt: now, privacyAgreedAt: now, healthDataAgreedAt: now, consentVersion: '1' },
    });
  }
  await createProfile(USER_A);
});

afterAll(async () => {
  vi.useRealTimers();
  await t.app.close();
  await prisma.$disconnect();
});

const GOAL = { goalDistance: 'five_k' };
const preview = (body: object = GOAL, user = USER_A) => t.call('post', '/v1/plan/preview', user, body);
const confirm = (body: object = { ...GOAL, kind: 'race_prep' }, user = USER_A) => t.call('post', '/v1/plan', user, body);
const get = (path: string, user = USER_A) => t.call('get', path, user);

/** 직접 넣은 계획. 상태 판정과 조회를 볼 때 쓴다 */
async function seedPlan(data: { userId?: string; raceDate?: string | null; startDate?: string; endDate?: string } = {}) {
  const userId = data.userId ?? USER_A;
  const plan = await prisma.trainingPlan.create({
    data: {
      userId,
      status: 'active',
      kind: 'race_prep',
      goalDistance: 'ten_k',
      raceDate: data.raceDate ? day(data.raceDate) : null,
      startDate: day(data.startDate ?? '2026-11-09'),
      endDate: day(data.endDate ?? '2027-01-17'),
      engineVersion: 'test',
    },
  });
  const session = (date: string, extra: { type?: 'easy' | 'long' | 'race'; isSkipped?: boolean } = {}) =>
    prisma.plannedSession.create({
      data: { planId: plan.id, userId, date: day(date), type: 'easy', distanceKm: 5, weekNumber: 1, ...extra },
    });
  const workout = (plannedSessionId: string, date: string) =>
    prisma.workoutLog.create({ data: { userId, date: day(date), distanceKm: 5, durationSec: 1920, rpe: 6, source: 'app', plannedSessionId } });
  return { plan, session, workout };
}

describe('POST /v1/plan/preview (F03)', () => {
  test('만들 수 있는 계획을 보여 주고 저장하지 않는다 (F03-R05, TE-G06)', async () => {
    const res = await preview();

    expect(res.status).toBe(200);
    expect(res.body.options.map((option: { kind: string }) => option.kind)).toEqual(['race_prep', 'base_building']);
    const [option] = res.body.options;
    expect(option).toMatchObject({ startDate: '2026-11-18', totalWeeks: 8, warnings: [] });
    expect(option.sessions[0]).toEqual({
      date: '2026-11-18',
      type: 'easy',
      distanceKm: expect.any(Number),
      durationMin: null,
      runIntervalMin: null,
      paceRange: { minSecPerKm: 440, maxSecPerKm: 500 },
      weekNumber: 1,
      status: 'planned',
      workoutId: null,
      original: null,
    });
    expect(await prisma.trainingPlan.count()).toBe(0);
    expect(await prisma.plannedSession.count()).toBe(0);
  });

  test('오늘 날짜는 서버가 정하고 프로필은 저장된 것을 쓴다 (DI-09, F03-R02)', async () => {
    await preview({ ...GOAL, raceDate: '2027-01-17', goalTimeSec: 1800 });

    expect(engine.generate).toHaveBeenCalledWith({
      profile: { experience: 'under_2y', continuousRun: 'under_60m', recentWeeklyKm: 15, recentPaceSecPerKm: 400, weeklyRunCount: 3, preferredWeekdays: [3, 5, 7] },
      goal: { goalDistance: 'five_k', goalTimeSec: 1800, raceDate: '2027-01-17' },
      today: TODAY,
    });
  });

  test('완주 준비 계획만 만들 수 없으면 기초 훈련 계획과 이유를 돌려준다 (F03-R06, AC-F03-04)', async () => {
    await prisma.runnerProfile.update({ where: { userId: USER_A }, data: { recentWeeklyKm: 0 } });
    const res = await preview();

    expect(res.status).toBe(200);
    expect(res.body.options).toHaveLength(1);
    expect(res.body.options[0]).toMatchObject({ kind: 'base_building', warnings: ['RACE_PREP_NOT_REACHABLE'] });
    expect(res.body.options[0].sessions[0]).toMatchObject({ type: 'walk_run', distanceKm: null, durationMin: 30, runIntervalMin: 30 });
  });

  test('어떤 계획도 만들 수 없으면 PLAN_NOT_FEASIBLE이다 (TE-G06)', async () => {
    engine.generate.mockReturnValueOnce({ level: 'novice', options: [] });
    const res = await preview();

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PLAN_NOT_FEASIBLE');
  });

  test('검증기를 통과하지 못한 계획은 보여 주지 않는다 (TE-S12)', async () => {
    engine.validate.mockReturnValueOnce({ ok: false, violations: ['TE-S01'] });
    const res = await preview();

    expect(res.body.options.map((option: { kind: string }) => option.kind)).toEqual(['base_building']);

    engine.validate.mockReturnValue({ ok: false, violations: ['TE-S01'] });
    expect((await preview()).body.code).toBe('PLAN_NOT_FEASIBLE');
    expect((await confirm()).body.code).toBe('PLAN_NOT_FEASIBLE');
    expect(await prisma.trainingPlan.count()).toBe(0);
    engine.validate.mockImplementation(validate);
  });

  test('프로필이 없거나 대회 날짜가 오늘 이전이면 거절한다', async () => {
    expect((await preview(GOAL, USER_B)).status).toBe(404);

    const res = await preview({ ...GOAL, raceDate: TODAY });
    expect(res.status).toBe(400);
    expect(res.body.fields.raceDate).toBeDefined();
    expect((await preview({ goalDistance: 'marathon' })).status).toBe(400);
  });
});

describe('POST /v1/plan (F03)', () => {
  test('확정한 계획은 미리보기와 같다 (F03-R05, AC-F03-05)', async () => {
    const [option] = (await preview()).body.options;
    const res = await confirm();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      kind: 'race_prep',
      goalDistance: 'five_k',
      goalTimeSec: null,
      raceDate: null,
      startDate: option.startDate,
      endDate: option.endDate,
      version: 1,
      warnings: [],
      progress: { completed: 0, total: option.sessions.length },
      isFinished: false,
    });
    expect((await get('/v1/plan')).body).toEqual(res.body);

    const sessions = (await get(`/v1/sessions?from=${option.startDate}&to=${option.endDate}`)).body.items;
    expect(sessions).toEqual(option.sessions.map((session: object) => ({ id: expect.any(String), ...session })));
    expect((await prisma.trainingPlan.findFirstOrThrow()).engineVersion).toBe('test-version');
  });

  test('시간 기반 계획과 경고, 대회를 저장한다 (AC-F03-06, TE-G08, TE-S14)', async () => {
    await prisma.runnerProfile.update({ where: { userId: USER_A }, data: { recentWeeklyKm: null, continuousRun: 'under_10m' } });
    const body = { ...GOAL, raceDate: '2026-12-20', goalTimeSec: 2400, kind: 'base_building' };
    const res = await confirm(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'base_building', raceDate: '2026-12-20', endDate: '2026-12-20', goalTimeSec: 2400 });
    expect(res.body.warnings).toContain('RACE_PREP_NOT_REACHABLE');
    const { items } = (await get('/v1/sessions?from=2026-11-17&to=2026-12-20')).body;
    expect(items[0]).toMatchObject({ type: 'walk_run', durationMin: 30, runIntervalMin: 1, distanceKm: null });
    expect(items.at(-1)).toMatchObject({ date: '2026-12-20', type: 'race', distanceKm: 5 });
    // 진행률은 대회를 세지 않는다
    expect(res.body.progress.total).toBe(items.length - 1);
  });

  test('고른 종류의 계획을 만들 수 없으면 PLAN_NOT_FEASIBLE이다', async () => {
    await prisma.runnerProfile.update({ where: { userId: USER_A }, data: { recentWeeklyKm: 0 } });
    const res = await confirm();

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PLAN_NOT_FEASIBLE');
    expect(await prisma.trainingPlan.count()).toBe(0);
  });

  test('활성 계획이 있으면 PLAN_ALREADY_ACTIVE다 (DI-13)', async () => {
    expect((await confirm()).status).toBe(201);
    const res = await confirm({ goalDistance: 'ten_k', kind: 'base_building' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PLAN_ALREADY_ACTIVE');
    expect(await prisma.trainingPlan.count()).toBe(1);
  });

  test('동시에 확정해도 계획은 하나만 생긴다 (DI-13)', async () => {
    const results = await Promise.all([confirm(), confirm(), confirm()]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.trainingPlan.count()).toBe(1);
    const plan = await prisma.trainingPlan.findFirstOrThrow();
    expect(await prisma.plannedSession.count({ where: { planId: { not: plan.id } } })).toBe(0);
  });

  test('기간이 끝난 계획은 새 계획을 확정할 때 종료된다 (F03-R08)', async () => {
    const { plan: old, session } = await seedPlan({ startDate: '2026-09-07', endDate: '2026-11-15' });
    await session('2026-11-14');
    expect((await get('/v1/plan')).body.isFinished).toBe(true);

    const res = await confirm();

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(old.id);
    const ended = await prisma.trainingPlan.findUniqueOrThrow({ where: { id: old.id } });
    expect(ended.status).toBe('ended');
    expect(ended.endedAt).not.toBeNull();
    // 끝난 계획의 훈련은 지우지 않는다
    expect((await get('/v1/sessions?from=2026-11-14&to=2026-11-14')).body.items).toHaveLength(1);
  });

  test('다른 사용자의 계획은 영향을 받지 않는다 (DI-07)', async () => {
    await createProfile(USER_B);
    await confirm(undefined, USER_B);

    expect((await get('/v1/plan')).body.code).toBe('NO_ACTIVE_PLAN');
    expect((await confirm()).status).toBe(201);
    expect(await prisma.trainingPlan.count({ where: { status: 'active' } })).toBe(2);
  });
});

describe('GET /v1/plan', () => {
  test('활성 계획이 없으면 NO_ACTIVE_PLAN이다', async () => {
    const res = await get('/v1/plan');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_ACTIVE_PLAN');
  });

  test('진행률은 완료 수 / (전체 − 생략)이고 대회를 세지 않는다 (DATABASE §3.4)', async () => {
    const { session, workout } = await seedPlan({ raceDate: '2027-01-17' });
    const done = await session('2026-11-11');
    await workout(done.id, '2026-11-11');
    await session('2026-11-13');
    await session('2026-11-18', { isSkipped: true });
    await session('2026-11-20');
    await session('2027-01-17', { type: 'race' });

    expect((await get('/v1/plan')).body.progress).toEqual({ completed: 1, total: 3 });
  });

  test('종료일 당일까지는 진행 중이다 (F03-R08)', async () => {
    await seedPlan({ endDate: TODAY });
    expect((await get('/v1/plan')).body.isFinished).toBe(false);

    vi.setSystemTime(new Date('2026-11-17T15:00:00Z')); // 한국 시간으로 다음 날 0시
    expect((await get('/v1/plan')).body.isFinished).toBe(true);
  });
});

describe('GET /v1/sessions (F06)', () => {
  test('훈련 상태를 완료, 생략, 예정, 미완료로 판정한다 (F06-R02, DATABASE §3.4)', async () => {
    const { session, workout } = await seedPlan();
    const done = await session('2026-11-11');
    const log = await workout(done.id, '2026-11-12');
    await session('2026-11-13');
    await session('2026-11-15', { isSkipped: true });
    await session(TODAY);
    await session('2026-11-20', { type: 'long' });

    const res = await get('/v1/sessions?from=2026-11-09&to=2026-11-22');

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { date: string; status: string }) => [item.date, item.status])).toEqual([
      ['2026-11-11', 'completed'],
      ['2026-11-13', 'missed'],
      ['2026-11-15', 'skipped'],
      [TODAY, 'planned'],
      ['2026-11-20', 'planned'],
    ]);
    expect(res.body.items[0].workoutId).toBe(log.id);
  });

  test('기간 안의 내 훈련만 돌려준다 (DI-07)', async () => {
    const mine = await seedPlan();
    await mine.session('2026-11-18');
    await mine.session('2026-11-25');
    const other = await seedPlan({ userId: USER_B });
    await other.session('2026-11-18');

    const { items } = (await get('/v1/sessions?from=2026-11-16&to=2026-11-22')).body;

    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2026-11-18');
  });

  test('기간이 없거나 62일을 넘으면 거절한다', async () => {
    expect((await get('/v1/sessions')).status).toBe(400);
    expect((await get('/v1/sessions?from=2026-11-01&to=2027-01-02')).status).toBe(400);
  });
});

describe('GET /v1/sessions/{id} (F06-R03)', () => {
  test('연결된 기록과 변경 이력을 함께 돌려준다 (F06-R04, DI-08)', async () => {
    const { plan, session, workout } = await seedPlan();
    const before = { date: '2026-11-12', type: 'easy', distanceKm: 5, durationMin: null };
    const target = await prisma.plannedSession.create({
      data: { planId: plan.id, userId: USER_A, date: day('2026-11-14'), type: 'easy', distanceKm: 5, weekNumber: 1, original: before },
    });
    const untouched = await session('2026-11-19');
    const log = await workout(target.id, '2026-11-14');
    const proposal = await prisma.changeProposal.create({
      data: { userId: USER_A, planId: plan.id, type: 'reschedule', source: 'chat', status: 'approved', request: {}, payload: {}, expiresAt: new Date() },
    });
    await prisma.planChangeLog.create({
      data: {
        userId: USER_A,
        planId: plan.id,
        proposalId: proposal.id,
        planVersion: 2,
        before: { sessions: [{ id: target.id, ...before }] },
        after: { sessions: [{ id: target.id, ...before, date: '2026-11-14' }] },
        reason: 'schedule',
        source: 'chat',
      },
    });

    const res = await get(`/v1/sessions/${target.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: target.id, date: '2026-11-14', status: 'completed', workoutId: log.id, original: before });
    expect(res.body.workout).toEqual({
      id: log.id,
      date: '2026-11-14',
      distanceKm: 5,
      durationSec: 1920,
      paceSecPerKm: 384,
      condition: null,
      rpe: 6,
      memo: null,
      plannedSessionId: target.id,
      source: 'app',
    });
    expect(res.body.changes).toEqual([
      { changedAt: expect.any(String), reason: 'schedule', before, after: { ...before, date: '2026-11-14' } },
    ]);

    const other = (await get(`/v1/sessions/${untouched.id}`)).body;
    expect(other).toMatchObject({ workout: null, changes: [], original: null, status: 'planned' });
  });

  test('다른 사용자의 훈련과 없는 훈련은 NOT_FOUND다 (DI-07)', async () => {
    const other = await seedPlan({ userId: USER_B });
    const session = await other.session('2026-11-18');

    expect((await get(`/v1/sessions/${session.id}`)).status).toBe(404);
    expect((await get('/v1/sessions/33333333-3333-4333-8333-333333333333')).status).toBe(404);
    expect((await get('/v1/sessions/abc')).status).toBe(400);
  });
});

describe('GET /v1/home (PRD §5.4)', () => {
  const messageCode = async () => (await get('/v1/home')).body.managerMessage.code;

  test('활성 계획이 없으면 새 목표를 안내한다', async () => {
    const res = await get('/v1/home');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      plan: null,
      daysToRace: null,
      todaySession: null,
      weekSessions: [],
      managerMessage: { code: 'NO_PLAN', text: expect.any(String) },
    });
  });

  test('오늘의 훈련, 이번 주 훈련, 대회까지 남은 날을 돌려준다', async () => {
    const { plan, session } = await seedPlan({ raceDate: '2026-12-20', endDate: '2026-12-20' });
    await session('2026-11-15');
    const todays = await session(TODAY);
    await session('2026-11-22', { type: 'long' });
    await session('2026-11-23');

    const res = await get('/v1/home');

    expect(res.body.plan.id).toBe(plan.id);
    expect(res.body.daysToRace).toBe(33);
    expect(res.body.todaySession.id).toBe(todays.id);
    expect(res.body.weekSessions.map((item: { date: string }) => item.date)).toEqual([TODAY, '2026-11-22']);
    expect(res.body.managerMessage).toEqual({ code: 'TODAY_SESSION', text: '오늘은 가볍게 달리기 5km 하는 날이에요.' });
  });

  test('매니저 메시지는 상황에 맞는 것을 고른다', async () => {
    const { session, workout } = await seedPlan({ raceDate: '2026-11-22', endDate: '2026-11-22' });
    expect(await messageCode()).toBe('REST_DAY');

    await session('2026-11-16');
    expect(await messageCode()).toBe('MISSED_SESSION');

    const skipped = await session(TODAY, { isSkipped: true });
    expect((await get('/v1/home')).body.todaySession).toBeNull();
    expect(await messageCode()).toBe('MISSED_SESSION');
    await prisma.plannedSession.delete({ where: { id: skipped.id } });

    const todays = await session(TODAY);
    expect(await messageCode()).toBe('TODAY_SESSION');

    await workout(todays.id, TODAY);
    expect(await messageCode()).toBe('TODAY_DONE');

    await session('2026-11-22', { type: 'race' });
    vi.setSystemTime(new Date('2026-11-22T03:00:00Z'));
    expect(await messageCode()).toBe('RACE_DAY');
    expect((await get('/v1/home')).body.daysToRace).toBe(0);

    vi.setSystemTime(new Date('2026-11-23T03:00:00Z'));
    expect(await messageCode()).toBe('PLAN_FINISHED');
    expect((await get('/v1/home')).body.daysToRace).toBeNull();
  });

  test('계획이 아직 시작하지 않았으면 첫 훈련 날짜를 알린다', async () => {
    await seedPlan({ startDate: '2026-11-23' });

    expect((await get('/v1/home')).body.managerMessage).toEqual({
      code: 'PLAN_NOT_STARTED',
      text: '첫 훈련은 11월 23일이에요. 그때까지 편하게 쉬어 주세요.',
    });
  });
});
