import { z } from 'zod';
import {
  chatMessageStatusSchema,
  chatRoleSchema,
  goalDistanceSchema,
  proposalActionSchema,
  proposalStatusSchema,
  proposalTypeSchema,
  sessionStatusSchema,
  sessionTypeSchema,
  tierSchema,
  workoutSourceSchema,
} from './enums.js';

// API_SPEC §2의 공통 객체. 엔드포인트별 요청·응답 스키마는 `api.ts`에 있다.

/** `YYYY-MM-DD`. 시간대가 없는 날짜다(ARCHITECTURE §13). */
export const dateSchema = z.iso.date();
/** ISO 8601 UTC 시각 */
export const dateTimeSchema = z.iso.datetime();

export const idSchema = z.uuid();
export const countSchema = z.int().nonnegative();

// §2.1 Usage
const usageCounterSchema = z.object({ used: countSchema, limit: countSchema });
export const usageSchema = z.object({
  tier: tierSchema,
  chat: usageCounterSchema,
  reschedule: usageCounterSchema,
  resetsOn: dateSchema,
});
export type Usage = z.infer<typeof usageSchema>;

// §2.2 Session
/** 훈련 한 건의 내용. 변경 전후 비교와 "원래 일정" 표시에 쓴다. */
export const sessionSnapshotSchema = z.object({
  date: dateSchema,
  type: sessionTypeSchema,
  distanceKm: z.number().positive().nullable(),
  durationMin: z.int().positive().nullable(),
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

export const sessionSchema = sessionSnapshotSchema.extend({
  id: idSchema,
  /** 걷고 달리기에서 한 번에 달리는 시간(분). 시간 기준 걷고 달리기에만 있다(TE-S14) */
  runIntervalMin: z.int().positive().nullable(),
  paceRange: z
    .object({ minSecPerKm: z.int().positive(), maxSecPerKm: z.int().positive() })
    .nullable(),
  weekNumber: z.int().positive(),
  status: sessionStatusSchema,
  workoutId: idSchema.nullable(),
  /** 값이 있으면 "변경됨"이다 */
  original: sessionSnapshotSchema.nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

// §2.3 Workout
const workoutContentSchema = z.object({
  date: dateSchema,
  distanceKm: z.number().positive(),
  durationSec: z.int().positive(),
  /** 서버가 거리와 시간으로 계산한다 */
  paceSecPerKm: z.int().positive(),
  condition: z.int().min(1).max(5).nullable(),
  rpe: z.int().min(1).max(10).nullable(),
  memo: z.string().nullable(),
  plannedSessionId: idSchema.nullable(),
});

export const workoutSchema = workoutContentSchema.extend({
  id: idSchema,
  source: workoutSourceSchema,
});
export type Workout = z.infer<typeof workoutSchema>;

// §2.4 Proposal
export const goalSchema = z.object({
  goalDistance: goalDistanceSchema,
  goalTimeSec: z.int().positive().nullable(),
  raceDate: dateSchema.nullable(),
});

export const proposalChangeSchema = z.object({
  /** 새로 추가되는 훈련(`add`)은 아직 ID가 없어 null이다 */
  sessionId: idSchema.nullable(),
  action: proposalActionSchema,
  before: sessionSnapshotSchema.nullable(),
  after: sessionSnapshotSchema.nullable(),
});
export type ProposalChange = z.infer<typeof proposalChangeSchema>;

export const proposalSchema = z.object({
  id: idSchema,
  type: proposalTypeSchema,
  status: proposalStatusSchema,
  expiresAt: dateTimeSchema,
  /** 카드의 이유 한 줄. 서버가 사유와 요청 내용으로 만든 템플릿 문구다(F05-R03). 목표 변경과 기록 등록은 null이다 */
  reasonLine: z.string().nullable(),
  /** 승인 시 AI 일정 변경 이용량을 차감하는지 */
  consumesQuota: z.boolean(),
  changes: z.array(proposalChangeSchema),
  impact: z
    .object({
      weeklyDistanceBeforeKm: z.number().nonnegative(),
      weeklyDistanceAfterKm: z.number().nonnegative(),
      skippedCount: countSchema,
    })
    .nullable(),
  /** 경고 코드. 문구는 화면에서 코드로 찾는다 */
  warnings: z.array(z.string()),
  goal: z.object({ before: goalSchema, after: goalSchema }).nullable(),
  /** 기록 등록 제안일 때 저장될 기록과 연결될 훈련 */
  workout: workoutContentSchema
    .extend({ plannedSession: sessionSnapshotSchema.nullable() })
    .nullable(),
});
export type Proposal = z.infer<typeof proposalSchema>;

// §2.5 ChatMessage
// shortcut: 요약·한도·결과 카드의 data 형식이 아직 없다, 카드를 만드는 T-406에서 카드별 스키마로 좁힌다
const cardDataSchema = z.record(z.string(), z.unknown());

export const chatCardSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('proposal'), proposal: proposalSchema }),
  z.object({ type: z.literal('plan_summary'), data: cardDataSchema }),
  z.object({ type: z.literal('weekly_summary'), data: cardDataSchema }),
  z.object({ type: z.literal('limit'), data: cardDataSchema }),
  z.object({ type: z.literal('result'), data: cardDataSchema }),
]);
export type ChatCard = z.infer<typeof chatCardSchema>;

export const chatMessageSchema = z.object({
  id: idSchema,
  role: chatRoleSchema,
  content: z.string(),
  status: chatMessageStatusSchema,
  createdAt: dateTimeSchema,
  card: chatCardSchema.nullable(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;
