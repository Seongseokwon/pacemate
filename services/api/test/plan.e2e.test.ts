import { generate, reschedule, validate } from '@pacemate/training-engine';
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
const engine = { generate: vi.fn(generate), validate: vi.fn(validate), reschedule, version: 'test-version' };
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
    engine.generate.mockReturnValueOnce({ level: 'novice', profile: {} as never, options: [] });
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
      focus: null,
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
      averageHeartRate: null,
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
      daysToStart: null,
      yesterdaySession: null,
      weekMissedCount: 0,
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

  test('계획이 아직 시작하지 않았으면 첫 훈련 날짜, 시작까지 남은 날, 첫 주 훈련을 알린다 (PRD §5.4)', async () => {
    const { session } = await seedPlan({ startDate: '2026-11-23' });
    await session('2026-11-25');
    await session('2026-11-29', { type: 'long' });
    await session('2026-12-02');

    const res = await get('/v1/home');

    expect(res.body.managerMessage).toEqual({
      code: 'PLAN_NOT_STARTED',
      text: '첫 훈련은 11월 23일이에요. 그때까지 편하게 쉬어 주세요.',
    });
    expect(res.body.daysToStart).toBe(6);
    expect(res.body.todaySession).toBeNull();
    expect(res.body.weekSessions.map((item: { date: string }) => item.date)).toEqual(['2026-11-25', '2026-11-29']);
  });

  test('시작한 계획에는 시작까지 남은 날이 없다', async () => {
    await seedPlan();
    expect((await get('/v1/home')).body.daysToStart).toBeNull();
  });

  test('어제 훈련을 기록하지 않았을 때만 어제 훈련을 돌려주고, 이틀 전 훈련은 넣지 않는다 (AC-F06-04)', async () => {
    const { session, workout } = await seedPlan();
    await session('2026-11-15');
    const yesterday = await session('2026-11-16');

    expect((await get('/v1/home')).body.yesterdaySession.id).toBe(yesterday.id);

    // 수요일이 되면 월요일 훈련은 이틀 전이다
    vi.setSystemTime(new Date('2026-11-18T03:00:00Z'));
    expect((await get('/v1/home')).body.yesterdaySession).toBeNull();

    vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
    await workout(yesterday.id, '2026-11-16');
    expect((await get('/v1/home')).body.yesterdaySession).toBeNull();
  });

  test('어제가 지난주(일요일)여도 어제 훈련을 돌려주고, 생략한 훈련은 넣지 않는다', async () => {
    const { session } = await seedPlan();
    const sunday = await session('2026-11-15');
    vi.setSystemTime(new Date('2026-11-16T03:00:00Z'));
    expect((await get('/v1/home')).body.yesterdaySession.id).toBe(sunday.id);

    await prisma.plannedSession.update({ where: { id: sunday.id }, data: { isSkipped: true } });
    expect((await get('/v1/home')).body.yesterdaySession).toBeNull();
  });

  test('이번 주 미완료 훈련 수를 센다. 지난주 훈련과 생략·완료한 훈련은 세지 않는다 (F05-R14)', async () => {
    const { session, workout } = await seedPlan();
    await session('2026-11-15');
    await session('2026-11-16');
    expect((await get('/v1/home')).body.weekMissedCount).toBe(1);

    vi.setSystemTime(new Date('2026-11-20T03:00:00Z'));
    const thursday = await session('2026-11-19');
    await session('2026-11-18', { isSkipped: true });
    await session('2026-11-17');
    expect((await get('/v1/home')).body.weekMissedCount).toBe(3);

    await workout(thursday.id, '2026-11-19');
    expect((await get('/v1/home')).body.weekMissedCount).toBe(2);
  });
});

