import fc from 'fast-check';
import { expect, test } from 'vitest';
import { generate } from './generate.js';
import { PLAN, SAFETY } from './safety-config.js';
import type { Continuation, EngineProfile, EngineSession, GenerateInput, PlanOption } from './types.js';
import { validate } from './validate.js';

// 2026-11-15는 일요일이다. 최근 4주는 10/12, 10/19, 10/26, 11/2로 시작하는 주이고, 유지 계획은 11/16(월)에 시작한다.
const TODAY = '2026-11-15';
const RECENT_MONDAYS = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
const DAY_MS = 86_400_000;
const plus = (date: string, days: number) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

const profile = (over: Partial<EngineProfile> = {}): EngineProfile => ({
  experience: 'under_2y', continuousRun: 'under_60m', recentWeeklyKm: 20, recentPaceSecPerKm: null, weeklyRunCount: 3, preferredWeekdays: [2, 4, 7], ...over,
});
const NO_GOAL = { goalDistance: 'none', goalTimeSec: null, raceDate: null } as const;

type Ended = Continuation['ended'];
/** 주마다 화·목에 `easy`, 일에 `long`을 둔 거리 기반 계획. `weeks`는 주간 거리다(easy 25%씩, long 50%) */
const distancePlan = (weeks: number[], completed = true): Ended['sessions'] =>
  weeks.flatMap((km, i) => {
    const monday = RECENT_MONDAYS[i] as string;
    const session = (offset: number, type: 'easy' | 'long', distanceKm: number) => ({
      date: plus(monday, offset), type, distanceKm, durationMin: null, runIntervalMin: null, completed,
    });
    return [session(1, 'easy', km / 4), session(3, 'easy', km / 4), session(6, 'long', km / 2)];
  });
/** 계획의 훈련을 그대로 달린 기록. `scale`배로 달린 것으로 바꿀 수 있다 */
const workoutsOf = (sessions: Ended['sessions'], scale = 1) => sessions.filter((session) => session.distanceKm !== null).map((session) => ({ date: session.date, distanceKm: (session.distanceKm ?? 0) * scale }));

const input = (continuation: Continuation, p: Partial<EngineProfile> = {}, today = TODAY): GenerateInput => ({ profile: profile(p), goal: NO_GOAL, today, continuation });
const continued = (ended: Partial<Ended> & Pick<Ended, 'sessions'>, workouts = workoutsOf(ended.sessions)): Continuation => ({
  ended: { goalDistance: 'ten_k', raceDate: null, ...ended }, workouts,
});
const only = (result: ReturnType<typeof generate>): PlanOption => {
  expect(result.options).toHaveLength(1);
  return result.options[0] as PlanOption;
};
const weeklyKm = (plan: PlanOption) => {
  const weeks = new Map<number, number>();
  for (const session of plan.sessions) weeks.set(session.weekNumber, (weeks.get(session.weekNumber) ?? 0) + (session.distanceKm ?? 0));
  return Array.from({ length: plan.totalWeeks }, (_, i) => Math.round((weeks.get(i + 1) ?? 0) * 10) / 10);
};
const longs = (sessions: EngineSession[]) => sessions.filter((session) => session.type === 'long').map((session) => session.distanceKm);

test('AC-F03-08 TE-G10 유지 계획은 4주이고 주간 거리가 늘지 않으며 경고가 없다', () => {
  const sessions = distancePlan([20, 20, 20, 20]);
  const result = generate(input(continued({ sessions })));
  const plan = only(result);

  expect(plan).toMatchObject({ kind: 'maintenance', totalWeeks: PLAN.maintenance.weeks, startDate: '2026-11-17', endDate: '2026-12-13', warnings: [] });
  const km = weeklyKm(plan);
  expect(km.every((week) => week <= 20)).toBe(true);
  expect(new Set(km).size).toBe(1);
  // 조금 빠르게 달리기를 두지 않는다
  expect(plan.sessions.every((session) => session.type === 'easy' || session.type === 'long')).toBe(true);
  const sessionsState = plan.sessions.map((session, i) => ({ ...session, id: String(i), completed: false, skipped: false }));
  expect(validate({ plan: { ...plan, goal: NO_GOAL, profile: result.profile, level: result.level, sessions: sessionsState }, today: TODAY })).toEqual({ ok: true });
});

