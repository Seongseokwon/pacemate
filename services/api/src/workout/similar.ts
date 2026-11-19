import type { WorkoutLog } from '../generated/prisma/client.js';

const DISTANCE_TOLERANCE = 0.05;
const DURATION_TOLERANCE_SEC = 120;

export function workoutGroups(rows: WorkoutLog[]): WorkoutLog[][] {
  const groups: WorkoutLog[][] = [];
  for (const row of rows) {
    const matches = row.separateRun ? [] : groups.filter((group) => group.some((other) => {
      if (other.separateRun || row.date.getTime() !== other.date.getTime()) return false;
      if (row.source === 'healthkit' && other.source === 'healthkit') {
        return !!row.startedAt && !!row.endedAt && !!other.startedAt && !!other.endedAt && row.startedAt < other.endedAt && other.startedAt < row.endedAt;
      }
      if (row.source !== 'healthkit' && other.source !== 'healthkit') return false;
      const a = row.distanceKm.toNumber();
      const b = other.distanceKm.toNumber();
      return Math.abs(a - b) <= Math.max(a, b) * DISTANCE_TOLERANCE && Math.abs(row.durationSec - other.durationSec) <= DURATION_TOLERANCE_SEC;
    }));
    for (const group of matches) groups.splice(groups.indexOf(group), 1);
    groups.push([row, ...matches.flat()]);
  }
  return groups;
}

export function representativeWorkouts(rows: WorkoutLog[]): WorkoutLog[] {
  return workoutGroups(rows).map((group) => group.sort((a, b) => Number(!!b.plannedSessionId) - Number(!!a.plannedSessionId) || b.distanceKm.toNumber() - a.distanceKm.toNumber() || a.id.localeCompare(b.id))[0]!);
}
