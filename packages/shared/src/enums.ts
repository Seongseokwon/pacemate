import { z } from 'zod';

// API_SPEC §2의 공통 객체가 쓰는 열거형. 값은 DATABASE.md의 열거형과 같다.

export const tierSchema = z.enum(['free', 'pro']);
export type Tier = z.infer<typeof tierSchema>;

export const sessionTypeSchema = z.enum(['walk_run', 'easy', 'tempo', 'long', 'race']);
export type SessionType = z.infer<typeof sessionTypeSchema>;

/** 서버가 판정하는 훈련 상태(DATABASE.md §3.4). 저장되는 값이 아니다. */
export const sessionStatusSchema = z.enum(['planned', 'completed', 'missed', 'skipped']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

/** `none`은 목표 없음이다(F03-R09). */
export const goalDistanceSchema = z.enum(['five_k', 'ten_k', 'half', 'none']);
export type GoalDistance = z.infer<typeof goalDistanceSchema>;

export const workoutSourceSchema = z.enum(['app', 'chat']);
export type WorkoutSource = z.infer<typeof workoutSourceSchema>;

export const proposalTypeSchema = z.enum(['reschedule', 'goal_change', 'workout_log']);
export type ProposalType = z.infer<typeof proposalTypeSchema>;

/** `expired`는 저장되지 않고 서버가 만료 시각으로 판정해 응답에 넣는 값이다. */
export const proposalStatusSchema = z.enum(['pending', 'approved', 'cancelled', 'superseded', 'expired']);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const proposalActionSchema = z.enum(['move', 'skip', 'modify', 'add', 'remove']);
export type ProposalAction = z.infer<typeof proposalActionSchema>;

export const chatRoleSchema = z.enum(['user', 'assistant', 'system']);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageStatusSchema = z.enum(['processing', 'done', 'failed']);
export type ChatMessageStatus = z.infer<typeof chatMessageStatusSchema>;

export const authProviderSchema = z.enum(['apple', 'google']);
export type AuthProvider = z.infer<typeof authProviderSchema>;

export const experienceSchema = z.enum(['none', 'under_6m', 'under_2y', 'over_2y']);
export type Experience = z.infer<typeof experienceSchema>;

export const continuousRunSchema = z.enum(['under_10m', 'under_30m', 'under_60m', 'over_60m']);
export type ContinuousRun = z.infer<typeof continuousRunSchema>;

/** 입문 / 초급 / 중급. 서버가 분류한다(TE-G01). */
export const runnerLevelSchema = z.enum(['beginner', 'novice', 'intermediate']);
export type RunnerLevel = z.infer<typeof runnerLevelSchema>;

/** 완주 준비 계획 / 기초 훈련 계획 / 유지 계획(PRD §7.3). */
/** 홈의 매니저 메시지 종류(API_SPEC §3.3). 문구는 서버가 만든다 */
export const managerMessageCodeSchema = z.enum([
  'NO_PLAN',
  'PLAN_FINISHED',
  'PLAN_NOT_STARTED',
  'RACE_DAY',
  'TODAY_DONE',
  'TODAY_SESSION',
  'MISSED_SESSION',
  'REST_DAY',
]);
export type ManagerMessageCode = z.infer<typeof managerMessageCodeSchema>;

export const planKindSchema = z.enum(['race_prep', 'base_building', 'maintenance']);
export type PlanKind = z.infer<typeof planKindSchema>;

/** 계획의 경고 코드(API_SPEC §3.3의 `warnings`). 문구는 `PLAN_WARNING_LABELS`에 있다. */
/** 목표 없음 계획이 무엇을 향하는지(API_SPEC §3.3의 `focus`). 문구는 `PLAN_FOCUS_LABELS`에 있다. */
export const planFocusSchema = z.enum(['continuous_30min', 'habit']);
export type PlanFocus = z.infer<typeof planFocusSchema>;

export const planWarningSchema = z.enum(['RACE_PREP_NOT_REACHABLE', 'GOAL_TIME_TOO_FAST', 'GOAL_TIME_NOT_CHECKED']);
export type PlanWarning = z.infer<typeof planWarningSchema>;

export const proposalReasonSchema = z.enum(['schedule', 'fatigue', 'pain']);
export type ProposalReason = z.infer<typeof proposalReasonSchema>;

export const storeSchema = z.enum(['app_store', 'play_store']);
export type Store = z.infer<typeof storeSchema>;

export const pushPlatformSchema = z.enum(['ios', 'android']);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;
