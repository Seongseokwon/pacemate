import fc from 'fast-check';
import { expect, test } from 'vitest';
import { generate } from './generate.js';
import { reschedule } from './reschedule.js';
import type { PlanSessionState, PlanState, RescheduleInput, RescheduleResult } from './types.js';
import { validate } from './validate.js';

const run = (id: string, date: string, type: PlanSessionState['type'], distanceKm: number): PlanSessionState => ({ id, date, type, distanceKm, durationMin: null, runIntervalMin: null, paceRange: null, weekNumber: 1, completed: false, skipped: false });
const plan: PlanState = {
  kind: 'base_building', level: 'novice', startDate: '2026-11-16', endDate: '2026-11-29',
  goal: { goalDistance: 'none', goalTimeSec: null, raceDate: null },
  profile: { experience: 'under_6m', continuousRun: 'under_30m', recentWeeklyKm: 10, recentPaceSecPerKm: null, weeklyRunCount: 3, preferredWeekdays: [2, 4, 7] },
  sessions: [run('a', '2026-11-17', 'easy', 2), run('b', '2026-11-19', 'easy', 4), run('c', '2026-11-22', 'long', 4)],
};
const input = (request: RescheduleInput['request'], overrides: Partial<RescheduleInput> = {}): RescheduleInput => ({ plan, today: '2026-11-16', reason: 'schedule', request, ...overrides });
const apply = (p: PlanState, result: Extract<RescheduleResult, { ok: true }>): PlanState => ({
  ...p, sessions: p.sessions.map((s) => {
    const change = result.changes.find((c) => c.sessionId === s.id);
    return !change ? s : change.action === 'skip' ? { ...s, skipped: true } : { ...s, ...change.after! };
  }),
});

test('TE-R01 완료·생략·과거 훈련은 바꾸지 않는다', () => {
  for (const extra of [{ completed: true }, { skipped: true }, { date: '2026-11-15' }]) {
    const changed = { ...plan, sessions: [{ ...plan.sessions[0]!, ...extra }, ...plan.sessions.slice(1)] };
    expect(reschedule(input({ changeType: 'ease', sessionId: 'a', easeOption: 'rest' }, { plan: changed }))).toEqual({ ok: false, reasonCode: 'TARGET_NOT_CHANGEABLE' });
  }
});

test('TE-R02 같은 주의 날짜로만 이동한다', () => {
  expect(reschedule(input({ changeType: 'move', sessionId: 'a', targetDate: '2026-11-23' }))).toEqual({ ok: false, reasonCode: 'OUT_OF_WEEK' });
  const result = reschedule(input({ changeType: 'move', sessionId: 'a', targetDate: '2026-11-18' }));
  expect(result.ok && result.changes[0]).toMatchObject({ action: 'move', after: { date: '2026-11-18' } });
});

test('TE-R03 횟수를 줄일 때 낮은 우선순위부터 생략한다', () => {
  const result = reschedule(input({ changeType: 'reduce_count', weekStart: '2026-11-16', maxSessions: 2 }));
  expect(result.ok && result.changes).toEqual([expect.objectContaining({ sessionId: 'a', action: 'skip' })]);
});

test('TE-R03 이동할 자리에 가벼운 훈련이 있으면 길게 달리기를 먼저 보존한다', () => {
  const longer = { ...plan, profile: { ...plan.profile, recentWeeklyKm: 14 }, sessions: [run('a', '2026-11-17', 'easy', 4), run('b', '2026-11-19', 'easy', 4), run('c', '2026-11-22', 'long', 4)] };
  const result = reschedule(input({ changeType: 'move', sessionId: 'c', targetDate: '2026-11-19' }, { plan: longer }));
  expect(result.ok && result.changes).toEqual(expect.arrayContaining([expect.objectContaining({ sessionId: 'c', action: 'move' }), expect.objectContaining({ sessionId: 'b', action: 'skip' })]));
});

test('TE-R04 이동 결과가 안전 규칙을 위반하면 검증되는 생략안을 찾는다', () => {
  const result = reschedule(input({ changeType: 'move', sessionId: 'a', targetDate: '2026-11-19' }));
  expect(result.ok).toBe(true);
  if (result.ok) expect(validate({ plan: apply(plan, result), today: '2026-11-16', change: { previous: plan, reason: 'schedule' } })).toEqual({ ok: true });
});

test('TE-R05 불가 기간은 14일까지다', () => {
  expect(reschedule(input({ changeType: 'unavailable_dates', unavailableDates: ['2026-11-16', '2026-11-30'] }))).toEqual({ ok: false, reasonCode: 'PERIOD_TOO_LONG' });
  expect(reschedule(input({ changeType: 'unavailable_dates', unavailableDates: ['2026-11-17'] })).ok).toBe(true);
});

test('TE-R06 대회 일정은 변경하지 않는다', () => {
  const race = { ...plan, sessions: [...plan.sessions, run('race', '2026-11-21', 'race', 5)] };
  expect(reschedule(input({ changeType: 'move', sessionId: 'race', targetDate: '2026-11-20' }, { plan: race }))).toEqual({ ok: false, reasonCode: 'RACE_DAY_FIXED' });
  expect(reschedule(input({ changeType: 'unavailable_dates', unavailableDates: ['2026-11-21'] }, { plan: race }))).toEqual({ ok: false, reasonCode: 'RACE_DAY_FIXED' });
});

