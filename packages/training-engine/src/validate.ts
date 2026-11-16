import type { SafetyRuleId, Validate } from './types.js';
import { SAFETY } from './safety-config.js';

// 나머지 규칙의 입력과 판정 기준이 정해질 때까지 검증을 통과시키지 않는다.
export const validate: Validate = ({ plan }) => {
  const violations = new Set<SafetyRuleId>();
  const sessions = plan.sessions.filter((session) => !session.skipped && session.type !== 'race');
  const weeks = new Map<number, typeof sessions>();
  for (const session of sessions) {
    const week = weeks.get(session.weekNumber) ?? [];
    week.push(session);
    weeks.set(session.weekNumber, week);
  }
  for (const week of weeks.values()) {
    const total = week.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
    if (week.some((session) => session.type === 'long' && session.distanceKm !== null && session.distanceKm > total * (week.length <= SAFETY.minSessionsForTempo ? SAFETY.longRunShare.upToThree : SAFETY.longRunShare.fourOrMore))) violations.add('TE-S03');
    const dates = week.map((session) => session.date);
    if (new Set(dates).size !== dates.length || dates.length > SAFETY.maxSessionsPerWeek) violations.add('TE-S05');
    const tempos = week.filter((session) => session.type === 'tempo');
    if (tempos.length > SAFETY.maxTempoPerWeek || (tempos.length > 0 && (plan.level === 'beginner' || week.length < SAFETY.minSessionsForTempo))) violations.add('TE-S07');
  }
  // shortcut: 입력 명세가 미완성인 규칙은 항상 실패 처리하며, 판정 기준 확정 후 실제 검사로 교체한다.
  for (const rule of ['TE-S01', 'TE-S02', 'TE-S04', 'TE-S06', 'TE-S08', 'TE-S09', 'TE-S10', 'TE-S11', 'TE-S13', 'TE-S14'] as const) violations.add(rule);
  return { ok: false, violations: [...violations] };
};
