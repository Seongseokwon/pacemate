import OpenAI from 'openai';
import { LLM_REASONING_HEADROOM_TOKENS } from '../chat.config.js';
import { LlmError, type LlmMessage, type LlmProvider, type LlmRequest, type LlmResponse, type LlmStopReason, type LlmToolCall } from './llm-provider.js';
import { costOf, type ModelPrice } from './pricing.js';

export interface OpenAiProviderOptions {
  client: OpenAI;
  model: string;
  price: ModelPrice;
  /** 추론 모델에만 보낸다. 없으면 모델의 기본값을 쓴다 */
  reasoningEffort?: OpenAI.ReasoningEffort;
}

/** GPT(Chat Completions API) 구현. 공급자 SDK의 타입은 이 파일 밖으로 내보내지 않는다(ARCHITECTURE §7.2). */
export class OpenAiLlmProvider implements LlmProvider {
  readonly model: string;

  constructor(private readonly options: OpenAiProviderOptions) {
    this.model = options.model;
  }

  async complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    let completion: OpenAI.ChatCompletion;
    try {
      completion = await this.options.client.chat.completions.create(
        {
          model: this.model,
          max_completion_tokens: request.maxOutputTokens + LLM_REASONING_HEADROOM_TOKENS,
          messages: [{ role: 'system', content: request.system }, ...toOpenAiMessages(request.messages)],
          tools: request.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
          ...(this.options.reasoningEffort && { reasoning_effort: this.options.reasoningEffort }),
        },
        { signal },
      );
    } catch (error) {
      throw toLlmError(error);
    }

    const choice = completion.choices[0];
    if (!choice) throw new LlmError('PROVIDER_ERROR');
    const toolCalls: LlmToolCall[] = (choice.message.tool_calls ?? []).flatMap((c) =>
      c.type === 'function' ? [{ id: c.id, name: c.function.name, input: parseArguments(c.function.arguments) }] : [],
    );
    const usage = completion.usage;
    const input = usage?.prompt_tokens ?? 0;
    const cachedInput = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const output = usage?.completion_tokens ?? 0;
    return {
      text: choice.message.content ?? '',
      toolCalls,
      stopReason: choice.message.refusal ? 'refusal' : stopReasonOf(choice.finish_reason, toolCalls.length),
      inputTokens: input,
      outputTokens: output,
      cachedInputTokens: cachedInput,
      costUsd: costOf(this.options.price, { uncachedInput: input - cachedInput, cachedInput, cacheWrite: 0, output }),
    };
  }
}

// 형식이 깨진 인자는 문자열 그대로 넘긴다. 도구 레지스트리가 스키마 검증에서 거절한다(ARCHITECTURE §7.3)
function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function stopReasonOf(reason: OpenAI.ChatCompletion.Choice['finish_reason'], toolCallCount: number): LlmStopReason {
  switch (reason) {
    case 'tool_calls':
      return toolCallCount > 0 ? 'tool_calls' : 'end';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    default:
      return 'end';
  }
}

/** 공급자 중립 대화를 Chat Completions 형식으로 바꾼다 */
export function toOpenAiMessages(messages: LlmMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((m): OpenAI.ChatCompletionMessageParam => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    return {
      role: 'assistant',
      content: m.content || null,
      ...(m.toolCalls.length > 0 && {
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })),
      }),
    };
  });
}

// 오류 메시지에는 공급자 응답 본문이 들어 있을 수 있어 코드만 남긴다(F11-R04)
function toLlmError(error: unknown): LlmError {
  if (error instanceof OpenAI.APIUserAbortError || error instanceof OpenAI.APIConnectionTimeoutError) return new LlmError('TIMEOUT');
  if (error instanceof OpenAI.RateLimitError || error instanceof OpenAI.InternalServerError || error instanceof OpenAI.APIConnectionError) {
    return new LlmError('PROVIDER_ERROR', true);
  }
  return new LlmError('PROVIDER_ERROR');
}
