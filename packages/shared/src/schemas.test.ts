import {
  chatMessageSchema,
  dateSchema,
  proposalSchema,
  sessionSchema,
  usageSchema,
  workoutSchema,
} from './schemas.js';
import { expect, test } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const session = {
  id: id(1),
  date: '2026-11-19',
  type: 'long',
  distanceKm: 12,
  durationMin: null,
  paceRange: { minSecPerKm: 380, maxSecPerKm: 420 },
  runIntervalMin: null,
  weekNumber: 3,
  status: 'planned',
  workoutId: null,
  original: { date: '2026-11-21', type: 'long', distanceKm: 12, durationMin: null },
};

const workout = {
  id: id(2),
  date: '2026-11-18',
  distanceKm: 5,
  durationSec: 1920,
  paceSecPerKm: 384,
  condition: null,
  rpe: 7,
  memo: null,
  plannedSessionId: id(1),
  source: 'chat',
};

const proposal = {
  id: id(3),
  type: 'reschedule',
  status: 'pending',
  expiresAt: '2026-11-20T06:00:00Z',
  reasonLine: '여행 일정(금~일)에 맞췄어요',
  consumesQuota: true,
  changes: [
    {
      sessionId: id(1),
      action: 'move',
      before: { date: '2026-11-21', type: 'long', distanceKm: 12, durationMin: null },
      after: { date: '2026-11-19', type: 'long', distanceKm: 12, durationMin: null },
    },
    { sessionId: id(4), action: 'skip', before: { date: '2026-11-20', type: 'easy', distanceKm: 5, durationMin: null }, after: null },
  ],
  impact: { weeklyDistanceBeforeKm: 23, weeklyDistanceAfterKm: 18, skippedCount: 1 },
  warnings: [],
  goal: null,
  workout: null,
};

const message = (card: unknown) => ({
  id: id(5),
  role: 'assistant',
  content: '이렇게 바꿔 볼게요.',
  status: 'done',
  createdAt: '2026-11-19T06:00:00Z',
  card,
});

test('API_SPEC §2의 예시 객체가 스키마를 통과한다', () => {
  expect(
    usageSchema.safeParse({
      tier: 'free',
      chat: { used: 3, limit: 10 },
      reschedule: { used: 1, limit: 2 },
      resetsOn: '2026-12-01',
    }).success,
  ).toBe(true);
  expect(sessionSchema.safeParse(session).success).toBe(true);
  expect(workoutSchema.safeParse(workout).success).toBe(true);
  expect(workoutSchema.safeParse({ ...workout, source: 'healthkit' }).success).toBe(true);
  expect(proposalSchema.safeParse(proposal).success).toBe(true);
  expect(chatMessageSchema.safeParse(message(null)).success).toBe(true);
  expect(chatMessageSchema.safeParse(message({ type: 'proposal', proposal })).success).toBe(true);
  expect(chatMessageSchema.safeParse(message({ type: 'limit', data: { resetsOn: '2026-12-01' } })).success).toBe(true);
});

test('날짜는 실제로 있는 YYYY-MM-DD만 받는다', () => {
  expect(dateSchema.safeParse('2026-02-28').success).toBe(true);
  expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
  expect(dateSchema.safeParse('2026-2-3').success).toBe(false);
  expect(dateSchema.safeParse('2026-11-19T06:00:00Z').success).toBe(false);
});

test('정해지지 않은 값은 거부한다', () => {
  expect(sessionSchema.safeParse({ ...session, type: 'interval' }).success).toBe(false);
  expect(sessionSchema.safeParse({ ...session, status: 'done' }).success).toBe(false);
  expect(workoutSchema.safeParse({ ...workout, condition: 6 }).success).toBe(false);
  expect(workoutSchema.safeParse({ ...workout, rpe: 0 }).success).toBe(false);
  expect(proposalSchema.safeParse({ ...proposal, status: 'done' }).success).toBe(false);
});

test('새로 추가되는 훈련은 ID 없이 제안에 담긴다', () => {
  const added = { sessionId: null, action: 'add', before: null, after: session.original };
  expect(proposalSchema.safeParse({ ...proposal, type: 'goal_change', changes: [added] }).success).toBe(true);
});

test('제안 카드에는 제안이 있어야 하고, 모르는 카드 종류는 거부한다', () => {
  expect(chatMessageSchema.safeParse(message({ type: 'proposal' })).success).toBe(false);
  expect(chatMessageSchema.safeParse(message({ type: 'banner', data: {} })).success).toBe(false);
});

test('요약·한도·결과 카드는 카드별 형식으로 검증한다 (DATABASE §3.6)', () => {
  const message = (card: unknown) => ({ id: '11111111-1111-4111-8111-111111111111', role: 'assistant', content: '', status: 'done', createdAt: '2026-11-19T00:00:00.000Z', card });
  expect(chatMessageSchema.safeParse(message({ type: 'limit', data: { resetsOn: '2026-12-01' } })).success).toBe(true);
  expect(chatMessageSchema.safeParse(message({ type: 'limit', data: {} })).success).toBe(false);
  expect(chatMessageSchema.safeParse(message({ type: 'result', data: { proposalType: 'reschedule' } })).success).toBe(true);
  expect(chatMessageSchema.safeParse(message({ type: 'plan_summary', data: { from: '2026-11-16', to: '2026-11-22', sessions: [] } })).success).toBe(true);
  expect(
    chatMessageSchema.safeParse(
      message({ type: 'weekly_summary', data: { weekStart: '2026-11-16', plannedCount: 3, completedCount: 1, totalDistanceKm: 5, completionRate: 1.5, nextSession: null } }),
    ).success,
  ).toBe(false);
});
