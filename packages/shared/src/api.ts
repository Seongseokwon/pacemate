import { z } from 'zod';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  LIST_PAGE,
  PROFILE_LIMITS,
  REMINDER_HOUR,
  SESSION_QUERY_MAX_DAYS,
  WORKOUT_LIMITS,
} from './config.js';
import {
  authProviderSchema,
  continuousRunSchema,
  experienceSchema,
  goalDistanceSchema,
  managerMessageCodeSchema,
  planKindSchema,
  planWarningSchema,
  pushPlatformSchema,
  runnerLevelSchema,
  storeSchema,
} from './enums.js';
import {
  chatMessageSchema,
  countSchema,
  dateSchema,
  dateTimeSchema,
  idSchema,
  proposalSchema,
  sessionSchema,
  sessionSnapshotSchema,
  usageSchema,
  workoutSchema,
} from './schemas.js';

// API_SPEC §3, §4의 엔드포인트별 요청·응답. 앱과 서버가 함께 쓴다(AD-04).
// 조회 조건(Query)은 주소의 문자열에서 오므로 숫자를 변환해서 받는다.

const DAY_MS = 86_400_000;
const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** 이어서 조회하는 목록의 조건(API_SPEC §1). */
export const listQuerySchema = z.object({
  before: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE.maxLimit).default(LIST_PAGE.defaultLimit),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

const pageOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), hasMore: z.boolean() });
const itemsOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

