import type { PlanKind, PlanWarning, SessionType } from '@pacemate/shared';
import { classifyLevel } from './classify-level.js';
import { PLAN, SAFETY } from './safety-config.js';
import type { Continuation, EngineProfile, EngineSession, Generate, GenerateInput, PlanOption } from './types.js';
import { validate } from './validate.js';

// 값의 근거는 `docs/T-201-TRAINING-DRAFT.md` §10에 있다. 날짜는 1970-01-01부터의 일수로 계산한다.
const DAY_MS = 86_400_000;
const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
const toDay = (date: string) => Date.parse(date) / DAY_MS;
const toDate = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
// 1970-01-01이 목요일이다. 1(월)~7(일)
const weekdayOf = (day: number) => ((day + 3) % 7) + 1;
const mondayOf = (day: number) => day - (weekdayOf(day) - 1);
const floor1 = (km: number) => Math.floor(km * 10 + 1e-9) / 10;
const round1 = (km: number) => Math.round(km * 10) / 10;

type Count = keyof typeof PLAN.shares;
type Week = { count: Count; easyKm: number; longKm: number; grows: boolean; taper: boolean };

/** `anchor`를 포함해 훈련 사이 간격이 가장 넓은 요일을 고른다. 같으면 이른 요일이다. */
function pickDays(preferred: number[], count: number, anchor: number): number[] {
  const rest = preferred.filter((day) => day !== anchor);
  let best: { gap: number; days: number[] } | undefined;
  const search = (from: number, chosen: number[]) => {
    if (chosen.length === count - 1) {
      const days = [...chosen, anchor].sort((a, b) => a - b);
      const gap = Math.min(...days.map((day, i) => (days[i + 1] ?? (days[0] ?? day) + 7) - day));
      if (!best || gap > best.gap) best = { gap, days };
      return;
    }
    for (let i = from; i < rest.length; i++) search(i + 1, [...chosen, rest[i] as number]);
  };
  search(0, []);
  return best?.days ?? [anchor];
}

/** `easy` 한 번이 최소 거리보다 짧아지면 횟수를 줄인다. */
function countFor(peakKm: number, userCount: number): Count {
  let count = userCount;
  while (count > PLAN.minSessionsPerWeek && peakKm * PLAN.shares[count as Count].easy < PLAN.minSessionKm) count--;
  return count as Count;
}

/**
 * 주마다의 횟수와 거리. `taper`는 마지막 주부터 거꾸로 센 조정 주의 비율이다.
 * 다음 주의 기준은 검증기와 같이 최근 4주의 내림한 실제 값이다. 목표값을 기준으로 하면 내림이 쌓여 한도를 넘는다.
 */
function distanceWeeks(recentKm: number, userCount: number, kind: Exclude<PlanKind, 'maintenance'>, totalWeeks: number, taper: number[], maintainWeeks: number): Week[] {
  const weeks: Week[] = [];
  const totals: number[] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const peak = Math.max(...Array.from({ length: SAFETY.peakWeeks }, (_, i) => totals[w - 1 - i] ?? recentKm));
    const peakLong = Math.max(0, ...weeks.slice(-SAFETY.peakWeeks).map((week) => week.longKm));
    const position = w % PLAN.cycleWeeks;
    const taperFactor = taper[totalWeeks - 1 - w];
    // 회복 주 다음 주(주기의 첫 주)는 고점으로 복귀만 한다(TE-S01)
    const grows = taperFactor === undefined && position !== 0 && position !== PLAN.cycleWeeks - 1 && w >= maintainWeeks;
    const factor = taperFactor ?? (position === PLAN.cycleWeeks - 1 ? PLAN.recoveryFactor : 1);
    const count = countFor(peak, userCount);
    const target = peak * (grows ? 1 + PLAN.weeklyIncrease[kind] : 1) * factor;
    let longKm = floor1(target * PLAN.shares[count].long);
    // 한 번의 거리는 최근 최장 거리의 110%까지다(TE-S13)
    if (weeks.length > 0) longKm = Math.min(longKm, floor1(peakLong * (grows ? SAFETY.singleRunIncrease : 1) * factor));
    const easyKm = Math.min(floor1(target * PLAN.shares[count].easy), longKm);
    totals.push(round1(easyKm * (count - 1) + longKm));
    weeks.push({ count, easyKm, longKm, grows, taper: taperFactor !== undefined });
  }
  return weeks;
}

