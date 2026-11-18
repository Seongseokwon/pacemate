import type { PlanSessionState, PlanState, SafetyRuleId, Validate } from './types.js';
import { SAFETY } from './safety-config.js';

// 형식을 먼저 확인한다. 형식이 다른 날짜 문자열은 실행 환경의 시간대로 해석될 수 있다(TE-R09).
const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
const dayOf = (date: string) => Date.parse(date) / 86_400_000;
// 1970-01-01이 목요일이라 3을 더해 월요일을 주의 시작으로 맞춘다(PRD §1.5).
const weekOf = (date: string) => Math.floor((dayOf(date) + 3) / 7);
// 소수 계산의 오차로 경계값이 위반이 되지 않게 한다.
const exceeds = (value: number, limit: number) => value > limit + 1e-9;
const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
// 대회 일정도 "높음"으로 본다(TE-S04).
const isHard = (session: PlanSessionState) => session.type === 'tempo' || session.type === 'long' || session.type === 'race';

// 주는 입력의 `weekNumber`가 아니라 날짜로 계산한다(ARCHITECTURE §6). 생략한 훈련은 넣지 않는다.
const byWeek = (plan: PlanState) => {
  const active = plan.sessions.filter((session) => !session.skipped).sort((a, b) => a.date.localeCompare(b.date));
  const weeks = new Map<number, PlanSessionState[]>();
  for (const session of active) weeks.set(weekOf(session.date), [...(weeks.get(weekOf(session.date)) ?? []), session]);
  const stats = (week: number) => {
    // 대회 당일의 거리는 훈련량이 아니다(TE-S08).
    const runs = (weeks.get(week) ?? []).filter((session) => session.type !== 'race');
    const timed = runs.filter((session) => session.distanceKm === null);
    return {
      runs,
      km: sum(runs.map((session) => session.distanceKm)),
      minutes: sum(timed.map((session) => session.durationMin)),
      timeBased: runs.length > 0 && timed.length === runs.length,
      mixed: timed.length > 0 && timed.length < runs.length,
    };
  };
  return { active, weeks, stats };
};

