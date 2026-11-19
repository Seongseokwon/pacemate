import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { FakeLlmProvider, type FakeLlmStep } from '../src/chat/llm/fake-llm-provider.js';
import { LLM_PROVIDER, LlmError, type LlmProvider, type LlmRequest } from '../src/chat/llm/llm-provider.js';
import { SAFETY_LINES } from '../src/chat/prompts/safety.js';
import { UsageService } from '../src/usage/usage.service.js';
import { createTestApp } from './test-app.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
// 화요일. 달리는 요일이 수·금·일이라 계획이 이번 주(11/18 수)부터 시작한다
const TODAY = '2026-11-17';
const NOON_KST = (date: string) => new Date(`${date}T03:00:00Z`);

const prisma = createTestPrisma();
let provider = new FakeLlmProvider([]);
// 테스트마다 대본을 바꾼다
const delegating: LlmProvider = { model: 'fake', complete: (request, signal) => provider.complete(request, signal) };
let t: Awaited<ReturnType<typeof createTestApp>>;
// 채팅은 사용자별 분당 10회로 막힌다. 테스트마다 2분씩 시각을 옮겨 앞 테스트의 요청 수가 남지 않게 한다
let base = NOON_KST(TODAY);
let slot = 0;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOON_KST(TODAY) });
  t = await createTestApp({ override: (builder) => builder.overrideProvider(LLM_PROVIDER).useValue(delegating) });
});

