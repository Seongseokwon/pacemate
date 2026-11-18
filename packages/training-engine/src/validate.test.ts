import type { ProposalReason } from '@pacemate/shared';
import { expect, test } from 'vitest';
import type { PlanSessionState, PlanState } from './types.js';
import { validate } from './validate.js';

// 2026-11-02는 월요일이다. 주는 11-02~08, 11-09~15, 11-16~22 순이다.
const run = (date: string, type: PlanSessionState['type'], distanceKm: number | null, extra: Partial<PlanSessionState> = {}): PlanSessionState => ({
  id: `${date}-${type}`, date, type, distanceKm, durationMin: null, paceRange: null, runIntervalMin: null, weekNumber: 1, completed: false, skipped: false, ...extra,
});
const walk = (date: string, durationMin: number, runIntervalMin: number | null = 1) => run(date, 'walk_run', null, { durationMin, runIntervalMin });

const base: PlanState = {
  kind: 'base_building', level: 'novice', startDate: '2026-11-02', endDate: '2027-01-31',
  goal: { goalDistance: 'five_k', goalTimeSec: null, raceDate: null },
  profile: { experience: 'under_6m', continuousRun: 'under_30m', recentWeeklyKm: 12, recentPaceSecPerKm: null, weeklyRunCount: 3, preferredWeekdays: [2, 4, 7] },
  sessions: [],
};
const noDistance = { profile: { ...base.profile, recentWeeklyKm: 0 } };
// 주 3회 12km: 최근 주간 거리와 같고 길게 달리기가 정확히 50%다.
const week1 = [run('2026-11-03', 'easy', 3), run('2026-11-05', 'easy', 3), run('2026-11-08', 'long', 6)];
const week2 = (longKm: number) => [run('2026-11-10', 'easy', 3.3), run('2026-11-12', 'easy', 3.3), run('2026-11-15', 'long', longKm)];
// n번째 주(0부터)에 화·목·일 3회로 주간 거리 km를 배치한다.
const day = (offset: number) => new Date(Date.UTC(2026, 10, 2 + offset)).toISOString().slice(0, 10);
const weekOfKm = (n: number, km: number) => [run(day(n * 7 + 1), 'easy', km / 4), run(day(n * 7 + 3), 'easy', km / 4), run(day(n * 7 + 6), 'long', km / 2)];
const weeksOfKm = (...kms: number[]) => kms.flatMap((km, n) => weekOfKm(n, km));

const violations = (input: Parameters<typeof validate>[0]) => {
  const result = validate(input);
  return result.ok ? [] : result.violations;
};
const check = (sessions: PlanSessionState[], plan: Partial<PlanState> = {}, today = '2026-11-02') =>
  violations({ plan: { ...base, ...plan, sessions }, today });
const checkChange = (before: PlanSessionState[], after: PlanSessionState[], reason: ProposalReason = 'schedule', today = '2026-11-02') =>
  violations({ plan: { ...base, sessions: after }, today, change: { previous: { ...base, sessions: before }, reason } });

test('규칙을 모두 지킨 계획은 통과한다', () => {
  expect(validate({ plan: { ...base, sessions: [...week1, ...week2(6.6)] }, today: '2026-11-02' })).toEqual({ ok: true });
  const raceWeek = [run('2026-11-10', 'easy', 3), run('2026-11-12', 'easy', 3), run('2026-11-13', 'easy', 3), run('2026-11-15', 'race', 5)];
  expect(validate({ plan: { ...base, sessions: [...week1, ...raceWeek] }, today: '2026-11-02' })).toEqual({ ok: true });
});

test('위반한 규칙의 ID를 모두 돌려준다', () => {
  expect(validate({ plan: { ...base, sessions: [run('2026-11-03', 'easy', 3), run('2026-11-03', 'long', 9)] }, today: '2026-11-02' })).toEqual({ ok: false, violations: ['TE-S03', 'TE-S05'] });
});

test('TE-S01 주간 거리는 최근 4주 고점의 110%까지다', () => {
  expect(check([...week1, ...week2(6.6)])).not.toContain('TE-S01');
  expect(check([...week1, ...week2(6.7)])).toContain('TE-S01');
});

test('TE-S01 기준은 직전 주가 아니라 최근 4주의 고점이다', () => {
  expect(check(weeksOfKm(12, 10, 13))).not.toContain('TE-S01');
});

