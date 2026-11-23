import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, test, vi } from 'vitest';
import { AnthropicLlmProvider, toAnthropicMessages } from './anthropic-llm-provider.js';
import { LlmError, type LlmRequest } from './llm-provider.js';
import { KNOWN_PRICES } from './pricing.js';

const request: LlmRequest = {
  system: '시스템 지침',
  messages: [{ role: 'user', content: '오늘 쉬고 싶어요' }],
  tools: [{ name: 'get_training_plan', description: '계획 조회', inputSchema: { type: 'object', properties: {} } }],
  maxOutputTokens: 1000,
};

const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 };

function providerReturning(result: unknown | (() => unknown)) {
  const create = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => (typeof result === 'function' ? (result as () => unknown)() : result));
  const client = { beta: { messages: { create } } } as unknown as Anthropic;
  const provider = new AnthropicLlmProvider({ client, model: 'claude-opus-5-5', effort: 'low', priceOf: (m) => KNOWN_PRICES[m] ?? null });
  return { provider, create };
}

const signal = new AbortController().signal;

describe('Claude 공급자 (T-407, ARCHITECTURE §7.2)', () => {
  test('시스템 지침을 캐시하고 effort와 거절 시 대체 모델을 요청한다', async () => {
    const { provider, create } = providerReturning({ model: 'claude-opus-5-5', content: [{ type: 'text', text: '쉬어도 좋아요.' }], stop_reason: 'end_turn', usage });

    const response = await provider.complete(request, signal);

    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 5000,
      system: [{ type: 'text', text: '시스템 지침', cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low' },
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
      tools: [{ name: 'get_training_plan', description: '계획 조회', input_schema: { type: 'object', properties: {} } }],
    });
    expect(response).toMatchObject({ text: '쉬어도 좋아요.', toolCalls: [], stopReason: 'end', inputTokens: 1100, outputTokens: 50, cachedInputTokens: 1000 });
    // 100 × $4 + 1000 × $0.2 + 50 × $20 (100만 토큰당)
    expect(response.costUsd).toBeCloseTo((100 * 4 + 1000 * 0.2 + 50 * 20) / 1_000_000, 10);
  });

  test('도구 호출을 돌려주고, 다음 호출에서 추론 블록을 포함한 응답 원본을 그대로 돌려보낸다', async () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'tool_use', id: 'call-1', name: 'get_training_plan', input: { week: 'this' } },
    ];
    const { provider } = providerReturning({ model: 'claude-opus-5-5', content, stop_reason: 'tool_use', usage });

    const response = await provider.complete(request, signal);
    expect(response.stopReason).toBe('tool_calls');
    expect(response.toolCalls).toEqual([{ id: 'call-1', name: 'get_training_plan', input: { week: 'this' } }]);

    const next = toAnthropicMessages([
      ...request.messages,
      { role: 'assistant', content: response.text, toolCalls: response.toolCalls, providerData: response.providerData },
      { role: 'tool', toolCallId: 'call-1', content: '{"ok":true}' },
    ]);
    expect(next[1]).toEqual({ role: 'assistant', content });
    expect(next[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: '{"ok":true}' }] });
  });

  test('연달아 온 도구 결과는 한 메시지에 모으고, 다른 공급자의 응답 원본은 쓰지 않는다', () => {
    const messages = toAnthropicMessages([
      { role: 'user', content: '질문' },
      {
        role: 'assistant',
        content: '확인할게요',
        toolCalls: [
          { id: 'a', name: 'x', input: {} },
          { id: 'b', name: 'y', input: {} },
        ],
        providerData: { provider: 'openai', content: [] },
      },
      { role: 'tool', toolCallId: 'a', content: '1' },
      { role: 'tool', toolCallId: 'b', content: '2' },
    ]);
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: '확인할게요' },
        { type: 'tool_use', id: 'a', name: 'x', input: {} },
        { type: 'tool_use', id: 'b', name: 'y', input: {} },
      ],
    });
    expect(messages).toHaveLength(3);
    expect(messages[2]!.content).toHaveLength(2);
  });

  test.each([
    ['max_tokens', 'max_tokens'],
    ['refusal', 'refusal'],
  ])('%s로 끝나면 %s로 알린다', async (stop, expected) => {
    const { provider } = providerReturning({ model: 'claude-opus-5-5', content: [], stop_reason: stop, usage });
    expect((await provider.complete(request, signal)).stopReason).toBe(expected);
  });

  test('대체 모델이 답하면 그 모델의 단가로 계산한다', async () => {
    const { provider } = providerReturning({ model: 'claude-opus-4-8', content: [{ type: 'text', text: '답' }], stop_reason: 'end_turn', usage: { ...usage, cache_read_input_tokens: 0 } });
    expect((await provider.complete(request, signal)).costUsd).toBeCloseTo((100 * 5 + 50 * 25) / 1_000_000, 10);
  });

  test('과부하·연결 오류는 다시 시도할 수 있는 오류로, 요청 오류는 그렇지 않은 오류로, 중단은 제한 시간으로 바꾼다', async () => {
    const headers = new Headers();
    const cases: [unknown, string, boolean][] = [
      [new Anthropic.RateLimitError(429, {}, 'rate', headers), 'PROVIDER_ERROR', true],
      [new Anthropic.InternalServerError(529, {}, 'overloaded', headers), 'PROVIDER_ERROR', true],
      [new Anthropic.APIConnectionError({ message: 'reset' }), 'PROVIDER_ERROR', true],
      [new Anthropic.BadRequestError(400, {}, 'bad', headers), 'PROVIDER_ERROR', false],
      [new Anthropic.APIUserAbortError(), 'TIMEOUT', false],
    ];
    for (const [thrown, code, transient] of cases) {
      const { provider } = providerReturning(() => {
        throw thrown;
      });
      const error = await provider.complete(request, signal).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({ code, transient, message: code });
    }
  });
});
