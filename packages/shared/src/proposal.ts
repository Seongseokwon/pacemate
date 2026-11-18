import { z } from 'zod';
import { PROFILE_LIMITS, WORKOUT_LIMITS } from './config.js';
import {
  continuousRunSchema,
  experienceSchema,
  goalDistanceSchema,
  planKindSchema,
  planWarningSchema,
  proposalReasonSchema,
  runnerLevelSchema,
} from './enums.js';
import { countSchema, dateSchema, goalSchema, idSchema, proposalChangeSchema, sessionSnapshotSchema } from './schemas.js';

// 변경 제안의 입력(API_SPEC §6 제안 도구)과 저장 형식(DATABASE §3.7의 `request`, `payload`).
// 도구 레지스트리(T-405)가 입력 스키마로 도구 정의를 만들고, 제안 모듈이 저장 형식을 읽을 때마다 검증한다.

const require = (ctx: z.RefinementCtx, value: unknown, path: string) => {
  if (value === undefined) ctx.addIssue({ code: 'custom', path: [path], message: '이 변경에는 값이 필요해요.' });
};

/** `propose_reschedule`의 입력. 훈련의 거리·강도는 없다. Training Engine이 정한다(AI-03) */
export const proposeRescheduleInputSchema = z
  .object({
    changeType: z.enum(['move', 'unavailable_dates', 'reduce_count', 'ease']),
    reason: proposalReasonSchema,
    sessionId: idSchema.optional(),
    targetDate: dateSchema.optional(),
    // 14일 초과는 Engine이 PERIOD_TOO_LONG으로 알린다(TE-R05). 여기서는 입력 크기만 막는다
    unavailableDates: z.array(dateSchema).min(1).max(31).optional(),
    weekStart: dateSchema.optional(),
    maxSessions: z.int().min(0).max(7).optional(),
    easeOption: z.enum(['rest', 'lighter']).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.changeType === 'move') {
      require(ctx, input.sessionId, 'sessionId');
      require(ctx, input.targetDate, 'targetDate');
    } else if (input.changeType === 'ease') {
      require(ctx, input.sessionId, 'sessionId');
      require(ctx, input.easeOption, 'easeOption');
    } else if (input.changeType === 'unavailable_dates') {
      require(ctx, input.unavailableDates, 'unavailableDates');
    } else {
      require(ctx, input.weekStart, 'weekStart');
      require(ctx, input.maxSessions, 'maxSessions');
    }
  });
export type ProposeRescheduleInput = z.infer<typeof proposeRescheduleInputSchema>;

/** `propose_goal_change`의 입력. null은 값을 지운다. `recentWeeklyKm`은 `RECENT_DISTANCE_REQUIRED`를 받은 뒤에만 넣는다(F02-R09) */
export const proposeGoalChangeInputSchema = z
  .object({
    goalDistance: goalDistanceSchema.optional(),
    goalTimeSec: z.int().positive().nullable().optional(),
    raceDate: dateSchema.nullable().optional(),
    recentWeeklyKm: z.number().min(PROFILE_LIMITS.recentWeeklyKm.min).max(PROFILE_LIMITS.recentWeeklyKm.max).optional(),
  })
  .refine((input) => input.goalDistance !== undefined || input.goalTimeSec !== undefined || input.raceDate !== undefined, {
    message: '바꿀 목표를 하나 이상 넣어 주세요.',
  });
export type ProposeGoalChangeInput = z.infer<typeof proposeGoalChangeInputSchema>;

/** `propose_workout_log`의 입력. 컨디션은 받지 않는다(F07-R01) */
export const proposeWorkoutLogInputSchema = z.object({
  date: dateSchema,
  distanceKm: z.number().min(WORKOUT_LIMITS.distanceKm.min).max(WORKOUT_LIMITS.distanceKm.max),
  durationSec: z.int().min(WORKOUT_LIMITS.durationSec.min).max(WORKOUT_LIMITS.durationSec.max),
  rpe: z.int().min(1).max(10).optional(),
  memo: z.string().max(WORKOUT_LIMITS.memoMaxLength).optional(),
  sessionId: idSchema.optional(),
});
export type ProposeWorkoutLogInput = z.infer<typeof proposeWorkoutLogInputSchema>;

