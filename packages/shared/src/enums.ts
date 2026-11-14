import { z } from 'zod';

// API_SPEC §2의 공통 객체가 쓰는 열거형. 값은 DATABASE.md의 열거형과 같다.

export const tierSchema = z.enum(['free', 'pro']);
export type Tier = z.infer<typeof tierSchema>;

export const sessionTypeSchema = z.enum(['walk_run', 'easy', 'tempo', 'long', 'race']);
export type SessionType = z.infer<typeof sessionTypeSchema>;

/** 서버가 판정하는 훈련 상태(DATABASE.md §3.4). 저장되는 값이 아니다. */
export const sessionStatusSchema = z.enum(['planned', 'completed', 'missed', 'skipped']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const goalDistanceSchema = z.enum(['five_k', 'ten_k', 'half']);
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