export const validate: Validate = ({ plan, today, change }) => {
  const violations = new Set<SafetyRuleId>();
  // 지난 주의 위반은 보고하지 않고 기준값 계산에만 쓴다(PRD §7.4). 오늘 날짜가 잘못되면 모든 주를 검사한다.
  const currentWeek = isDate(today) ? weekOf(today) : -Infinity;
  const { active, weeks, stats } = byWeek(plan);
  const runs = active.filter((session) => session.type !== 'race');

  const malformed = (session: PlanSessionState) =>
    session.distanceKm === null && (session.durationMin === null || session.type !== 'walk_run' || session.runIntervalMin === null);
  if (!isDate(plan.startDate) || active.some((session) => !isDate(session.date)) || runs.some(malformed)) violations.add('TE-S14');

  let previous: PlanSessionState | undefined;
  let previousHard: PlanSessionState | undefined;
  for (const session of active) {
    const judged = weekOf(session.date) >= currentWeek;
    if (judged && previous?.date === session.date) violations.add('TE-S05');
    previous = session;
    if (!isHard(session)) continue;
    if (judged && previousHard && dayOf(session.date) - dayOf(previousHard.date) === 1) violations.add('TE-S04');
    previousHard = session;
  }

  const startWeek = weekOf(plan.startDate);
  // "첫 주"는 생략하지 않은 훈련이 처음 있는 주다(PRD §7.4).
  const firstWeek = runs[0] && weekOf(runs[0].date);
  const recentKm = plan.profile.recentWeeklyKm ?? 0;
  const priorWeeks = (week: number) => Array.from({ length: SAFETY.peakWeeks }, (_, i) => week - 1 - i);
  // 계획 시작 전의 주는 최근 주간 거리로 본다(TE-S01). 시간 기반 주는 거리가 0이라,
  // 시간 기반에서 거리 기반으로 넘어가는 주는 전환 조건이 정해질 때까지 통과하지 못한다(D-04).
  const kmOf = (week: number) => (week < startWeek ? recentKm : stats(week).km);
  const peakKm = (week: number) => Math.max(...priorWeeks(week).map(kmOf));
  const isRecovery = (week: number) => !exceeds(kmOf(week), peakKm(week) * (1 - SAFETY.recoveryMinReduction));

  for (const [week, sessions] of weeks) {
    if (week < currentWeek) continue;
    const { runs: weekRuns, km, minutes, timeBased, mixed } = stats(week);
    if (sessions.length > SAFETY.maxSessionsPerWeek) violations.add('TE-S05');
    const tempos = weekRuns.filter((session) => session.type === 'tempo').length;
    if (tempos > SAFETY.maxTempoPerWeek || (tempos > 0 && (plan.level === 'beginner' || weekRuns.length < SAFETY.minSessionsForTempo))) violations.add('TE-S07');
    if (mixed) violations.add('TE-S14');
    const runLimit = Math.max(SAFETY.continuousRunMin[plan.profile.continuousRun], plan.profile.recentRunIntervalMin ?? 0);
    if (week === firstWeek && weekRuns.some((session) => exceeds(session.runIntervalMin ?? 0, runLimit))) violations.add('TE-S14');
    if (timeBased) {
      // 계획 시작 전의 주는 시간 기준이 없다. 비교할 주가 없는 첫 주는 상한이 없다.
      const peaks = priorWeeks(week).filter((prior) => prior >= startWeek).map((prior) => stats(prior).minutes);
      if (peaks.length > 0 && exceeds(minutes, Math.max(...peaks) * SAFETY.weeklyIncrease)) violations.add('TE-S14');
      continue;
    }
    const share = weekRuns.length <= SAFETY.longRunShare.threshold ? SAFETY.longRunShare.upToThree : SAFETY.longRunShare.fourOrMore;
    if (weekRuns.some((session) => session.type === 'long' && exceeds(session.distanceKm ?? 0, km * share))) violations.add('TE-S03');
    // 회복 주 바로 다음 주는 고점까지만 복귀한다.
    if (exceeds(km, peakKm(week) * (isRecovery(week - 1) ? 1 : SAFETY.weeklyIncrease))) violations.add('TE-S01');
    if (week === firstWeek && exceeds(km, recentKm)) violations.add('TE-S06');
    if (sessions.some((session) => session.type === 'race') && exceeds(km, peakKm(week) * (1 - SAFETY.taperMinReduction))) violations.add('TE-S08');
  }

  // 대회가 월~수요일이면 대회가 있는 주에 훈련이 거의 없어, 그 전 주도 줄었는지 본다(TE-S08).
  for (const race of active.filter((session) => session.type === 'race')) {
    const before = weekOf(race.date) - 1;
    const weekday = ((dayOf(race.date) + 3) % 7) + 1;
    if (weekday > SAFETY.taperPreviousWeekUntilWeekday || before < startWeek || before < currentWeek || stats(before).timeBased) continue;
    if (exceeds(kmOf(before), peakKm(before) * (1 - SAFETY.taperMinReduction))) violations.add('TE-S08');
  }

  // 고점을 넘지 않는 유지 주간에는 회복 주를 요구하지 않는다. 시간 기반 주와 빈 주는 거리가 0이라 회복 주로 센다.
  let sinceRecovery = 0;
  const lastWeek = Math.max(...weeks.keys());
  for (let week = startWeek; week <= lastWeek; week++) {
    sinceRecovery = isRecovery(week) ? 0 : sinceRecovery + 1;
    if (week >= currentWeek && sinceRecovery >= SAFETY.recoveryEveryWeeks && exceeds(kmOf(week), peakKm(week))) violations.add('TE-S02');
  }

  for (const session of runs) {
    const week = weekOf(session.date);
    // 첫 주는 비교할 달리기가 없어 TE-S03과 TE-S06으로만 제한한다.
    if (session.distanceKm === null || week < currentWeek || week === firstWeek) continue;
    const day = dayOf(session.date);
    const earlier = runs.filter((other) => other.distanceKm !== null && dayOf(other.date) < day && day - dayOf(other.date) <= SAFETY.singleRunWindowDays);
    // 비교할 달리기가 없으면 최장 거리가 -Infinity라 위반이 된다.
    if (exceeds(session.distanceKm, Math.max(...earlier.map((other) => other.distanceKm ?? 0)) * SAFETY.singleRunIncrease)) violations.add('TE-S13');
  }

  if (change) {
    const before = byWeek(change.previous);
    const beforeById = new Map(before.active.map((session) => [session.id, session]));
    let more = false;
    let harder = false;
    for (const week of weeks.keys()) {
      if (week < currentWeek) continue;
      if (exceeds(stats(week).km, before.stats(week).km) || exceeds(stats(week).minutes, before.stats(week).minutes)) more = true;
    }
    for (const session of active) {
      if (weekOf(session.date) < currentWeek) continue;
      const old = beforeById.get(session.id);
      // 변경 전에 없던 훈련은 추가했거나 생략을 되돌린 것이다.
      if (!old) harder = true;
      else if (exceeds(session.distanceKm ?? 0, old.distanceKm ?? 0) || exceeds(session.durationMin ?? 0, old.durationMin ?? 0)) more = true;
      else if (isHard(session) && !isHard(old)) harder = true;
    }
    if (more) violations.add('TE-S09');
    if (change.reason !== 'schedule' && (more || harder)) violations.add('TE-S11');
  }

  return violations.size === 0 ? { ok: true } : { ok: false, violations: [...violations].sort() };
};