test('TE-G10 시작 훈련량은 최근 4주의 주마다 계획과 기록 중 적은 쪽의 평균이다', () => {
  // 계획 24km의 주를 절반만 달렸으면 12km로 센다. 대회 전 감량 주(12km)도 평균에 들어간다
  const sessions = distancePlan([24, 24, 24, 12]);
  const workouts = [...workoutsOf(sessions.slice(0, 9), 0.5), ...workoutsOf(sessions.slice(9))];
  const result = generate(input(continued({ sessions }, workouts)));
  expect(result.profile.recentWeeklyKm).toBe(12);
  expect(Math.max(...weeklyKm(only(result)))).toBeLessThanOrEqual(12);

  // 계획보다 많이 달려도 계획 거리까지만 센다
  expect(generate(input(continued({ sessions: distancePlan([20, 20, 20, 20]) }, workoutsOf(distancePlan([20, 20, 20, 20]), 2)))).profile.recentWeeklyKm).toBe(20);
});

test('TE-G10 끝난 계획의 마지막 주가 아니라 최근 4주를 보고, 계획이 끝난 뒤 쉰 주는 0으로 센다', () => {
  // 10/26 주에 계획이 끝났고 그 뒤 두 주를 쉬었다
  const sessions = distancePlan([20, 20]);
  expect(generate(input(continued({ sessions }))).profile.recentWeeklyKm).toBe(10);
  // 계획이 끝난 뒤에 혼자 달린 기록은 그대로 센다
  const after = [{ date: '2026-10-27', distanceKm: 10 }, { date: '2026-11-03', distanceKm: 10 }];
  expect(generate(input(continued({ sessions }, [...workoutsOf(sessions), ...after]))).profile.recentWeeklyKm).toBe(15);
  // 4주보다 오래된 기록과 오늘 기록은 세지 않는다
  expect(generate(input(continued({ sessions }, [...workoutsOf(sessions), { date: '2026-10-05', distanceKm: 40 }, { date: TODAY, distanceKm: 40 }]))).profile.recentWeeklyKm).toBe(10);
});

test('TE-G10 대회 당일 기록은 시작 훈련량에 넣지 않는다', () => {
  const sessions = [...distancePlan([20, 20, 20, 8]), { date: '2026-11-08', type: 'race' as const, distanceKm: 10, durationMin: null, runIntervalMin: null, completed: true }];
  const result = generate(input(continued({ sessions, raceDate: '2026-11-08' }, [...workoutsOf(sessions.filter((session) => session.type !== 'race' && session.date !== '2026-11-08')), { date: '2026-11-08', distanceKm: 10 }])));
  // 11/8은 일요일 long 자리이기도 하다. 그날 기록은 모두 빠져 마지막 주는 화·목 4km만 남는다
  expect(result.profile.recentWeeklyKm).toBe(16);
});

test('TE-G10 대회 뒤 14일 안에 시작하면 첫 주를 대회 거리별로 줄이고, 한 번 거리를 10%씩만 되돌린다', () => {
  const sessions = distancePlan([30, 30, 30, 30]);
  for (const goalDistance of ['five_k', 'ten_k', 'half'] as const) {
    const plan = only(generate(input(continued({ sessions, goalDistance, raceDate: '2026-11-08' }))));
    const km = weeklyKm(plan);
    expect(km[0]).toBeLessThanOrEqual(30 * PLAN.maintenance.postRaceFactor[goalDistance]);
    expect(km.every((week) => week <= 30)).toBe(true);
    const long = longs(plan.sessions) as number[];
    long.slice(1).forEach((value, i) => expect(value).toBeLessThanOrEqual((long[i] as number) * SAFETY.singleRunIncrease + 1e-9));
  }
});

