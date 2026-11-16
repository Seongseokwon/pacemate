import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import type { AiCallPurpose } from '../../generated/prisma/client.js';
import { LLM_CALL_TIMEOUT_MS, LLM_RETRY_COUNT } from '../chat.config.js';
import { LLM_PROVIDER, LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './llm-provider.js';

export interface LlmCallMeta {
  userId: string;
  purpose: AiCallPurpose;
  /** 시스템 지침 버전. 호출 기록을 평가 결과와 잇는다(ARCHITECTURE §7.4) */
  promptVersion: string;
}

/** LLM을 호출하는 유일한 곳(ARCHITECTURE §7.2). 공급자를 바꿔도 이 클래스를 쓰는 코드는 그대로다. */
@Injectable()
export class LlmGateway {
  private readonly logger = new Logger(LlmGateway.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    private readonly prisma: PrismaService,
  ) {}

  /** 정상 종료한 응답만 돌려준다. 그 밖에는 LlmError를 던진다(F04-R10). 시도마다 호출 기록을 남긴다(F11-R02). */
  async complete(request: LlmRequest, meta: LlmCallMeta): Promise<LlmResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.attempt(request, meta);
      } catch (error) {
        if (!(error instanceof LlmError && error.transient) || attempt >= LLM_RETRY_COUNT) throw error;
      }
    }
  }

  private async attempt(request: LlmRequest, meta: LlmCallMeta): Promise<LlmResponse> {
    const startedAt = Date.now();
    let response: LlmResponse | undefined;
    let failure: LlmError | undefined;
    try {
      response = await this.callWithTimeout(request);
      if (response.stopReason === 'max_tokens') failure = new LlmError('MAX_TOKENS');
      if (response.stopReason === 'refusal') failure = new LlmError('REFUSAL');
    } catch (error) {
      failure = error instanceof LlmError ? error : new LlmError('PROVIDER_ERROR');
    }
    await this.record(meta, response, failure, Date.now() - startedAt);
    if (failure || !response) throw failure ?? new LlmError('PROVIDER_ERROR');
    return response;
  }

  // 제한 시간 초과는 다시 시도하지 않는다. 두 번 기다리면 메시지 1건의 제한 시간(60초)을 다 쓴다
  private async callWithTimeout(request: LlmRequest): Promise<LlmResponse> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LlmError('TIMEOUT'));
      }, LLM_CALL_TIMEOUT_MS);
    });
    try {
      return await Promise.race([this.provider.complete(request, controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async record(
    meta: LlmCallMeta,
    response: LlmResponse | undefined,
    failure: LlmError | undefined,
    latencyMs: number,
  ): Promise<void> {
    try {
      await this.prisma.aiCallLog.create({
        data: {
          userId: meta.userId,
          purpose: meta.purpose,
          model: this.provider.model,
          promptVersion: meta.promptVersion,
          inputTokens: response?.inputTokens ?? 0,
          outputTokens: response?.outputTokens ?? 0,
          cachedInputTokens: response?.cachedInputTokens,
          costUsd: response?.costUsd ?? 0,
          toolCallCount: response?.toolCalls.length ?? 0,
          success: !failure,
          errorCode: failure?.code,
          latencyMs,
        },
      });
    } catch (error) {
      // 기록을 못 남겼다고 사용자의 응답까지 실패시키지 않는다
      this.logger.error('AI 호출 기록 저장 실패', error instanceof Error ? error.stack : undefined);
    }
  }
}
