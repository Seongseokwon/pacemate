import fc from 'fast-check';
import { expect, test } from 'vitest';
import { generate } from './generate.js';
import { PLAN } from './safety-config.js';
import type { EngineGoal, EngineProfile, EngineSession, GenerateInput, PlanOption } from './types.js';
import { validate } from './validate.js';

// 2026-11-15는 일요일, 2026-11-16은 월요일이다.
const SUNDAY = '2026-11-15';
const profile = (over: Partial<EngineProfile> = {}): EngineProfile => ({
  experience: 'under_2y', continuousRun: 'under_60m', recentWeeklyKm: 20, recentPaceSecPerKm: null, weeklyRunCount: 3, preferredWeekdays: [2, 4, 7], ...over,
});
const goal = (over: Partial<EngineGoal> = {}): EngineGoal => ({ goalDistance: 'ten_k', goalTimeSec: null, raceDate: null, ...over });
const run = (p: Partial<EngineProfile> = {}, g: Partial<EngineGoal> = {}, today = SUNDAY) => generate({ profile: profile(p), goal: goal(g), today });
const option = (result: ReturnType<typeof generate>, kind: PlanOption['kind']) => {
  const found = result.options.find((item) => item.kind === kind);
  if (!found) throw new Error(`${kind} 계획이 없다`);
  return found;
};
const weekday = (date: string) => ((Date.parse(date) / 86_400_000 + 3) % 7) + 1;
const byWeek = (sessions: EngineSession[]) => {
  const weeks = new Map<number, EngineSession[]>();
  for (const session of sessions) weeks.set(session.weekNumber, [...(weeks.get(session.weekNumber) ?? []), session]);
  return weeks;
};
const weeklyKm = (plan: PlanOption) => [...byWeek(plan.sessions.filter((session) => session.type !== 'race')).values()].map((week) => Math.round(week.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0) * 10) / 10);

test('AC-F03-01 목표 3종과 수준 3종마다 계획이 만들어진다', () => {
  const levels: Partial<EngineProfile>[] = [
    { experience: 'none', continuousRun: 'under_10m', recentWeeklyKm: 0 },
    { experience: 'under_6m', continuousRun: 'under_60m', recentWeeklyKm: 15 },
    { experience: 'over_2y', continuousRun: 'over_60m', recentWeeklyKm: 40 },
  ];
  for (const goalDistance of ['five_k', 'ten_k', 'half'] as const) {
    expect(levels.map((level) => run(level, { goalDistance })).map((result) => [result.level, result.options.length > 0])).toEqual([
      ['beginner', true], ['novice', true], ['intermediate', true],
    ]);
  }
});

test('AC-F03-05 같은 입력으로는 같은 계획이 나온다', () => {
  expect(run({}, { raceDate: '2027-02-14' })).toEqual(run({}, { raceDate: '2027-02-14' }));
});

test('TE-G02 대회가 있는 주는 가볍게 달리기만 두고 고점의 60% 아래로 줄인다', () => {
  const plan = option(run({}, { raceDate: '2027-01-24' }), 'race_prep');
  const weeks = [...byWeek(plan.sessions).values()];
  const raceWeek = weeks.at(-1) ?? [];
  expect(raceWeek.map((session) => session.type)).toEqual(['easy', 'easy', 'race']);
  const km = weeklyKm(plan);
  expect(km.at(-1)).toBeLessThanOrEqual(Math.max(...km.slice(-5, -1)) * PLAN.taper.raceWeek);
});

test('TE-G02 하프마라톤은 대회 전 주도 고점의 75% 아래로 줄인다', () => {
  const km = weeklyKm(option(run({ recentWeeklyKm: 30 }, { goalDistance: 'half', raceDate: '2027-02-07' }), 'race_prep'));
  expect(km.at(-2)).toBeLessThanOrEqual(Math.max(...km.slice(-6, -2)) * 0.75);
});

