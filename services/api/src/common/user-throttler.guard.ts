import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthedRequest } from '../auth/authed-request.js';
import { AppError } from './app-error.js';

/**
 * 사용자별 요청 제한. 인증 뒤에 실행되어 사용자 ID로 세고, 공개 경로는 IP로 센다.
 * shortcut: 횟수를 프로세스 메모리에 둔다, 인스턴스를 3개 이상으로 늘릴 때 공유 저장소로 바꾼다(ARCHITECTURE §18)
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: AuthedRequest): Promise<string> {
    return req.userId ?? req.ip ?? 'unknown';
  }

  protected override async throwThrottlingException(): Promise<void> {
    throw new AppError('RATE_LIMITED', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
  }
}
