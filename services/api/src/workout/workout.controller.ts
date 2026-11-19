import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { createWorkoutRequestSchema, healthkitWorkoutRequestSchema, idSchema, linkCandidatesQuerySchema, listQuerySchema, updateWorkoutRequestSchema, type CreateWorkoutRequest, type HealthkitWorkoutRequest, type ListQuery, type UpdateWorkoutRequest } from '@pacemate/shared';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { WorkoutService } from './workout.service.js';

@Controller('workouts')
export class WorkoutController {
  constructor(private readonly workouts: WorkoutService) {}

  @Get() list(@CurrentUserId() user: string, @Query(new ZodPipe(listQuerySchema)) query: ListQuery) { return this.workouts.list(user, query); }
  @Get('stats') stats(@CurrentUserId() user: string) { return this.workouts.stats(user); }
  @Get('link-candidates') candidates(@CurrentUserId() user: string, @Query(new ZodPipe(linkCandidatesQuerySchema)) query: { date: string }) { return this.workouts.candidates(user, query.date); }
  @Post() create(@CurrentUserId() user: string, @Body(new ZodPipe(createWorkoutRequestSchema)) body: CreateWorkoutRequest) { return this.workouts.create(user, body); }
  @Post('healthkit') importHealthkit(@CurrentUserId() user: string, @Body(new ZodPipe(healthkitWorkoutRequestSchema)) body: HealthkitWorkoutRequest) { return this.workouts.importHealthkit(user, body); }
  @Get(':id/similar') similar(@CurrentUserId() user: string, @Param('id', new ZodPipe(idSchema)) id: string) { return this.workouts.similar(user, id); }
  @Get(':id') get(@CurrentUserId() user: string, @Param('id', new ZodPipe(idSchema)) id: string) { return this.workouts.get(user, id); }
  @Patch(':id') update(@CurrentUserId() user: string, @Param('id', new ZodPipe(idSchema)) id: string, @Body(new ZodPipe(updateWorkoutRequestSchema)) body: UpdateWorkoutRequest) { return this.workouts.update(user, id, body); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUserId() user: string, @Param('id', new ZodPipe(idSchema)) id: string) { return this.workouts.remove(user, id); }
}
