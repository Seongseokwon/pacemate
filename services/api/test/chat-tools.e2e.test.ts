import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ToolRegistry } from '../src/chat/tools/tool-registry.js';
import { createTestApp } from './test-app.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
// 화요일. 달리는 요일이 수·금·일이라 계획이 이번 주(11/18 수)부터 시작한다
const TODAY = '2026-11-17';
const NOON_KST = (date: string) => new Date(`${date}T03:00:00Z`);
const day = (date: string) => new Date(`${date}T00:00:00Z`);

const prisma = createTestPrisma();
let t: Awaited<ReturnType<typeof createTestApp>>;
let registry: ToolRegistry;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOON_KST(TODAY) });
  t = await createTestApp();
  registry = t.app.get(ToolRegistry);
});

beforeEach(async () => {
  vi.setSystemTime(NOON_KST(TODAY));
  await resetDatabase(prisma);
  const now = new Date();
  for (const id of [USER_A, USER_B]) {
    await prisma.user.create({ data: { id, authProvider: 'google', termsAgreedAt: now, privacyAgreedAt: now, healthDataAgreedAt: now, consentVersion: '1' } });
    await prisma.runnerProfile.create({
      data: { userId: id, experience: 'under_2y', continuousRun: 'under_60m', recentWeeklyKm: 15, recentPaceSecPerKm: 400, weeklyRunCount: 3, preferredWeekdays: [3, 5, 7], level: 'novice' },
    });
  }
});

afterAll(async () => {
  vi.useRealTimers();
  await t.app.close();
  await prisma.$disconnect();
});

/** 실제 생성기로 만든 5km 계획을 확정한다 */
async function startPlan(user = USER_A, body: object = { goalDistance: 'five_k' }) {
  const preview = await t.call('post', '/v1/plan/preview', user, body);
  const res = await t.call('post', '/v1/plan', user, { ...body, kind: preview.body.options[0].kind });
  expect(res.status).toBe(201);
  const sessions = await prisma.plannedSession.findMany({ where: { userId: user }, orderBy: { date: 'asc' } });
  const on = (date: string) => sessions.find((s) => s.date.toISOString().startsWith(date))!;
  return { sessions, on };
}

/** LLM이 도구를 호출한 것처럼 레지스트리로 실행한다 */
async function run(name: string, input: unknown, user = USER_A) {
  const execution = await registry.execute({ userId: user }, { id: 'call-1', name, input });
  // supertest의 res.body처럼 형식 없이 읽는다
  const output = JSON.parse(execution.content);
  return { ...execution, output };
}

const invalid = { ok: false, output: { error: 'INVALID_INPUT', message: expect.any(String) } };

describe('도구 레지스트리 구성 (PRD §6.2)', () => {
  test('도구는 조회 4개와 제안 3개, 모두 7개뿐이고, 데이터를 바꾸는 도구는 없다 (PRD §6.1)', () => {
    expect(registry.definitions.map((tool) => tool.name)).toEqual([
      'get_runner_profile',
      'get_training_plan',
      'get_workout_history',
      'get_weekly_summary',
      'propose_reschedule',
      'propose_goal_change',
      'propose_workout_log',
    ]);
  });

  test('도구 정의의 인자에는 사용자 ID도, 훈련의 거리·강도도 없다 (DI-07, AI-03)', () => {
    const reschedule = registry.definitions.find((tool) => tool.name === 'propose_reschedule')!;
    const properties = Object.keys((reschedule.inputSchema as { properties: object }).properties);
    expect(properties).not.toContain('distanceKm');
    expect(JSON.stringify(registry.definitions)).not.toMatch(/userId/i);
    // 고른 코치는 도구 정의에 넣지 않는다(AI-11)
    expect(JSON.stringify(registry.definitions)).not.toMatch(/coach/i);
  });
});

