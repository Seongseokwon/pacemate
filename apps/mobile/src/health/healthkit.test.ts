import { isHealthDataAvailable, queryWorkoutSamples, requestAuthorization } from '@kingstinct/react-native-healthkit';
import { importHealthkitWorkout } from '@/api/workouts';
import { importHealthkitWorkouts } from './healthkit';

jest.mock('@kingstinct/react-native-healthkit', () => ({ isHealthDataAvailable: jest.fn(), queryWorkoutSamples: jest.fn(), requestAuthorization: jest.fn(), WorkoutActivityType: { running: 37 }, WorkoutTypeIdentifier: 'HKWorkoutTypeIdentifier' }));
jest.mock('@/api/workouts', () => ({ importHealthkitWorkout: jest.fn() }));

test('건강 기록의 거리와 심박수를 변환하고 중복 기록은 건너뛴다', async () => {
  jest.mocked(isHealthDataAvailable).mockReturnValue(true);
  jest.mocked(requestAuthorization).mockResolvedValue(true);
  const dispose = jest.fn();
  const sample = { startDate: new Date('2026-11-18T03:00:00Z'), duration: { quantity: 1800 }, totalDistance: { quantity: 5000 }, getStatistic: jest.fn(async (type: string) => type.includes('HeartRate') ? { averageQuantity: { quantity: 145 } } : undefined), dispose };
  jest.mocked(queryWorkoutSamples).mockResolvedValue([sample, sample] as never);
  jest.mocked(importHealthkitWorkout).mockResolvedValueOnce({ imported: true }).mockResolvedValueOnce({ imported: false });
  await expect(importHealthkitWorkouts()).resolves.toEqual({ imported: 1, skipped: 1 });
  expect(importHealthkitWorkout).toHaveBeenCalledWith({ date: '2026-11-18', distanceKm: 5, durationSec: 1800, averageHeartRate: 145 });
  expect(dispose).toHaveBeenCalledTimes(2);
});
