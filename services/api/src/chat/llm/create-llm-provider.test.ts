import { describe, expect, test } from 'vitest';
import { AnthropicLlmProvider } from './anthropic-llm-provider.js';
import { createLlmProvider } from './create-llm-provider.js';
import { OpenAiLlmProvider } from './openai-llm-provider.js';
import { priceOf } from './pricing.js';
import { UnconfiguredLlmProvider } from './unconfigured-llm-provider.js';

describe('LLM 공급자 고르기 (T-407, D-03)', () => {
  test('공급자를 정하지 않으면 모든 호출이 실패하는 구현을 쓴다', () => {
    expect(createLlmProvider({})).toBeInstanceOf(UnconfiguredLlmProvider);
  });

  test('공급자와 모델, 키가 있으면 그 구현을 쓴다', () => {
    const claude = createLlmProvider({ LLM_PROVIDER: 'anthropic', LLM_MODEL: 'claude-opus-5-5', ANTHROPIC_API_KEY: 'key' });
    expect(claude).toBeInstanceOf(AnthropicLlmProvider);
    expect(claude.model).toBe('claude-opus-5-5');

    const gpt = createLlmProvider({ LLM_PROVIDER: 'openai', LLM_MODEL: 'gpt-test', OPENAI_API_KEY: 'key', LLM_INPUT_USD_PER_MTOK: 1, LLM_OUTPUT_USD_PER_MTOK: 4 });
    expect(gpt).toBeInstanceOf(OpenAiLlmProvider);
  });

  test.each([
    ['모델이 없으면', { LLM_PROVIDER: 'anthropic' as const, ANTHROPIC_API_KEY: 'key' }],
    ['키가 없으면', { LLM_PROVIDER: 'anthropic' as const, LLM_MODEL: 'claude-opus-5-5' }],
    ['effort 값이 틀리면', { LLM_PROVIDER: 'anthropic' as const, LLM_MODEL: 'claude-opus-5-5', ANTHROPIC_API_KEY: 'key', LLM_EFFORT: 'fast' }],
    ['단가를 모르는 모델이면', { LLM_PROVIDER: 'openai' as const, LLM_MODEL: 'gpt-test', OPENAI_API_KEY: 'key' }],
  ])('%s 서버를 띄우지 않는다', (_, config) => {
    expect(() => createLlmProvider(config)).toThrow();
  });

  test('단가는 환경 변수가 표보다 우선하고, 캐시 단가가 없으면 입력 단가를 쓴다', () => {
    expect(priceOf('claude-opus-5-5', {})).toMatchObject({ input: 4, output: 20, cachedInput: 0.2, cacheWrite: 5 });
    expect(priceOf('gpt-test', { LLM_INPUT_USD_PER_MTOK: 1, LLM_OUTPUT_USD_PER_MTOK: 4 })).toEqual({ input: 1, output: 4, cachedInput: 1, cacheWrite: 1 });
    expect(priceOf('gpt-test', {})).toBeNull();
  });
});
