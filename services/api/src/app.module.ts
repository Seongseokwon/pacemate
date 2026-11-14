import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RATE_LIMIT_PER_MINUTE } from '@pacemate/shared';
import { createRemoteJWKSet } from 'jose';
import { AuthGuard } from './auth/auth.guard.js';
import { JWKS, TokenVerifier } from './auth/token-verifier.js';
import { AppVersionGuard } from './common/app-version.guard.js';
import { ErrorFilter } from './common/error.filter.js';
import { UserThrottlerGuard } from './common/user-throttler.guard.js';
import { APP_CONFIG, type AppConfig, loadConfig } from './config.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: RATE_LIMIT_PER_MINUTE.default }])],
  controllers: [HealthController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: JWKS,
      useFactory: (config: AppConfig) => createRemoteJWKSet(new URL(config.AUTH_JWKS_URL)),
      inject: [APP_CONFIG],
    },
    TokenVerifier,
    { provide: APP_FILTER, useClass: ErrorFilter },
    // 순서가 곧 실행 순서다: 앱 버전 → 인증 → 요청 제한(사용자 ID로 센다)
    { provide: APP_GUARD, useClass: AppVersionGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