test('TE-G03 대회 날짜가 없으면 표준 기간으로 만든다', () => {
  expect((['five_k', 'ten_k', 'half'] as const).map((goalDistance) => option(run({ recentWeeklyKm: 40 }, { goalDistance }), 'base_building').totalWeeks)).toEqual([8, 10, 12]);
  expect(option(run(), 'base_building')).toMatchObject({ startDate: '2026-11-17', endDate: '2027-01-24' });
});

test('TE-G04 훈련은 선호 요일에만 두고 주당 횟수를 넘지 않는다', () => {
  const plan = option(run({ weeklyRunCount: 3, preferredWeekdays: [1, 2, 4, 6] }), 'base_building');
  expect(plan.sessions.every((session) => [1, 2, 4, 6].includes(weekday(session.date)))).toBe(true);
  expect([...byWeek(plan.sessions).values()].every((week) => week.length === 3)).toBe(true);
});

test('TE-G04 길게 달리기는 일요일, 없으면 토요일, 없으면 마지막 선호 요일에 둔다', () => {
  const longDays = (preferredWeekdays: number[]) => new Set(option(run({ preferredWeekdays }), 'base_building').sessions.filter((session) => session.type === 'long').map((session) => weekday(session.date)));
  expect(longDays([2, 4, 7])).toEqual(new Set([7]));
  expect(longDays([1, 3, 6])).toEqual(new Set([6]));
  expect(longDays([1, 3, 5])).toEqual(new Set([5]));
});

test('TE-G04 한 번이 2km보다 짧아지면 그 주의 횟수를 줄인다', () => {
  const weeks = [...byWeek(option(run({ recentWeeklyKm: 6, weeklyRunCount: 5, preferredWeekdays: [1, 2, 3, 4, 5, 6, 7] }, { goalDistance: 'five_k' }), 'base_building').sessions).values()];
  expect(weeks[0]?.map((session) => session.distanceKm)).toEqual([3, 3]);
});

test('AC-F03-06 TE-G05 최근 주간 거리가 0이거나 없거나 6km 미만이면 시간 기반 계획으로 시작한다', () => {
  for (const recentWeeklyKm of [null, 0, 5.9]) {
    const result = run({ recentWeeklyKm, continuousRun: 'under_10m' });
    expect(result.options.map((item) => item.kind)).toEqual(['base_building']);
    expect(result.options[0]?.sessions.every((session) => session.type === 'walk_run' && session.distanceKm === null && session.durationMin === 30)).toBe(true);
  }
  expect(option(run({ recentWeeklyKm: 6 }), 'base_building').sessions.every((session) => session.distanceKm !== null)).toBe(true);
});

test('TE-S14 한 번에 달리는 시간은 답한 범주에서 시작해 한 주에 한 단계 오른다', () => {
  const intervals = (continuousRun: EngineProfile['continuousRun']) =>
    [...byWeek(option(run({ recentWeeklyKm: 0, continuousRun }, { goalDistance: 'half' }), 'base_building').sessions).values()].map((week) => new Set(week.map((session) => session.runIntervalMin)));
  expect(intervals('under_10m').map((week) => [...week])).toEqual([[1], [2], [3], [5], [8], [10], [15], [20], [30], [30], [30], [30]]);
  expect(intervals('under_30m')[0]).toEqual(new Set([10]));
  expect(intervals('over_60m')[0]).toEqual(new Set([30]));
});

test('TE-S14 시간 기반 계획은 주 3회를 넘지 않는다', () => {
  const plan = option(run({ recentWeeklyKm: 0, weeklyRunCount: 5, preferredWeekdays: [1, 2, 3, 4, 5, 6] }), 'base_building');
  expect([...byWeek(plan.sessions).values()].every((week) => week.length === 3)).toBe(true);
});

test('TE-G06 도달 기준 거리에 닿으면 두 계획을 모두 만든다', () => {
  const result = run({ recentWeeklyKm: 12 });
  expect(result.options.map((item) => [item.kind, item.warnings])).toEqual([['race_prep', []], ['base_building', []]]);
  expect(Math.max(...option(result, 'race_prep').sessions.map((session) => session.distanceKm ?? 0))).toBeGreaterThanOrEqual(PLAN.reachKm.ten_k);
});

