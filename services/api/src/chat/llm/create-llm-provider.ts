import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { AppConfig } from '../../config.js';
import { DEFAULT_CLAUDE_EFFORT, LLM_CALL_TIMEOUT_MS } from '../chat.config.js';
import { AnthropicLlmProvider } from './anthropic-llm-provider.js';
import type { LlmProvider } from './llm-provider.js';
import { OpenAiLlmProvider } from './openai-llm-provider.js';
import { priceOf } from './pricing.js';
import { UnconfiguredLlmProvider } from './unconfigured-llm-provider.js';

type LlmConfig = Pick<
  AppConfig,
  'LLM_PROVIDER' | 'LLM_MODEL' | 'LLM_EFFORT' | 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' | 'LLM_INPUT_USD_PER_MTOK' | 'LLM_OUTPUT_USD_PER_MTOK' | 'LLM_CACHED_INPUT_USD_PER_MTOK'
>;

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const isClaudeEffort = (value: string): value is (typeof CLAUDE_EFFORTS)[number] => (CLAUDE_EFFORTS as readonly string[]).includes(value);

/**
 * 환경 변수로 공급자를 고른다(D-03은 T-407의 비교로 정한다). 공급자를 정하지 않았으면 모든 호출이 실패하는 구현을 쓴다.
 * 공급자를 정했는데 모델·키·단가가 빠졌으면 서버를 띄우지 않는다. 설정 실수를 채팅 실패로 늦게 알게 되지 않게 한다.
 */
export function createLlmProvider(config: LlmConfig): LlmProvider {
  if (!config.LLM_PROVIDER) return new UnconfiguredLlmProvider();
  const model = config.LLM_MODEL;
  if (!model) throw new Error('LLM_MODEL이 없다');
  // 재시도는 게이트웨이가 한 번만 한다. SDK가 따로 재시도하면 메시지 1건의 제한 시간을 넘긴다
  const clientOptions = { maxRetries: 0, timeout: LLM_CALL_TIMEOUT_MS };

  if (config.LLM_PROVIDER === 'anthropic') {
    if (!config.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없다');
    const effort = config.LLM_EFFORT ?? DEFAULT_CLAUDE_EFFORT;
    if (!isClaudeEffort(effort)) throw new Error(`LLM_EFFORT는 ${CLAUDE_EFFORTS.join(', ')} 중 하나다`);
    const lookup = (m: string) => priceOf(m, config);
    if (!lookup(model)) throw new Error(`${model}의 단가를 모른다. LLM_INPUT_USD_PER_MTOK, LLM_OUTPUT_USD_PER_MTOK를 넣는다`);
    return new AnthropicLlmProvider({ client: new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, ...clientOptions }), model, effort, priceOf: lookup });
  }

  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY가 없다');
  const price = priceOf(model, config);
  if (!price) throw new Error(`${model}의 단가를 모른다. LLM_INPUT_USD_PER_MTOK, LLM_OUTPUT_USD_PER_MTOK를 넣는다`);
  return new OpenAiLlmProvider({
    client: new OpenAI({ apiKey: config.OPENAI_API_KEY, ...clientOptions }),
    model,
    price,
    ...(config.LLM_EFFORT && { reasoningEffort: config.LLM_EFFORT as OpenAI.ReasoningEffort }),
  });
}
