import OpenAI from 'openai';
import { describe, expect, test, vi } from 'vitest';
import { LlmError, type LlmRequest } from './llm-provider.js';
import { OpenAiLlmProvider, toOpenAiMessages } from './openai-llm-provider.js';

const request: LlmRequest = {
  system: '시스템 지침',
  messages: [{ role: 'user', content: '오늘 쉬고 싶어요' }],
  tools: [{ name: 'get_training_plan', description: '계획 조회', inputSchema: { type: 'object', properties: {} } }],
  maxOutputTokens: 1000,
};
const price = { input: 1, output: 4, cachedInput: 0.25, cacheWrite: 1 };
const usage = { prompt_tokens: 1100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 1000 } };
const signal = new AbortController().signal;

function providerReturning(result: unknown | (() => unknown), reasoningEffort?: OpenAI.ReasoningEffort) {
  const create = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => (typeof result === 'function' ? (result as () => unknown)() : result));
  const client = { chat: { completions: { create } } } as unknown as OpenAI;
  return { provider: new OpenAiLlmProvider({ client, model: 'gpt-test', price, ...(reasoningEffort && { reasoningEffort }) }), create };
}

const completion = (message: Record<string, unknown>, finish_reason: string) => ({ choices: [{ message: { refusal: null, ...message }, finish_reason }], usage });

describe('GPT 공급자 (T-407, ARCHITECTURE §7.2)', () => {
  test('시스템 지침을 첫 메시지로 보내고 비용을 계산한다', async () => {
    const { provider, create } = providerReturning(completion({ content: '쉬어도 좋아요.' }, 'stop'));

    const response = await provider.complete(request, signal);

    expect(create.mock.calls[0]![0]).toMatchObject({
      model: 'gpt-test',
      max_completion_tokens: 5000,
      messages: [
        { role: 'system', content: '시스템 지침' },
        { role: 'user', content: '오늘 쉬고 싶어요' },
      ],
      tools: [{ type: 'function', function: { name: 'get_training_plan', description: '계획 조회', parameters: { type: 'object', properties: {} } } }],
    });
    expect(create.mock.calls[0]![0]).not.toHaveProperty('reasoning_effort');
    expect(response).toMatchObject({ text: '쉬어도 좋아요.', stopReason: 'end', inputTokens: 1100, cachedInputTokens: 1000, outputTokens: 50 });
    expect(response.costUsd).toBeCloseTo((100 * 1 + 1000 * 0.25 + 50 * 4) / 1_000_000, 10);
  });

  test('추론 effort를 정하면 보낸다', async () => {
    const { provider, create } = providerReturning(completion({ content: '답' }, 'stop'), 'low');
    await provider.complete(request, signal);
    expect(create.mock.calls[0]![0]).toMatchObject({ reasoning_effort: 'low' });
  });

  test('도구 호출의 인자를 풀고, 깨진 인자는 문자열 그대로 넘긴다', async () => {
    const { provider } = providerReturning(
      completion(
        {
          content: null,
          tool_calls: [
            { id: 'a', type: 'function', function: { name: 'get_training_plan', arguments: '{"week":"this"}' } },
            { id: 'b', type: 'function', function: { name: 'get_training_plan', arguments: '{broken' } },
          ],
        },
        'tool_calls',
      ),
    );
    const response = await provider.complete(request, signal);
    expect(response.stopReason).toBe('tool_calls');
    expect(response.toolCalls).toEqual([
      { id: 'a', name: 'get_training_plan', input: { week: 'this' } },
      { id: 'b', name: 'get_training_plan', input: '{broken' },
    ]);
  });

  test('도구 호출과 결과를 Chat Completions 형식으로 바꾼다', () => {
    expect(
      toOpenAiMessages([
        { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'x', input: { n: 1 } }] },
        { role: 'tool', toolCallId: 'a', content: '{"ok":true}' },
        { role: 'assistant', content: '끝', toolCalls: [] },
      ]),
    ).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'x', arguments: '{"n":1}' } }] },
      { role: 'tool', tool_call_id: 'a', content: '{"ok":true}' },
      { role: 'assistant', content: '끝' },
    ]);
  });

  test.each([
    [{ content: '' }, 'length', 'max_tokens'],
    [{ content: '' }, 'content_filter', 'refusal'],
    [{ content: null, refusal: '도와드릴 수 없어요' }, 'stop', 'refusal'],
  ])('%o, %s로 끝나면 %s로 알린다', async (message, finish, expected) => {
    const { provider } = providerReturning(completion(message, finish));
    expect((await provider.complete(request, signal)).stopReason).toBe(expected);
  });

  test('과부하·연결 오류는 다시 시도할 수 있는 오류로, 요청 오류와 중단은 그렇지 않은 오류로 바꾼다', async () => {
    const headers = new Headers();
    const cases: [unknown, string, boolean][] = [
      [new OpenAI.RateLimitError(429, {}, 'rate', headers), 'PROVIDER_ERROR', true],
      [new OpenAI.InternalServerError(503, {}, 'down', headers), 'PROVIDER_ERROR', true],
      [new OpenAI.APIConnectionError({ message: 'reset' }), 'PROVIDER_ERROR', true],
      [new OpenAI.BadRequestError(400, {}, 'bad', headers), 'PROVIDER_ERROR', false],
      [new OpenAI.APIUserAbortError(), 'TIMEOUT', false],
    ];
    for (const [thrown, code, transient] of cases) {
      const { provider } = providerReturning(() => {
        throw thrown;
      });
      const error = await provider.complete(request, signal).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({ code, transient });
    }
  });
});