beforeEach(async () => {
  base = new Date(NOON_KST(TODAY).getTime() + ++slot * 120_000);
  vi.setSystemTime(base);
  provider = new FakeLlmProvider([]);
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

const script = (steps: FakeLlmStep[]) => {
  provider = new FakeLlmProvider(steps);
};

async function startPlan(user = USER_A) {
  const preview = await t.call('post', '/v1/plan/preview', user, { goalDistance: 'five_k' });
  const res = await t.call('post', '/v1/plan', user, { goalDistance: 'five_k', kind: preview.body.options[0].kind });
  expect(res.status).toBe(201);
  const sessions = await prisma.plannedSession.findMany({ where: { userId: user }, orderBy: { date: 'asc' } });
  return { on: (date: string) => sessions.find((s) => s.date.toISOString().startsWith(date))! };
}

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
/** 날짜만 고정하면 시계가 멈춰 모든 메시지의 시각이 같아진다. 실제처럼 요청 앞뒤로 시계를 1초씩 움직인다 */
const tick = () => vi.setSystemTime(new Date(Date.now() + 1_000));
async function send(content: string, extra: { clientMessageId?: string; sessionId?: string } = {}, user = USER_A) {
  tick();
  const res = await t.call('post', '/v1/chat/messages', user, { clientMessageId: extra.clientMessageId ?? newId(), content, ...(extra.sessionId && { sessionId: extra.sessionId }) });
  tick();
  return res;
}
const chatUsed = async (user = USER_A) => (await prisma.usageCounter.findFirst({ where: { userId: user } }))?.chatCount ?? 0;
const toolCall = (name: string, input: object, id = `call-${name}`) => ({ id, name, input });
const toolResults = (request: LlmRequest) => request.messages.filter((m) => m.role === 'tool');

describe('메시지 처리 (API_SPEC §3.5, ARCHITECTURE §7.5)', () => {
  test('AI 답을 저장하고 이용량을 1 올린다. 호출 기록에 지침 버전이 남는다', async () => {
    script([{ text: '안녕하세요! 무엇을 도와드릴까요?' }]);

    const res = await send('안녕');

    expect(res.status).toBe(200);
    expect(res.body.userMessage).toMatchObject({ role: 'user', content: '안녕', status: 'done', card: null });
    expect(res.body.replies).toEqual([expect.objectContaining({ role: 'assistant', content: '안녕하세요! 무엇을 도와드릴까요?', status: 'done', card: null })]);
    expect(res.body.usage.chat.used).toBe(1);
    expect(await chatUsed()).toBe(1);
    expect(await prisma.aiCallLog.findMany()).toMatchObject([{ userId: USER_A, purpose: 'chat', promptVersion: 'chat-v1', success: true }]);
  });

  test('도구를 부르면 결과를 붙여 다시 호출하고, 조회한 일정을 카드로 붙인다 (PRD §6.3, §6.6)', async () => {
    await startPlan();
    script([{ toolCalls: [toolCall('get_training_plan', { from: '2026-11-16', to: '2026-11-22' })] }, { text: '이번 주에는 훈련이 세 번 있어요.' }]);

    const res = await send('이번 주 훈련 알려 줘');

    expect(res.status).toBe(200);
    const second = provider.requests[1]!;
    expect(toolResults(second)).toHaveLength(1);
    expect(JSON.parse((toolResults(second)[0] as { content: string }).content).sessions).toHaveLength(3);
    expect(second.tools.map((tool) => tool.name)).toHaveLength(7);
    expect(res.body.replies[0]).toMatchObject({ content: '이번 주에는 훈련이 세 번 있어요.', card: { type: 'plan_summary', data: { from: '2026-11-16', to: '2026-11-22' } } });
    expect(res.body.replies[0].card.data.sessions.map((s: { date: string }) => s.date)).toEqual(['2026-11-18', '2026-11-20', '2026-11-22']);
    expect(await prisma.aiCallLog.count()).toBe(2);
  });

  test('주간 요약을 조회하면 주간 요약 카드를 붙인다 (F08-R05)', async () => {
    await startPlan();
    script([{ toolCalls: [toolCall('get_weekly_summary', { weekStart: '2026-11-16' })] }, { text: '이번 주는 아직 시작 전이에요.' }]);

    const res = await send('이번 주 어때?');

    expect(res.body.replies[0].card).toEqual({
      type: 'weekly_summary',
      data: expect.objectContaining({ weekStart: '2026-11-16', plannedCount: 3, completedCount: 0, nextSession: expect.objectContaining({ date: '2026-11-18' }) }),
    });
  });

  test('제안 도구가 제안을 만들면 제안 카드를 붙이고, 일정은 바꾸지 않는다 (F04-R03, PRD §6.1)', async () => {
    const { on } = await startPlan();
    script([
      { toolCalls: [toolCall('propose_reschedule', { changeType: 'move', reason: 'schedule', sessionId: on('2026-11-18').id, targetDate: '2026-11-19' })] },
      { text: '내일 훈련을 목요일로 옮길까요?' },
    ]);

    const res = await send('내일 운동 목요일로 옮겨 줘');

    expect(res.status).toBe(200);
    expect(res.body.replies[0].card).toMatchObject({ type: 'proposal', proposal: { type: 'reschedule', status: 'pending', reasonLine: '일정에 맞춰 11/19(목)로 옮겼어요' } });
    expect((await prisma.plannedSession.findUniqueOrThrow({ where: { id: on('2026-11-18').id } })).date.toISOString()).toContain('2026-11-18');
    // 채팅은 대화 이용량만 쓴다. 일정 변경 이용량은 승인할 때 차감한다
    expect(res.body.usage).toMatchObject({ chat: { used: 1 }, reschedule: { used: 0 } });
  });

  test('한 번에 제안을 여러 번 만들면 마지막 대기 제안만 카드로 붙는다 (DI-05)', async () => {
    const { on } = await startPlan();
    script([
      { toolCalls: [toolCall('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' }, 'c1')] },
      { toolCalls: [toolCall('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'lighter' }, 'c2')] },
      { text: '가볍게 바꿔 볼까요?' },
    ]);

    const res = await send('피곤해');

    const pending = await prisma.changeProposal.findFirstOrThrow({ where: { userId: USER_A, status: 'pending' } });
    expect(res.body.replies[0].card.proposal.id).toBe(pending.id);
    expect(await prisma.changeProposal.count({ where: { status: 'superseded' } })).toBe(1);
  });
});

describe('한도 (F04-R06)', () => {
  test('한도를 넘으면 LLM을 부르지 않고 한도 카드를 돌려준다. 호출 기록이 생기지 않는다 (AC-F04-03)', async () => {
    await prisma.usageCounter.create({ data: { userId: USER_A, month: '2026-11', chatCount: 5 } });
    script([{ text: '여기까지 오면 안 된다' }]);

    const res = await send('이번 주 훈련 알려 줘');

    expect(res.status).toBe(200);
    expect(res.body.userMessage.status).toBe('done');
    expect(res.body.replies).toEqual([expect.objectContaining({ role: 'system', card: { type: 'limit', data: { resetsOn: '2026-12-01' } } })]);
    expect(provider.requests).toHaveLength(0);
    expect(await prisma.aiCallLog.count()).toBe(0);
    expect(await chatUsed()).toBe(5);
  });
});

describe('실패 (F04-R10)', () => {
  test('LLM이 실패하면 503이고 메시지는 실패, 이용량은 그대로, 그 사이 만든 제안은 취소된다 (AC-F04-06)', async () => {
    const { on } = await startPlan();
    script([
      { toolCalls: [toolCall('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' })] },
      () => {
        throw new LlmError('PROVIDER_ERROR');
      },
    ]);
    const clientMessageId = newId();

    const res = await send('오늘 쉬고 싶어', { clientMessageId });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
    expect(await prisma.chatMessage.findFirstOrThrow({ where: { clientMessageId } })).toMatchObject({ status: 'failed' });
    expect(await prisma.chatMessage.count({ where: { role: { not: 'user' } } })).toBe(0);
    expect(await chatUsed()).toBe(0);
    expect(await prisma.changeProposal.findFirstOrThrow()).toMatchObject({ status: 'cancelled' });
    // 실패한 메시지를 같은 ID로 다시 보내도 실패로 답한다. 앱은 새 ID로 다시 보낸다
    expect((await send('오늘 쉬고 싶어', { clientMessageId })).status).toBe(503);
  });

  test('도구 반복이 5회를 넘으면 멈추고 실패로 답한다 (PRD §6.3의 4단계)', async () => {
    await startPlan();
    script(Array.from({ length: 7 }, (_, i) => ({ toolCalls: [toolCall('get_runner_profile', {}, `c${i}`)] })));

    const res = await send('계속 조회해 봐');

    expect(res.status).toBe(503);
    expect(provider.requests).toHaveLength(6);
    expect(await chatUsed()).toBe(0);
  });

  test('빈 답은 실패로 본다', async () => {
    script([{ text: '  ' }]);
    expect((await send('안녕')).status).toBe(503);
  });

  test('공급자를 정하기 전에는 AI_UNAVAILABLE로 답한다', async () => {
    const plain = await createTestApp();
    const res = await plain.call('post', '/v1/chat/messages', USER_A, { clientMessageId: newId(), content: '안녕' });
    expect(res.status).toBe(503);
    expect(await chatUsed()).toBe(0);
    await plain.app.close();
  });
});

describe('실패 정리와 완료 확정 (§7.5의 5~6번)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('메시지를 저장한 뒤 한도 조회가 실패해도 처리 중으로 남지 않는다', async () => {
    vi.spyOn(t.app.get(UsageService), 'get').mockRejectedValueOnce(new Error('db'));
    const clientMessageId = newId();

    expect((await send('안녕', { clientMessageId })).status).toBe(503);

    expect(await prisma.chatMessage.findFirstOrThrow({ where: { clientMessageId } })).toMatchObject({ status: 'failed' });
    script([{ text: '네' }]);
    expect((await send('다시 안녕')).status).toBe(200);
  });

  test('커밋한 뒤 응답 조립이 실패해도 결과를 되돌리지 않고, 같은 ID로 다시 보내면 저장된 결과를 받는다 (AC-F04-06)', async () => {
    const { on } = await startPlan();
    script([
      { toolCalls: [toolCall('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' })] },
      { text: '쉬도록 바꿀까요?' },
    ]);
    const usage = t.app.get(UsageService);
    const original = usage.get.bind(usage);
    // 첫 호출은 한도 확인, 둘째 호출은 커밋 뒤 응답 조립이다
    vi.spyOn(usage, 'get').mockImplementationOnce(original).mockRejectedValueOnce(new Error('db'));
    const clientMessageId = newId();

    expect((await send('피곤해', { clientMessageId })).status).toBe(500);

    expect(await prisma.chatMessage.findFirstOrThrow({ where: { clientMessageId } })).toMatchObject({ status: 'done' });
    expect(await prisma.changeProposal.findFirstOrThrow()).toMatchObject({ status: 'pending' });
    expect(await chatUsed()).toBe(1);
    const again = await send('피곤해', { clientMessageId });
    expect(again.status).toBe(200);
    expect(again.body.replies[0]).toMatchObject({ content: '쉬도록 바꿀까요?', card: { type: 'proposal', proposal: { status: 'pending' } } });
  });

  test('2분이 지나 실패로 바뀐 처리는 늦게 끝나도 결과를 남기지 못한다', async () => {
    const { on } = await startPlan();
    script([
      { toolCalls: [toolCall('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' })] },
      async () => {
        // 처리하는 동안 다른 요청이 이 메시지를 오래된 처리로 보고 실패로 바꿨다
        await prisma.chatMessage.updateMany({ where: { userId: USER_A, status: 'processing' }, data: { status: 'failed' } });
        return { text: '늦은 답', toolCalls: [], stopReason: 'end', inputTokens: 0, outputTokens: 0, costUsd: 0 };
      },
    ]);

    const res = await send('피곤해');

    expect(res.status).toBe(503);
    expect(await prisma.chatMessage.count({ where: { role: 'assistant' } })).toBe(0);
    expect(await chatUsed()).toBe(0);
    expect(await prisma.changeProposal.findFirstOrThrow()).toMatchObject({ status: 'cancelled' });
  });

  test('처리하는 동안 한도에 닿으면 답을 남기지 않고 이용량도 넘기지 않는다 (DI-12)', async () => {
    await prisma.usageCounter.create({ data: { userId: USER_A, month: '2026-11', chatCount: 4 } });
    script([
      async () => {
        // 다른 경로가 남은 1회를 먼저 썼다
        await prisma.usageCounter.updateMany({ where: { userId: USER_A }, data: { chatCount: 5 } });
        return { text: '한도 밖의 답', toolCalls: [], stopReason: 'end', inputTokens: 0, outputTokens: 0, costUsd: 0 };
      },
    ]);
    const clientMessageId = newId();

    expect((await send('안녕', { clientMessageId })).status).toBe(503);

    expect(await prisma.chatMessage.findFirstOrThrow({ where: { clientMessageId } })).toMatchObject({ status: 'failed' });
    expect(await prisma.chatMessage.count({ where: { role: 'assistant' } })).toBe(0);
    expect(await chatUsed()).toBe(5);
  });
});

