import type { AuthProvider } from '@pacemate/shared';
import type { Request } from 'express';

/** 인증 가드를 지난 요청. `userId`는 검증된 토큰에서 얻은 값이며, 요청에 담긴 다른 사용자 ID는 쓰지 않는다(DI-07). */
export type AuthedRequest = Request & { userId?: string; authProvider?: AuthProvider };
