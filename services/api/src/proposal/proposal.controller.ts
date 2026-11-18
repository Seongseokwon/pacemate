import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { goalChangeRequestSchema, idSchema, type GoalChangeRequest } from '@pacemate/shared';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ProposalService } from './proposal.service.js';

/** API_SPEC §3.6. 일정 변경 제안은 채팅의 도구로만 만든다. 앱이 직접 만드는 경로는 없다(D-07). */
@Controller('proposals')
export class ProposalController {
  constructor(private readonly proposals: ProposalService) {}

  @Post('goal-change') goalChange(@CurrentUserId() user: string, @Body(new ZodPipe(goalChangeRequestSchema)) body: GoalChangeRequest) { return this.proposals.createGoalChangeFromSettings(user, body); }
  @Get(':id') get(@CurrentUserId() user: string, @Param('id', new ZodPipe(idSchema)) id: string) { return this.proposals.get(user, id); }
  @Post(':id/approve') @HttpCode(200) approve(@CurrentUserId() user: string, @Param('id', new ZodPipe(idSchema)) id: string) { return this.proposals.approve(user, id); }
  @Post(':id/cancel') @HttpCode(200) cancel(@CurrentUserId() user: string, @Param('id', new ZodPipe(idSchema)) id: string) { return this.proposals.cancel(user, id); }
}
