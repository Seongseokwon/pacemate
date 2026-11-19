import { isHealthDataAvailable, queryWorkoutSamples, requestAuthorization, WorkoutActivityType, WorkoutTypeIdentifier } from '@kingstinct/react-native-healthkit';
import { WORKOUT_LIMITS } from '@pacemate/shared';
import { importHealthkitWorkout } from '@/api/workouts';
import { isRedirectError } from '@/api/query-client';

export async function importHealthkitWorkouts() {
  if (!await isHealthDataAvailable()) throw new Error('이 기기에서는 Apple 건강을 사용할 수 없어요.');
  await requestAuthorization({ toRead: [WorkoutTypeIdentifier, 'HKQuantityTypeIdentifierDistanceWalkingRunning', 'HKQuantityTypeIdentifierHeartRate'] });
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const workouts = await queryWorkoutSamples({ limit: 0, filter: { workoutActivityType: WorkoutActivityType.running, date: { startDate, strictStartDate: true } } });
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let missingDistance = 0;
  for (const workout of workouts) {
    try {
      const distance = await workout.getStatistic('HKQuantityTypeIdentifierDistanceWalkingRunning', 'km');
      const heart = await workout.getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min');
      const distanceKm = Math.round((distance?.sumQuantity?.quantity ?? (workout.totalDistance?.quantity ?? 0) / 1000) * 100) / 100;
      const durationSec = Math.round(workout.duration.quantity);
      if (distanceKm <= 0) { missingDistance++; continue; }
      if (distanceKm < WORKOUT_LIMITS.distanceKm.min || distanceKm > WORKOUT_LIMITS.distanceKm.max || durationSec < WORKOUT_LIMITS.durationSec.min || durationSec > WORKOUT_LIMITS.durationSec.max) { skipped++; continue; }
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(workout.startDate);
      const average = heart?.averageQuantity?.quantity;
      const result = await importHealthkitWorkout({ externalId: workout.uuid, date, startedAt: workout.startDate.toISOString(), endedAt: workout.endDate.toISOString(), distanceKm, durationSec, averageHeartRate: average && average > 0 && average <= 300 ? Math.round(average) : null });
      if (result.imported) imported++; else skipped++;
    } catch (error) {
      if (isRedirectError(error)) throw error;
      failed++;
    } finally { workout.dispose(); }
  }
  return { imported, skipped, failed, missingDistance, total: workouts.length };
}
