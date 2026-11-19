import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { FakeLlmProvider, type FakeLlmStep } from '../src/chat/llm/fake-llm-provider.js';
import { LLM_PROVIDER, type LlmProvider } from '../src/chat/llm/llm-provider.js';
import { createTestApp } from './test-app.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

// 주요 흐름 통합 테스트(PRD §12의 S2, S4, AC-F05-01, AC-F07-05). 채팅으로 제안 카드를 받고, 승인 전에는 아무것도 바뀌지 않으며,
// 승인한 뒤에야 일정·이력 또는 기록·훈련 완료가 바뀌는지 본다. 평가 세트(test/eval)는 제안 단계까지만 본다.

const USER = '11111111-1111-4111-8111-111111111111';
const NOON_KST = (date: string) => new Date(`${date}T03:00:00Z`);
const prisma = createTestPrisma();
let provider = new FakeLlmProvider([]);
const delegating: LlmProvider = { model: 'fake', complete: (request, signal) => provider.complete(request, signal) };
let t: Awaited<ReturnType<typeof createTestApp>>;
let slot = 0;
let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const tick = () => vi.setSystemTime(new Date(Date.now() + 1_000));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOON_KST('2026-11-17') });
  t = await createTestApp({ override: (builder) => builder.overrideProvider(LLM_PROVIDER).useValue(delegating) });
});

beforeEach(async () => {
  // 채팅의 분당 횟수 제한이 앞 테스트에서 넘어오지 않게 시각을 옮긴다
  vi.setSystemTime(new Date(NOON_KST('2026-11-17').getTime() + ++slot * 120_000));
  await resetDatabase(prisma);
  const now = new Date();
  await prisma.user.create({ data: { id: USER, authProvider: 'google', termsAgreedAt: now, privacyAgreedAt: now, healthDataAgreedAt: now, consentVersion: '1' } });
  await prisma.runnerProfile.create({
    data: { userId: USER, experience: 'under_2y', continuousRun: 'under_60m', recentWeeklyKm: 15, recentPaceSecPerKm: 400, weeklyRunCount: 3, preferredWeekdays: [3, 5, 7], level: 'novice' },
  });
  const preview = await t.call('post', '/v1/plan/preview', USER, { goalDistance: 'five_k' });
  expect((await t.call('post', '/v1/plan', USER, { goalDistance: 'five_k', kind: preview.body.options[0].kind })).status).toBe(201);
});

afterAll(async () => {
  vi.useRealTimers();
  await t.app.close();
  await prisma.$disconnect();
});

/** 그날 정오로 시계를 옮기고 채팅을 보낸다 */
async function chatOn(date: string, content: string, steps: FakeLlmStep[]) {
  vi.setSystemTime(new Date(NOON_KST(date).getTime() + slot * 120_000));
  provider = new FakeLlmProvider(steps);
  tick();
  const res = await t.call('post', '/v1/chat/messages', USER, { clientMessageId: newId(), content });
  tick();
  expect(res.status).toBe(200);
  return res.body.replies.at(-1).card.proposal as { id: string; status: string };
}

const sessionsSnapshot = async () =>
  (await prisma.plannedSession.findMany({ where: { userId: USER }, orderBy: { date: 'asc' } })).map((s) => ({ id: s.id, date: s.date.toISOString().slice(0, 10), isSkipped: s.isSkipped, distanceKm: s.distanceKm?.toNumber() ?? null }));

test('S2: 여행 일정 제안은 승인 전에는 일정을 바꾸지 않고, 승인하면 일정·이력·결과 메시지가 바뀐다 (AC-F05-01)', async () => {
  const before = await sessionsSnapshot();
  const travel = ['2026-11-20', '2026-11-21', '2026-11-22'];
  const proposal = await chatOn('2026-11-18', '이번 주 금요일부터 일요일까지 여행이야. 훈련 일정을 다시 만들어 줘.', [
    { toolCalls: [{ id: 'c1', name: 'propose_reschedule', input: { changeType: 'unavailable_dates', reason: 'schedule', unavailableDates: travel } }] },
    { text: '여행 가는 날을 빼고 다시 짜 봤어요. 이렇게 바꿀까요?' },
  ]);
  expect(proposal.status).toBe('pending');
  expect(await sessionsSnapshot()).toEqual(before);
  expect(await prisma.planChangeLog.count()).toBe(0);

  const approved = await t.call('post', `/v1/proposals/${proposal.id}/approve`, USER);
  expect(approved.status).toBe(200);
  expect(approved.body.proposal.status).toBe('approved');

  const after = await sessionsSnapshot();
  expect(after).not.toEqual(before);
  // 여행 날짜에는 달릴 훈련이 남지 않는다
  expect(after.filter((s) => travel.includes(s.date) && !s.isSkipped)).toEqual([]);
  expect(await prisma.planChangeLog.findFirst({ where: { proposalId: proposal.id } })).toMatchObject({ source: 'chat', planVersion: 2 });
  const messages = await t.call('get', '/v1/chat/messages', USER);
  expect(messages.body.items[0]).toMatchObject({ role: 'system', card: { type: 'result' } });
});

test('S4: 채팅 기록 카드는 승인 전에는 저장하지 않고, 저장하면 기록이 생기고 훈련이 완료된다 (AC-F07-05, AC-F07-01)', async () => {
  const wed = (await prisma.plannedSession.findFirstOrThrow({ where: { userId: USER, date: new Date('2026-11-18T00:00:00Z') } })).id;
  const proposal = await chatOn('2026-11-19', '어제 5km를 32분에 뛰었어. 좀 힘들었어.', [
    { toolCalls: [{ id: 'c1', name: 'propose_workout_log', input: { date: '2026-11-18', distanceKm: 5, durationSec: 1920, sessionId: wed } }] },
    { text: '어제 기록을 이렇게 남길까요?' },
  ]);
  expect(await prisma.workoutLog.count()).toBe(0);
  expect((await t.call('get', `/v1/sessions/${wed}`, USER)).body.status).not.toBe('completed');

  expect((await t.call('post', `/v1/proposals/${proposal.id}/approve`, USER)).status).toBe(200);

  expect(await prisma.workoutLog.findMany({ where: { userId: USER } })).toMatchObject([{ source: 'chat', durationSec: 1920, plannedSessionId: wed }]);
  const session = await t.call('get', `/v1/sessions/${wed}`, USER);
  expect(session.body).toMatchObject({ status: 'completed', workout: { distanceKm: 5, paceSecPerKm: 384 } });
});