test('AC-F03-04 TE-G06 닿지 못하면 완주 준비 계획 없이 기초 훈련 계획과 이유만 준다', () => {
  expect(run({ recentWeeklyKm: 11.5 }).options.map((item) => [item.kind, item.warnings])).toEqual([['base_building', ['RACE_PREP_NOT_REACHABLE']]]);
});

test('TE-G06 기초 훈련 계획은 더 천천히 늘리고 조금 빠르게 달리기가 없다', () => {
  const result = run({ recentWeeklyKm: 12 });
  const peak = (kind: PlanOption['kind']) => Math.max(...weeklyKm(option(result, kind)));
  expect(peak('base_building')).toBeLessThan(peak('race_prep'));
  expect(option(result, 'base_building').sessions.some((session) => session.type === 'tempo')).toBe(false);
});

test('TE-G06 목표 기록이 무리하면 경고하고 계획은 달라지지 않는다', () => {
  const sessions = (result: ReturnType<typeof generate>) => result.options.map((item) => item.sessions);
  const plain = run({ recentPaceSecPerKm: 400 });
  // 10km 목표 페이스 359초는 최근 페이스 400초보다 10% 넘게 빠르다
  const fast = run({ recentPaceSecPerKm: 400 }, { goalTimeSec: 3590 });
  expect(fast.options.every((item) => item.warnings.includes('GOAL_TIME_TOO_FAST'))).toBe(true);
  expect(sessions(fast)).toEqual(sessions(plain));
  expect(run({ recentPaceSecPerKm: 400 }, { goalTimeSec: 3600 }).options.some((item) => item.warnings.includes('GOAL_TIME_TOO_FAST'))).toBe(false);
});

test('TE-G06 최근 기록이 없으면 목표 기록을 확인하지 못했다고 알린다', () => {
  expect(run({}, { goalTimeSec: 3600 }).options.every((item) => item.warnings.includes('GOAL_TIME_NOT_CHECKED'))).toBe(true);
});

test('TE-G07 대회가 표준 기간보다 멀면 앞은 늘리지 않는 유지 주간이다', () => {
  // 10km 표준 기간은 10주다. 14주 뒤 대회면 앞 4주는 유지한다
  const km = weeklyKm(option(run({ recentWeeklyKm: 30 }, { raceDate: '2027-02-21' }), 'race_prep'));
  expect(km).toHaveLength(14);
  expect(Math.max(...km.slice(0, 4))).toBeLessThanOrEqual(30);
  expect(Math.max(...km)).toBeGreaterThan(30);
});

test('TE-G07 도달에 주가 더 필요하면 늘리는 주를 앞당긴다', () => {
  // 주간 10km는 10주로는 8km에 닿지 못하지만 18주로는 닿는다
  expect(run({ recentWeeklyKm: 10 }).options.map((item) => item.kind)).toEqual(['base_building']);
  expect(run({ recentWeeklyKm: 10 }, { raceDate: '2027-03-21' }).options.map((item) => item.kind)).toContain('race_prep');
});

test('TE-G08 대회 당일은 대회 일정이고 전날은 쉰다', () => {
  const plan = option(run({ preferredWeekdays: [2, 4, 6, 7] }, { raceDate: '2027-01-24' }), 'base_building');
  expect(plan.sessions.at(-1)).toMatchObject({ date: '2027-01-24', type: 'race', distanceKm: 10 });
  expect(plan.sessions.some((session) => session.date === '2027-01-23')).toBe(false);
  expect(plan.endDate).toBe('2027-01-24');
});

test('TE-S08 대회가 월~수요일이면 그 전 주도 줄인다', () => {
  // 2027-01-26은 화요일이다
  const plan = option(run({}, { raceDate: '2027-01-26' }), 'base_building');
  const km = (week: number) => (byWeek(plan.sessions).get(week) ?? []).reduce((sum, session) => sum + (session.type === 'race' ? 0 : (session.distanceKm ?? 0)), 0);
  const last = plan.totalWeeks;
  expect(km(last)).toBe(0);
  expect(km(last - 1)).toBeLessThanOrEqual(Math.max(km(last - 2), km(last - 3), km(last - 4), km(last - 5)) * 0.75);
});