test('TE-S01 계획 시작 전의 주는 최근 주간 거리로 본다', () => {
  expect(check(week1, { profile: { ...base.profile, recentWeeklyKm: 11 } })).not.toContain('TE-S01');
  expect(check(week1, { profile: { ...base.profile, recentWeeklyKm: 10 } })).toContain('TE-S01');
});

test('TE-S01 회복 주 바로 다음 주는 고점까지만 복귀한다', () => {
  expect(check(weeksOfKm(12, 9, 12))).not.toContain('TE-S01');
  expect(check(weeksOfKm(12, 9, 12.5))).toContain('TE-S01');
  // 10km는 고점보다 20% 넘게 줄지 않아 회복 주가 아니다.
  expect(check(weeksOfKm(12, 10, 12.5))).not.toContain('TE-S01');
});

test('TE-S02 회복 주 없이 4주째에는 고점을 넘기지 않는다', () => {
  expect(check(weeksOfKm(12, 13, 14, 15))).toContain('TE-S02');
  expect(check(weeksOfKm(12, 13, 14, 14))).not.toContain('TE-S02');
  expect(check(weeksOfKm(12, 13, 14, 10.5))).not.toContain('TE-S02');
});

test('TE-S02 회복 주 뒤에는 다시 3주까지 늘릴 수 있고, 유지 주간은 회복 주를 대신하지 않는다', () => {
  expect(check(weeksOfKm(12, 13, 14, 10.5, 14, 15, 16))).toEqual([]);
  expect(check(weeksOfKm(12, 13, 14, 10.5, 14, 15, 16, 17))).toContain('TE-S02');
  expect(check(weeksOfKm(12, 12, 12, 12, 13))).toContain('TE-S02');
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

test('TE-S04 대회 일정도 높음으로 본다', () => {
  expect(check([run('2026-11-07', 'long', 3), run('2026-11-08', 'race', 5)])).toContain('TE-S04');
  expect(check([run('2026-11-08', 'race', 5), run('2026-11-09', 'tempo', 3)])).toContain('TE-S04');
  expect(check([run('2026-11-07', 'easy', 3), run('2026-11-08', 'race', 5)])).not.toContain('TE-S04');
});

test('TE-S05 하루에 훈련은 1개다. 대회 일정도 1개로 세고 생략한 훈련은 세지 않는다', () => {
  expect(check([run('2026-11-03', 'easy', 3), run('2026-11-03', 'long', 3)])).toContain('TE-S05');
  expect(check([run('2026-11-08', 'race', 5), run('2026-11-08', 'easy', 3)])).toContain('TE-S05');
  expect(check([run('2026-11-03', 'easy', 3, { skipped: true }), run('2026-11-03', 'long', 3)])).not.toContain('TE-S05');
});

test('TE-S05 월~일 한 주에 쉬는 날이 하루는 있어야 한다. 입력의 주차는 믿지 않는다', () => {
  const days = (dates: string[]) => dates.map((date, i) => run(date, i === dates.length - 1 ? 'race' : 'easy', 2, { weekNumber: i < 4 ? 1 : 2 }));
  const mondayToSunday = [0, 1, 2, 3, 4, 5, 6].map(day);
  expect(check(days(mondayToSunday))).toContain('TE-S05');
  expect(check(days(mondayToSunday.slice(1)))).not.toContain('TE-S05');
  // 일요일~토요일의 7일은 두 주에 걸쳐 있어 주마다 쉬는 날이 있다.
  expect(check(days([6, 7, 8, 9, 10, 11, 12].map(day)))).not.toContain('TE-S05');
});

test('TE-S06 첫 주의 거리는 최근 주간 거리를 넘지 않는다', () => {
  expect(check(week1)).not.toContain('TE-S06');
  expect(check([...week1.slice(0, 2), run('2026-11-08', 'long', 6.1)])).toContain('TE-S06');
});

test('TE-S06 최근 주간 거리가 0이거나 없으면 시간 기반 주로 시작한다', () => {
  const walks = [walk('2026-11-03', 20), walk('2026-11-05', 20), walk('2026-11-08', 20)];
  for (const recentWeeklyKm of [0, null]) {
    const profile = { ...base.profile, recentWeeklyKm };
    expect(check(walks, { profile })).toEqual([]);
    expect(check([run('2026-11-03', 'easy', 1)], { profile })).toContain('TE-S06');
  }
});

test('TE-S07 tempo는 초급 이상, 주 3회 이상일 때 주 1회까지다', () => {
  const week = (...types: PlanSessionState['type'][]) => types.map((type, i) => run(day(1 + i * 2), type, 3));
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

test('TE-S08 대회가 있는 주의 훈련 거리는 최근 4주 고점보다 25% 이상 적어야 한다', () => {
  const raceWeek = (km: number) => [run('2026-11-10', 'easy', 3), run('2026-11-12', 'easy', 3), run('2026-11-13', 'easy', km), run('2026-11-15', 'race', 5)];
  expect(check([...week1, ...raceWeek(3)])).not.toContain('TE-S08');
  expect(check([...week1, ...raceWeek(3.1)])).toContain('TE-S08');
  // 대회가 없는 주에는 적용하지 않는다.
  expect(check([...week1, ...raceWeek(3.1).slice(0, 3)])).not.toContain('TE-S08');
});

test('TE-S08 대회가 월~수요일이면 그 전 주도 고점보다 25% 이상 적어야 한다', () => {
  // 2026-11-18은 수요일, 2026-11-19는 목요일이다. 고점은 첫 주의 12km다.
  const before = (km: number) => [run('2026-11-10', 'easy', 3), run('2026-11-12', 'easy', 3), run('2026-11-14', 'easy', km)];
  expect(check([...week1, ...before(3), run('2026-11-18', 'race', 5)])).not.toContain('TE-S08');
  expect(check([...week1, ...before(3.1), run('2026-11-18', 'race', 5)])).toContain('TE-S08');
  expect(check([...week1, ...before(3.1), run('2026-11-19', 'race', 5)])).not.toContain('TE-S08');
  // 그 전 주가 계획 시작 전이면 판정하지 않는다.
  expect(check([run('2026-11-03', 'race', 5)])).not.toContain('TE-S08');
});

test('TE-S09 변경 후 주간 거리는 원래 그 주의 계획 거리를 넘지 않는다', () => {
  const skipped = [{ ...week1[0]!, skipped: true }, week1[1]!, week1[2]!];
  expect(checkChange(week1, skipped)).not.toContain('TE-S09');
  // 이번 주 훈련을 다음 주로 넘기면 다음 주의 거리가 늘어난다.
  expect(checkChange(week1, [{ ...week1[0]!, date: '2026-11-10' }, week1[1]!, week1[2]!])).toContain('TE-S09');
  expect(checkChange(skipped, week1)).toContain('TE-S09');
});

test('TE-S09 생략한 훈련을 다른 훈련의 거리나 시간을 늘려 보충하지 않는다', () => {
  expect(checkChange(week1, [{ ...week1[0]!, skipped: true }, { ...week1[1]!, distanceKm: 5 }, week1[2]!])).toContain('TE-S09');
  const walks = [walk('2026-11-03', 20), walk('2026-11-05', 20)];
  expect(checkChange(walks, [{ ...walks[0]!, skipped: true }, { ...walks[1]!, durationMin: 30 }])).toContain('TE-S09');
});

test('TE-S09 지난 주의 변경과 변경 전 계획이 없는 검증에는 적용하지 않는다', () => {
  expect(checkChange(week1, [...week1.slice(0, 2), { ...week1[2]!, distanceKm: 6.1 }], 'schedule', '2026-11-09')).toEqual([]);
  expect(check(week1)).not.toContain('TE-S09');
});

test('TE-S11 통증·피로가 사유인 변경은 강도를 올리거나 훈련을 더하지 않는다', () => {
  const harder = [week1[0]!, { ...week1[1]!, type: 'tempo' as const }, week1[2]!];
  const added = [...week1, run('2026-11-06', 'easy', 0)];
  for (const reason of ['pain', 'fatigue'] as const) {
    expect(checkChange(week1, harder, reason)).toContain('TE-S11');
    expect(checkChange(week1, added, reason)).toContain('TE-S11');
    expect(checkChange(week1, [{ ...week1[0]!, skipped: true }, week1[1]!, { ...week1[2]!, type: 'easy' as const, distanceKm: 4 }], reason)).not.toContain('TE-S11');
  }
  expect(checkChange(week1, harder, 'schedule')).not.toContain('TE-S11');
});

test('TE-S11 통증·피로가 사유인 변경은 훈련량을 늘리지 않는다', () => {
  const more = [{ ...week1[0]!, skipped: true }, { ...week1[1]!, distanceKm: 4 }, week1[2]!];
  expect(checkChange(week1, more, 'fatigue')).toEqual(expect.arrayContaining(['TE-S09', 'TE-S11']));
  expect(checkChange(week1, more, 'schedule')).not.toContain('TE-S11');
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

test('TE-S14 형식이 맞지 않는 훈련을 거절한다', () => {
  expect(check([walk('2026-11-03', 20)], noDistance)).toEqual([]);
  expect(check([...week1.slice(0, 2), run('2026-11-08', 'long', null)])).toContain('TE-S14');
  expect(check([run('2026-11-03', 'easy', null, { durationMin: 30 })])).toContain('TE-S14');
  expect(check([run('2026-11-03', 'walk_run', null, { runIntervalMin: 1 })], noDistance)).toContain('TE-S14');
  expect(check([walk('2026-11-03', 20, null)], noDistance)).toContain('TE-S14');
  expect(check([run('2026-11-3', 'easy', 3)])).toContain('TE-S14');
  expect(check(week1, { startDate: '' })).toContain('TE-S14');
});

test('TE-S14 한 주에 시간 기반 훈련과 거리 기반 훈련을 섞지 않는다', () => {
  expect(check([walk('2026-11-03', 20), run('2026-11-05', 'easy', 3)])).toContain('TE-S14');
  expect(check([walk('2026-11-03', 20), walk('2026-11-05', 20)])).not.toContain('TE-S14');
});

test('TE-S14 시간 기반 주의 총 시간은 최근 4주 고점의 110%까지고, 거리 규칙은 적용하지 않는다', () => {
  const weeks = (minutes: number) => [walk('2026-11-03', 30), walk('2026-11-05', 30), walk('2026-11-10', 33), walk('2026-11-12', minutes)];
  expect(check(weeks(33), noDistance)).toEqual([]);
  expect(check(weeks(34), noDistance)).toContain('TE-S14');
});

test('TE-S14 첫 주에 한 번에 달리는 시간은 쉬지 않고 달릴 수 있는 시간의 하한까지다', () => {
  expect(check([walk('2026-11-03', 20, 10)], noDistance)).toEqual([]);
  expect(check([walk('2026-11-03', 20, 11)], noDistance)).toContain('TE-S14');
  // 둘째 주부터는 이 상한을 적용하지 않는다.
  expect(check([walk('2026-11-03', 20, 10), walk('2026-11-10', 20, 11)], noDistance)).toEqual([]);
  const under10 = { profile: { ...noDistance.profile, continuousRun: 'under_10m' as const } };
  expect(check([walk('2026-11-03', 20, 1)], under10)).toEqual([]);
  expect(check([walk('2026-11-03', 20, 2)], under10)).toContain('TE-S14');
});

test('TE-S14 TE-G10 유지 계획은 최근에 마친 단계까지 첫 주에 둘 수 있다', () => {
  const continued = { profile: { ...noDistance.profile, continuousRun: 'under_10m' as const, recentRunIntervalMin: 20 } };
  expect(check([walk('2026-11-03', 30, 20)], continued)).toEqual([]);
  expect(check([walk('2026-11-03', 30, 30)], continued)).toContain('TE-S14');
});

test('시간 기반 주에서 거리 기반 주로 넘어가는 주는 전환 조건이 정해질 때까지 거절한다', () => {
  const sessions = [walk('2026-11-03', 30), walk('2026-11-05', 30), run('2026-11-10', 'easy', 1)];
  expect(check(sessions, noDistance)).toEqual(expect.arrayContaining(['TE-S01', 'TE-S13']));
});

test('지난 주의 위반은 보고하지 않지만 기준값 계산에는 쓴다', () => {
  const pastViolation = [run('2026-11-03', 'easy', 3), run('2026-11-03', 'long', 9)];
  expect(check(pastViolation, {}, '2026-11-08')).toEqual(['TE-S03', 'TE-S05']);
  expect(check(pastViolation, {}, '2026-11-09')).toEqual([]);
  expect(check([...week1, ...week2(6.7)], {}, '2026-11-09')).toEqual(expect.arrayContaining(['TE-S01', 'TE-S13']));
  expect(check([run('2026-11-08', 'long', 6), run('2026-11-09', 'tempo', 3)], {}, '2026-11-09')).toContain('TE-S04');
  expect(check(weeksOfKm(12, 13, 14, 15), {}, day(21))).toContain('TE-S02');
  expect(check(weeksOfKm(12, 13, 14, 15), {}, day(28))).toEqual([]);
});

test('오늘 날짜가 잘못되면 지난 주도 모두 검사한다', () => {
  expect(check([run('2026-11-03', 'easy', 3), run('2026-11-03', 'long', 3)], {}, '')).toContain('TE-S05');
});