const reachOf = (weeks: Week[]) => Math.max(0, ...weeks.filter((week) => !week.taper).map((week) => week.longKm));

function build({ profile, goal, today }: GenerateInput, kind: Exclude<PlanKind, 'maintenance'>): Omit<PlanOption, 'warnings'> | null {
  const level = classifyLevel(profile);
  const t = toDay(today);
  const race = goal.raceDate === null ? null : toDay(goal.raceDate);
  if (race !== null && race <= t) return null;
  const preferred = [...profile.preferredWeekdays].sort((a, b) => a - b);
  const recentKm = profile.recentWeeklyKm;
  const timeBased = recentKm === null || recentKm < PLAN.distanceBasedMinWeeklyKm;
  // 시간 기반으로 시작하는 계획은 항상 기초 훈련 계획이다
  if (timeBased && kind === 'race_prep') return null;

  const userCount = timeBased ? Math.min(profile.weeklyRunCount, PLAN.timeBased.maxSessionsPerWeek) : profile.weeklyRunCount;
  const longDay = preferred.includes(7) ? 7 : preferred.includes(6) ? 6 : (preferred.at(-1) as number);
  const daysFor = (count: number) => pickDays(preferred, count, longDay);

  // 첫 주에 훈련이 일부만 있으면 그 주가 기준이 되어 둘째 주가 TE-S13, TE-S14에 걸린다.
  // 정해진 요일이 모두 내일 이후일 때만 이번 주에 시작한다(TE-G09). 대회가 이번 주면 이번 주다.
  const thisWeek = mondayOf(t);
  const firstDays = daysFor(timeBased ? userCount : countFor(recentKm, userCount));
  const raceThisWeek = race !== null && mondayOf(race) === thisWeek;
  const start = raceThisWeek || firstDays.every((day) => thisWeek + day - 1 > t) ? thisWeek : thisWeek + 7;
  const totalWeeks = race === null ? PLAN.standardWeeks[goal.goalDistance] : (mondayOf(race) - start) / 7 + 1;

  const sessions: EngineSession[] = [];
  const pace = (type: 'easy' | 'long' | 'tempo') => {
    if (profile.recentPaceSecPerKm === null) return null;
    const [fast, slow] = PLAN.pace[type];
    return { minSecPerKm: Math.round(profile.recentPaceSecPerKm * fast), maxSecPerKm: Math.round(profile.recentPaceSecPerKm * slow) };
  };
  const add = (day: number, type: SessionType, session: Partial<EngineSession>) =>
    sessions.push({ date: toDate(day), type, distanceKm: null, durationMin: null, paceRange: null, runIntervalMin: null, weekNumber: (mondayOf(day) - start) / 7 + 1, ...session });
  // 오늘은 훈련을 두지 않는다(TE-G09). 대회 전날은 쉰다(TE-G08)
  const open = (day: number) => day > t && (race === null || day < race - 1);

  if (timeBased) {
    const { runIntervalLadder: ladder, startRunInterval, sessionMin } = PLAN.timeBased;
    const startStep = ladder.indexOf(startRunInterval[profile.continuousRun]);
    for (let w = 0; w < totalWeeks; w++) {
      const runIntervalMin = ladder[Math.min(startStep + w, ladder.length - 1)] as number;
      for (const weekday of firstDays) {
        const day = start + w * 7 + weekday - 1;
        if (open(day)) add(day, 'walk_run', { durationMin: sessionMin, runIntervalMin });
      }
    }
  } else {
    // 목표 없음은 대회가 없어 조정 주가 없고, 도달 거리를 비교하지 않는다(TE-G06)
    const distance = goal.goalDistance === 'none' ? null : goal.goalDistance;
    const before = distance === null ? null : PLAN.taper.weekBefore[distance];
    // 대회가 월~수요일이면 그 전 주도 대회가 있는 주처럼 줄인다(TE-S08)
    const early = race !== null && weekdayOf(race) <= SAFETY.taperPreviousWeekUntilWeekday;
    const taper = race === null ? [] : [PLAN.taper.raceWeek, ...(early ? [PLAN.taper.raceWeek] : []), ...(before === null ? [] : [before])];
    const weeksWith = (maintain: number) => distanceWeeks(recentKm, userCount, kind, totalWeeks, taper, maintain);
    // 대회가 표준 기간보다 멀면 앞은 유지 주간으로 채우되, 도달에 필요한 만큼은 늘리는 주로 쓴다(TE-G07)
    let maintain = Math.max(0, totalWeeks - PLAN.standardWeeks[goal.goalDistance]);
    if (kind === 'race_prep') {
      if (distance === null) return null;
      const reach = PLAN.reachKm[distance];
      while (maintain > 0 && reachOf(weeksWith(maintain)) < reach) maintain--;
      if (reachOf(weeksWith(maintain)) < reach) return null;
    }
    const weeks = weeksWith(maintain);

    weeks.forEach((week, w) => {
      const days = daysFor(week.count);
      const raceWeek = race !== null && mondayOf(race) === start + w * 7;
      const gap = (weekday: number) => Math.min(Math.abs(weekday - longDay), 7 - Math.abs(weekday - longDay));
      const tempoDay =
        kind === 'race_prep' && level !== 'beginner' && week.grows && week.count >= SAFETY.minSessionsForTempo
          ? days.find((weekday) => weekday !== longDay && gap(weekday) >= PLAN.tempoMinGapDays)
          : undefined;
      for (const weekday of days) {
        const day = start + w * 7 + weekday - 1;
        if (!open(day)) continue;
        // 대회가 있는 주에는 가볍게 달리기만 둔다
        const type = weekday === longDay && !raceWeek ? 'long' : weekday === tempoDay ? 'tempo' : 'easy';
        add(day, type, { distanceKm: type === 'long' ? week.longKm : week.easyKm, paceRange: pace(type) });
      }
    });
  }
  if (race !== null && goal.goalDistance !== 'none') add(race, 'race', { distanceKm: PLAN.raceKm[goal.goalDistance] });

  const first = sessions[0];
  if (!first) return null;
  const option = {
    kind,
    startDate: first.date,
    endDate: goal.raceDate ?? toDate(start + totalWeeks * 7 - 1),
    totalWeeks,
    sessions,
  };
  // 검증기를 통과하지 못한 계획은 제안하지 않는다(TE-S12)
  const state = { ...option, goal, profile, level, sessions: sessions.map((session, i) => ({ ...session, id: String(i), completed: false, skipped: false })) };
  return validate({ plan: state, today }).ok ? option : null;
}

