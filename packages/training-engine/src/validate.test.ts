import { expect, test } from 'vitest';
import type { PlanSessionState, PlanState } from './types.js';
import { validate } from './validate.js';

const session = (id: string, type: PlanSessionState['type'], distanceKm: number): PlanSessionState => ({
  id, type, distanceKm, date: `2026-11-${id.padStart(2, '0')}`, durationMin: null,
  paceRange: null, weekNumber: 1, completed: false, skipped: false,
});
const plan: PlanState = {
  kind: 'base_building', level: 'novice', startDate: '2026-11-01', endDate: '2026-11-07',
  goal: { goalDistance: 'five_k', goalTimeSec: null, raceDate: null },
  profile: { experience: 'under_6m', continuousRun: 'under_30m', recentWeeklyKm: 10, recentPaceSecPerKm: null, weeklyRunCount: 3, preferredWeekdays: [1, 3, 5] },
  sessions: [session('01', 'easy', 3), session('03', 'easy', 3), session('05', 'long', 6)],
};

test('TE-S03 장거리 비율 경계를 검사한다', () => {
  const valid = validate({ plan, today: '2026-11-01' });
  expect(valid.ok).toBe(false);
  if (!valid.ok) expect(valid.violations).not.toContain('TE-S03');
  const invalid = validate({ plan: { ...plan, sessions: [session('01', 'easy', 3), session('03', 'easy', 3), session('05', 'long', 7)] }, today: '2026-11-01' });
  if (!invalid.ok) expect(invalid.violations).toContain('TE-S03');
});

test('TE-S05 하루 중복과 TE-S07 입문자의 tempo를 거절한다', () => {
  const invalid = validate({ plan: { ...plan, level: 'beginner', sessions: [session('01', 'easy', 3), session('01', 'tempo', 3)] }, today: '2026-11-01' });
  if (!invalid.ok) expect(invalid.violations).toEqual(expect.arrayContaining(['TE-S05', 'TE-S07']));
});
