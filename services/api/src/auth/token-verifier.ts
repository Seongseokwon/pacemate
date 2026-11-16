import { Inject, Injectable } from '@nestjs/common';
import { type AuthProvider, authProviderSchema } from '@pacemate/shared';
import { type JWTVerifyGetKey, jwtVerify } from 'jose';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config.js';

/** 인증 서비스의 공개 키 묶음. 테스트에서는 로컬 키로 바꾼다. */
export const JWKS = Symbol('JWKS');

// 로그인 수단은 인증 서비스(Supabase)가 토큰에 넣는 값이다. Apple·Google이 아니면 받지 않는다(F01-R01)
const claimsSchema = z.object({ sub: z.uuid(), app_metadata: z.object({ provider: authProviderSchema }) });

export interface VerifiedToken {
  userId: string;
  authProvider: AuthProvider;
}

@Injectable()
export class TokenVerifier {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(JWKS) private readonly keys: JWTVerifyGetKey,
  ) {}

  /** 서명·발급자·대상·만료를 검증하고 사용자 ID와 로그인 수단을 돌려준다. 하나라도 틀리면 예외를 던진다. */
  async verify(token: string): Promise<VerifiedToken> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.config.AUTH_ISSUER,
      audience: this.config.AUTH_AUDIENCE,
      algorithms: ['ES256', 'RS256'],
    });
    const claims = claimsSchema.parse(payload);
    return { userId: claims.sub, authProvider: claims.app_metadata.provider };
  }
}