/** 목표 기록은 경고만 만든다. 계획의 훈련량과 강도는 달라지지 않는다(TE-G06). */
function goalTimeWarnings({ profile, goal }: GenerateInput): PlanWarning[] {
  if (goal.goalTimeSec === null || goal.goalDistance === 'none') return [];
  if (profile.recentPaceSecPerKm === null) return ['GOAL_TIME_NOT_CHECKED'];
  const goalPace = goal.goalTimeSec / PLAN.raceKm[goal.goalDistance];
  return goalPace < profile.recentPaceSecPerKm * (1 - PLAN.goalPaceWarning[goal.goalDistance]) ? ['GOAL_TIME_TOO_FAST'] : [];
}

function isValid({ profile, goal, today }: GenerateInput): boolean {
  const days = profile.preferredWeekdays;
  const count = profile.weeklyRunCount;
  return (
    isDate(today) &&
    (goal.raceDate === null || isDate(goal.raceDate)) &&
    // 목표 없음에는 목표 기록과 대회 날짜가 없다(F02-R07)
    (goal.goalDistance !== 'none' || (goal.raceDate === null && goal.goalTimeSec === null)) &&
    Number.isInteger(count) && count >= PLAN.minSessionsPerWeek && count in PLAN.shares &&
    days.length >= count && new Set(days).size === days.length && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  );
}