describe('중복 전송과 동시 처리 (§7.5의 1~2번)', () => {
  test('완료된 메시지를 같은 ID로 다시 보내면 저장된 결과를 그대로 돌려주고 다시 처리하지 않는다', async () => {
    script([{ text: '안녕하세요!' }]);
    const clientMessageId = newId();
    const first = await send('안녕', { clientMessageId });

    const again = await send('안녕', { clientMessageId });

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(provider.requests).toHaveLength(1);
    expect(await chatUsed()).toBe(1);
  });

  test('같은 ID가 처리 중이면 202, 다른 메시지가 처리 중이면 CHAT_BUSY', async () => {
    const clientMessageId = newId();
    await prisma.chatMessage.create({ data: { userId: USER_A, role: 'user', content: '처리 중', status: 'processing', clientMessageId } });

    const same = await send('처리 중', { clientMessageId });
    expect(same.status).toBe(202);
    expect(same.body).toEqual({ status: 'processing' });

    const other = await send('다른 메시지');
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('CHAT_BUSY');
    // 다른 사용자는 막히지 않는다
    script([{ text: '네' }]);
    expect((await send('안녕', {}, USER_B)).status).toBe(200);
  });

  test('2분 넘게 처리 중인 메시지는 실패로 보고 새 메시지를 받는다', async () => {
    const stale = await prisma.chatMessage.create({
      data: { userId: USER_A, role: 'user', content: '멈춘 메시지', status: 'processing', clientMessageId: newId(), createdAt: new Date(base.getTime() - 121_000) },
    });
    script([{ text: '네' }]);

    expect((await send('새 메시지')).status).toBe(200);
    expect(await prisma.chatMessage.findUniqueOrThrow({ where: { id: stale.id } })).toMatchObject({ status: 'failed' });
  });
});

