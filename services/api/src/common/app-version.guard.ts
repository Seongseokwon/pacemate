import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AppError } from './app-error.js';
import { IS_PUBLIC } from './public.decorator.js';

/** `a < b`이면 음수. `1.2.3` 형식만 받는다. */
export function compareVersions(a: string, b: string): number {
  const [pa, pb] = [a, b].map((v) => v.split('.').map(Number)) as [number[], number[]];
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 지원하지 않는 앱 버전에 업데이트 안내를 돌려준다(F11-R06). 인증보다 먼저 실행한다. */
@Injectable()
export class AppVersionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

    const version = context.switchToHttp().getRequest<Request>().header('x-app-version');
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new AppError('VALIDATION_ERROR', '요청 내용을 확인해 주세요.', {
        fields: { 'X-App-Version': '앱 버전 헤더가 필요해요.' },
      });
    }
    if (compareVersions(version, this.config.MIN_APP_VERSION) < 0) {
      throw new AppError('APP_UPDATE_REQUIRED', '새 버전으로 업데이트해 주세요.');
    }
    return true;
  }
}
