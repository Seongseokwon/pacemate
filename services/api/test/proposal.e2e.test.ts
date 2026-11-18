import type { Proposal } from '@pacemate/shared';
import { generate, reschedule, validate } from '@pacemate/training-engine';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { TRAINING_ENGINE } from '../src/plan/training-engine.js';
import { ProposalService } from '../src/proposal/proposal.service.js';
import { createTestApp } from './test-app.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
// 화요일. 달리는 요일이 수·금·일이라 계획이 이번 주(11/18 수)부터 시작한다
const TODAY = '2026-11-17';
const NOON_KST = (date: string) => new Date(`${date}T03:00:00Z`);
const day = (date: string) => new Date(`${date}T00:00:00Z`);

const prisma = createTestPrisma();
const engine = { generate: vi.fn(generate), validate: vi.fn(validate), reschedule: vi.fn(reschedule), version: 'test-version' };
let t: Awaited<ReturnType<typeof createTestApp>>;
let proposals: ProposalService;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOON_KST(TODAY) });
  t = await createTestApp({ override: (builder) => builder.overrideProvider(TRAINING_ENGINE).useValue(engine) });
  proposals = t.app.get(ProposalService);
});

beforeEach(async () => {
  vi.setSystemTime(NOON_KST(TODAY));
  engine.validate.mockImplementation(validate);
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
async function startPlan(user = USER_A) {
  const preview = await t.call('post', '/v1/plan/preview', user, { goalDistance: 'five_k' });
  const res = await t.call('post', '/v1/plan', user, { goalDistance: 'five_k', kind: preview.body.options[0].kind });
  expect(res.status).toBe(201);
  const sessions = await prisma.plannedSession.findMany({ where: { userId: user }, orderBy: { date: 'asc' } });
  const on = (date: string) => sessions.find((s) => s.date.toISOString().startsWith(date))!;
  return { planId: res.body.id as string, sessions, on };
}

const created = (result: Awaited<ReturnType<ProposalService['createReschedule']>>): Proposal => {
  if (!result.created) throw new Error(`제안을 만들지 못했다: ${result.reasonCode}`);
  return result.proposal;
};
const approve = (id: string, user = USER_A) => t.call('post', `/v1/proposals/${id}/approve`, user);
const snapshotAll = async () => ({
  sessions: await prisma.plannedSession.findMany({ where: { userId: USER_A }, orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
  plan: await prisma.trainingPlan.findFirst({ where: { userId: USER_A, status: 'active' } }),
  logs: await prisma.planChangeLog.count(),
  usage: await prisma.usageCounter.findMany({ where: { userId: USER_A } }),
  workouts: await prisma.workoutLog.count(),
});

describe('일정 변경 제안 생성 (F05)', () => {
  test('제안만 만들고 일정은 바꾸지 않는다. 이유 한 줄은 서버 템플릿이고 만든 날 자정에 만료된다 (AC-F05-02, F05-R03, DI-05)', async () => {
    const { on } = await startPlan();
    const before = await snapshotAll();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));

    expect(proposal).toMatchObject({ type: 'reschedule', status: 'pending', consumesQuota: true, reasonLine: '일정에 맞춰 11/19(목)로 옮겼어요', expiresAt: '2026-11-17T15:00:00.000Z' });
    expect(proposal.changes).toContainEqual(expect.objectContaining({ sessionId: on('2026-11-18').id, action: 'move', after: expect.objectContaining({ date: '2026-11-19' }) }));
    expect(await snapshotAll()).toEqual(before);
    expect((await t.call('get', `/v1/proposals/${proposal.id}`, USER_A)).body).toEqual(proposal);
  });

  test('완료한 훈련과 지난 훈련은 바꿀 수 없다 (AC-F05-06, TE-R01)', async () => {
    const { on } = await startPlan();
    await t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, plannedSessionId: on('2026-11-18').id });
    const completed = await proposals.createReschedule(USER_A, { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' });
    expect(completed).toMatchObject({ created: false, reasonCode: 'TARGET_NOT_CHANGEABLE' });

    vi.setSystemTime(NOON_KST('2026-11-19'));
    const past = await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-21' });
    expect(past).toMatchObject({ created: false, reasonCode: 'TARGET_NOT_CHANGEABLE' });
    expect(await prisma.changeProposal.count()).toBe(0);
  });

  test('다음 주보다 뒤의 훈련은 바꾸는 제안을 만들지 않는다 (AC-F05-10, TE-R10)', async () => {
    const { sessions } = await startPlan();
    const later = sessions.find((s) => s.date >= day('2026-11-30'))!;
    const result = await proposals.createReschedule(USER_A, { changeType: 'ease', reason: 'schedule', sessionId: later.id, easeOption: 'rest' });
    expect(result).toMatchObject({ created: false, reasonCode: 'OUT_OF_RANGE', message: '이번 주와 다음 주의 일정만 바꿀 수 있어요.' });
  });

  test('활성 계획이 없으면 NO_ACTIVE_PLAN', async () => {
    const result = await proposals.createReschedule(USER_A, { changeType: 'reduce_count', reason: 'schedule', weekStart: '2026-11-16', maxSessions: 1 });
    expect(result).toMatchObject({ created: false, reasonCode: 'NO_ACTIVE_PLAN' });
  });

  test('새 제안이 생기면 이전 대기 제안은 대체된다 (DI-05)', async () => {
    const { on } = await startPlan();
    const first = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));
    const second = created(await proposals.createReschedule(USER_A, { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' }));

    expect((await t.call('get', `/v1/proposals/${first.id}`, USER_A)).body.status).toBe('superseded');
    expect(second.status).toBe('pending');
    expect((await approve(first.id)).body.code).toBe('PROPOSAL_NOT_PENDING');
  });
});

describe('POST /v1/proposals/{id}/approve (F05, DI-02)', () => {
  test('승인하면 일정·이력·버전·상태·결과 메시지·이용량이 함께 바뀐다 (AC-F05-01, AC-F05-07, F05-R09)', async () => {
    const { on, planId } = await startPlan();
    const wed = on('2026-11-18');
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: wed.id, targetDate: '2026-11-19' }));

    const res = await approve(proposal.id);
    expect(res.status).toBe(200);
    expect(res.body.proposal.status).toBe('approved');
    expect(res.body.resultMessage).toMatchObject({ role: 'system', status: 'done', content: '일정을 바꿨어요. 홈과 캘린더에 반영했어요.', card: { type: 'result' } });
    expect(res.body.usage.reschedule.used).toBe(1);

    const moved = await prisma.plannedSession.findUniqueOrThrow({ where: { id: wed.id } });
    expect(moved.date).toEqual(day('2026-11-19'));
    expect(moved.original).toMatchObject({ date: '2026-11-18', type: wed.type });
    expect((await prisma.trainingPlan.findUniqueOrThrow({ where: { id: planId } })).version).toBe(2);
    const log = await prisma.planChangeLog.findFirstOrThrow({ where: { proposalId: proposal.id } });
    expect(log).toMatchObject({ planVersion: 2, source: 'chat', reason: '일정에 맞춰 11/19(목)로 옮겼어요' });
    expect(log.before).toEqual({ sessions: [expect.objectContaining({ id: wed.id, date: '2026-11-18' })] });
    expect(log.after).toEqual({ sessions: [expect.objectContaining({ id: wed.id, date: '2026-11-19' })] });

    // 캘린더와 홈에 바로 보인다
    const detail = await t.call('get', `/v1/sessions/${wed.id}`, USER_A);
    expect(detail.body).toMatchObject({ date: '2026-11-19', original: { date: '2026-11-18' } });
    expect(detail.body.changes).toHaveLength(1);
  });

  test('여러 번 눌러도 한 번만 적용되고 같은 결과를 돌려준다 (AC-F05-04, DI-04)', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'lighter' }));

    const results = await Promise.all(Array.from({ length: 5 }, () => approve(proposal.id)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(results.map((r) => r.body.resultMessage.id)).size).toBe(1);
    const again = await approve(proposal.id);
    expect(again.body.resultMessage).toEqual(results[0]!.body.resultMessage);
    expect(await prisma.planChangeLog.count()).toBe(1);
    expect(await prisma.chatMessage.count()).toBe(1);
    expect((await prisma.usageCounter.findFirstOrThrow({ where: { userId: USER_A } })).rescheduleCount).toBe(1);
    expect((await prisma.trainingPlan.findFirstOrThrow({ where: { userId: USER_A } })).version).toBe(2);
  });

  test('취소하면 일정이 바뀌지 않고 이용량도 차감하지 않는다 (AC-F05-03, AC-F05-12)', async () => {
    const { on } = await startPlan();
    const before = await snapshotAll();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));

    const res = await t.call('post', `/v1/proposals/${proposal.id}/cancel`, USER_A);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect((await t.call('post', `/v1/proposals/${proposal.id}/cancel`, USER_A)).body.status).toBe('cancelled');
    expect((await approve(proposal.id)).body.code).toBe('PROPOSAL_NOT_PENDING');
    expect(await snapshotAll()).toEqual(before);
  });

  test('승인된 제안은 취소할 수 없다', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));
    await approve(proposal.id);
    const res = await t.call('post', `/v1/proposals/${proposal.id}/cancel`, USER_A);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROPOSAL_NOT_PENDING');
  });

  test('승인 전에 계획이 바뀌었으면 거부한다 (AC-F05-05, DI-03)', async () => {
    const { on, planId } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));
    await prisma.trainingPlan.update({ where: { id: planId }, data: { version: { increment: 1 } } });
    const before = await snapshotAll();

    const res = await approve(proposal.id);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'PLAN_CHANGED', message: '그 사이 일정이 바뀌었어요. 다시 요청해 주세요.' });
    expect(await snapshotAll()).toEqual(before);
    expect((await t.call('get', `/v1/proposals/${proposal.id}`, USER_A)).body.status).toBe('pending');
  });

  test('그 사이 대상 훈련에 기록이 연결되었으면 거부한다 (PRD §6.4, DI-06)', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));
    await t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, plannedSessionId: on('2026-11-18').id });

    const res = await approve(proposal.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TARGET_CHANGED');
    expect((await prisma.plannedSession.findUniqueOrThrow({ where: { id: on('2026-11-18').id } })).date).toEqual(day('2026-11-18'));
  });

  test('만든 날 자정이 지나면 승인하지 않고 만료로 보인다 (AC-F05-11)', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-20').id, targetDate: '2026-11-21' }));

    vi.setSystemTime(new Date('2026-11-17T14:59:59Z'));
    expect((await t.call('get', `/v1/proposals/${proposal.id}`, USER_A)).body.status).toBe('pending');
    vi.setSystemTime(new Date('2026-11-17T15:00:00Z'));
    const res = await approve(proposal.id);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'PROPOSAL_EXPIRED', message: '이 제안은 만료됐어요. 다시 물어봐 주세요.' });
    expect((await t.call('get', `/v1/proposals/${proposal.id}`, USER_A)).body.status).toBe('expired');
    expect((await prisma.planChangeLog.count())).toBe(0);
  });

  test('안전 규칙을 다시 통과하지 못하면 거부하고 아무것도 바꾸지 않는다 (AC-F05-09, F05-R05)', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));
    const before = await snapshotAll();
    engine.validate.mockReturnValue({ ok: false, violations: ['TE-S05'] });

    const res = await approve(proposal.id);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SAFETY_CHECK_FAILED');
    expect(await snapshotAll()).toEqual(before);
  });

  test('처리 중 오류가 나면 일정·이력·이용량 모두 그대로다 (AC-F05-08)', async () => {
    const { on, planId } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));
    // 변경 이력의 제안당 1건 제약으로, 훈련을 고친 뒤 이력을 추가하는 단계에서 실패하게 만든다
    await prisma.planChangeLog.create({ data: { userId: USER_A, planId, proposalId: proposal.id, planVersion: 9, before: {}, after: {}, source: 'chat' } });
    const before = await snapshotAll();

    const res = await approve(proposal.id);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(await snapshotAll()).toEqual(before);
    expect((await t.call('get', `/v1/proposals/${proposal.id}`, USER_A)).body.status).toBe('pending');
  });

  test('일정 변경 한도를 넘으면 거부하고 제안은 대기로 남는다 (PRD §6.4, DI-12)', async () => {
    const { on } = await startPlan();
    await approve(created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' })).id);
    const second = created(await proposals.createReschedule(USER_A, { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-20').id, easeOption: 'rest' }));
    const before = await snapshotAll();

    const res = await approve(second.id);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'LIMIT_REACHED', usage: { reschedule: { used: 1, limit: 1 } } });
    expect(await snapshotAll()).toEqual(before);
    expect((await t.call('get', `/v1/proposals/${second.id}`, USER_A)).body.status).toBe('pending');
  });

  test('다른 사용자의 제안은 조회·승인·취소할 수 없다 (DI-07)', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));
    for (const path of ['', '/approve', '/cancel']) {
      const res = await t.call(path ? 'post' : 'get', `/v1/proposals/${proposal.id}${path}`, USER_B);
      expect(res.status).toBe(404);
    }
    expect((await t.call('get', `/v1/proposals/${proposal.id}`, USER_A)).body.status).toBe('pending');
  });
});

