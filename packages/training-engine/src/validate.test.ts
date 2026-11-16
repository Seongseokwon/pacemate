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
  expect(valid).toEqual({ ok: false, violations: expect.not.arrayContaining(['TE-S03']) });
  const invalid = validate({ plan: { ...plan, sessions: [session('01', 'easy', 3), session('03', 'easy', 3), session('05', 'long', 7)] }, today: '2026-11-01' });
  expect(invalid).toEqual({ ok: false, violations: expect.arrayContaining(['TE-S03']) });
});

test('TE-S05 하루 중복과 TE-S07 입문자의 tempo를 거절한다', () => {
  const invalid = validate({ plan: { ...plan, level: 'beginner', sessions: [session('01', 'easy', 3), session('01', 'tempo', 3)] }, today: '2026-11-01' });
  expect(invalid).toEqual({ ok: false, violations: expect.arrayContaining(['TE-S05', 'TE-S07']) });
});


test('TE-S05 대회 일정과 다른 주차의 중복 날짜를 검사한다', () => {
  const race = session('01', 'race', 5);
  const duplicate = { ...session('01', 'easy', 3), weekNumber: 2 };
  expect(validate({ plan: { ...plan, sessions: [race, duplicate] }, today: '2026-11-01' })).toEqual({ ok: false, violations: expect.arrayContaining(['TE-S05']) });
  const sevenDays = Array.from({ length: 7 }, (_, i) => session(String(i + 1), i === 6 ? 'race' : 'easy', 1));
  expect(validate({ plan: { ...plan, sessions: sevenDays }, today: '2026-11-01' })).toEqual({ ok: false, violations: expect.arrayContaining(['TE-S05']) });
});

test('TE-S03 주 4회에서는 40%까지만 허용한다', () => {
  const check = (distance: number) => validate({ plan: { ...plan, sessions: [session('01', 'easy', 2), session('02', 'easy', 2), session('03', 'easy', 2), session('04', 'long', distance)] }, today: '2026-11-01' });
  expect(check(4)).toEqual({ ok: false, violations: expect.not.arrayContaining(['TE-S03']) });
  expect(check(5)).toEqual({ ok: false, violations: expect.arrayContaining(['TE-S03']) });
});


test('TE-S04 주 경계를 넘어 연속된 고강도 훈련을 거절한다', () => {
  const sunday = { ...session('01', 'long', 3), date: '2026-11-01' };
  const monday = { ...session('02', 'tempo', 3), date: '2026-11-02', weekNumber: 2 };
  const check = (date: string) => validate({ plan: { ...plan, sessions: [sunday, { ...monday, date }] }, today: '2026-11-01' });
  expect(check('2026-11-02')).toEqual({ ok: false, violations: expect.arrayContaining(['TE-S04']) });
  expect(check('2026-11-03')).toEqual({ ok: false, violations: expect.not.arrayContaining(['TE-S04']) });
});