describe('목표 없음 (F03-R09, T-206)', () => {
  const NONE = { goalDistance: 'none' };

  test('기초 훈련 계획 하나만 보여 주고, 경고가 없고, 표준 기간 9주다 (AC-F03-07)', async () => {
    const res = await preview(NONE);

    expect(res.status).toBe(200);
    expect(res.body.options).toHaveLength(1);
    expect(res.body.options[0]).toMatchObject({ kind: 'base_building', totalWeeks: 9, warnings: [], focus: 'habit' });
  });

  test('목표 문구는 계획의 첫 주로 정한다: 시간 기반이고 한 번에 30분 미만이면 30분 달리기 (F03-R09)', async () => {
    await prisma.runnerProfile.update({ where: { userId: USER_A }, data: { recentWeeklyKm: 0, continuousRun: 'under_10m' } });
    expect((await preview(NONE)).body.options[0].focus).toBe('continuous_30min');

    await prisma.runnerProfile.update({ where: { userId: USER_A }, data: { continuousRun: 'over_60m' } });
    expect((await preview(NONE)).body.options[0].focus).toBe('habit');
  });

  test('거리 목표의 미리보기와 계획 요약에는 목표 문구가 없다', async () => {
    expect((await preview()).body.options.every((option: { focus: unknown }) => option.focus === null)).toBe(true);
    await confirm();
    expect((await get('/v1/plan')).body.focus).toBeNull();
  });

  test('목표 기록이나 대회 날짜가 있으면 거절한다 (AC-F02-05)', async () => {
    for (const body of [{ ...NONE, goalTimeSec: 1800 }, { ...NONE, raceDate: '2027-01-10' }]) {
      const res = await preview(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect((await confirm({ ...body, kind: 'base_building' })).body.code).toBe('VALIDATION_ERROR');
    }
  });

  test('완주 준비 계획으로 확정할 수 없다 (F03-R09)', async () => {
    const res = await confirm({ ...NONE, kind: 'race_prep' });
    expect(res.body.code).toBe('PLAN_NOT_FEASIBLE');
  });

  test('확정하면 목표 없음으로 저장되고, 계획 요약과 홈에 목표 문구가 있다', async () => {
    const res = await confirm({ ...NONE, kind: 'base_building' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ goalDistance: 'none', goalTimeSec: null, raceDate: null, kind: 'base_building', focus: 'habit' });
    expect((await get('/v1/home')).body.plan.focus).toBe('habit');
    expect((await get('/v1/home')).body.daysToRace).toBeNull();
  });

  test('목표 없음 계획이 끝나면 다음 목표를 권한다 (F03-R08)', async () => {
    await confirm({ ...NONE, kind: 'base_building' });
    const plan = await prisma.trainingPlan.findFirstOrThrow({ where: { userId: USER_A } });
    vi.setSystemTime(new Date(new Date(plan.endDate).getTime() + 2 * 86_400_000));

    const { managerMessage } = (await get('/v1/home')).body;
    expect(managerMessage.code).toBe('PLAN_FINISHED');
    expect(managerMessage.text).toContain('5km에 도전해 볼까요?');
  });

  test('DB 체크 제약: 목표 없음 계획에 완주 준비 계획이나 대회 날짜를 넣을 수 없다', async () => {
    const base = { userId: USER_A, status: 'active', goalDistance: 'none', startDate: day('2026-11-23'), endDate: day('2027-01-24'), engineVersion: 'test' } as const;
    await expect(prisma.trainingPlan.create({ data: { ...base, kind: 'race_prep' } })).rejects.toThrow();
    await expect(prisma.trainingPlan.create({ data: { ...base, kind: 'base_building', raceDate: day('2027-01-24') } })).rejects.toThrow();
    await expect(prisma.trainingPlan.create({ data: { ...base, kind: 'base_building', goalTimeSec: 1800 } })).rejects.toThrow();
    await expect(prisma.trainingPlan.create({ data: { ...base, kind: 'base_building' } })).resolves.toMatchObject({ goalDistance: 'none' });
  });
});

describe('유지 계획 (F03-R08, F03-R10, T-207)', () => {
  const CONTINUE = { goalDistance: 'none', continuation: true };
  const MAINTAIN = { goalDistance: 'none', kind: 'maintenance' };

  /** 11/15(일)에 끝난 거리 기반 10km 계획. 최근 4주(10/19~11/15) 동안 주 20km를 계획하고 그대로 달렸다 */
  async function seedEnded({ status = 'active' as 'active' | 'ended', ran = 1, raceDate = null as string | null } = {}) {
    const plan = await prisma.trainingPlan.create({
      data: {
        userId: USER_A, status, kind: 'race_prep', goalDistance: 'ten_k', raceDate: raceDate ? day(raceDate) : null,
        startDate: day('2026-09-21'), endDate: day('2026-11-15'), engineVersion: 'test', ...(status === 'ended' && { endedAt: new Date() }),
      },
    });
    for (const monday of ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']) {
      for (const [offset, km] of [[2, 5], [4, 5], [6, 10]] as const) {
        const date = new Date(day(monday).getTime() + offset * 86_400_000);
        const session = await prisma.plannedSession.create({
          data: { planId: plan.id, userId: USER_A, date, type: offset === 6 ? 'long' : 'easy', distanceKm: km, weekNumber: 1 },
        });
        await prisma.workoutLog.create({ data: { userId: USER_A, date, distanceKm: km * ran, durationSec: 1800, source: 'app', plannedSessionId: session.id } });
      }
    }
    return plan;
  }

  test('끝난 계획에 이어 4주 유지 계획을 보여 주고 저장하지 않는다 (AC-F03-08)', async () => {
    await seedEnded();
    const res = await preview(CONTINUE);

    expect(res.status).toBe(200);
    expect(res.body.options).toHaveLength(1);
    expect(res.body.options[0]).toMatchObject({ kind: 'maintenance', totalWeeks: 4, warnings: [], focus: 'habit', startDate: '2026-11-18' });
    const weekly = new Map<number, number>();
    for (const session of res.body.options[0].sessions) weekly.set(session.weekNumber, (weekly.get(session.weekNumber) ?? 0) + session.distanceKm);
    expect([...weekly.values()].every((km) => km <= 20)).toBe(true);
    expect(await prisma.trainingPlan.count()).toBe(1);
  });

  test('끝난 계획의 훈련과 최근 기록을 Training Engine에 넘기고, 기록이 계획보다 적으면 적은 쪽으로 만든다 (TE-G10)', async () => {
    await seedEnded({ ran: 0.5 });
    const res = await preview(CONTINUE);

    const input = engine.generate.mock.calls.at(-1)?.[0];
    expect(input?.continuation?.ended).toMatchObject({ goalDistance: 'ten_k', raceDate: null });
    expect(input?.continuation?.ended.sessions).toHaveLength(12);
    expect(input?.continuation?.ended.sessions.every((session) => session.completed)).toBe(true);
    expect(input?.continuation?.workouts).toHaveLength(12);
    // 오늘(11/17)이 있는 주 전 4주 동안 계획 20km 중 10km만 달렸다
    expect(engine.generate.mock.results.at(-1)?.value.profile.recentWeeklyKm).toBe(10);
    const total = res.body.options[0].sessions.filter((session: { weekNumber: number }) => session.weekNumber === 2).reduce((sum: number, session: { distanceKm: number | null }) => sum + (session.distanceKm ?? 0), 0);
    expect(total).toBeLessThanOrEqual(10);
  });

  test('확정하면 목표 없음 유지 계획으로 저장하고 끝난 계획을 종료한다 (F03-R10)', async () => {
    const ended = await seedEnded();
    const res = await confirm(MAINTAIN);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'maintenance', goalDistance: 'none', goalTimeSec: null, raceDate: null, focus: 'habit', isFinished: false });
    expect((await prisma.trainingPlan.findUniqueOrThrow({ where: { id: ended.id } })).status).toBe('ended');
    expect((await get('/v1/home')).body.plan).toMatchObject({ kind: 'maintenance', focus: 'habit' });
  });

  test('유지 계획이 끝나면 다시 이어 갈 수 있다 (F03-R10)', async () => {
    await seedEnded();
    await confirm(MAINTAIN);
    const plan = await prisma.trainingPlan.findFirstOrThrow({ where: { userId: USER_A, status: 'active' } });
    vi.setSystemTime(new Date(plan.endDate.getTime() + 2 * 86_400_000));

    expect((await get('/v1/home')).body.plan.isFinished).toBe(true);
    expect((await preview(CONTINUE)).body.options[0].kind).toBe('maintenance');
    expect((await confirm(MAINTAIN)).status).toBe(201);
    expect(await prisma.trainingPlan.count({ where: { userId: USER_A, kind: 'maintenance' } })).toBe(2);
  });

  test('대회를 마친 뒤 이으면 첫 주를 줄인다 (TE-G10)', async () => {
    await seedEnded({ raceDate: '2026-11-15' });
    const { sessions } = (await preview(CONTINUE)).body.options[0];
    const week = (n: number) => sessions.filter((session: { weekNumber: number }) => session.weekNumber === n).reduce((sum: number, session: { distanceKm: number }) => sum + session.distanceKm, 0);
    // 대회 날 기록을 빼면 시작 훈련량은 17.5km이고, 10km 대회 뒤 첫 주는 그 60%까지다
    expect(week(1)).toBeLessThanOrEqual(17.5 * 0.6);
    expect(week(2)).toBeGreaterThan(week(1));
  });

  test('종료 처리된 계획에도 이을 수 있다', async () => {
    await seedEnded({ status: 'ended' });
    expect((await preview(CONTINUE)).body.options[0].kind).toBe('maintenance');
  });

  test('끝난 계획이 없으면 NOT_FOUND, 끝나지 않은 계획이 있으면 PLAN_ALREADY_ACTIVE다', async () => {
    expect((await preview(CONTINUE)).body.code).toBe('NOT_FOUND');
    expect((await confirm(MAINTAIN)).body.code).toBe('NOT_FOUND');

    await seedPlan({ endDate: '2027-01-17' });
    expect((await preview(CONTINUE)).body.code).toBe('PLAN_ALREADY_ACTIVE');
    expect((await confirm(MAINTAIN)).body.code).toBe('PLAN_ALREADY_ACTIVE');
  });

  test('다른 사용자의 끝난 계획에는 이을 수 없다 (DI-07)', async () => {
    await seedEnded();
    await createProfile(USER_B);
    expect((await preview(CONTINUE, USER_B)).body.code).toBe('NOT_FOUND');
  });

  test('이어서 훈련하기는 목표 없음으로만 요청한다', async () => {
    await seedEnded();
    for (const res of [await preview({ goalDistance: 'five_k', continuation: true }), await confirm({ goalDistance: 'five_k', kind: 'maintenance' })]) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  test('continuation 없이 만든 미리보기에는 유지 계획이 없다', async () => {
    expect((await preview({ goalDistance: 'none' })).body.options.map((option: { kind: string }) => option.kind)).toEqual(['base_building']);
  });

  test('DB 체크 제약: 유지 계획은 목표 없음으로만 저장한다', async () => {
    const base = { userId: USER_A, status: 'ended', startDate: day('2026-11-23'), endDate: day('2026-12-20'), engineVersion: 'test', kind: 'maintenance' } as const;
    await expect(prisma.trainingPlan.create({ data: { ...base, goalDistance: 'five_k' } })).rejects.toThrow();
    await expect(prisma.trainingPlan.create({ data: { ...base, goalDistance: 'none', raceDate: day('2026-12-20') } })).rejects.toThrow();
    await expect(prisma.trainingPlan.create({ data: { ...base, goalDistance: 'none' } })).resolves.toMatchObject({ kind: 'maintenance' });
  });
});
