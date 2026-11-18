import { Body, Controller, Put } from '@nestjs/common';
import { type CoachChoice, coachChoiceSchema } from '@pacemate/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { AccountService } from './account.service.js';
import { CurrentUserId } from './current-user.decorator.js';

/** AI 코치 바꾸기(API_SPEC §3.1). `/v1/me`와 달리 필수 동의를 마친 계정만 호출한다. */
@Controller('me/coach')
export class CoachController {
  constructor(private readonly account: AccountService) {}

  @Put()
  set(@CurrentUserId() userId: string, @Body(new ZodPipe(coachChoiceSchema)) body: CoachChoice): Promise<CoachChoice> {
    return this.account.setCoach(userId, body.coach);
  }
}
