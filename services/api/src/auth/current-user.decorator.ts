import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './authed-request.js';

/** 인증된 사용자 ID. `@Public()` 경로에서는 쓸 수 없다. */
export const CurrentUserId = createParamDecorator((_: unknown, context: ExecutionContext): string => {
  const { userId } = context.switchToHttp().getRequest<AuthedRequest>();
  if (!userId) throw new Error('인증되지 않은 경로에서 CurrentUserId를 사용했다');
  return userId;
});