test('TE-G09 훈련은 오늘 뒤의 날짜에만 둔다', () => {
  for (const today of ['2026-11-15', '2026-11-16', '2026-11-18', '2026-11-21']) {
    expect(option(run({}, {}, today), 'base_building').sessions.every((session) => session.date > today)).toBe(true);
  }
});

test('TE-G09 정해진 요일이 하나라도 지났으면 다음 주 월요일부터 시작한다', () => {
  // 화·목·일 계획: 월요일에는 이번 주에, 화요일에는 다음 주에 시작한다
  expect(option(run({}, {}, '2026-11-16'), 'base_building').startDate).toBe('2026-11-17');
  expect(option(run({}, {}, '2026-11-17'), 'base_building').startDate).toBe('2026-11-24');
});

test('TE-S07 조금 빠르게 달리기는 초급 이상의 완주 준비 계획에, 길게 달리기와 떨어진 날에만 둔다', () => {
  const tempos = (p: Partial<EngineProfile>, kind: PlanOption['kind'] = 'race_prep') => option(run({ recentWeeklyKm: 20, ...p }), kind).sessions.filter((session) => session.type === 'tempo');
  expect(tempos({}).length).toBeGreaterThan(0);
  expect(tempos({}).every((session) => weekday(session.date) === 2 || weekday(session.date) === 4)).toBe(true);
  expect(tempos({ experience: 'none' })).toEqual([]);
  expect(tempos({ weeklyRunCount: 2 })).toEqual([]);
  // 월·토·일은 길게 달리기(일요일)와 이틀 이상 떨어진 날이 없다
  expect(tempos({ preferredWeekdays: [1, 6, 7] })).toEqual([]);
});

test('권장 페이스는 최근 페이스가 있을 때만 주고 최근 페이스보다 느리다', () => {
  expect(option(run(), 'race_prep').sessions.every((session) => session.paceRange === null)).toBe(true);
  const sessions = option(run({ recentPaceSecPerKm: 400 }), 'race_prep').sessions;
  expect(sessions.find((session) => session.type === 'easy')?.paceRange).toEqual({ minSecPerKm: 440, maxSecPerKm: 500 });
  expect(sessions.find((session) => session.type === 'tempo')?.paceRange).toEqual({ minSecPerKm: 400, maxSecPerKm: 420 });
});

test('AC-F03-07 TE-G06 목표 없음은 수준과 주간 거리에 관계없이 기초 훈련 계획 하나뿐이고 경고가 없다', () => {
  const levels: Partial<EngineProfile>[] = [
    { experience: 'none', continuousRun: 'under_10m', recentWeeklyKm: 0 },
    { experience: 'under_6m', continuousRun: 'under_60m', recentWeeklyKm: 12 },
    { experience: 'over_2y', continuousRun: 'over_60m', recentWeeklyKm: 50, recentPaceSecPerKm: 300 },
  ];
  for (const level of levels) {
    const { options } = run(level, { goalDistance: 'none' });
    expect(options.map((item) => [item.kind, item.warnings])).toEqual([['base_building', []]]);
    expect(options[0]?.sessions.some((session) => session.type === 'race' || session.type === 'tempo')).toBe(false);
  }
});

test('TE-G03 목표 없음은 대회 날짜 없이 표준 기간 9주로 만든다', () => {
  expect(option(run({ recentWeeklyKm: 20 }, { goalDistance: 'none' }), 'base_building').totalWeeks).toBe(9);
  expect(option(run({ recentWeeklyKm: 0 }, { goalDistance: 'none' }), 'base_building').totalWeeks).toBe(9);
});

test('F02-R07 목표 없음에 목표 기록이나 대회 날짜가 있으면 계획을 만들지 않는다', () => {
  expect(run({}, { goalDistance: 'none', goalTimeSec: 1800 }).options).toEqual([]);
  expect(run({}, { goalDistance: 'none', raceDate: '2027-01-10' }).options).toEqual([]);
});

