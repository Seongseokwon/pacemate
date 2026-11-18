import { expect, test } from 'vitest';
import { proposeGoalChangeInputSchema, proposeRescheduleInputSchema, proposeWorkoutLogInputSchema } from './proposal.js';

const SESSION = '11111111-1111-4111-8111-111111111111';

test('propose_reschedule는 변경 유형마다 필요한 값을 요구한다 (API_SPEC §6)', () => {
  expect(proposeRescheduleInputSchema.safeParse({ changeType: 'move', reason: 'schedule', sessionId: SESSION, targetDate: '2026-11-19' }).success).toBe(true);
  expect(proposeRescheduleInputSchema.safeParse({ changeType: 'move', reason: 'schedule', sessionId: SESSION }).success).toBe(false);
  expect(proposeRescheduleInputSchema.safeParse({ changeType: 'ease', reason: 'fatigue', sessionId: SESSION }).success).toBe(false);
  expect(proposeRescheduleInputSchema.safeParse({ changeType: 'unavailable_dates', reason: 'schedule', unavailableDates: [] }).success).toBe(false);
  expect(proposeRescheduleInputSchema.safeParse({ changeType: 'reduce_count', reason: 'schedule', weekStart: '2026-11-16' }).success).toBe(false);
});

test('propose_reschedule에는 거리·강도 입력이 없다 (AI-03)', () => {
  const parsed = proposeRescheduleInputSchema.parse({ changeType: 'ease', reason: 'pain', sessionId: SESSION, easeOption: 'lighter', distanceKm: 3 });
  expect(parsed).not.toHaveProperty('distanceKm');
});

test('propose_goal_change는 바꿀 목표가 하나는 있어야 한다', () => {
  expect(proposeGoalChangeInputSchema.safeParse({ recentWeeklyKm: 10 }).success).toBe(false);
  expect(proposeGoalChangeInputSchema.safeParse({ raceDate: null }).success).toBe(true);
  expect(proposeGoalChangeInputSchema.safeParse({ goalDistance: 'ten_k', recentWeeklyKm: 101 }).success).toBe(false);
});

test('propose_workout_log는 컨디션을 받지 않고 범위를 지킨다 (F07-R01, F07-R03)', () => {
  expect(proposeWorkoutLogInputSchema.parse({ date: '2026-11-17', distanceKm: 5, durationSec: 1800, condition: 3 })).not.toHaveProperty('condition');
  expect(proposeWorkoutLogInputSchema.safeParse({ date: '2026-11-17', distanceKm: 0, durationSec: 1800 }).success).toBe(false);
});