/** 제안을 만들 수 없는 이유(API_SPEC §6의 `reasonCode`) */
export const proposalFailureCodeSchema = z.enum([
  'NO_ACTIVE_PLAN',
  'TARGET_NOT_CHANGEABLE',
  'OUT_OF_WEEK',
  'OUT_OF_RANGE',
  'RECENT_DISTANCE_REQUIRED',
  'RACE_DAY_FIXED',
  'PERIOD_TOO_LONG',
  'NO_SAFE_OPTION',
  'NOTHING_TO_CHANGE',
  'SESSION_ALREADY_COMPLETED',
  'WORKOUT_DUPLICATE',
  'INVALID_VALUE',
]);
export type ProposalFailureCode = z.infer<typeof proposalFailureCodeSchema>;

// 저장 형식(`change_proposals.payload`)
const impactSchema = z.object({
  weeklyDistanceBeforeKm: z.number().nonnegative(),
  weeklyDistanceAfterKm: z.number().nonnegative(),
  skippedCount: countSchema,
});

export const reschedulePayloadSchema = z.object({
  changes: z.array(proposalChangeSchema),
  impact: impactSchema,
  warnings: z.array(z.string()),
  reasonLine: z.string(),
});
export type ReschedulePayload = z.infer<typeof reschedulePayloadSchema>;

/** 계획을 만들고 검증할 때 쓴 프로필(Training Engine의 `EngineProfile`) */
const engineProfileSchema = z.object({
  experience: experienceSchema,
  continuousRun: continuousRunSchema,
  recentWeeklyKm: z.number().nonnegative().nullable(),
  recentPaceSecPerKm: z.int().positive().nullable(),
  weeklyRunCount: z.int().positive(),
  preferredWeekdays: z.array(z.int().min(1).max(7)),
});

/** 새로 만들 훈련 한 건 */
const newSessionSchema = sessionSnapshotSchema.extend({
  runIntervalMin: z.int().positive().nullable(),
  paceRange: z.object({ minSecPerKm: z.int().positive(), maxSecPerKm: z.int().positive() }).nullable(),
  weekNumber: z.int().positive(),
});

export const goalChangePayloadSchema = z.object({
  goal: z.object({ before: goalSchema, after: goalSchema }),
  /** 승인 때 `runner_profiles`에 저장할 값. 프로필을 바꾸지 않으면 null이다 */
  profileUpdate: engineProfileSchema.extend({ recentRecordKm: z.number().positive().nullable(), level: runnerLevelSchema }).nullable(),
  /** 새 계획을 만들고 검증할 때 쓴 값. 승인 때 같은 값으로 다시 검증한다(TE-S12) */
  engine: z.object({ profile: engineProfileSchema, level: runnerLevelSchema, startDate: dateSchema, endDate: dateSchema }),
  kind: planKindSchema,
  warnings: z.array(planWarningSchema),
  /** 지울 훈련: 오늘 이후의 기록이 없는 훈련(DATABASE §4) */
  removeSessions: z.array(sessionSnapshotSchema.extend({ id: idSchema })),
  /** 만들 훈련. `weekNumber`는 기존 계획의 첫 주부터 센 값이다 */
  addSessions: z.array(newSessionSchema),
});
export type GoalChangePayload = z.infer<typeof goalChangePayloadSchema>;

export const workoutLogPayloadSchema = z.object({
  workout: z.object({
    date: dateSchema,
    distanceKm: z.number().positive(),
    durationSec: z.int().positive(),
    rpe: z.int().min(1).max(10).nullable(),
    memo: z.string().nullable(),
    plannedSessionId: idSchema.nullable(),
  }),
  plannedSession: sessionSnapshotSchema.nullable(),
});
export type WorkoutLogPayload = z.infer<typeof workoutLogPayloadSchema>;
