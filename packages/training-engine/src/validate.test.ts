import { expect, test } from 'vitest';
import type { PlanSessionState, PlanState } from './types.js';
import { checkRules, UNIMPLEMENTED, validate } from './validate.js';

// 2026-11-02는 월요일이다. 주는 11-02~08, 11-09~15, 11-16~22 순이다.
const run = (date: string, type: PlanSessionState['type'], distanceKm: number | null, extra: Partial<PlanSessionState> = {}): PlanSessionState => ({
  id: `${date}-${type}`, date, type, distanceKm, durationMin: null, paceRange: null, weekNumber: 1, completed: false, skipped: false, ...extra,
});
const walk = (date: string, durationMin: number) => run(date, 'walk_run', null, { durationMin });

const base: PlanState = {
  kind: 'base_building', level: 'novice', startDate: '2026-11-02', endDate: '2026-11-29',
  goal: { goalDistance: 'five_k', goalTimeSec: null, raceDate: null },
  profile: { experience: 'under_6m', continuousRun: 'under_30m', recentWeeklyKm: 12, recentPaceSecPerKm: null, weeklyRunCount: 3, preferredWeekdays: [2, 4, 7] },
  sessions: [],
};
// 주 3회 12km: 최근 주간 거리와 같고 길게 달리기가 정확히 50%다.
const week1 = [run('2026-11-03', 'easy', 3), run('2026-11-05', 'easy', 3), run('2026-11-08', 'long', 6)];
const week2 = (longKm: number) => [run('2026-11-10', 'easy', 3.3), run('2026-11-12', 'easy', 3.3), run('2026-11-15', 'long', longKm)];

const check = (sessions: PlanSessionState[], plan: Partial<PlanState> = {}, today = '2026-11-02') =>
  [...checkRules({ plan: { ...base, ...plan, sessions }, today })];

test('규칙을 모두 지킨 계획은 검사한 규칙에 위반이 없다', () => {
  expect(check([...week1, ...week2(6.6)])).toEqual([]);
});

test('구현이 남은 규칙은 항상 위반으로 보고해 어떤 계획도 통과시키지 않는다', () => {
  expect(validate({ plan: { ...base, sessions: week1 }, today: '2026-11-02' })).toEqual({ ok: false, violations: [...UNIMPLEMENTED] });
});

test('TE-S01 주간 거리는 최근 4주 고점의 110%까지다', () => {
  expect(check([...week1, ...week2(6.6)])).not.toContain('TE-S01');
  expect(check([...week1, ...week2(6.7)])).toContain('TE-S01');
});

test('TE-S01 기준은 직전 주가 아니라 최근 4주의 고점이다', () => {
  const lightWeek = [run('2026-11-10', 'easy', 3), run('2026-11-15', 'easy', 3)];
  const week3 = [run('2026-11-17', 'easy', 3.5), run('2026-11-19', 'easy', 3.5), run('2026-11-22', 'long', 6)];
  expect(check([...week1, ...lightWeek, ...week3])).not.toContain('TE-S01');
});

test('TE-S01 계획 시작 전의 주는 최근 주간 거리로 본다', () => {
  expect(check(week1, { profile: { ...base.profile, recentWeeklyKm: 11 } })).not.toContain('TE-S01');
  expect(check(week1, { profile: { ...base.profile, recentWeeklyKm: 10 } })).toContain('TE-S01');
});

test('TE-S03 주 3회 이하에서는 길게 달리기가 50%까지다', () => {
  expect(check(week1)).not.toContain('TE-S03');
  expect(check([run('2026-11-03', 'easy', 3), run('2026-11-05', 'easy', 2.9), run('2026-11-08', 'long', 6)])).toContain('TE-S03');
});

test('TE-S03 주 4회 이상에서는 길게 달리기가 40%까지다', () => {
  const week = (longKm: number) => [run('2026-11-03', 'easy', 2), run('2026-11-04', 'easy', 2), run('2026-11-06', 'easy', 2), run('2026-11-08', 'long', longKm)];
  expect(check(week(4))).not.toContain('TE-S03');
  expect(check(week(4.1))).toContain('TE-S03');
});