describe('get_runner_profile', () => {
  test('프로필, 수준, 목표, 대회까지 남은 날을 돌려준다', async () => {
    await startPlan(USER_A, { goalDistance: 'ten_k', goalTimeSec: 3900, raceDate: '2027-01-24' });

    const result = await run('get_runner_profile', {});

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      today: TODAY,
      profile: { experience: 'under_2y', continuousRun: 'under_60m', recentWeeklyKm: 15, recentRecord: { paceSecPerKm: 400 }, weeklyRunCount: 3, preferredWeekdays: [3, 5, 7] },
      level: 'novice',
      goal: { goalDistance: 'ten_k', goalName: expect.any(String), goalTimeSec: 3900, raceDate: '2027-01-24', daysToRace: 68 },
    });
  });

  test('목표 없음이면 focus만 주고 기록·대회 날짜를 넣지 않는다', async () => {
    await startPlan(USER_A, { goalDistance: 'none' });

    const { output } = await run('get_runner_profile', {});

    expect(output.goal).toEqual({ goalDistance: 'none', goalName: expect.any(String), focus: expect.stringMatching(/^(habit|continuous_30min)$/) });
  });

  test('활성 계획이 없으면 목표는 null, 프로필이 없으면 프로필도 null이다', async () => {
    expect((await run('get_runner_profile', {})).output).toMatchObject({ level: 'novice', goal: null });

    await prisma.runnerProfile.delete({ where: { userId: USER_A } });
    expect((await run('get_runner_profile', {})).output).toMatchObject({ profile: null, level: null, goal: null });
  });

  test('객체가 아닌 인자는 실행하지 않는다', async () => {
    expect(await run('get_runner_profile', '프로필 보여 줘')).toMatchObject(invalid);
  });
});

describe('get_training_plan', () => {
  test('기간의 훈련과 계획 요약을 돌려준다. 다음 제안에 쓸 sessionId가 있다', async () => {
    const { on } = await startPlan();
    await startPlan(USER_B);

    const result = await run('get_training_plan', { from: '2026-11-16', to: '2026-11-22' });

    expect(result.ok).toBe(true);
    expect(result.output.plan).toMatchObject({ kind: expect.any(String), startDate: '2026-11-18', currentWeek: 1, progress: { completed: 0 }, isFinished: false });
    expect(result.output.sessions.map((s: { date: string }) => s.date)).toEqual(['2026-11-18', '2026-11-20', '2026-11-22']);
    expect(result.output.sessions[0]).toEqual({
      sessionId: on('2026-11-18').id,
      date: '2026-11-18',
      weekday: '수',
      type: on('2026-11-18').type,
      typeName: expect.any(String),
      distanceKm: on('2026-11-18').distanceKm?.toNumber() ?? null,
      durationMin: on('2026-11-18').durationMin,
      runIntervalMin: on('2026-11-18').runIntervalMin,
      status: 'planned',
      statusName: expect.any(String),
    });
  });

  test('첫 주가 오기 전이면 몇째 주는 null이고, 계획이 없으면 계획은 null이다', async () => {
    expect((await run('get_training_plan', { from: '2026-11-16', to: '2026-11-22' })).output).toEqual({ today: TODAY, plan: null, sessions: [] });

    await startPlan();
    vi.setSystemTime(NOON_KST('2026-11-15'));
    expect((await run('get_training_plan', { from: '2026-11-16', to: '2026-11-22' })).output.plan.currentWeek).toBeNull();
    vi.setSystemTime(NOON_KST('2026-11-25'));
    expect((await run('get_training_plan', { from: '2026-11-23', to: '2026-11-29' })).output.plan.currentWeek).toBe(2);
  });

  test('28일을 넘는 기간이나 거꾸로 된 기간은 실행하지 않는다', async () => {
    expect(await run('get_training_plan', { from: '2026-11-16', to: '2026-12-14' })).toMatchObject(invalid);
    expect(await run('get_training_plan', { from: '2026-11-22', to: '2026-11-16' })).toMatchObject(invalid);
    expect(await run('get_training_plan', { from: '이번 주' })).toMatchObject(invalid);
  });
});

describe('get_workout_history', () => {
  test('기간의 기록과 연결된 훈련의 종류를 돌려준다. 다른 사용자의 기록은 없다 (DI-07)', async () => {
    const { on } = await startPlan();
    await t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, rpe: 6, memo: '왼쪽 무릎이 살짝 아파요', plannedSessionId: on('2026-11-18').id });
    await t.call('post', '/v1/workouts', USER_A, { date: '2026-11-15', distanceKm: 5, durationSec: 1800 });
    await t.call('post', '/v1/workouts', USER_A, { date: '2026-10-01', distanceKm: 4, durationSec: 1500 });
    await t.call('post', '/v1/workouts', USER_B, { date: TODAY, distanceKm: 7, durationSec: 2400 });

    const result = await run('get_workout_history', { from: '2026-11-10', to: TODAY });

    expect(result.ok).toBe(true);
    expect(result.output.workouts).toEqual([
      { date: '2026-11-15', weekday: '일', distanceKm: 5, durationSec: 1800, paceSecPerKm: 360, rpe: null, memo: null, sessionType: null, sessionTypeName: null },
      {
        date: TODAY,
        weekday: '화',
        distanceKm: 3,
        durationSec: 1200,
        paceSecPerKm: 400,
        rpe: 6,
        memo: '왼쪽 무릎이 살짝 아파요',
        sessionType: on('2026-11-18').type,
        sessionTypeName: expect.any(String),
      },
    ]);
  });

  test('90일을 넘는 기간은 실행하지 않는다', async () => {
    expect(await run('get_workout_history', { from: '2026-08-19', to: TODAY })).toMatchObject(invalid);
  });
});