/**
 * 유지 계획의 시작 주간 거리(TE-G10). 이번 주 전 `recentWeeks`주의 주마다 계획 거리와 기록 거리 중 적은 쪽을 평균한다.
 * 대회 당일 기록은 빼고, 계획에 거리 기반 훈련이 없던 주(계획이 끝난 뒤)는 기록만 본다.
 */
function recentWeeklyKm({ ended, workouts }: Continuation, today: number): number {
  const { recentWeeks } = PLAN.maintenance;
  const race = ended.raceDate === null ? null : toDay(ended.raceDate);
  let total = 0;
  for (let i = 1; i <= recentWeeks; i++) {
    const from = mondayOf(today) - 7 * i;
    const inWeek = (date: string) => toDay(date) >= from && toDay(date) <= from + 6 && toDay(date) < today;
    const planned = ended.sessions.filter((session) => inWeek(session.date) && session.type !== 'race' && session.distanceKm !== null);
    const done = workouts.filter((workout) => inWeek(workout.date) && toDay(workout.date) !== race).reduce((sum, workout) => sum + workout.distanceKm, 0);
    total += planned.length === 0 ? done : Math.min(planned.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0), done);
  }
  return floor1(total / recentWeeks);
}

/** 유지 계획(F03-R10, TE-G10). 훈련량을 늘리지 않고, 조금 빠르게 달리기와 회복 주가 없다. */
function buildMaintenance({ profile, today }: GenerateInput, continuation: Continuation): { option: Omit<PlanOption, 'warnings'>; profile: EngineProfile } | null {
  const level = classifyLevel(profile);
  const t = toDay(today);
  const { ended } = continuation;
  const { weeks: totalWeeks, postRaceDays, postRaceFactor } = PLAN.maintenance;
  const preferred = [...profile.preferredWeekdays].sort((a, b) => a - b);
  const lastRun = ended.sessions.filter((session) => session.type !== 'race').sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const baseKm = recentWeeklyKm(continuation, t);
  // 시간 기반으로 끝난 계획은 시간 기반으로 잇는다. 최근 훈련량이 적어도 시간 기반이다(TE-G05)
  const timeBased = (lastRun !== undefined && lastRun.distanceKm === null) || baseKm < PLAN.distanceBasedMinWeeklyKm;
  const doneInterval = ended.sessions.filter((session) => session.completed && session.runIntervalMin !== null).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.runIntervalMin ?? null;
  const used: EngineProfile = { ...profile, recentWeeklyKm: baseKm, recentRunIntervalMin: timeBased ? doneInterval : null };

  const userCount = timeBased ? Math.min(profile.weeklyRunCount, PLAN.timeBased.maxSessionsPerWeek) : profile.weeklyRunCount;
  const longDay = preferred.includes(7) ? 7 : preferred.includes(6) ? 6 : (preferred.at(-1) as number);
  const daysFor = (count: number) => pickDays(preferred, count, longDay);
  const thisWeek = mondayOf(t);
  const firstDays = daysFor(timeBased ? userCount : countFor(baseKm, userCount));
  const start = firstDays.every((day) => thisWeek + day - 1 > t) ? thisWeek : thisWeek + 7;

  const race = ended.raceDate === null || ended.goalDistance === 'none' ? null : toDay(ended.raceDate);
  const postRace = race !== null && race < t && start - race <= postRaceDays;
  // 입문 수준은 대회 뒤 첫 주를 쉬고, 다음 주를 줄여서 시작한다
  const restWeek = postRace && level === 'beginner' ? 0 : null;
  const reducedWeek = postRace ? (restWeek === null ? 0 : 1) : null;

  const sessions: EngineSession[] = [];
  const add = (day: number, type: EngineSession['type'], session: Partial<EngineSession>) =>
    sessions.push({ date: toDate(day), type, distanceKm: null, durationMin: null, paceRange: null, runIntervalMin: null, weekNumber: (mondayOf(day) - start) / 7 + 1, ...session });
  const pace = () => {
    if (profile.recentPaceSecPerKm === null) return null;
    const [fast, slow] = PLAN.pace.easy;
    return { minSecPerKm: Math.round(profile.recentPaceSecPerKm * fast), maxSecPerKm: Math.round(profile.recentPaceSecPerKm * slow) };
  };

  if (timeBased) {
    // 한 번에 달리는 시간을 늘리지 않는다. 마친 훈련이 없으면 답한 범주의 시작 단계다(TE-S14)
    const runIntervalMin = doneInterval ?? PLAN.timeBased.startRunInterval[profile.continuousRun];
    for (let w = 0; w < totalWeeks; w++) {
      if (w === restWeek) continue;
      for (const weekday of firstDays) add(start + w * 7 + weekday - 1, 'walk_run', { durationMin: PLAN.timeBased.sessionMin, runIntervalMin });
    }
  } else {
    let previous: { target: number; longKm: number } | null = null;
    for (let w = 0; w < totalWeeks; w++) {
      if (w === restWeek) continue;
      const factor = w === reducedWeek && ended.goalDistance !== 'none' ? postRaceFactor[ended.goalDistance] : 1;
      // 줄인 주 다음에는 한 번의 거리가 최근 최장 거리의 110%를 넘지 않게 되돌린다(TE-S13)
      const target: number = previous === null ? baseKm * factor : Math.min(baseKm, previous.target * SAFETY.singleRunIncrease);
      const count = countFor(target, userCount);
      let longKm = floor1(target * PLAN.shares[count].long);
      if (previous !== null) longKm = Math.min(longKm, floor1(previous.longKm * SAFETY.singleRunIncrease));
      const easyKm = Math.min(floor1(target * PLAN.shares[count].easy), longKm);
      for (const weekday of daysFor(count)) {
        const type = weekday === longDay ? 'long' : 'easy';
        add(start + w * 7 + weekday - 1, type, { distanceKm: type === 'long' ? longKm : easyKm, paceRange: pace() });
      }
      previous = { target, longKm };
    }
  }

  const first = sessions[0];
  if (!first) return null;
  const option = { kind: 'maintenance' as const, startDate: first.date, endDate: toDate(start + totalWeeks * 7 - 1), totalWeeks, sessions };
  const goal = { goalDistance: 'none' as const, goalTimeSec: null, raceDate: null };
  const state = { ...option, goal, profile: used, level, sessions: sessions.map((session, i) => ({ ...session, id: String(i), completed: false, skipped: false })) };
  return validate({ plan: state, today }).ok ? { option, profile: used } : null;
}

