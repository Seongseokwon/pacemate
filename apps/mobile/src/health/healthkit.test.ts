import { isHealthDataAvailable, queryWorkoutSamples, requestAuthorization } from '@kingstinct/react-native-healthkit';
import { importHealthkitWorkout } from '@/api/workouts';
import { isRedirectError } from '@/api/query-client';
import { importHealthkitWorkouts } from './healthkit';

jest.mock('@kingstinct/react-native-healthkit', () => ({ isHealthDataAvailable: jest.fn(), queryWorkoutSamples: jest.fn(), requestAuthorization: jest.fn(), WorkoutActivityType: { running: 37 }, WorkoutTypeIdentifier: 'HKWorkoutTypeIdentifier' }));
jest.mock('@/api/workouts', () => ({ importHealthkitWorkout: jest.fn() }));
jest.mock('@/api/query-client', () => ({ isRedirectError: jest.fn(() => false) }));

test('건강 기록의 거리와 심박수를 변환하고 중복 기록은 건너뛴다', async () => {
  jest.mocked(isHealthDataAvailable).mockReturnValue(true);
  jest.mocked(requestAuthorization).mockResolvedValue(true);
  const dispose = jest.fn();
  const sample = { uuid: '11111111-1111-4111-8111-111111111111', startDate: new Date('2026-11-18T03:00:00Z'), endDate: new Date('2026-11-18T03:30:00Z'), duration: { quantity: 1800 }, totalDistance: { quantity: 5000 }, getStatistic: jest.fn(async (type: string) => type.includes('HeartRate') ? { averageQuantity: { quantity: 145 } } : undefined), dispose };
  jest.mocked(queryWorkoutSamples).mockResolvedValue([sample, sample] as never);
  jest.mocked(importHealthkitWorkout).mockResolvedValueOnce({ imported: true }).mockResolvedValueOnce({ imported: false });
  await expect(importHealthkitWorkouts()).resolves.toEqual({ imported: 1, skipped: 1, failed: 0, missingDistance: 0, total: 2 });
  expect(requestAuthorization).toHaveBeenCalledWith({ toRead: ['HKWorkoutTypeIdentifier', 'HKQuantityTypeIdentifierDistanceWalkingRunning', 'HKQuantityTypeIdentifierHeartRate'] });
  expect(importHealthkitWorkout).toHaveBeenCalledWith({ externalId: sample.uuid, date: '2026-11-18', startedAt: '2026-11-18T03:00:00.000Z', endedAt: '2026-11-18T03:30:00.000Z', distanceKm: 5, durationSec: 1800, averageHeartRate: 145 });
  expect(dispose).toHaveBeenCalledTimes(2);
});

test('일부 저장에 실패해도 나머지 기록을 처리한다', async () => {
  const sample = { uuid: '11111111-1111-4111-8111-111111111111', startDate: new Date('2026-11-18T03:00:00Z'), endDate: new Date('2026-11-18T03:30:00Z'), duration: { quantity: 1800 }, totalDistance: { quantity: 5000 }, getStatistic: jest.fn().mockResolvedValue(undefined), dispose: jest.fn() };
  jest.mocked(queryWorkoutSamples).mockResolvedValue([sample, sample] as never);
  jest.mocked(importHealthkitWorkout).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ imported: true });
  await expect(importHealthkitWorkouts()).resolves.toEqual({ imported: 1, skipped: 0, failed: 1, missingDistance: 0, total: 2 });
});

test('로그인 등 필수 이동이 필요한 오류는 즉시 전달한다', async () => {
  const sample = { uuid: '11111111-1111-4111-8111-111111111111', startDate: new Date('2026-11-18T03:00:00Z'), endDate: new Date('2026-11-18T03:30:00Z'), duration: { quantity: 1800 }, totalDistance: { quantity: 5000 }, getStatistic: jest.fn().mockResolvedValue(undefined), dispose: jest.fn() };
  const error = new Error('login');
  jest.mocked(queryWorkoutSamples).mockResolvedValue([sample] as never);
  jest.mocked(importHealthkitWorkout).mockRejectedValueOnce(error);
  jest.mocked(isRedirectError).mockReturnValueOnce(true);
  await expect(importHealthkitWorkouts()).rejects.toBe(error);
  expect(sample.dispose).toHaveBeenCalled();
});

test('거리가 없는 건강 기록은 따로 센다', async () => {
  const sample = { startDate: new Date('2026-11-18T03:00:00Z'), endDate: new Date('2026-11-18T03:30:00Z'), duration: { quantity: 1800 }, totalDistance: null, getStatistic: jest.fn().mockResolvedValue(undefined), dispose: jest.fn() };
  jest.mocked(queryWorkoutSamples).mockResolvedValue([sample] as never);
  await expect(importHealthkitWorkouts()).resolves.toEqual({ imported: 0, skipped: 0, failed: 0, missingDistance: 1, total: 1 });
  expect(sample.dispose).toHaveBeenCalled();
});
