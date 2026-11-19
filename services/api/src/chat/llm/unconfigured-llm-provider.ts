import { LlmError, type LlmProvider } from './llm-provider.js';

/** 공급자를 정하기 전(D-03, T-407)의 자리. 모든 호출이 실패하고, 채팅은 AI_UNAVAILABLE로 답한다 */
export class UnconfiguredLlmProvider implements LlmProvider {
  readonly model = 'unconfigured';

  complete(): Promise<never> {
    return Promise.reject(new LlmError('PROVIDER_ERROR'));
  }
}