test('TE-S03 대회 당일의 거리는 주간 거리에 넣지 않는다', () => {
  expect(check([...week1.slice(0, 2), run('2026-11-06', 'long', 6), run('2026-11-08', 'race', 5)])).not.toContain('TE-S03');
  expect(check([run('2026-11-03', 'easy', 3), run('2026-11-06', 'long', 6), run('2026-11-08', 'race', 5)])).toContain('TE-S03');
});

test('TE-S04 강도가 높은 훈련을 연속된 날에 두지 않는다. 주가 바뀌어도 같다', () => {
  const sundayLong = run('2026-11-08', 'long', 3);
  expect(check([sundayLong, run('2026-11-09', 'tempo', 3)])).toContain('TE-S04');
  expect(check([sundayLong, run('2026-11-10', 'tempo', 3)])).not.toContain('TE-S04');
  expect(check([sundayLong, run('2026-11-09', 'easy', 3)])).not.toContain('TE-S04');
});

test('TE-S05 하루에 훈련은 1개다. 대회 일정과 생략한 훈련도 구분한다', () => {
  expect(check([run('2026-11-03', 'easy', 3), run('2026-11-03', 'long', 3)])).toContain('TE-S05');
  expect(check([run('2026-11-08', 'race', 5), run('2026-11-08', 'easy', 3)])).toContain('TE-S05');
  expect(check([run('2026-11-03', 'easy', 3, { skipped: true }), run('2026-11-03', 'long', 3)])).not.toContain('TE-S05');
});

