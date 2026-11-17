import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type ConfirmPlanRequest,
  confirmPlanRequestSchema,
  type HomeResponse,
  idSchema,
  type PlanSummary,
  type PreviewPlanRequest,
  previewPlanRequestSchema,
  type PreviewPlanResponse,
  type SessionDetailResponse,
  type SessionsQuery,
  sessionsQuerySchema,
  type SessionsResponse,
} from '@pacemate/shared';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PlanService } from './plan.service.js';

/** 계획, 훈련 조회, 홈(API_SPEC §3.3) */
@Controller()
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  @Post('plan/preview')
  @HttpCode(200)
  preview(
    @CurrentUserId() userId: string,
    @Body(new ZodPipe(previewPlanRequestSchema)) body: PreviewPlanRequest,
  ): Promise<PreviewPlanResponse> {
    return this.plan.preview(userId, body);
  }

  @Post('plan')
  confirm(
    @CurrentUserId() userId: string,
    @Body(new ZodPipe(confirmPlanRequestSchema)) body: ConfirmPlanRequest,
  ): Promise<PlanSummary> {
    return this.plan.confirm(userId, body);
  }

  @Get('plan')
  getSummary(@CurrentUserId() userId: string): Promise<PlanSummary> {
    return this.plan.getSummary(userId);
  }

  @Get('sessions')
  listSessions(
    @CurrentUserId() userId: string,
    @Query(new ZodPipe(sessionsQuerySchema)) query: SessionsQuery,
  ): Promise<SessionsResponse> {
    return this.plan.listSessions(userId, query);
  }

  @Get('sessions/:id')
  getSession(@CurrentUserId() userId: string, @Param('id', new ZodPipe(idSchema)) id: string): Promise<SessionDetailResponse> {
    return this.plan.getSession(userId, id);
  }

  @Get('home')
  getHome(@CurrentUserId() userId: string): Promise<HomeResponse> {
    return this.plan.getHome(userId);
  }
}
