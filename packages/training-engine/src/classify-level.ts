import type { RunnerLevel } from '@pacemate/shared';
import { PLAN } from './safety-config.js';
import type { ClassifyLevel } from './types.js';

const ORDER: RunnerLevel[] = ['beginner', 'novice', 'intermediate'];

/** 세 항목을 각각 판정해 가장 낮은 수준을 쓴다(TE-G01). 주간 거리가 없으면 입문이다(TE-G05). */
export const classifyLevel: ClassifyLevel = (profile) => {
  const km = profile.recentWeeklyKm ?? 0;
  const byKm: RunnerLevel = km >= PLAN.level.weeklyKm.intermediate ? 'intermediate' : km >= PLAN.level.weeklyKm.novice ? 'novice' : 'beginner';
  const levels = [PLAN.level.continuousRun[profile.continuousRun], PLAN.level.experience[profile.experience], byKm];
  return ORDER[Math.min(...levels.map((level) => ORDER.indexOf(level)))] ?? 'beginner';
};