test('TE-S05 월~일 한 주에 쉬는 날이 하루는 있어야 한다. 입력의 주차는 믿지 않는다', () => {
  const days = (dates: string[]) => dates.map((date, i) => run(date, i === dates.length - 1 ? 'race' : 'easy', 2, { weekNumber: i < 4 ? 1 : 2 }));
  const mondayToSunday = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
  expect(check(days(mondayToSunday))).toContain('TE-S05');
  expect(check(days(mondayToSunday.slice(1)))).not.toContain('TE-S05');
  // 일요일~토요일의 7일은 두 주에 걸쳐 있어 주마다 쉬는 날이 있다.
  expect(check(days(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']))).not.toContain('TE-S05');
});

test('TE-S06 첫 주의 거리는 최근 주간 거리를 넘지 않는다', () => {
  expect(check(week1)).not.toContain('TE-S06');
  expect(check([...week1.slice(0, 2), run('2026-11-08', 'long', 6.1)])).toContain('TE-S06');
});

test('TE-S06 최근 주간 거리가 0이거나 없으면 시간 기반 주로 시작한다', () => {
  const walks = [walk('2026-11-03', 20), walk('2026-11-05', 20), walk('2026-11-08', 20)];
  for (const recentWeeklyKm of [0, null]) {
    const profile = { ...base.profile, recentWeeklyKm };
    expect(check(walks, { profile })).not.toContain('TE-S06');
    expect(check([run('2026-11-03', 'easy', 1)], { profile })).toContain('TE-S06');
  }
});

test('TE-S07 tempo는 초급 이상, 주 3회 이상일 때 주 1회까지다', () => {
  const week = (...types: PlanSessionState['type'][]) => types.map((type, i) => run(`2026-11-0${3 + i * 2}`, type, 3));
  expect(check(week('easy', 'tempo', 'easy'))).not.toContain('TE-S07');
  expect(check(week('easy', 'tempo', 'easy'), { level: 'beginner' })).toContain('TE-S07');
  expect(check(week('easy', 'tempo'))).toContain('TE-S07');
  expect(check(week('tempo', 'easy', 'tempo'))).toContain('TE-S07');
});

test('TE-S07 주 3회는 그 주에 생략하지 않은 훈련으로 센다. 입력의 주차는 믿지 않는다', () => {
  expect(check([run('2026-11-03', 'easy', 3, { skipped: true }), run('2026-11-05', 'tempo', 3), run('2026-11-08', 'easy', 3)])).toContain('TE-S07');
  const sameWeek = [run('2026-11-02', 'easy', 2), run('2026-11-03', 'tempo', 2), run('2026-11-05', 'easy', 2), run('2026-11-06', 'tempo', 2, { weekNumber: 2 }), run('2026-11-08', 'easy', 2, { weekNumber: 2 })];
  expect(check(sameWeek)).toContain('TE-S07');
});

test('TE-S13 한 번의 거리는 최근 30일 최장 거리의 110%까지다', () => {
  expect(check([...week1, ...week2(6.6)])).not.toContain('TE-S13');
  expect(check([...week1, ...week2(6.7)])).toContain('TE-S13');
});

test('TE-S13 30일보다 오래된 달리기는 기준이 아니고, 비교할 달리기가 없으면 첫 주만 통과한다', () => {
  expect(check(week1)).not.toContain('TE-S13');
  expect(check([run('2026-11-03', 'easy', 3), run('2026-12-03', 'easy', 3)])).not.toContain('TE-S13');
  expect(check([run('2026-11-03', 'easy', 3), run('2026-12-04', 'easy', 3)])).toContain('TE-S13');
});

test('TE-S14 걷고 달리기가 아닌 훈련에 거리가 없거나 거리와 시간이 모두 없으면 거절한다', () => {
  expect(check([walk('2026-11-03', 20)])).not.toContain('TE-S14');
  expect(check([...week1.slice(0, 2), run('2026-11-08', 'long', null)])).toContain('TE-S14');
  expect(check([run('2026-11-03', 'easy', null, { durationMin: 30 })])).toContain('TE-S14');
  expect(check([run('2026-11-03', 'walk_run', null)])).toContain('TE-S14');
  expect(check([run('2026-11-3', 'easy', 3)])).toContain('TE-S14');
});

test('TE-S14 한 주에 시간 기반 훈련과 거리 기반 훈련을 섞지 않는다', () => {
  expect(check([walk('2026-11-03', 20), run('2026-11-05', 'easy', 3)])).toContain('TE-S14');
  expect(check([walk('2026-11-03', 20), walk('2026-11-05', 20)])).not.toContain('TE-S14');
});

test('TE-S14 시간 기반 주의 총 시간은 최근 4주 고점의 110%까지고, 거리 규칙은 적용하지 않는다', () => {
  const weeks = (minutes: number) => [walk('2026-11-03', 30), walk('2026-11-05', 30), walk('2026-11-10', 33), walk('2026-11-12', minutes)];
  const profile = { ...base.profile, recentWeeklyKm: 0 };
  expect(check(weeks(33), { profile })).toEqual([]);
  expect(check(weeks(34), { profile })).toContain('TE-S14');
});

test('시간 기반 주에서 거리 기반 주로 넘어가는 주는 전환 조건이 정해질 때까지 거절한다', () => {
  const sessions = [walk('2026-11-03', 30), walk('2026-11-05', 30), run('2026-11-10', 'easy', 1)];
  expect(check(sessions, { profile: { ...base.profile, recentWeeklyKm: 0 } })).toEqual(expect.arrayContaining(['TE-S01', 'TE-S13']));
});

test('지난 주의 위반은 보고하지 않지만 기준값 계산에는 쓴다', () => {
  const pastViolation = [run('2026-11-03', 'easy', 3), run('2026-11-03', 'long', 9)];
  expect(check(pastViolation, {}, '2026-11-08')).toEqual(expect.arrayContaining(['TE-S03', 'TE-S05']));
  expect(check(pastViolation, {}, '2026-11-09')).toEqual([]);
  expect(check([...week1, ...week2(6.7)], {}, '2026-11-09')).toEqual(expect.arrayContaining(['TE-S01', 'TE-S13']));
  expect(check([run('2026-11-08', 'long', 6), run('2026-11-09', 'tempo', 3)], {}, '2026-11-09')).toContain('TE-S04');
});

test('오늘 날짜가 잘못되면 지난 주도 모두 검사한다', () => {
  expect(check([run('2026-11-03', 'easy', 3), run('2026-11-03', 'long', 3)], {}, '')).toContain('TE-S05');
});