export const generate: Generate = (input) => {
  const level = classifyLevel(input.profile);
  if (!isValid(input)) return { level, profile: input.profile, options: [] };
  if (input.continuation) {
    // 유지 계획은 목표 없음으로만 만든다(F03-R10)
    const built = input.goal.goalDistance === 'none' ? buildMaintenance(input, input.continuation) : null;
    return built ? { level, profile: built.profile, options: [{ ...built.option, warnings: [] }] } : { level, profile: input.profile, options: [] };
  }
  // 목표 없음은 기초 훈련 계획 하나뿐이고 경고가 없다(F03-R09, TE-G06)
  if (input.goal.goalDistance === 'none') {
    const base = build(input, 'base_building');
    return { level, profile: input.profile, options: base ? [{ ...base, warnings: [] }] : [] };
  }
  const warnings = goalTimeWarnings(input);
  const racePrep = build(input, 'race_prep');
  const base = build(input, 'base_building');
  const options: PlanOption[] = [];
  if (racePrep) options.push({ ...racePrep, warnings });
  // 완주 준비 계획을 만들 수 없으면 기초 훈련 계획에 이유를 넣는다(F03-R06)
  if (base) options.push({ ...base, warnings: racePrep ? warnings : ['RACE_PREP_NOT_REACHABLE', ...warnings] });
  return { level, profile: input.profile, options };
};