test('TE-G10 입문 수준은 대회 뒤 첫 주를 쉬는 주로 둔다', () => {
  const sessions = distancePlan([12, 12, 12, 12]);
  const plan = only(generate(input(continued({ sessions, goalDistance: 'five_k', raceDate: '2026-11-08' }), { experience: 'none' })));
  expect(plan.totalWeeks).toBe(4);
  expect(plan.sessions.some((session) => session.weekNumber === 1)).toBe(false);
  expect(plan.startDate).toBe('2026-11-24');
  expect(weeklyKm(plan)[1]).toBeLessThanOrEqual(12 * PLAN.maintenance.postRaceFactor.five_k);
});

test('TE-G10 대회 뒤 14일이 지났거나 목표 없음 계획에 이으면 첫 주를 줄이지 않는다', () => {
  const sessions = distancePlan([20, 20, 20, 20]);
  // 10/25 대회 날 기록은 빠져 시작 훈련량은 17.5km다. 줄이는 주 없이 4주가 같다
  const late = weeklyKm(only(generate(input(continued({ sessions, goalDistance: 'half', raceDate: '2026-10-25' })))));
  expect(new Set(late).size).toBe(1);
  expect(late[0]).toBeGreaterThan(17.5 * PLAN.maintenance.postRaceFactor.half);
  expect(weeklyKm(only(generate(input(continued({ sessions, goalDistance: 'none' })))))).toEqual([20, 20, 20, 20]);
});

test('TE-G10 TE-S14 시간 기반으로 끝난 계획에 이으면 마지막으로 마친 단계를 늘리지 않고 이어 간다', () => {
  const walk = (date: string, runIntervalMin: number, completed: boolean) => ({ date, type: 'walk_run' as const, distanceKm: null, durationMin: 30, runIntervalMin, completed });
  // 20분 단계까지 계획했지만 마지막으로 마친 훈련은 15분 단계다
  const sessions = [walk('2026-10-27', 15, true), walk('2026-10-29', 15, true), walk('2026-11-03', 20, false), walk('2026-11-05', 20, false)];
  const result = generate(input(continued({ sessions, goalDistance: 'five_k' }, [{ date: '2026-10-27', distanceKm: 3 }]), { continuousRun: 'under_10m' }));
  const plan = only(result);
  expect(plan.sessions.every((session) => session.type === 'walk_run' && session.runIntervalMin === 15 && session.durationMin === PLAN.timeBased.sessionMin)).toBe(true);
  expect(plan.sessions.filter((session) => session.weekNumber === 1)).toHaveLength(3);
  expect(result.profile.recentRunIntervalMin).toBe(15);

  // 마친 훈련이 없으면 답한 범주의 시작 단계다
  const none = only(generate(input(continued({ sessions: sessions.map((session) => ({ ...session, completed: false })) }, []), { continuousRun: 'under_10m' })));
  expect(new Set(none.sessions.map((session) => session.runIntervalMin))).toEqual(new Set([PLAN.timeBased.startRunInterval.under_10m]));
});

test('TE-G05 TE-G10 최근 훈련량이 6km보다 적으면 시간 기반 유지 계획이다', () => {
  const sessions = distancePlan([20, 20, 20, 20]);
  const plan = only(generate(input(continued({ sessions }, [{ date: '2026-11-03', distanceKm: 5 }]))));
  expect(plan.sessions.every((session) => session.type === 'walk_run' && session.distanceKm === null)).toBe(true);
});

test('F03-R10 유지 계획은 목표 없음으로만 만든다', () => {
  const sessions = distancePlan([20, 20, 20, 20]);
  expect(generate({ ...input(continued({ sessions })), goal: { goalDistance: 'five_k', goalTimeSec: null, raceDate: null } }).options).toEqual([]);
});

test('AC-F03-05 같은 입력으로는 같은 유지 계획이 나온다', () => {
  const value = input(continued({ sessions: distancePlan([20, 22, 18, 10]), goalDistance: 'half', raceDate: '2026-11-08' }));
  expect(generate(value)).toEqual(generate(value));
});