describe('get_weekly_summary', () => {
  test('주간 요약 화면과 같은 수치를 돌려준다 (F08-R05)', async () => {
    await startPlan();
    await t.call('post', '/v1/workouts', USER_A, { date: '2026-11-16', distanceKm: 5, durationSec: 1800 });

    const result = await run('get_weekly_summary', { weekStart: '2026-11-16' });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      weekStart: '2026-11-16',
      plannedCount: 3,
      completedCount: 0,
      totalDistanceKm: 5,
      completionRate: 0,
      nextSession: { date: '2026-11-18', weekday: '수', status: 'planned' },
    });
  });

  test('월요일이 아닌 주 시작은 실행하지 않는다', async () => {
    expect(await run('get_weekly_summary', { weekStart: TODAY })).toMatchObject(invalid);
  });
});

describe('propose_reschedule', () => {
  test('대기 제안만 만들고 일정은 바꾸지 않는다. 결과에 제안 ID와 설명할 요약이 있다 (PRD §6.1, AC-F05-02)', async () => {
    const { on } = await startPlan();
    const before = await prisma.plannedSession.findMany({ where: { userId: USER_A }, orderBy: { id: 'asc' } });

    const result = await run('propose_reschedule', { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' });

    expect(result).toMatchObject({ ok: true, proposalId: expect.any(String) });
    expect(result.output).toMatchObject({
      created: true,
      proposalId: result.proposalId,
      summary: {
        type: 'reschedule',
        reasonLine: '일정에 맞춰 11/19(목)로 옮겼어요',
        impact: expect.any(Object),
        consumesQuota: true,
      },
    });
    expect(result.output.summary.changes).toContainEqual(
      expect.objectContaining({ sessionId: on('2026-11-18').id, action: 'move', after: expect.objectContaining({ date: '2026-11-19', typeName: expect.any(String) }) }),
    );
    expect(await prisma.changeProposal.findUniqueOrThrow({ where: { id: result.proposalId! } })).toMatchObject({ userId: USER_A, status: 'pending' });
    expect(await prisma.plannedSession.findMany({ where: { userId: USER_A }, orderBy: { id: 'asc' } })).toEqual(before);
  });

  test('LLM이 거리·강도를 넣어도 쓰지 않는다 (AI-03)', async () => {
    const { on } = await startPlan();

    const result = await run('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'lighter', distanceKm: 42, type: 'tempo' });

    expect(result.ok).toBe(true);
    const row = await prisma.changeProposal.findUniqueOrThrow({ where: { id: result.proposalId! } });
    expect(row.request).not.toHaveProperty('distanceKm');
    expect(JSON.stringify(result.output.summary.changes)).not.toContain('42');
  });

  test('만들 수 없으면 사유 코드와 문장을 돌려주고 제안을 저장하지 않는다', async () => {
    expect((await run('propose_reschedule', { changeType: 'reduce_count', reason: 'schedule', weekStart: '2026-11-16', maxSessions: 1 })).output).toMatchObject({
      created: false,
      reasonCode: 'NO_ACTIVE_PLAN',
      message: expect.any(String),
    });

    const { sessions } = await startPlan();
    const later = sessions.find((s) => s.date >= day('2026-11-30'))!;
    const result = await run('propose_reschedule', { changeType: 'ease', reason: 'schedule', sessionId: later.id, easeOption: 'rest' });

    expect(result).toMatchObject({ ok: true, output: { created: false, reasonCode: 'OUT_OF_RANGE', message: '이번 주와 다음 주의 일정만 바꿀 수 있어요.' } });
    expect(result.proposalId).toBeUndefined();
    expect(await prisma.changeProposal.count()).toBe(0);
  });

  test('다른 사용자의 훈련은 바꾸는 제안을 만들지 않는다 (DI-07)', async () => {
    await startPlan(USER_A);
    const { on } = await startPlan(USER_B);

    const result = await run('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' });

    expect(result.output.created).toBe(false);
    expect(await prisma.changeProposal.count()).toBe(0);
  });

  test('변경 유형에 필요한 값이 빠지면 실행하지 않는다', async () => {
    const { on } = await startPlan();
    expect(await run('propose_reschedule', { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id })).toMatchObject(invalid);
    expect(await run('propose_reschedule', { changeType: 'skip_all', reason: 'schedule' })).toMatchObject(invalid);
    expect(await prisma.changeProposal.count()).toBe(0);
  });
});

describe('propose_goal_change', () => {
  test('기록이 부족하면 RECENT_DISTANCE_REQUIRED, 다시 물은 주간 거리를 넣으면 제안을 만든다 (F02-R09)', async () => {
    await startPlan();

    const first = await run('propose_goal_change', { goalDistance: 'ten_k' });
    expect(first.output).toMatchObject({ created: false, reasonCode: 'RECENT_DISTANCE_REQUIRED' });

    const second = await run('propose_goal_change', { goalDistance: 'ten_k', recentWeeklyKm: 15 });
    expect(second).toMatchObject({ ok: true, proposalId: expect.any(String) });
    expect(second.output.summary).toMatchObject({
      type: 'goal_change',
      goal: { before: { goalDistance: 'five_k' }, after: { goalDistance: 'ten_k' } },
      removedSessionCount: expect.any(Number),
      addedSessionCount: expect.any(Number),
      consumesQuota: true,
    });
    // 계획 전체 대신 가까운 2주의 새 훈련만 설명용으로 준다
    for (const session of second.output.summary.upcomingSessions) expect(session.date <= '2026-11-30').toBe(true);
    expect(second.output.summary.upcomingSessions.length).toBeGreaterThan(0);
    expect(await prisma.trainingPlan.findFirstOrThrow({ where: { userId: USER_A, status: 'active' } })).toMatchObject({ goalDistance: 'five_k' });
  });

  test('바꿀 목표가 없거나 주간 거리가 범위를 벗어나면 실행하지 않는다', async () => {
    await startPlan();
    expect(await run('propose_goal_change', {})).toMatchObject(invalid);
    expect(await run('propose_goal_change', { goalDistance: 'ten_k', recentWeeklyKm: 101 })).toMatchObject(invalid);
    expect(await run('propose_goal_change', { goalDistance: 'marathon' })).toMatchObject(invalid);
  });
});

describe('propose_workout_log', () => {
  test('기록 확인 제안만 만들고 기록은 저장하지 않는다 (AC-F07-05)', async () => {
    const { on } = await startPlan();

    const result = await run('propose_workout_log', { date: TODAY, distanceKm: 3, durationSec: 1200, memo: '종아리가 당겨요', sessionId: on('2026-11-18').id });

    expect(result).toMatchObject({ ok: true, proposalId: expect.any(String) });
    expect(result.output.summary).toEqual({
      type: 'workout_log',
      workout: {
        date: TODAY,
        distanceKm: 3,
        durationSec: 1200,
        paceSecPerKm: 400,
        rpe: null,
        memo: '종아리가 당겨요',
        condition: null,
        plannedSessionId: on('2026-11-18').id,
        plannedSession: expect.objectContaining({ date: '2026-11-18', typeName: expect.any(String) }),
      },
    });
    expect(await prisma.workoutLog.count()).toBe(0);
  });

  test('컨디션은 받지 않는다 (F07-R01)', async () => {
    await startPlan();
    const result = await run('propose_workout_log', { date: TODAY, distanceKm: 3, durationSec: 1200, condition: 5 });

    const row = await prisma.changeProposal.findUniqueOrThrow({ where: { id: result.proposalId! } });
    expect(row.request).not.toHaveProperty('condition');
  });

  test('미래 날짜나 이미 기록한 훈련은 사유 코드를 돌려준다', async () => {
    const { on } = await startPlan();
    expect((await run('propose_workout_log', { date: '2026-11-18', distanceKm: 3, durationSec: 1200 })).output).toMatchObject({ created: false, reasonCode: 'INVALID_VALUE' });

    await t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, plannedSessionId: on('2026-11-18').id });
    expect((await run('propose_workout_log', { date: TODAY, distanceKm: 4, durationSec: 1500, sessionId: on('2026-11-18').id })).output).toMatchObject({
      created: false,
      reasonCode: 'SESSION_ALREADY_COMPLETED',
    });
  });

  test('거리·시간이 범위를 벗어나거나 빠지면 실행하지 않는다 (F07-R03)', async () => {
    expect(await run('propose_workout_log', { date: TODAY, distanceKm: 0, durationSec: 1200 })).toMatchObject(invalid);
    expect(await run('propose_workout_log', { date: TODAY, distanceKm: 3 })).toMatchObject(invalid);
  });
});