describe('컨텍스트 (ARCHITECTURE §7.4)', () => {
  test('오늘 날짜, 프로필, 이번 주 계획을 지침 뒤에 붙이고, 최근 대화에서 실패한 메시지는 뺀다', async () => {
    await startPlan();
    await prisma.chatMessage.create({ data: { userId: USER_A, role: 'user', content: '실패한 질문', status: 'failed', clientMessageId: newId() } });
    script([{ text: '첫 답' }, { text: '둘째 답' }]);
    await send('첫 질문');

    await send('둘째 질문');

    const request = provider.requests[1]!;
    expect(request.system).toContain(SAFETY_LINES.pain);
    expect(request.system).toContain(`"today":"${TODAY}"`);
    expect(request.system).toContain('"sessions":[{');
    expect(request.messages).toEqual([
      { role: 'user', content: '첫 질문' },
      { role: 'assistant', content: '첫 답', toolCalls: [] },
      { role: 'user', content: '둘째 질문' },
    ]);
  });

  test('코치를 바꾸면 다음 요청의 지침만 바뀌고 도구 정의와 이전 대화는 같다 (AC-F04-07, F04-R13)', async () => {
    script([{ text: '온이예요' }, { text: '수리예요' }]);
    await send('안녕');
    expect((await t.call('put', '/v1/me/coach', USER_A, { coach: 'suri' })).status).toBe(200);

    await send('다시 안녕');

    const [before, after] = provider.requests as [LlmRequest, LlmRequest];
    expect(before.system).toContain('[말투: 온이]');
    expect(after.system).toContain('[말투: 수리]');
    expect(after.tools).toEqual(before.tools);
    expect(after.messages.slice(0, 2)).toEqual([before.messages[0], { role: 'assistant', content: '온이예요', toolCalls: [] }]);
    expect(await chatUsed()).toBe(2);
  });

  test('훈련 상세에서 들어오면 대상 훈련을 상황에 넣는다. 다른 사용자의 훈련이면 404 (F05-R11, DI-07)', async () => {
    const { on } = await startPlan();
    const other = await startPlan(USER_B);
    script([{ text: '이 훈련을 어떻게 바꿀까요?' }]);

    expect((await send('이거 바꿔 줘', { sessionId: on('2026-11-18').id })).status).toBe(200);
    expect(provider.requests[0]!.system).toContain(`"targetSession":{"sessionId":"${on('2026-11-18').id}"`);

    const res = await send('이거 바꿔 줘', { sessionId: other.on('2026-11-18').id });
    expect(res.status).toBe(404);
    expect(await prisma.chatMessage.count({ where: { userId: USER_A, status: 'processing' } })).toBe(0);
  });

  test('과거 제안 카드는 현재 상태를 짧은 글로 넘긴다', async () => {
    const { on } = await startPlan();
    script([
      { toolCalls: [toolCall('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' })] },
      { text: '쉬도록 바꿀까요?' },
      { text: '카드의 버튼을 눌러 주세요.' },
    ]);
    const first = await send('피곤해');
    await t.call('post', `/v1/proposals/${first.body.replies[0].card.proposal.id}/cancel`, USER_A);

    await send('응 그렇게 해 줘');

    expect(provider.requests[2]!.messages[1]).toEqual({ role: 'assistant', content: '쉬도록 바꿀까요?\n[일정 변경 제안 카드, 상태: 취소됨]', toolCalls: [] });
  });
});

