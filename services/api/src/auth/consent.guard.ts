import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../common/public.decorator.js';
import { AccountService, consentRequired } from './account.service.js';
import type { AuthedRequest } from './authed-request.js';

const ALLOW_UNREGISTERED = 'allowUnregistered';

/** 필수 동의 전의 계정도 호출할 수 있는 경로에 붙인다. `/v1/me`뿐이다(API_SPEC §3.1). */
export const AllowUnregistered = () => SetMetadata(ALLOW_UNREGISTERED, true);

/** 필수 동의를 마치지 않은 계정의 요청을 거절한다(F01-R02, AC-F01-02). */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly account: AccountService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if ([IS_PUBLIC, ALLOW_UNREGISTERED].some((key) => this.reflector.getAllAndOverride<boolean>(key, targets))) {
      return true;
    }
    const { userId } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!userId || !(await this.account.isRegistered(userId))) throw consentRequired();
    return true;
  }
}
