import Anthropic from '@anthropic-ai/sdk';
import { LLM_REASONING_HEADROOM_TOKENS } from '../chat.config.js';
import { LlmError, type LlmMessage, type LlmProvider, type LlmRequest, type LlmResponse, type LlmStopReason } from './llm-provider.js';
import { costOf, type ModelPrice } from './pricing.js';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
type Block = Anthropic.Beta.BetaContentBlockParam;

// 응답 원본에 공급자 표시를 달아, 다른 공급자의 응답을 잘못 돌려보내지 않게 한다
const TAG = 'anthropic';
interface AnthropicData {
  provider: typeof TAG;
  content: Anthropic.Beta.BetaContentBlock[];
}
const isOwnData = (data: unknown): data is AnthropicData =>
  typeof data === 'object' && data !== null && (data as { provider?: unknown }).provider === TAG && Array.isArray((data as { content?: unknown }).content);

export interface AnthropicProviderOptions {
  client: Anthropic;
  model: string;
  effort: Effort;
  /** 응답한 모델(거절 시 대체 모델 포함)의 단가. 모르면 요청한 모델의 단가를 쓴다 */
  priceOf: (model: string) => ModelPrice | null;
}

/** Claude(Messages API) 구현. 공급자 SDK의 타입은 이 파일 밖으로 내보내지 않는다(ARCHITECTURE §7.2). */
export class AnthropicLlmProvider implements LlmProvider {
  readonly model: string;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.model = options.model;
  }

  async complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await this.options.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: request.maxOutputTokens + LLM_REASONING_HEADROOM_TOKENS,
          // 도구 정의와 시스템 지침은 매번 같아 캐시한다(도구가 시스템 지침보다 앞에 놓인다)
          system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
          messages: toAnthropicMessages(request.messages),
          tools: request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema })),
          output_config: { effort: this.options.effort },
          // 정책상 거절하면 서버가 정한 대체 모델로 같은 요청을 다시 돌린다. 지원하지 않는 모델은 그대로 거절로 끝난다
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal },
      );
    } catch (error) {
      throw toLlmError(error);
    }

    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const toolCalls = message.content.flatMap((b) => (b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : []));
    const usage = message.usage;
    const cachedInput = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const price = this.options.priceOf(message.model) ?? this.options.priceOf(this.model);
    return {
      text,
      toolCalls,
      stopReason: stopReasonOf(message.stop_reason, toolCalls.length),
      inputTokens: usage.input_tokens + cachedInput + cacheWrite,
      outputTokens: usage.output_tokens,
      cachedInputTokens: cachedInput,
      costUsd: price ? costOf(price, { uncachedInput: usage.input_tokens, cachedInput, cacheWrite, output: usage.output_tokens }) : 0,
      providerData: { provider: TAG, content: message.content } satisfies AnthropicData,
    };
  }
}

function stopReasonOf(reason: Anthropic.Beta.BetaStopReason | null, toolCallCount: number): LlmStopReason {
  switch (reason) {
    case 'tool_use':
      return toolCallCount > 0 ? 'tool_calls' : 'end';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'end';
  }
}

/** 공급자 중립 대화를 Messages API 형식으로 바꾼다. 연달아 온 도구 결과는 한 user 메시지에 모은다 */
export function toAnthropicMessages(messages: LlmMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      // 도구 호출과 함께 온 추론 블록은 바꾸지 않고 돌려보내야 한다
      const content: Block[] = isOwnData(m.providerData)
        ? (m.providerData.content as Block[])
        : [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.toolCalls.map((c) => ({ type: 'tool_use' as const, id: c.id, name: c.name, input: c.input as Record<string, unknown> })),
          ];
      out.push({ role: 'assistant', content });
    } else {
      const result: Block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const last = out.at(-1);
      if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) last.content.push(result);
      else out.push({ role: 'user', content: [result] });
    }
  }
  return out;
}

// 오류 메시지에는 공급자 응답 본문이 들어 있을 수 있어 코드만 남긴다(F11-R04)
function toLlmError(error: unknown): LlmError {
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) return new LlmError('TIMEOUT');
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
    return new LlmError('PROVIDER_ERROR', true);
  }
  return new LlmError('PROVIDER_ERROR');
}
