import type { Session, SessionStatus, Workout } from '@pacemate/shared';
import { toDateString } from '../common/dates.js';
import type { PlannedSession, WorkoutLog } from '../generated/prisma/client.js';

export type SessionRow = PlannedSession & { workout: { id: string } | null };

/** 훈련 상태는 저장하지 않고 판정한다(DATABASE §3.4). */
export function statusOf(row: { date: Date; isSkipped: boolean; workout: object | null }, today: string): SessionStatus {
  if (row.workout) return 'completed';
  if (row.isSkipped) return 'skipped';
  return toDateString(row.date) >= today ? 'planned' : 'missed';
}

export function toSession(row: SessionRow, today: string): Session {
  return {
    id: row.id,
    date: toDateString(row.date),
    type: row.type,
    distanceKm: row.distanceKm?.toNumber() ?? null,
    durationMin: row.durationMin,
    runIntervalMin: row.runIntervalMin,
    paceRange:
      row.paceMinSecPerKm === null || row.paceMaxSecPerKm === null
        ? null
        : { minSecPerKm: row.paceMinSecPerKm, maxSecPerKm: row.paceMaxSecPerKm },
    weekNumber: row.weekNumber,
    status: statusOf(row, today),
    workoutId: row.workout?.id ?? null,
    original: (row.original as Session['original']) ?? null,
  };
}

export function toWorkout(row: WorkoutLog): Workout {
  const distanceKm = row.distanceKm.toNumber();
  return {
    id: row.id,
    date: toDateString(row.date),
    distanceKm,
    durationSec: row.durationSec,
    averageHeartRate: row.averageHeartRate,
    paceSecPerKm: Math.round(row.durationSec / distanceKm),
    condition: row.condition,
    rpe: row.rpe,
    memo: row.memo,
    plannedSessionId: row.plannedSessionId,
    source: row.source,
  };
}
