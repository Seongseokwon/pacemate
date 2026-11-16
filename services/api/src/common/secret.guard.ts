import { createHash, timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable, type Type } from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AppError } from './app-error.js';

type SecretKey = 'SUBSCRIPTION_WEBHOOK_SECRET' | 'INTERNAL_JOB_SECRET';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * 사용자 토큰 대신 비밀값으로 호출자를 확인하는 가드(ARCHITECTURE §5.3, API_SPEC §4).
 * `@Public()`과 함께 붙인다: `@Public() @UseGuards(secretGuard('INTERNAL_JOB_SECRET'))`.
 * 호출자는 `Authorization: Bearer <비밀값>`을 보낸다. 비밀값이 설정되지 않은 서버는 모든 요청을 거절한다.
 */
export function secretGuard(key: SecretKey): Type<CanActivate> {
  @Injectable()
  class SecretGuard implements CanActivate {
    constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

    canActivate(context: ExecutionContext): boolean {
      const secret = this.config[key];
      const [scheme, given] = context.switchToHttp().getRequest<Request>().header('authorization')?.split(' ') ?? [];
      // 길이가 달라도 비교 시간이 같도록 해시끼리 비교한다
      if (!secret || scheme !== 'Bearer' || !given || !timingSafeEqual(digest(given), digest(secret))) {
        throw new AppError('UNAUTHENTICATED', '로그인이 필요해요.');
      }
      return true;
    }
  }
  return SecretGuard;
}
