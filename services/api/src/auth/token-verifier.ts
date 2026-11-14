import { Inject, Injectable } from '@nestjs/common';
import { type JWTVerifyGetKey, jwtVerify } from 'jose';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config.js';

/** 인증 서비스의 공개 키 묶음. 테스트에서는 로컬 키로 바꾼다. */
export const JWKS = Symbol('JWKS');

const userIdSchema = z.uuid();

@Injectable()
export class TokenVerifier {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(JWKS) private readonly keys: JWTVerifyGetKey,
  ) {}

  /** 서명·발급자·대상·만료를 검증하고 사용자 ID를 돌려준다. 하나라도 틀리면 예외를 던진다. */
  async verify(token: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.config.AUTH_ISSUER,
      audience: this.config.AUTH_AUDIENCE,
      algorithms: ['ES256', 'RS256'],
    });
    return userIdSchema.parse(payload.sub);
  }
}
