import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestPrisma, resetDatabase } from '../../../test/test-db.js';
import { PrismaService } from '../../db/prisma.service.js';
import { FakeLlmProvider, type FakeLlmStep, fakeLlmResponse } from './fake-llm-provider.js';
import { LlmGateway } from './llm-gateway.js';
import { LLM_PROVIDER, LlmError, type LlmMessage, type LlmRequest } from './llm-provider.js';

// 제한 시간 테스트가 30초를 기다리지 않게 한다
vi.mock('../chat.config.js', async (original) => ({
  ...(await original<typeof import('../chat.config.js')>()),
  LLM_CALL_TIMEOUT_MS: 50,
}));

const prisma = createTestPrisma();
const USER = '11111111-1111-4111-8111-111111111111';
const META = { userId: USER, purpose: 'chat', promptVersion: 'v-test' } as const;

const request = (messages: LlmMessage[] = [{ role: 'user', content: '이번 주 훈련 알려 줘' }]): LlmRequest => ({
  system: '시스템 지침',
  messages,
  tools: [{ name: 'get_training_plan', description: '훈련 계획 조회', inputSchema: { type: 'object' } }],
  maxOutputTokens: 1000,
});

async function setup(script: FakeLlmStep[]) {
  const provider = new FakeLlmProvider(script);
  const moduleRef = await Test.createTestingModule({
    providers: [
      LlmGateway,
      { provide: LLM_PROVIDER, useValue: provider },
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { provider, gateway: moduleRef.get(LlmGateway) };
}

const logs = () => prisma.aiCallLog.findMany({ orderBy: { createdAt: 'asc' } });

beforeEach(async () => {
  await resetDatabase(prisma);
  const now = new Date();
  await prisma.user.create({
    data: {
      id: USER,
      authProvider: 'apple',
      termsAgreedAt: now,
      privacyAgreedAt: now,
      healthDataAgreedAt: now,
      consentVersion: '1',
    },
  });
});

afterAll(() => prisma.$disconnect());

describe('LlmGateway', () => {
  test('가짜 구현으로 도구 호출이 있는 대화를 재현하고, 호출마다 기록을 남긴다 (F11-R02)', async () => {
    const toolCall = { id: 'call-1', name: 'get_training_plan', input: { from: '2026-11-16', to: '2026-11-22' } };
    const { provider, gateway } = await setup([
      { toolCalls: [toolCall], inputTokens: 100, outputTokens: 20, costUsd: 0.0012 },
      { text: '이번 주에는 훈련이 3번 있어요.', inputTokens: 150, outputTokens: 30, cachedInputTokens: 100, costUsd: 0.0015 },
    ]);

    const first = await gateway.complete(request(), META);
    expect(first).toMatchObject({ stopReason: 'tool_calls', toolCalls: [toolCall] });

    const messages: LlmMessage[] = [
      ...request().messages,
      { role: 'assistant', content: first.text, toolCalls: first.toolCalls },
      { role: 'tool', toolCallId: 'call-1', content: '{"sessions":3}' },
    ];
    const second = await gateway.complete(request(messages), META);

    expect(second).toMatchObject({ stopReason: 'end', text: '이번 주에는 훈련이 3번 있어요.', toolCalls: [] });
    expect(provider.requests[1]?.messages).toEqual(messages);
    expect(await logs()).toMatchObject([
      { userId: USER, purpose: 'chat', model: 'fake', promptVersion: 'v-test', success: true, errorCode: null },
      { inputTokens: 150, outputTokens: 30, cachedInputTokens: 100, toolCallCount: 0, success: true },
    ]);
    expect((await logs())[0]).toMatchObject({ inputTokens: 100, outputTokens: 20, toolCallCount: 1 });

    // 사용자별 비용을 호출 기록에서 집계할 수 있다(AC-F11-02)
    const cost = await prisma.aiCallLog.aggregate({ where: { userId: USER }, _sum: { costUsd: true } });
    expect(cost._sum.costUsd?.toNumber()).toBe(0.0027);
  });

  test.each([
    ['max_tokens', 'MAX_TOKENS'],
    ['refusal', 'REFUSAL'],
  ] as const)('%s로 끝난 응답은 실패로 처리하고 다시 시도하지 않는다 (F04-R10)', async (stopReason, code) => {
    const { provider, gateway } = await setup([{ stopReason, text: '잘린 응답', inputTokens: 80, outputTokens: 40 }]);

    await expect(gateway.complete(request(), META)).rejects.toMatchObject({ code });

    expect(provider.requests).toHaveLength(1);
    expect(await logs()).toMatchObject([{ success: false, errorCode: code, inputTokens: 80, outputTokens: 40 }]);
  });

  test('일시적 오류는 한 번 다시 시도한다', async () => {
    const { gateway } = await setup([
      () => {
        throw new LlmError('PROVIDER_ERROR', true);
      },
      { text: '안녕하세요' },
    ]);

    await expect(gateway.complete(request(), META)).resolves.toMatchObject({ text: '안녕하세요' });

    expect(await logs()).toMatchObject([
      { success: false, errorCode: 'PROVIDER_ERROR', inputTokens: 0 },
      { success: true },
    ]);
  });

  test('일시적 오류가 이어지면 두 번째 실패에서 멈춘다', async () => {
    const fail = () => {
      throw new LlmError('PROVIDER_ERROR', true);
    };
    const { provider, gateway } = await setup([fail, fail, { text: '여기까지 오면 안 된다' }]);

    await expect(gateway.complete(request(), META)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });

    expect(provider.requests).toHaveLength(2);
    expect(await logs()).toHaveLength(2);
  });

  test('일시적이 아닌 오류는 다시 시도하지 않고, 알 수 없는 오류의 내용을 밖으로 내보내지 않는다', async () => {
    const { provider, gateway } = await setup([
      () => {
        throw new Error('공급자가 돌려준 대화 내용');
      },
    ]);

    const error: unknown = await gateway.complete(request(), META).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ code: 'PROVIDER_ERROR', message: 'PROVIDER_ERROR' });
    expect(provider.requests).toHaveLength(1);
  });

  test('제한 시간이 지나면 호출을 끊고 실패로 처리한다', async () => {
    let aborted = false;
    const { provider, gateway } = await setup([
      (_request, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => (aborted = true));
          setTimeout(() => resolve(fakeLlmResponse({ text: '늦은 응답' })), 500);
        }),
    ]);

    await expect(gateway.complete(request(), META)).rejects.toMatchObject({ code: 'TIMEOUT' });

    expect(aborted).toBe(true);
    expect(provider.requests).toHaveLength(1);
    expect(await logs()).toMatchObject([{ success: false, errorCode: 'TIMEOUT' }]);
  });

  test('호출 기록을 남기지 못해도 응답은 돌려준다', async () => {
    const { gateway } = await setup([{ text: '안녕하세요' }]);
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const unknownUser = '99999999-9999-4999-8999-999999999999';

    await expect(gateway.complete(request(), { ...META, userId: unknownUser })).resolves.toMatchObject({
      text: '안녕하세요',
    });
    expect(await logs()).toHaveLength(0);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
