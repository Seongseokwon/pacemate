import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { type AuthProvider, type CreateMeRequest, createMeRequestSchema, type MeResponse } from '@pacemate/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { AccountService } from './account.service.js';
import { AllowUnregistered } from './consent.guard.js';
import { CurrentAuthProvider, CurrentUserId } from './current-user.decorator.js';

/** 계정(API_SPEC §3.1). 로그인·로그아웃·토큰 갱신은 인증 서비스의 앱 SDK가 한다. */
@Controller('me')
@AllowUnregistered()
export class MeController {
  constructor(private readonly account: AccountService) {}

  @Get()
  get(@CurrentUserId() userId: string, @CurrentAuthProvider() authProvider: AuthProvider): Promise<MeResponse> {
    return this.account.getMe(userId, authProvider);
  }

  @Post()
  @HttpCode(200)
  create(
    @CurrentUserId() userId: string,
    @CurrentAuthProvider() authProvider: AuthProvider,
    @Body(new ZodPipe(createMeRequestSchema)) body: CreateMeRequest,
  ): Promise<MeResponse> {
    return this.account.register(userId, authProvider, body);
  }

  // 삭제가 끝나지 않은 계정이 다시 호출할 수 있어야 한다. 가입한 적 없는 계정은 서비스가 거절한다
  @Delete()
  @HttpCode(204)
  delete(@CurrentUserId() userId: string): Promise<void> {
    return this.account.delete(userId);
  }
}