const date = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const randomInputs = fc
  .record({
    today: fc.integer({ min: 20_400, max: 20_800 }),
    experience: fc.constantFrom('none', 'under_6m', 'under_2y', 'over_2y'),
    continuousRun: fc.constantFrom('under_10m', 'under_30m', 'under_60m', 'over_60m'),
    days: fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 2, maxLength: 7 }),
    count: fc.integer({ min: 2, max: 5 }),
    goalDistance: fc.constantFrom('five_k', 'ten_k', 'half', 'none'),
    raceAgo: fc.option(fc.integer({ min: 1, max: 30 }), { nil: null }),
    timeBased: fc.boolean(),
    weeks: fc.array(fc.option(fc.double({ min: 4, max: 70, noNaN: true }), { nil: null }), { minLength: 4, maxLength: 4 }),
    done: fc.array(fc.double({ min: 0, max: 1.5, noNaN: true }), { minLength: 4, maxLength: 4 }),
    interval: fc.constantFrom(...PLAN.timeBased.runIntervalLadder),
  })
  .filter(({ days, count }) => days.length >= count)
  .map((r): GenerateInput => {
    const monday = r.today - (((r.today + 3) % 7) + 1 - 1);
    const sessions: Ended['sessions'] = [];
    const workouts: Continuation['workouts'] = [];
    r.weeks.forEach((km, i) => {
      if (km === null) return;
      const start = monday - 7 * (4 - i);
      for (const offset of [1, 3, 6]) {
        const day = start + offset;
        if (day >= r.today) continue;
        const distanceKm = r.timeBased ? null : Math.round(km * (offset === 6 ? 0.5 : 0.25) * 10) / 10;
        const completed = (r.done[i] ?? 0) > 0.5;
        sessions.push({ date: date(day), type: r.timeBased ? 'walk_run' : offset === 6 ? 'long' : 'easy', distanceKm, durationMin: r.timeBased ? 30 : null, runIntervalMin: r.timeBased ? r.interval : null, completed });
        workouts.push({ date: date(day), distanceKm: Math.round((distanceKm ?? 3) * (r.done[i] ?? 0) * 10) / 10 });
      }
    });
    return {
      profile: { experience: r.experience, continuousRun: r.continuousRun, recentWeeklyKm: 20, recentPaceSecPerKm: null, weeklyRunCount: r.count, preferredWeekdays: r.days },
      goal: NO_GOAL,
      today: date(r.today),
      continuation: { ended: { goalDistance: r.goalDistance, raceDate: r.raceAgo === null || r.goalDistance === 'none' ? null : date(r.today - r.raceAgo), sessions }, workouts },
    };
  });

test('AC-F03-08 불변식: 유지 계획은 검증기를 통과하고, 4주이며, 시작 훈련량을 넘지 않는다', () => {
  fc.assert(
    fc.property(randomInputs, (value) => {
      const result = generate(value);
      for (const plan of result.options) {
        expect(plan).toMatchObject({ kind: 'maintenance', totalWeeks: PLAN.maintenance.weeks, warnings: [] });
        const sessions = plan.sessions.map((session, i) => ({ ...session, id: String(i), completed: false, skipped: false }));
        expect(validate({ plan: { ...plan, goal: NO_GOAL, profile: result.profile, level: result.level, sessions }, today: value.today })).toEqual({ ok: true });
        expect(weeklyKm(plan).every((km) => km <= (result.profile.recentWeeklyKm ?? 0) + 1e-9)).toBe(true);
        const intervals = plan.sessions.map((session) => session.runIntervalMin).filter((min) => min !== null);
        expect(new Set(intervals).size).toBeLessThanOrEqual(1);
        expect(plan.sessions.every((session) => session.date > value.today && value.profile.preferredWeekdays.includes(((Date.parse(session.date) / DAY_MS + 3) % 7) + 1))).toBe(true);
        expect(plan.sessions.every((session) => session.type !== 'tempo' && session.type !== 'race')).toBe(true);
      }
      expect(generate(value)).toEqual(result);
    }),
    { numRuns: 1000 },
  );
}, 60_000);

test('유지 계획은 어떤 입력에서도 만들 수 있다', () => {
  fc.assert(
    fc.property(randomInputs, (value) => {
      expect(generate(value).options).toHaveLength(1);
    }),
    { numRuns: 500 },
  );
}, 60_000);
