import type { SessionSnapshot } from '@pacemate/shared';
import { RESCHEDULE } from './safety-config.js';
import type { PlanSessionState, Reschedule, RescheduleFailure, SessionChange } from './types.js';
import { validate } from './validate.js';

const DAY = 86_400_000;
const day = (date: string) => Date.parse(date) / DAY;
const dateOf = (value: number) => new Date(value * DAY).toISOString().slice(0, 10);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(day(value)) && dateOf(day(value)) === value;
const monday = (value: number) => value - (((value + 3) % 7 + 7) % 7);
const priority = (session: PlanSessionState) => session.type === 'long' ? 2 : session.type === 'tempo' ? 1 : 0;
const snapshot = ({ date, type, distanceKm, durationMin }: PlanSessionState): SessionSnapshot => ({ date, type, distanceKm, durationMin });
const failure = (reasonCode: RescheduleFailure) => ({ ok: false as const, reasonCode });

/** 일정은 원본을 바꾸지 않고 만들며, 모든 변경을 적용한 계획을 독립 검증기로 검사한다. */
export const reschedule: Reschedule = ({ plan, request, reason, today }) => {
  if (!validDate(today)) return failure('NO_SAFE_OPTION');
  const start = monday(day(today));
  const inRange = (date: string) => validDate(date) && day(date) >= start && day(date) < start + 14;
  const changeable = (s: PlanSessionState) => !s.completed && !s.skipped && s.type !== 'race' && s.date >= today && inRange(s.date);
  const active = plan.sessions.filter((s) => !s.skipped);
  let targets: PlanSessionState[] = [];
  let weeks: number[] = [];
  let unavailable = new Set<string>();
  let maxSessions: number | undefined;

  if (request.changeType === 'move' || request.changeType === 'ease') {
    const target = plan.sessions.find((s) => s.id === request.sessionId);
    if (!target || target.completed || target.skipped || target.date < today) return failure('TARGET_NOT_CHANGEABLE');
    if (target.type === 'race') return failure('RACE_DAY_FIXED');
    if (!inRange(target.date)) return failure('OUT_OF_RANGE');
    if (request.changeType === 'move') {
      if (!inRange(request.targetDate)) return failure('OUT_OF_RANGE');
      if (monday(day(request.targetDate)) !== monday(day(target.date))) return failure('OUT_OF_WEEK');
      if (request.targetDate < today || request.targetDate < plan.startDate || request.targetDate > plan.endDate) return failure('TARGET_NOT_CHANGEABLE');
      if (request.targetDate === target.date) return failure('NOTHING_TO_CHANGE');
    }
    targets = [target];
    weeks = [monday(day(target.date))];
  } else if (request.changeType === 'unavailable_dates') {
    const dates = [...new Set(request.unavailableDates)].sort();
    if (dates.some((d) => !validDate(d))) return failure('NO_SAFE_OPTION');
    if (dates.length > RESCHEDULE.maxUnavailableDays || (dates.length > 0 && day(dates[dates.length - 1]!) - day(dates[0]!) + 1 > RESCHEDULE.maxUnavailableDays)) return failure('PERIOD_TOO_LONG');
    if (dates.some((d) => !inRange(d))) return failure('OUT_OF_RANGE');
    unavailable = new Set(dates);
    if (active.some((s) => s.type === 'race' && s.date >= today && unavailable.has(s.date))) return failure('RACE_DAY_FIXED');
    targets = active.filter((s) => changeable(s) && unavailable.has(s.date));
    weeks = [...new Set(targets.map((s) => monday(day(s.date))))];
  } else {
    if (!inRange(request.weekStart) || monday(day(request.weekStart)) !== day(request.weekStart)) return failure('OUT_OF_RANGE');
    if (!Number.isInteger(request.maxSessions) || request.maxSessions < 0) return failure('NO_SAFE_OPTION');
    weeks = [day(request.weekStart)];
    maxSessions = request.maxSessions;
    // 횟수는 그 주의 남은 훈련만 센다. 완료·지난 훈련과 대회는 세지 않는다(API_SPEC §4)
    targets = active.filter((s) => changeable(s) && monday(day(s.date)) === weeks[0]);
    if (targets.length <= maxSessions) return failure('NOTHING_TO_CHANGE');
  }
  if (!targets.length) return failure('NOTHING_TO_CHANGE');

  const targetIds = new Set(targets.map((s) => s.id));
  // 우선순위가 같으면 사용자가 고른 훈련을 먼저 지킨다(TE-R03)
  const chosen = (s: PlanSessionState) => (request.changeType === 'reduce_count' || !targetIds.has(s.id) ? 1 : 0);
  const sort = (a: PlanSessionState, b: PlanSessionState) => priority(b) - priority(a) || chosen(a) - chosen(b) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  const extras = active.filter((s) => changeable(s) && weeks.includes(monday(day(s.date))) && !targetIds.has(s.id)).sort(sort);

  const originalOf = new Map(plan.sessions.map((s) => [s.id, s]));
  const isChanged = (s: PlanSessionState) => {
    const old = originalOf.get(s.id)!;
    return s.skipped || s.date !== old.date || s.distanceKm !== old.distanceKm || s.durationMin !== old.durationMin;
  };
  const passes = (sessions: PlanSessionState[]) => validate({ plan: { ...plan, sessions }, today, change: { previous: plan, reason } }).ok;

  // 후보 조합을 깊이 우선으로 찾되, 검증 횟수에 상한을 둔다. 횟수로 세므로 결과는 결정적이다(TE-R09)
  const search = (): PlanSessionState[] | undefined => {
    const candidates = [...targets, ...extras].sort(sort);
    const ids = new Set(candidates.map((s) => s.id));
    const fixed = plan.sessions.filter((s) => !ids.has(s.id));
    const occupied = new Set(fixed.filter((s) => !s.skipped).map((s) => s.date));
    const selected: PlanSessionState[] = [];
    let budget = RESCHEDULE.maxSearch;
    const visit = (index: number): PlanSessionState[] | undefined => {
      if (budget <= 0) return undefined;
      if (index === candidates.length) {
        const sessions = [...fixed, ...selected];
        if (maxSessions !== undefined && sessions.filter((s) => changeable(s) && monday(day(s.date)) === weeks[0]).length > maxSessions) return undefined;
        if (!selected.some(isChanged)) return undefined;
        budget--;
        return passes(sessions) ? sessions : undefined;
      }
      const original = candidates[index]!;
      const target = targetIds.has(original.id);
      let options: PlanSessionState[] = [];
      if (!target || request.changeType === 'reduce_count') options = [original];
      else if (request.changeType === 'move') options = [{ ...original, date: request.targetDate }];
      else if (request.changeType === 'unavailable_dates') {
        const week = monday(day(original.date));
        options = Array.from({ length: 7 }, (_, n) => dateOf(week + n))
          .filter((d) => d >= today && d >= plan.startDate && d <= plan.endDate && !unavailable.has(d))
          .sort((a, b) => Math.abs(day(a) - day(original.date)) - Math.abs(day(b) - day(original.date)) || a.localeCompare(b))
          .map((date) => ({ ...original, date }));
      } else if (request.changeType === 'ease' && request.easeOption === 'lighter') {
        // 저장 단위(0.1km)로 내림해 검증한 값과 저장할 값을 같게 한다
        const distanceKm = original.distanceKm === null ? null : Math.floor(original.distanceKm * RESCHEDULE.lighterFactor * 10 + 1e-9) / 10;
        const durationMin = original.durationMin === null ? null : Math.floor(original.durationMin * RESCHEDULE.lighterFactor);
        if ((distanceKm === null || distanceKm > 0) && (durationMin === null || durationMin > 0) && (original.runIntervalMin === null || durationMin === null || original.runIntervalMin <= durationMin)) options = [{ ...original, distanceKm, durationMin }];
      }
      options.push({ ...original, skipped: true });
      for (const next of options) {
        if (!next.skipped && occupied.has(next.date)) continue;
        if (!next.skipped) occupied.add(next.date);
        selected.push(next);
        const result = visit(index + 1);
        selected.pop();
        if (!next.skipped) occupied.delete(next.date);
        if (result) return result;
      }
      return undefined;
    };
    return visit(0);
  };

  // 찾지 못했으면 대상 훈련만 생략하는 안을 검증한다. 줄이는 변경안은 항상 낼 수 있어야 한다(TE-R08)
  const skipOnly = () => {
    // 횟수 줄이기는 우선순위가 낮은 훈련부터 넘는 만큼만 생략한다(TE-R03)
    const skipping = request.changeType === 'reduce_count' ? new Set([...targets].sort(sort).slice(maxSessions).map((s) => s.id)) : targetIds;
    const sessions = plan.sessions.map((s) => (skipping.has(s.id) ? { ...s, skipped: true } : s));
    return passes(sessions) ? sessions : undefined;
  };
  const sessions = search() ?? skipOnly();
  if (!sessions) return failure('NO_SAFE_OPTION');
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const changes: SessionChange[] = plan.sessions.flatMap<SessionChange>((before) => {
    const after = byId.get(before.id)!;
    if (!before.skipped && after.skipped) return [{ sessionId: before.id, action: 'skip', before: snapshot(before), after: null }];
    if (before.date !== after.date || before.distanceKm !== after.distanceKm || before.durationMin !== after.durationMin) return [{ sessionId: before.id, action: before.date !== after.date ? 'move' : 'modify', before: snapshot(before), after: snapshot(after) }];
    return [];
  });
  const distance = (items: PlanSessionState[]) => items.filter((s) => !s.skipped && s.type !== 'race' && weeks.includes(monday(day(s.date)))).reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
  return { ok: true, changes, impact: { weeklyDistanceBeforeKm: distance(plan.sessions), weeklyDistanceAfterKm: distance(sessions), skippedCount: changes.filter((c) => c.action === 'skip').length }, warnings: weeks.length > 1 ? ['거리 합계는 변경 대상 두 주를 합한 값이에요.'] : [] };
};
