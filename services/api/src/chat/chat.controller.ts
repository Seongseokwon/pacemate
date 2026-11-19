import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  listQuerySchema,
  RATE_LIMIT_PER_MINUTE,
  sendChatMessageRequestSchema,
  type ChatMessagesResponse,
  type ChatSuggestionsResponse,
  type ListQuery,
  type SendChatMessageRequest,
  type SendChatMessageResponse,
} from '@pacemate/shared';
import type { Response } from 'express';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PlanService } from '../plan/plan.service.js';
import { suggestionsFor } from './chat-suggestions.js';
import { ChatService } from './chat.service.js';

/** 채팅(API_SPEC §3.5) */
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly plans: PlanService,
  ) {}

  @Get('messages')
  list(@CurrentUserId() userId: string, @Query(new ZodPipe(listQuerySchema)) query: ListQuery): Promise<ChatMessagesResponse> {
    return this.chat.list(userId, query);
  }

  @Post('messages')
  @Throttle({ default: { limit: RATE_LIMIT_PER_MINUTE.chat, ttl: 60_000 } })
  async send(
    @CurrentUserId() userId: string,
    @Body(new ZodPipe(sendChatMessageRequestSchema)) body: SendChatMessageRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SendChatMessageResponse> {
    const result = await this.chat.send(userId, body);
    res.status(result.status);
    return result.body;
  }

  @Get('suggestions')
  async suggestions(@CurrentUserId() userId: string): Promise<ChatSuggestionsResponse> {
    const home = await this.plans.getHome(userId);
    return suggestionsFor({
      hasPlan: home.plan !== null && !home.plan.isFinished,
      hasTodaySession: home.todaySession?.status === 'planned',
      hasMissed: home.weekMissedCount > 0,
    });
  }
}
