import type { EngineProfile, PlanSessionState, PlanState } from '@pacemate/training-engine';
import type { SessionSnapshot } from '@pacemate/shared';
import { toDateString } from '../common/dates.js';
import type { PlannedSession, RunnerProfile, TrainingPlan } from '../generated/prisma/client.js';

// DB의 계획을 Training Engine의 입력으로 바꾼다. 제안을 만들 때와 승인할 때 같은 함수를 쓴다(TE-S12).

export type SessionWithWorkout = PlannedSession & { workout: { id: string } | null };

export const engineProfileOf = (row: RunnerProfile): EngineProfile => ({
  experience: row.experience,
  continuousRun: row.continuousRun,
  recentWeeklyKm: row.recentWeeklyKm?.toNumber() ?? null,
  recentPaceSecPerKm: row.recentPaceSecPerKm,
  weeklyRunCount: row.weeklyRunCount,
  preferredWeekdays: row.preferredWeekdays,
});

export const sessionStateOf = (row: SessionWithWorkout): PlanSessionState => ({
  id: row.id,
  date: toDateString(row.date),
  type: row.type,
  distanceKm: row.distanceKm?.toNumber() ?? null,
  durationMin: row.durationMin,
  paceRange: row.paceMinSecPerKm === null || row.paceMaxSecPerKm === null ? null : { minSecPerKm: row.paceMinSecPerKm, maxSecPerKm: row.paceMaxSecPerKm },
  runIntervalMin: row.runIntervalMin,
  weekNumber: row.weekNumber,
  completed: row.workout !== null,
  skipped: row.isSkipped,
});

export const snapshotOf = ({ date, type, distanceKm, durationMin }: SessionSnapshot): SessionSnapshot => ({ date, type, distanceKm, durationMin });

export const planStateOf = (plan: TrainingPlan, profile: RunnerProfile, sessions: SessionWithWorkout[]): PlanState => ({
  kind: plan.kind,
  goal: { goalDistance: plan.goalDistance, goalTimeSec: plan.goalTimeSec, raceDate: plan.raceDate ? toDateString(plan.raceDate) : null },
  profile: engineProfileOf(profile),
  level: profile.level,
  startDate: toDateString(plan.startDate),
  endDate: toDateString(plan.endDate),
  sessions: sessions.map(sessionStateOf),
});
