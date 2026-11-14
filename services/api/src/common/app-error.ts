import type { ApiError, ErrorCode } from '@pacemate/shared';

/** 클라이언트에 그대로 전달되는 오류. `message`는 사용자에게 보여 줄 한국어 문장이다(API_SPEC §1.1). */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: Pick<ApiError, 'fields' | 'usage'> = {},
  ) {
    super(message);
  }

  toBody(): ApiError {
    return { code: this.code, message: this.message, ...this.extra };
  }
}
