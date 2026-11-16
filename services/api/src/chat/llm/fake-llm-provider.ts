import type { LlmProvider, LlmRequest, LlmResponse } from './llm-provider.js';

/** 대본의 한 줄. 응답의 일부만 적거나, 오류·지연을 흉내 낼 함수를 준다. */
export type FakeLlmStep =
  | Partial<LlmResponse>
  | ((request: LlmRequest, signal: AbortSignal) => LlmResponse | Promise<LlmResponse>);

/** 대본대로 답하는 가짜 공급자. 실제 LLM 없이 도구 흐름을 검증한다(ARCHITECTURE §7.2). */
export class FakeLlmProvider implements LlmProvider {
  readonly model = 'fake';
  /** 받은 요청. 대화와 도구 결과가 그대로 전달됐는지 테스트가 확인한다 */
  readonly requests: LlmRequest[] = [];

  constructor(private readonly script: FakeLlmStep[]) {}

  async complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    this.requests.push(structuredClone(request));
    const step = this.script[this.requests.length - 1];
    if (!step) throw new Error(`대본에 없는 ${this.requests.length}번째 호출`);
    return typeof step === 'function' ? step(request, signal) : fakeLlmResponse(step);
  }
}

export function fakeLlmResponse(partial: Partial<LlmResponse> = {}): LlmResponse {
  const toolCalls = partial.toolCalls ?? [];
  return {
    text: '',
    toolCalls,
    stopReason: toolCalls.length > 0 ? 'tool_calls' : 'end',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    ...partial,
  };
}