test('TE-R07 변경 목록과 주간 거리 및 생략 횟수를 돌려준다', () => {
  const result = reschedule(input({ changeType: 'reduce_count', weekStart: '2026-11-16', maxSessions: 2 }));
  expect(result.ok && result.impact).toEqual({ weeklyDistanceBeforeKm: 10, weeklyDistanceAfterKm: 8, skippedCount: 1 });
  expect(result.ok && result.changes[0]).toEqual({ sessionId: 'a', action: 'skip', before: { date: '2026-11-17', type: 'easy', distanceKm: 2, durationMin: null }, after: null });
});

test('TE-R08 자리가 없으면 안전한 생략안을 반환한다', () => {
  const result = reschedule(input({ changeType: 'move', sessionId: 'a', targetDate: '2026-11-19' }));
  expect(result.ok && result.changes.some((c) => c.sessionId === 'a' && c.action === 'skip')).toBe(true);
});

test('TE-R09 결과는 결정적이고 원본을 바꾸지 않는다', () => {
  const value = input({ changeType: 'unavailable_dates', unavailableDates: ['2026-11-17', '2026-11-19'] });
  const original = structuredClone(value);
  expect(reschedule(value)).toEqual(reschedule(value));
  expect(value).toEqual(original);
});

test('TE-R10 이번 주와 다음 주만 변경한다', () => {
  expect(reschedule(input({ changeType: 'unavailable_dates', unavailableDates: ['2026-11-30'] }))).toEqual({ ok: false, reasonCode: 'OUT_OF_RANGE' });
  expect(reschedule(input({ changeType: 'move', sessionId: 'a', targetDate: '2026-11-30' }))).toEqual({ ok: false, reasonCode: 'OUT_OF_RANGE' });
});

test('피로로 완화하면 50%를 적용하고 검증한다', () => {
  const result = reschedule(input({ changeType: 'ease', sessionId: 'a', easeOption: 'lighter' }, { reason: 'fatigue' }));
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.changes[0]).toMatchObject({ action: 'modify', after: { distanceKm: 1 } });
    expect(validate({ plan: apply(plan, result), today: '2026-11-16', change: { previous: plan, reason: 'fatigue' } })).toEqual({ ok: true });
  }
});

test('시간 기반 훈련도 50% 줄이고 달리기 구간보다 짧아지면 생략한다', () => {
  const timePlan: PlanState = { ...plan, profile: { ...plan.profile, recentWeeklyKm: 0 }, sessions: [{ ...plan.sessions[0]!, type: 'walk_run', distanceKm: null, durationMin: 30, runIntervalMin: 1 }] };
  const result = reschedule(input({ changeType: 'ease', sessionId: 'a', easeOption: 'lighter' }, { plan: timePlan, reason: 'fatigue' }));
  expect(result.ok && result.changes[0]).toMatchObject({ action: 'modify', after: { durationMin: 15 } });
  const tooShort = { ...timePlan, sessions: [{ ...timePlan.sessions[0]!, runIntervalMin: 20 }], profile: { ...timePlan.profile, continuousRun: 'over_60m' as const } };
  const rest = reschedule(input({ changeType: 'ease', sessionId: 'a', easeOption: 'lighter' }, { plan: tooShort, reason: 'fatigue' }));
  expect(rest.ok && rest.changes[0]).toMatchObject({ action: 'skip' });
});

test('불변식: 생성된 계획에서 성공한 모든 변경은 검증기를 통과한다', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 80 }), fc.constantFrom('move', 'unavailable_dates', 'reduce_count', 'ease'), fc.constantFrom('schedule', 'fatigue', 'pain'), (km, kind, reason) => {
    const profile = { ...plan.profile, recentWeeklyKm: km };
    const generated = generate({ profile, goal: plan.goal, today: '2026-11-15' });
    const option = generated.options[0];
    if (!option) return;
    const state: PlanState = { ...option, profile, goal: plan.goal, level: generated.level, sessions: option.sessions.map((s, i) => ({ ...s, id: String(i), completed: false, skipped: false })) };
    const first = state.sessions[0]!;
    const request: RescheduleInput['request'] = kind === 'move' ? { changeType: 'move', sessionId: first.id, targetDate: '2026-11-18' }
      : kind === 'unavailable_dates' ? { changeType: 'unavailable_dates', unavailableDates: [first.date, state.sessions[3]?.date ?? first.date] }
      : kind === 'reduce_count' ? { changeType: 'reduce_count', weekStart: '2026-11-16', maxSessions: 2 }
      : { changeType: 'ease', sessionId: first.id, easeOption: 'lighter' };
    const data = { plan: state, request, today: '2026-11-16', reason };
    const result = reschedule(data);
    expect(reschedule(data)).toEqual(result);
    if (result.ok) expect(validate({ plan: apply(state, result), today: data.today, change: { previous: state, reason: data.reason } })).toEqual({ ok: true });
  }), { numRuns: 100 });
}, 60_000);