describe('놓친 훈련이 많은 주의 일정 변경 (PRD §8.2, AC-F10-06)', () => {
  test('이번 주 미완료가 2회 이상이면 주 1회는 차감하지 않는다', async () => {
    const { on } = await startPlan();
    // 수·금을 놓친 토요일
    vi.setSystemTime(NOON_KST('2026-11-21'));
    const exempt = created(await proposals.createReschedule(USER_A, { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-22').id, easeOption: 'lighter' }));
    expect(exempt.consumesQuota).toBe(false);
    const res = await approve(exempt.id);
    expect(res.status).toBe(200);
    expect(res.body.usage.reschedule.used).toBe(0);

    // 같은 주에 이 조건으로 이미 승인했으니 다음 제안은 차감한다
    const next = created(await proposals.createReschedule(USER_A, { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-25').id, easeOption: 'rest' }));
    expect(next.consumesQuota).toBe(true);
  });

  test('미완료가 1회면 차감한다', async () => {
    const { on } = await startPlan();
    vi.setSystemTime(NOON_KST('2026-11-19'));
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-20').id, easeOption: 'rest' }));
    expect(proposal.consumesQuota).toBe(true);
  });
});

describe('POST /v1/proposals/goal-change (F02-R09)', () => {
  test('최근 기록이 2주 치가 안 되고 주간 거리도 없으면 RECENT_DISTANCE_REQUIRED', async () => {
    await startPlan();
    const res = await t.call('post', '/v1/proposals/goal-change', USER_A, { goal: { goalDistance: 'ten_k' } });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RECENT_DISTANCE_REQUIRED');
    expect(await prisma.changeProposal.count()).toBe(0);
  });

  test('목표를 바꾸면 오늘 이후의 기록 없는 훈련을 새 계획으로 바꾸고, 마이페이지 경로는 차감하지 않는다', async () => {
    const { on, planId } = await startPlan();
    // 수요일에 그날 훈련을 기록했다. 기록한 훈련은 남는다(DI-13)
    vi.setSystemTime(NOON_KST('2026-11-18'));
    await t.call('post', '/v1/workouts', USER_A, { date: '2026-11-18', distanceKm: 3, durationSec: 1200, plannedSessionId: on('2026-11-18').id });
    const before = await snapshotAll();

    const res = await t.call('post', '/v1/proposals/goal-change', USER_A, { goal: { goalDistance: 'ten_k' }, profile: { recentWeeklyKm: 15 } });
    expect(res.status).toBe(201);
    const proposal = res.body as Proposal;
    expect(proposal).toMatchObject({ type: 'goal_change', consumesQuota: false, reasonLine: null, goal: { before: { goalDistance: 'five_k' }, after: { goalDistance: 'ten_k' } } });
    expect(proposal.changes.some((c) => c.action === 'remove')).toBe(true);
    expect(proposal.changes.some((c) => c.action === 'add')).toBe(true);
    expect(proposal.changes.some((c) => c.sessionId === on('2026-11-18').id)).toBe(false);
    expect(await snapshotAll()).toEqual(before);

    const approved = await approve(proposal.id);
    expect(approved.status).toBe(200);
    expect(approved.body.usage.reschedule.used).toBe(0);
    // 승인 때도 새 계획이 시작하는 주부터의 최종 계획을 다시 검증한다(TE-S12)
    const revalidated = engine.validate.mock.calls.at(-1)![0].plan;
    expect(revalidated.startDate).toBe('2026-11-25');
    expect(revalidated.sessions.filter((s) => s.id.startsWith('new-'))).toHaveLength(proposal.changes.filter((c) => c.action === 'add').length);
    const plan = await prisma.trainingPlan.findUniqueOrThrow({ where: { id: planId } });
    expect(plan).toMatchObject({ goalDistance: 'ten_k', version: 2 });
    expect(await prisma.plannedSession.findUnique({ where: { id: on('2026-11-18').id } })).not.toBeNull();
    expect(await prisma.plannedSession.findUnique({ where: { id: on('2026-11-20').id } })).toBeNull();
    const added = proposal.changes.filter((c) => c.action === 'add').length;
    expect(await prisma.plannedSession.count({ where: { planId } })).toBe(added + 1);
    const log = await prisma.planChangeLog.findFirstOrThrow({ where: { proposalId: proposal.id } });
    expect(log).toMatchObject({ source: 'settings', before: { goal: { goalDistance: 'five_k' } }, after: { goal: { goalDistance: 'ten_k' } } });

    // 새 계획 전체가 안전 규칙을 지킨다(AC-F05-09)
    const summary = await t.call('get', '/v1/plan', USER_A);
    expect(summary.body).toMatchObject({ goalDistance: 'ten_k', version: 2 });
  });

  test('남는 훈련과 합친 계획이 안전 규칙을 어기면 제안을 만들지 않는다 (TE-S14, AC-F05-09)', async () => {
    const { on } = await startPlan();
    // 이번 주 거리 기반 훈련을 기록했는데, 주간 거리 0으로 시간 기반 계획을 만들면 같은 주에 두 방식이 섞인다
    await t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, plannedSessionId: on('2026-11-18').id });
    const res = await t.call('post', '/v1/proposals/goal-change', USER_A, { goal: { goalDistance: 'none' }, profile: { recentWeeklyKm: 0 } });

    const generated = engine.generate.mock.results.at(-1)!.value as ReturnType<typeof generate>;
    expect(generated.options[0]!.sessions.some((s) => s.date < '2026-11-23' && s.distanceKm === null)).toBe(true);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PLAN_NOT_FEASIBLE');
    expect(engine.validate.mock.results.at(-1)!.value).toMatchObject({ ok: false, violations: expect.arrayContaining(['TE-S14']) });
    expect(await prisma.changeProposal.count()).toBe(0);
  });

  test('바꿀 것이 없거나 목표 없음에 대회 날짜를 넣으면 입력 오류다', async () => {
    await startPlan();
    expect((await t.call('post', '/v1/proposals/goal-change', USER_A, { goal: { goalDistance: 'five_k' } })).body.code).toBe('VALIDATION_ERROR');
    expect((await t.call('post', '/v1/proposals/goal-change', USER_A, { goal: { goalDistance: 'none', raceDate: '2027-03-01' } })).body.code).toBe('VALIDATION_ERROR');
  });
});

describe('채팅의 목표 변경 제안', () => {
  test('기록이 2주 치 이상이면 기록으로 주간 거리를 정하고, 승인하면 일정 변경 1회를 차감한다 (PRD §6.5)', async () => {
    await startPlan();
    for (const date of ['2026-11-03', '2026-11-05', '2026-11-11']) {
      await prisma.workoutLog.create({ data: { userId: USER_A, date: day(date), distanceKm: 6, durationSec: 2400, source: 'app' } });
    }
    const result = await proposals.createGoalChangeFromChat(USER_A, { goalDistance: 'none' });
    const proposal = created(result);
    expect(proposal).toMatchObject({ consumesQuota: true, goal: { after: { goalDistance: 'none', goalTimeSec: null, raceDate: null } } });
    // 최근 3주(10/26~11/15)의 18km를 3주로 나눈 값으로 만든다
    expect(engine.generate).toHaveBeenLastCalledWith(expect.objectContaining({ profile: expect.objectContaining({ recentWeeklyKm: 6 }) }));

    const res = await approve(proposal.id);
    expect(res.status).toBe(200);
    expect(res.body.usage.reschedule.used).toBe(1);
    expect(await prisma.trainingPlan.findFirstOrThrow({ where: { userId: USER_A } })).toMatchObject({ goalDistance: 'none', kind: 'base_building' });
  });
});

describe('채팅의 기록 등록 제안 (AC-F07-05)', () => {
  test('승인 후에만 기록이 저장되고 훈련에 연결된다. 차감하지 않는다', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createWorkoutLog(USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, sessionId: on('2026-11-18').id }));
    expect(proposal).toMatchObject({ type: 'workout_log', consumesQuota: false, workout: { paceSecPerKm: 400, plannedSession: { date: '2026-11-18' } } });
    expect(await prisma.workoutLog.count()).toBe(0);

    const res = await approve(proposal.id);
    expect(res.status).toBe(200);
    expect(res.body.resultMessage.content).toBe('운동 기록을 저장했어요.');
    expect(res.body.usage.reschedule.used).toBe(0);
    expect(await prisma.workoutLog.findFirstOrThrow()).toMatchObject({ source: 'chat', plannedSessionId: on('2026-11-18').id });
    expect(await prisma.planChangeLog.count()).toBe(0);
  });

  test('그 사이 연결할 훈련이 생략되었으면 승인하지 않는다', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createWorkoutLog(USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, sessionId: on('2026-11-20').id }));
    await prisma.plannedSession.updateMany({ where: { id: on('2026-11-20').id }, data: { isSkipped: true } });

    const res = await approve(proposal.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TARGET_CHANGED');
    expect(await prisma.workoutLog.count()).toBe(0);
  });

  test('제안 뒤 화면에서 같은 기록을 저장했으면 승인 때 중복으로 거부한다', async () => {
    await startPlan();
    const proposal = created(await proposals.createWorkoutLog(USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200 }));
    expect((await t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200 })).status).toBe(201);

    const res = await approve(proposal.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WORKOUT_DUPLICATE');
    expect(await prisma.workoutLog.count()).toBe(1);
    expect((await t.call('get', `/v1/proposals/${proposal.id}`, USER_A)).body.status).toBe('pending');
  });

  test('승인과 화면 저장이 동시에 일어나도 같은 기록은 하나만 남는다', async () => {
    await startPlan();
    const proposal = created(await proposals.createWorkoutLog(USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200 }));
    const [approved, saved] = await Promise.all([approve(proposal.id), t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200 })]);

    // 먼저 잠근 쪽이 저장하고, 나중 쪽은 중복으로 거부된다
    const outcomes = [`${approved.status}`, `${saved.status}`].sort();
    expect([['200', '409'], ['201', '409']]).toContainEqual(outcomes);
    expect([approved.body.code, saved.body.code]).toContain('WORKOUT_DUPLICATE');
    expect(await prisma.workoutLog.count()).toBe(1);
  });

  test('승인과 일정 변경 승인이 동시에 일어나도 교착 없이 끝난다', async () => {
    const { on } = await startPlan();
    const proposal = created(await proposals.createReschedule(USER_A, { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' }));
    const results = await Promise.all([
      approve(proposal.id),
      t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, plannedSessionId: on('2026-11-20').id }),
      approve(proposal.id),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 201, 200]);
  });

  test('미래 날짜, 같은 기록, 이미 기록한 훈련은 제안을 만들지 않는다', async () => {
    const { on } = await startPlan();
    expect(await proposals.createWorkoutLog(USER_A, { date: '2026-11-18', distanceKm: 3, durationSec: 1200 })).toMatchObject({ created: false, reasonCode: 'INVALID_VALUE' });
    await t.call('post', '/v1/workouts', USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200, plannedSessionId: on('2026-11-18').id });
    expect(await proposals.createWorkoutLog(USER_A, { date: TODAY, distanceKm: 3, durationSec: 1200 })).toMatchObject({ created: false, reasonCode: 'WORKOUT_DUPLICATE' });
    expect(await proposals.createWorkoutLog(USER_A, { date: TODAY, distanceKm: 4, durationSec: 1500, sessionId: on('2026-11-18').id })).toMatchObject({ created: false, reasonCode: 'SESSION_ALREADY_COMPLETED' });
  });
});
