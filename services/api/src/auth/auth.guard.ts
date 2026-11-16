import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error.js';
import { IS_PUBLIC } from '../common/public.decorator.js';
import type { AuthedRequest } from './authed-request.js';
import { TokenVerifier } from './token-verifier.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw unauthenticated();

    try {
      Object.assign(request, await this.verifier.verify(token));
    } catch {
      // 실패 이유(만료, 서명 불일치 등)는 응답에 구분해 넣지 않는다
      throw unauthenticated();
    }
    return true;
  }
}

const unauthenticated = () => new AppError('UNAUTHENTICATED', '로그인이 필요해요.');
