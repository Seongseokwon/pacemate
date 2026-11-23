import { Controller, Get, Query } from '@nestjs/common';
import { weeklySummaryQuerySchema, type WeeklySummaryResponse } from '@pacemate/shared';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { mondayOf } from '../common/dates.js';
import { today } from '../common/today.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { UsageService } from '../usage/usage.service.js';
import { SummaryService } from './summary.service.js';

@Controller('summaries')
export class SummaryController {
  constructor(
    private readonly summaries: SummaryService,
    private readonly usage: UsageService,
  ) {}

  /**
   * 주간 요약(F08-R01, API_SPEC §3.7). 수치는 요청 시점의 데이터로 계산하고 LLM을 부르지 않는다.
   * AI 피드백(F08-R02)은 구독과 함께 출시 2단계에 만든다(DECISIONS 2026-11-22). 그때까지 aiFeedback은 늘 null이다.
   */
  @Get('weekly')
  async weekly(@CurrentUserId() user: string, @Query(new ZodPipe(weeklySummaryQuerySchema)) query: { weekStart?: string }): Promise<WeeklySummaryResponse> {
    const numbers = await this.summaries.weeklyNumbers(user, query.weekStart ?? mondayOf(today()));
    const { tier } = await this.usage.get(user);
    return { ...numbers, aiFeedback: null, aiFeedbackAvailable: tier === 'pro' };
  }
}
