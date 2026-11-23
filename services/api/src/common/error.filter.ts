import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { type ApiError, ERROR_STATUS } from '@pacemate/shared';
import { captureException } from '@sentry/node';
import type { Response } from 'express';
import { AppError } from './app-error.js';

/** 모든 오류를 `{ code, message }` 형식으로 바꾼다. 내부 오류의 내용은 응답에 넣지 않는다. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const body = toApiError(error);
    if (body.code === 'INTERNAL_ERROR') {
      captureException(error);
      this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    host.switchToHttp().getResponse<Response>().status(ERROR_STATUS[body.code]).json(body);
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof AppError) return error.toBody();

  // 프레임워크가 던지는 오류(없는 경로, 깨진 JSON 본문 등)
  const status = error instanceof HttpException ? error.getStatus() : 500;
  if (status === 404) return { code: 'NOT_FOUND', message: '요청한 내용을 찾을 수 없어요.' };
  if (status === 401) return { code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' };
  if (status === 429) return { code: 'RATE_LIMITED', message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' };
  if (status >= 400 && status < 500) return { code: 'VALIDATION_ERROR', message: '요청 내용을 확인해 주세요.' };
  return { code: 'INTERNAL_ERROR', message: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.' };
}
