import { Body, Controller, Get, Put } from '@nestjs/common';
import { type ProfileResponse, type SaveProfileRequest, saveProfileRequestSchema } from '@pacemate/shared';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ProfileService } from './profile.service.js';

/** 러닝 프로필(API_SPEC §3.2) */
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUserId() userId: string): Promise<ProfileResponse> {
    return this.profile.get(userId);
  }

  @Put()
  save(
    @CurrentUserId() userId: string,
    @Body(new ZodPipe(saveProfileRequestSchema)) body: SaveProfileRequest,
  ): Promise<ProfileResponse> {
    return this.profile.save(userId, body);
  }
}
