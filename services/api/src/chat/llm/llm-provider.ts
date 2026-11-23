// 공급자에 묶이지 않는 LLM 호출 형식(ARCHITECTURE §7.2). 공급자 SDK의 타입은 공급자 구현 밖으로 내보내지 않는다.

export interface LlmToolCall {
  id: string;
  name: string;
  /** 검증 전의 값이다. 도구 레지스트리가 스키마로 검증한다(§7.3) */
  input: unknown;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls: LlmToolCall[]; providerData?: unknown }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmToolDefinition {
  name: string;
  description: string;
  /** JSON Schema. 도구 레지스트리가 zod 스키마에서 만든다(§7.3) */
  inputSchema: Record<string, unknown>;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  maxOutputTokens: number;
}

export type LlmStopReason = 'end' | 'tool_calls' | 'max_tokens' | 'refusal';

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: LlmStopReason;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  /** 비용 추정치. 단가를 아는 공급자 구현이 계산한다 */
  costUsd: number;
  /**
   * 같은 공급자가 다음 호출에서 그대로 돌려받아야 하는 응답 원본(예: 도구 호출과 함께 온 추론 블록).
   * 도구를 부른 뒤 이어서 호출할 때 assistant 메시지에 그대로 넣는다. 저장하지 않는다
   */
  providerData?: unknown;
}

export type LlmErrorCode = 'TIMEOUT' | 'MAX_TOKENS' | 'REFUSAL' | 'PROVIDER_ERROR';

/** LLM 호출 실패. 메시지에 공급자의 응답이나 대화 내용을 넣지 않는다(F11-R04). */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    /** 다시 시도하면 될 수 있는 오류(과부하, 연결 끊김 등) */
    readonly transient = false,
  ) {
    super(code);
  }
}

/** 공급자 하나의 구현. 실패는 LlmError로 던진다. */
export interface LlmProvider {
  readonly model: string;
  complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