// §3.1 계정
export const subscriptionSchema = z.object({
  productId: z.string(),
  store: storeSchema,
  expiresAt: dateTimeSchema,
  willRenew: z.boolean(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

/** `GET /v1/me`, `POST /v1/me`의 응답 */
export const meResponseSchema = z.object({
  registered: z.boolean(),
  onboardingCompleted: z.boolean(),
  hasActivePlan: z.boolean(),
  authProvider: authProviderSchema,
  usage: usageSchema,
  subscription: subscriptionSchema.nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** `POST /v1/me`. 세 동의가 모두 true여야 한다(F01-R02). */
export const createMeRequestSchema = z.object({
  consentVersion: z.string().min(1),
  agreedTerms: z.literal(true),
  agreedPrivacy: z.literal(true),
  agreedHealthData: z.literal(true),
});
export type CreateMeRequest = z.infer<typeof createMeRequestSchema>;

// §3.2 프로필
const recentRecordSchema = z.union([
  z.object({
    distanceKm: z.number().min(WORKOUT_LIMITS.distanceKm.min).max(WORKOUT_LIMITS.distanceKm.max),
    durationSec: z.int().min(WORKOUT_LIMITS.durationSec.min).max(WORKOUT_LIMITS.durationSec.max),
  }),
  z.object({
    paceSecPerKm: z.int().min(WORKOUT_LIMITS.paceSecPerKm.min).max(WORKOUT_LIMITS.paceSecPerKm.max),
  }),
]);

const profileFieldsSchema = z.object({
  experience: experienceSchema,
  continuousRun: continuousRunSchema,
  /** null이면 "잘 모르겠어요"다. 0과 구분한다(TE-G05) */
  recentWeeklyKm: z.number().min(PROFILE_LIMITS.recentWeeklyKm.min).max(PROFILE_LIMITS.recentWeeklyKm.max).nullable(),
  recentRecord: recentRecordSchema.nullable(),
  weeklyRunCount: z.int().min(PROFILE_LIMITS.weeklyRunCount.min).max(PROFILE_LIMITS.weeklyRunCount.max),
  /** 1(월)~7(일) */
  preferredWeekdays: z
    .array(z.int().min(1).max(7))
    .max(7)
    .refine((days) => new Set(days).size === days.length, '같은 요일을 두 번 고를 수 없어요.'),
});

/** `PUT /v1/profile` */
export const saveProfileRequestSchema = profileFieldsSchema
  .partial({ recentWeeklyKm: true, recentRecord: true })
  .refine((profile) => profile.preferredWeekdays.length >= profile.weeklyRunCount, {
    path: ['preferredWeekdays'],
    message: '달릴 수 있는 요일을 주간 횟수만큼 골라 주세요.',
  });
export type SaveProfileRequest = z.infer<typeof saveProfileRequestSchema>;

/** `GET /v1/profile`, `PUT /v1/profile`의 응답. `level`은 서버가 분류한다(TE-G01). */
export const profileResponseSchema = profileFieldsSchema.extend({ level: runnerLevelSchema });
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

// §3.3 계획과 훈련
const goalInputSchema = z.object({
  goalDistance: goalDistanceSchema,
  goalTimeSec: z.int().positive().nullable().optional(),
  raceDate: dateSchema.nullable().optional(),
});

/** `POST /v1/plan/preview` */
export const previewPlanRequestSchema = goalInputSchema;
export type PreviewPlanRequest = z.infer<typeof previewPlanRequestSchema>;

/** `POST /v1/plan`. 미리보기에서 고른 계획의 종류를 더한다. */
export const confirmPlanRequestSchema = goalInputSchema.extend({ kind: planKindSchema });
export type ConfirmPlanRequest = z.infer<typeof confirmPlanRequestSchema>;

export const planOptionSchema = z.object({
  kind: planKindSchema,
  startDate: dateSchema,
  endDate: dateSchema,
  totalWeeks: z.int().positive(),
  /** 저장하기 전이라 ID가 없다 */
  sessions: z.array(sessionSchema.omit({ id: true })),
  warnings: z.array(planWarningSchema),
});
export type PlanOption = z.infer<typeof planOptionSchema>;

/** 만들 수 있는 계획만 담는다. 하나 또는 둘이다(TE-G06). */
export const previewPlanResponseSchema = z.object({ options: z.array(planOptionSchema).min(1).max(2) });
export type PreviewPlanResponse = z.infer<typeof previewPlanResponseSchema>;

/** `GET /v1/plan`, `POST /v1/plan`의 응답 */
export const planSummarySchema = z.object({
  id: idSchema,
  kind: planKindSchema,
  goalDistance: goalDistanceSchema,
  goalTimeSec: z.int().positive().nullable(),
  raceDate: dateSchema.nullable(),
  startDate: dateSchema,
  endDate: dateSchema,
  version: z.int().positive(),
  warnings: z.array(planWarningSchema),
  progress: z.object({ completed: countSchema, total: countSchema }),
  isFinished: z.boolean(),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;

/** `GET /v1/sessions?from=&to=` */
export const sessionsQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine(({ from, to }) => from <= to, { path: ['to'], message: '끝 날짜가 시작 날짜보다 빨라요.' })
  .refine(({ from, to }) => (dayOf(to) - dayOf(from)) / DAY_MS < SESSION_QUERY_MAX_DAYS, {
    path: ['to'],
    message: `한 번에 ${SESSION_QUERY_MAX_DAYS}일까지 조회할 수 있어요.`,
  });
export type SessionsQuery = z.infer<typeof sessionsQuerySchema>;

export const sessionsResponseSchema = itemsOf(sessionSchema);
export type SessionsResponse = z.infer<typeof sessionsResponseSchema>;

/** `GET /v1/sessions/{id}` */
export const sessionDetailResponseSchema = sessionSchema.extend({
  workout: workoutSchema.nullable(),
  /** 이 훈련이 바뀐 이력(DI-08) */
  changes: z.array(
    z.object({
      changedAt: dateTimeSchema,
      reason: z.string().nullable(),
      before: sessionSnapshotSchema.nullable(),
      after: sessionSnapshotSchema.nullable(),
    }),
  ),
});
export type SessionDetailResponse = z.infer<typeof sessionDetailResponseSchema>;

/** `GET /v1/home` */
export const homeResponseSchema = z.object({
  plan: planSummarySchema.nullable(),
  daysToRace: countSchema.nullable(),
  todaySession: sessionSchema.nullable(),
  weekSessions: z.array(sessionSchema),
  /** 서버 규칙으로 만든 템플릿 문구(PRD §5.4) */
  managerMessage: z.object({ code: managerMessageCodeSchema, text: z.string() }),
});
export type HomeResponse = z.infer<typeof homeResponseSchema>;

// §3.4 운동 기록
const workoutFieldsSchema = z.object({
  date: dateSchema,
  distanceKm: z.number().min(WORKOUT_LIMITS.distanceKm.min).max(WORKOUT_LIMITS.distanceKm.max),
  durationSec: z.int().min(WORKOUT_LIMITS.durationSec.min).max(WORKOUT_LIMITS.durationSec.max),
  condition: z.int().min(1).max(5).nullable(),
  rpe: z.int().min(1).max(10).nullable(),
  memo: z.string().max(WORKOUT_LIMITS.memoMaxLength).nullable(),
  /** 연결할 훈련. null이면 자유 러닝이다 */
  plannedSessionId: idSchema.nullable(),
  /** 중복 확인을 건너뛴다(`WORKOUT_DUPLICATE` 뒤에 다시 보낼 때) */
  confirmDuplicate: z.boolean(),
  /** 페이스 범위 확인을 건너뛴다(`PACE_OUT_OF_RANGE` 뒤에 다시 보낼 때) */
  confirmPace: z.boolean(),
});

/** `POST /v1/workouts` */
export const createWorkoutRequestSchema = workoutFieldsSchema.partial({
  condition: true,
  rpe: true,
  memo: true,
  plannedSessionId: true,
  confirmDuplicate: true,
  confirmPace: true,
});
export type CreateWorkoutRequest = z.infer<typeof createWorkoutRequestSchema>;

/** `PATCH /v1/workouts/{id}`. `plannedSessionId: null`은 연결 해제다. */
export const updateWorkoutRequestSchema = workoutFieldsSchema.partial();
export type UpdateWorkoutRequest = z.infer<typeof updateWorkoutRequestSchema>;

export const workoutsResponseSchema = pageOf(workoutSchema);
export type WorkoutsResponse = z.infer<typeof workoutsResponseSchema>;

const distanceAndCountSchema = z.object({ distanceKm: z.number().nonnegative(), count: countSchema });

/** `GET /v1/workouts/stats` */
export const workoutStatsResponseSchema = z.object({ week: distanceAndCountSchema, month: distanceAndCountSchema });
export type WorkoutStatsResponse = z.infer<typeof workoutStatsResponseSchema>;

/** `GET /v1/workouts/link-candidates?date=` */
export const linkCandidatesQuerySchema = z.object({ date: dateSchema });
export const linkCandidatesResponseSchema = itemsOf(sessionSchema);
export type LinkCandidatesResponse = z.infer<typeof linkCandidatesResponseSchema>;

// §3.5 채팅
export const chatMessagesResponseSchema = pageOf(chatMessageSchema);
export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;

/** `POST /v1/chat/messages`. 재전송할 때는 같은 `clientMessageId`를 쓴다. */
export const sendChatMessageRequestSchema = z.object({
  clientMessageId: idSchema,
  content: z.string().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
  /** 훈련 상세에서 "AI에게 변경 요청"으로 들어온 경우의 대상 훈련(F05-R11) */
  sessionId: idSchema.optional(),
});
export type SendChatMessageRequest = z.infer<typeof sendChatMessageRequestSchema>;

/** `200`: 처리가 끝난 결과 */
export const chatReplyResponseSchema = z.object({
  userMessage: chatMessageSchema,
  replies: z.array(chatMessageSchema),
  usage: usageSchema,
});
export type ChatReplyResponse = z.infer<typeof chatReplyResponseSchema>;

/** `202`: 같은 `clientMessageId`를 처리하는 중이다. 잠시 뒤 다시 보낸다 */
export const chatProcessingResponseSchema = z.object({ status: z.literal('processing') });

export const sendChatMessageResponseSchema = z.union([chatReplyResponseSchema, chatProcessingResponseSchema]);
export type SendChatMessageResponse = z.infer<typeof sendChatMessageResponseSchema>;

/** `GET /v1/chat/suggestions` */
export const chatSuggestionsResponseSchema = z.object({
  suggestions: z.array(z.object({ code: z.string(), text: z.string() })),
});
export type ChatSuggestionsResponse = z.infer<typeof chatSuggestionsResponseSchema>;

// §3.6 변경 제안. 조회·취소·목표 변경 제안의 응답은 `proposalSchema`다.
/** `POST /v1/proposals/{id}/approve`의 응답 */
export const approveProposalResponseSchema = z.object({
  proposal: proposalSchema,
  /** 대화에 추가된 결과 메시지 */
  resultMessage: chatMessageSchema,
  usage: usageSchema,
});
export type ApproveProposalResponse = z.infer<typeof approveProposalResponseSchema>;

/** `POST /v1/proposals/goal-change`. 바꿀 값만 보낸다. `goal`과 `profile` 중 하나는 있어야 한다. */
export const goalChangeRequestSchema = z
  .object({
    goal: goalInputSchema.partial().optional(),
    profile: profileFieldsSchema.partial().optional(),
  })
  .refine(({ goal, profile }) => [goal, profile].some((part) => part && Object.keys(part).length > 0), {
    message: '바꿀 내용을 하나 이상 입력해 주세요.',
  });
export type GoalChangeRequest = z.infer<typeof goalChangeRequestSchema>;

// §3.7 주간 요약
/** `GET /v1/summaries/weekly?weekStart=`. 생략하면 이번 주다. */
export const weeklySummaryQuerySchema = z.object({
  weekStart: dateSchema
    .refine((date) => new Date(dayOf(date)).getUTCDay() === 1, '주의 시작은 월요일이어야 해요.')
    .optional(),
});

export const weeklySummaryResponseSchema = z.object({
  weekStart: dateSchema,
  plannedCount: countSchema,
  completedCount: countSchema,
  totalDistanceKm: z.number().nonnegative(),
  /** 0~1 */
  completionRate: z.number().min(0).max(1),
  nextSession: sessionSchema.nullable(),
  /** Pro 사용자이고 그 주의 피드백이 만들어져 있을 때만 값이 있다 */
  aiFeedback: z.string().nullable(),
  /** false면 무료 사용자다 */
  aiFeedbackAvailable: z.boolean(),
});
export type WeeklySummaryResponse = z.infer<typeof weeklySummaryResponseSchema>;

// §3.8 알림
/** `GET`·`PUT /v1/notification-settings`의 요청과 응답 */
export const notificationSettingsSchema = z.object({
  workoutReminder: z.boolean(),
  reminderHour: z.int().min(REMINDER_HOUR.min).max(REMINDER_HOUR.max),
  missedNotice: z.boolean(),
  weeklySummary: z.boolean(),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

/** `PUT /v1/push-tokens` */
export const registerPushTokenRequestSchema = z.object({ token: z.string().min(1), platform: pushPlatformSchema });
export type RegisterPushTokenRequest = z.infer<typeof registerPushTokenRequestSchema>;

// §3.9 구독
/** `POST /v1/subscription/sync`의 응답. 아직 반영되지 않았으면 `subscription`이 null이다. */
export const syncSubscriptionResponseSchema = z.object({ subscription: subscriptionSchema.nullable(), usage: usageSchema });
export type SyncSubscriptionResponse = z.infer<typeof syncSubscriptionResponseSchema>;

// §4 내부 작업
export const jobResultSchema = z.object({ processed: countSchema, sent: countSchema, failed: countSchema });
export type JobResult = z.infer<typeof jobResultSchema>;