test('입력이 맞지 않으면 계획을 만들지 않는다', () => {
  expect(run({ preferredWeekdays: [2, 4] }).options).toEqual([]);
  expect(run({ weeklyRunCount: 6, preferredWeekdays: [1, 2, 3, 4, 5, 6] }).options).toEqual([]);
  expect(run({}, { raceDate: SUNDAY }).options).toEqual([]);
  expect(run({}, {}, '2026-11-1').options).toEqual([]);
});

// 불변식: 어떤 입력으로 만든 계획이든 검증기를 통과하고 TE-G04, TE-G08, TE-G09를 지킨다.
const DAY0 = Date.parse('2026-01-01') / 86_400_000;
const date = (offset: number) => new Date((DAY0 + offset) * 86_400_000).toISOString().slice(0, 10);
const inputs: fc.Arbitrary<GenerateInput> = fc
  .record({
    experience: fc.constantFrom('none', 'under_6m', 'under_2y', 'over_2y'),
    continuousRun: fc.constantFrom('under_10m', 'under_30m', 'under_60m', 'over_60m'),
    recentWeeklyKm: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 1000 }).map((n) => n / 10)),
    recentPaceSecPerKm: fc.option(fc.integer({ min: 180, max: 900 }), { nil: null }),
    weekdays: fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 2, maxLength: 7 }),
    countSeed: fc.nat(),
    goalDistance: fc.constantFrom('five_k', 'ten_k', 'half', 'none'),
    goalTimeSec: fc.option(fc.integer({ min: 900, max: 14_400 }), { nil: null }),
    today: fc.integer({ min: 0, max: 730 }),
    raceIn: fc.option(fc.integer({ min: 1, max: 300 }), { nil: null }),
  } as const)
  .map(({ weekdays, countSeed, goalDistance, goalTimeSec, today, raceIn, ...rest }) => ({
    profile: { ...rest, preferredWeekdays: weekdays, weeklyRunCount: 2 + (countSeed % (Math.min(weekdays.length, 5) - 1)) },
    // 목표 없음에는 목표 기록과 대회 날짜가 없다(F02-R07)
    goal:
      goalDistance === 'none'
        ? { goalDistance, goalTimeSec: null, raceDate: null }
        : { goalDistance, goalTimeSec, raceDate: raceIn === null ? null : date(today + raceIn) },
    today: date(today),
  }));

test('AC-F03-02 불변식: 만들어진 모든 계획이 검증기를 통과한다', () => {
  fc.assert(
    fc.property(inputs, (input) => {
      const { level, profile: used, options } = generate(input);
      expect(used).toBe(input.profile);
      // 기초 훈련 계획은 언제나 만들 수 있어야 한다
      expect(options.some((item) => item.kind === 'base_building')).toBe(true);
      for (const plan of options) {
        if (input.goal.goalDistance === 'none') {
          expect(options.map((item) => [item.kind, item.warnings, item.totalWeeks])).toEqual([['base_building', [], PLAN.standardWeeks.none]]);
        }
        const sessions = plan.sessions.map((session, i) => ({ ...session, id: String(i), completed: false, skipped: false }));
        expect(validate({ plan: { ...plan, goal: input.goal, profile: input.profile, level, sessions }, today: input.today })).toEqual({ ok: true });
        const runs = plan.sessions.filter((session) => session.type !== 'race');
        expect(plan.sessions.every((session) => session.date > input.today)).toBe(true);
        expect(runs.every((session) => input.profile.preferredWeekdays.includes(weekday(session.date)))).toBe(true);
        expect([...byWeek(runs).values()].every((week) => week.length <= input.profile.weeklyRunCount)).toBe(true);
        if (input.goal.raceDate) {
          const dayBefore = new Date(Date.parse(input.goal.raceDate) - 86_400_000).toISOString().slice(0, 10);
          expect(plan.sessions.filter((session) => session.type === 'race').map((session) => session.date)).toEqual([input.goal.raceDate]);
          expect(plan.sessions.some((session) => session.date === dayBefore)).toBe(false);
        }
      }
      expect(generate(input)).toEqual({ level, profile: used, options });
    }),
    { numRuns: 1000 },
  );
}, 60_000);