describe('대화 조회 (F04-R04)', () => {
  test('앱을 다시 열어도 이전 대화가 보인다. 최신부터 나누어 불러오고 다른 사용자의 대화는 없다 (AC-F04-05, DI-07)', async () => {
    script([{ text: '답 1' }, { text: '답 2' }, { text: '남의 답' }]);
    await send('질문 1');
    await send('질문 2');
    await send('남의 질문', {}, USER_B);

    const page = await t.call('get', '/v1/chat/messages?limit=3', USER_A);
    expect(page.status).toBe(200);
    expect(page.body.items.map((m: { content: string }) => m.content)).toEqual(['답 2', '질문 2', '답 1']);
    expect(page.body.hasMore).toBe(true);

    const rest = await t.call('get', `/v1/chat/messages?limit=3&before=${page.body.items[2].id}`, USER_A);
    expect(rest.body).toMatchObject({ items: [{ content: '질문 1' }], hasMore: false });
  });

  test('제안 카드는 지금 상태로 보인다 (API_SPEC §2.5)', async () => {
    const { on } = await startPlan();
    script([
      { toolCalls: [toolCall('propose_reschedule', { changeType: 'ease', reason: 'fatigue', sessionId: on('2026-11-18').id, easeOption: 'rest' })] },
      { text: '쉬도록 바꿀까요?' },
    ]);
    const res = await send('피곤해');
    await t.call('post', `/v1/proposals/${res.body.replies[0].card.proposal.id}/approve`, USER_A);

    const page = await t.call('get', '/v1/chat/messages', USER_A);
    const card = page.body.items.find((m: { card: { type: string } | null }) => m.card?.type === 'proposal').card;
    expect(card.proposal.status).toBe('approved');
    expect(page.body.items[0]).toMatchObject({ role: 'system', card: { type: 'result', data: { proposalType: 'reschedule' } } });
  });
});

describe('요청 제한 (API_SPEC §1)', () => {
  test('메시지 전송은 사용자별 분당 10회까지다', async () => {
    script(Array.from({ length: 10 }, () => ({ text: '네' })));
    for (let i = 0; i < 10; i++) expect((await send(`질문 ${i}`)).status).toBe(200);

    const blocked = await send('하나 더');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });
});

describe('빠른 질문 (F04-R05)', () => {
  test('오늘 훈련이 있으면 오늘 훈련 질문을, 계획이 없으면 시작 질문을 추천한다', async () => {
    expect((await t.call('get', '/v1/chat/suggestions', USER_A)).body.suggestions[0].code).toBe('NO_PLAN_START');

    await startPlan();
    vi.setSystemTime(NOON_KST('2026-11-18'));
    const res = await t.call('get', '/v1/chat/suggestions', USER_A);
    expect(res.status).toBe(200);
    expect(res.body.suggestions.map((s: { code: string }) => s.code)).toEqual(['TODAY_SESSION', 'TODAY_TIRED', 'THIS_WEEK']);
  });
});
