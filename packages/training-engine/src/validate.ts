import type { PlanSessionState, SafetyRuleId, Validate, ValidateInput } from './types.js';
import { SAFETY } from './safety-config.js';

// 형식을 먼저 확인한다. 형식이 다른 날짜 문자열은 실행 환경의 시간대로 해석될 수 있다(TE-R09).
const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
const dayOf = (date: string) => Date.parse(date) / 86_400_000;
// 1970-01-01이 목요일이라 3을 더해 월요일을 주의 시작으로 맞춘다(PRD §1.5).
const weekOf = (date: string) => Math.floor((dayOf(date) + 3) / 7);
// 소수 계산의 오차로 경계값이 위반이 되지 않게 한다.
const exceeds = (value: number, limit: number) => value > limit + 1e-9;
const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0);

/** 판정 기준이 정해진 규칙만 검사한다. 주는 입력의 `weekNumber`가 아니라 날짜로 계산한다(ARCHITECTURE §6). */
export const checkRules = ({ plan, today }: ValidateInput): Set<SafetyRuleId> => {
  const violations = new Set<SafetyRuleId>();
  // 지난 주의 위반은 보고하지 않고 기준값 계산에만 쓴다(PRD §7.4). 오늘 날짜가 잘못되면 모든 주를 검사한다.
  const currentWeek = isDate(today) ? weekOf(today) : -Infinity;
  const active = plan.sessions.filter((session) => !session.skipped).sort((a, b) => a.date.localeCompare(b.date));
  // 대회 당일의 거리는 훈련량이 아니다(TE-S08).
  const runs = active.filter((session) => session.type !== 'race');

  if (active.some((session) => !isDate(session.date)) || runs.some((session) => session.distanceKm === null && (session.durationMin === null || session.type !== 'walk_run'))) violations.add('TE-S14');

  let previous: PlanSessionState | undefined;
  let previousHard: PlanSessionState | undefined;
  for (const session of active) {
    const judged = weekOf(session.date) >= currentWeek;
    if (judged && previous?.date === session.date) violations.add('TE-S05');
    previous = session;
    if (session.type !== 'tempo' && session.type !== 'long') continue;
    if (judged && previousHard && dayOf(session.date) - dayOf(previousHard.date) === 1) violations.add('TE-S04');
    previousHard = session;
  }

  const weeks = new Map<number, PlanSessionState[]>();
  for (const session of active) weeks.set(weekOf(session.date), [...(weeks.get(weekOf(session.date)) ?? []), session]);
  const stats = (week: number) => {
    const weekRuns = (weeks.get(week) ?? []).filter((session) => session.type !== 'race');
    const timed = weekRuns.filter((session) => session.distanceKm === null);
    return {
      weekRuns,
      km: sum(weekRuns.map((session) => session.distanceKm)),
      minutes: sum(timed.map((session) => session.durationMin)),
      timeBased: weekRuns.length > 0 && timed.length === weekRuns.length,
      mixed: timed.length > 0 && timed.length < weekRuns.length,
    };
  };
  const startWeek = weekOf(plan.startDate);
  const firstWeek = runs[0] && weekOf(runs[0].date);
  const priorWeeks = (week: number) => Array.from({ length: SAFETY.peakWeeks }, (_, i) => week - 1 - i);

  for (const [week, sessions] of weeks) {
    if (week < currentWeek) continue;
    const { weekRuns, km, minutes, timeBased, mixed } = stats(week);
    if (sessions.length > SAFETY.maxSessionsPerWeek) violations.add('TE-S05');
    const tempos = weekRuns.filter((session) => session.type === 'tempo').length;
    if (tempos > SAFETY.maxTempoPerWeek || (tempos > 0 && (plan.level === 'beginner' || weekRuns.length < SAFETY.minSessionsForTempo))) violations.add('TE-S07');
    if (mixed) violations.add('TE-S14');
    if (timeBased) {
      // 계획 시작 전의 주는 시간 기준이 없다. 비교할 주가 없는 첫 주는 상한이 없다.
      const peaks = priorWeeks(week).filter((prior) => prior >= startWeek).map((prior) => stats(prior).minutes);
      if (peaks.length > 0 && exceeds(minutes, Math.max(...peaks) * SAFETY.weeklyIncrease)) violations.add('TE-S14');
      continue;
    }
    const share = weekRuns.length <= SAFETY.longRunShare.threshold ? SAFETY.longRunShare.upToThree : SAFETY.longRunShare.fourOrMore;
    if (weekRuns.some((session) => session.type === 'long' && exceeds(session.distanceKm ?? 0, km * share))) violations.add('TE-S03');
    const recentKm = plan.profile.recentWeeklyKm ?? 0;
    // 시간 기반 주는 거리가 0이라, 시간 기반에서 거리 기반으로 넘어가는 주는 전환 조건이 정해질 때까지 통과하지 못한다(D-04).
    const peakKm = Math.max(...priorWeeks(week).map((prior) => (prior < startWeek ? recentKm : stats(prior).km)));
    if (exceeds(km, peakKm * SAFETY.weeklyIncrease)) violations.add('TE-S01');
    if (week === firstWeek && exceeds(km, recentKm)) violations.add('TE-S06');
  }

  for (const session of runs) {
    const week = weekOf(session.date);
    // 훈련이 있는 첫 주는 비교할 달리기가 없어 TE-S03과 TE-S06으로만 제한한다.
    if (session.distanceKm === null || week < currentWeek || week === firstWeek) continue;
    const day = dayOf(session.date);
    const earlier = runs.filter((other) => other.distanceKm !== null && dayOf(other.date) < day && day - dayOf(other.date) <= SAFETY.singleRunWindowDays);
    // 비교할 달리기가 없으면 최장 거리가 -Infinity라 위반이 된다.
    if (exceeds(session.distanceKm, Math.max(...earlier.map((other) => other.distanceKm ?? 0)) * SAFETY.singleRunIncrease)) violations.add('TE-S13');
  }
  return violations;
};

// shortcut: 판정 기준이나 구현이 남은 규칙은 항상 위반으로 보고한다, 규칙을 다 구현하면 이 목록에서 뺀다(docs/T-202-VALIDATOR-PROPOSAL.md).
// TE-S01은 회복 주 다음 주의 조항, TE-S14는 첫 주의 달리기 구간 길이가 남았다.
export const UNIMPLEMENTED: readonly SafetyRuleId[] = ['TE-S01', 'TE-S02', 'TE-S08', 'TE-S09', 'TE-S11', 'TE-S14'];

export const validate: Validate = (input) => {
  const violations = new Set([...checkRules(input), ...UNIMPLEMENTED]);
  return violations.size === 0 ? { ok: true } : { ok: false, violations: [...violations].sort() };
};
