import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RATE_LIMIT_PER_MINUTE } from '@pacemate/shared';
import { classifyLevel, ENGINE_VERSION, generate, reschedule, validate } from '@pacemate/training-engine';
import { createRemoteJWKSet } from 'jose';
import { AccountService } from './auth/account.service.js';
import { AUTH_ADMIN, createAuthAdmin } from './auth/auth-admin.js';
import { AuthGuard } from './auth/auth.guard.js';
import { ConsentGuard } from './auth/consent.guard.js';
import { CoachController } from './auth/coach.controller.js';
import { MeController } from './auth/me.controller.js';
import { JWKS, TokenVerifier } from './auth/token-verifier.js';
import { ChatController } from './chat/chat.controller.js';
import { ChatService } from './chat/chat.service.js';
import { ContextBuilder } from './chat/context-builder.js';
import { LlmGateway } from './chat/llm/llm-gateway.js';
import { LLM_PROVIDER } from './chat/llm/llm-provider.js';
import { createLlmProvider } from './chat/llm/create-llm-provider.js';
import { toolRegistryProvider } from './chat/tools/chat-tools.js';
import { AppVersionGuard } from './common/app-version.guard.js';
import { ErrorFilter } from './common/error.filter.js';
import { UserThrottlerGuard } from './common/user-throttler.guard.js';
import { APP_CONFIG, type AppConfig, loadConfig } from './config.js';
import { PrismaService } from './db/prisma.service.js';
import { HealthController } from './health/health.controller.js';
import { PlanController } from './plan/plan.controller.js';
import { PlanService } from './plan/plan.service.js';
import { TRAINING_ENGINE, type TrainingEngine } from './plan/training-engine.js';
import { LEVEL_CLASSIFIER } from './profile/level-classifier.js';
import { ProfileController } from './profile/profile.controller.js';
import { ProfileService } from './profile/profile.service.js';
import { ProposalController } from './proposal/proposal.controller.js';
import { ProposalService } from './proposal/proposal.service.js';
import { SummaryService } from './summary/summary.service.js';
import { UsageService } from './usage/usage.service.js';
import { WorkoutController } from './workout/workout.controller.js';
import { WorkoutService } from './workout/workout.service.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: RATE_LIMIT_PER_MINUTE.default }])],
  controllers: [HealthController, MeController, CoachController, ProfileController, PlanController, WorkoutController, ProposalController, ChatController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: JWKS,
      useFactory: (config: AppConfig) => createRemoteJWKSet(new URL(config.AUTH_JWKS_URL)),
      inject: [APP_CONFIG],
    },
    PrismaService,
    UsageService,
    WorkoutService,
    TokenVerifier,
    AccountService,
    ProfileService,
    { provide: LEVEL_CLASSIFIER, useValue: classifyLevel },
    PlanService,
    ProposalService,
    SummaryService,
    toolRegistryProvider,
    ContextBuilder,
    LlmGateway,
    { provide: LLM_PROVIDER, useFactory: createLlmProvider, inject: [APP_CONFIG] },
    ChatService,
    { provide: TRAINING_ENGINE, useValue: { generate, validate, reschedule, version: ENGINE_VERSION } satisfies TrainingEngine },
    { provide: AUTH_ADMIN, useFactory: createAuthAdmin, inject: [APP_CONFIG] },
    { provide: APP_FILTER, useClass: ErrorFilter },
    // 순서가 곧 실행 순서다: 앱 버전 → 인증 → 요청 제한(사용자 ID로 센다) → 필수 동의
    { provide: APP_GUARD, useClass: AppVersionGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_GUARD, useClass: ConsentGuard },
  ],
})
export class AppModule {}
