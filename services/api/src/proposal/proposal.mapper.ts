import {
  goalChangePayloadSchema,
  reschedulePayloadSchema,
  workoutLogPayloadSchema,
  type ChatCard,
  type ChatMessage,
  type Proposal,
} from '@pacemate/shared';
import type { ChangeProposal, ChatMessage as ChatMessageRow } from '../generated/prisma/client.js';
import { snapshotOf } from './plan-state.js';

/** 승인 때 AI 일정 변경 이용량을 차감하는 제안인지(PRD §6.5, §8.2). 제안을 만들 때 정해진 값으로만 판정한다. */
export const consumesQuota = (row: Pick<ChangeProposal, 'type' | 'source' | 'quotaExempt'>): boolean =>
  row.type !== 'workout_log' && row.source === 'chat' && !row.quotaExempt;

/** 저장된 제안을 현재 상태의 Proposal로 바꾼다. 만료는 저장하지 않고 시각으로 판정한다(DATABASE §3.7). */
export function toProposal(row: ChangeProposal, now: Date = new Date()): Proposal {
  const base: Proposal = {
    id: row.id,
    type: row.type,
    status: row.status === 'pending' && row.expiresAt <= now ? 'expired' : row.status,
    expiresAt: row.expiresAt.toISOString(),
    reasonLine: null,
    consumesQuota: consumesQuota(row),
    changes: [],
    impact: null,
    warnings: [],
    goal: null,
    workout: null,
  };
  switch (row.type) {
    case 'reschedule': {
      const payload = reschedulePayloadSchema.parse(row.payload);
      return { ...base, changes: payload.changes, impact: payload.impact, warnings: payload.warnings, reasonLine: payload.reasonLine };
    }
    case 'goal_change': {
      const payload = goalChangePayloadSchema.parse(row.payload);
      return {
        ...base,
        changes: [
          ...payload.removeSessions.map((session) => ({ sessionId: session.id, action: 'remove' as const, before: snapshotOf(session), after: null })),
          ...payload.addSessions.map((session) => ({ sessionId: null, action: 'add' as const, before: null, after: snapshotOf(session) })),
        ],
        warnings: payload.warnings,
        goal: payload.goal,
      };
    }
    case 'workout_log': {
      const { workout, plannedSession } = workoutLogPayloadSchema.parse(row.payload);
      return {
        ...base,
        workout: { ...workout, paceSecPerKm: Math.round(workout.durationSec / workout.distanceKm), condition: null, plannedSession },
      };
    }
  }
}

/** 대화 메시지. 제안 카드는 제안의 현재 상태로 그린다(API_SPEC §2.5). */
export function toChatMessage(row: ChatMessageRow, proposal: ChangeProposal | null = null): ChatMessage {
  let card: ChatCard | null = null;
  if (row.cardType === 'proposal' && proposal) card = { type: 'proposal', proposal: toProposal(proposal) };
  else if (row.cardType && row.cardType !== 'proposal') card = { type: row.cardType, data: (row.cardData ?? {}) as Record<string, unknown> };
  return { id: row.id, role: row.role, content: row.content, status: row.status, createdAt: row.createdAt.toISOString(), card };
}
