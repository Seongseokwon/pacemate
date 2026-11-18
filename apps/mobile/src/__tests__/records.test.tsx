import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiClientError } from '@/api/client';
import { createWorkout, getCandidates, getWorkouts, getWorkoutStats } from '@/api/workouts';
import Records from '../app/(tabs)/records';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/api/workouts', () => ({ getWorkouts: jest.fn(), getWorkoutStats: jest.fn(), getCandidates: jest.fn(), createWorkout: jest.fn(), updateWorkout: jest.fn(), deleteWorkout: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), canDismiss: jest.fn(() => false), dismissAll: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getWorkouts).mockResolvedValue({ items: [], hasMore: false });
  jest.mocked(getWorkoutStats).mockResolvedValue({ week: { distanceKm: 0, count: 0 }, month: { distanceKm: 0, count: 0 } });
  jest.mocked(getCandidates).mockResolvedValue({ items: [] });
});

test('거리와 시간을 입력하고 저장하면 코치 문구와 진행률을 보여 준다', async () => {
  jest.mocked(createWorkout).mockResolvedValue({ workout: {} as never, weekProgress: { completed: 1, planned: 3 }, coachLine: { code: 'WORKOUT_SAVED', text: '수고하셨어요.' } });
  await render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Records /></QueryClientProvider>);
  await screen.findByText('아직 운동 기록이 없어요.');
  await fireEvent.press(screen.getAllByRole('button', { name: '기록 추가' })[0]!);
  await screen.findByText('운동 날짜');
  await fireEvent.changeText(screen.getByLabelText('거리 (km)'), '5');
  await fireEvent.changeText(screen.getByLabelText('분'), '30');
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
  expect(screen.getByText('평균 페이스: 6분 00초/km')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByText('수고하셨어요.')).toBeOnTheScreen();
  expect(screen.getByText('이번 주 1/3회')).toBeOnTheScreen();
  expect(createWorkout).toHaveBeenCalledWith(expect.objectContaining({ distanceKm: 5, durationSec: 1800, plannedSessionId: null }));
});

test('중복 확인에 동의하면 확인 값을 추가해 다시 저장한다', async () => {
  jest.mocked(createWorkout).mockRejectedValueOnce(new ApiClientError('WORKOUT_DUPLICATE', '중복')).mockResolvedValueOnce({ workout: {} as never, weekProgress: null, coachLine: { code: 'WORKOUT_SAVED', text: '수고하셨어요.' } });
  await render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Records /></QueryClientProvider>);
  await screen.findByText('아직 운동 기록이 없어요.');
  await fireEvent.press(screen.getAllByRole('button', { name: '기록 추가' })[0]!);
  await fireEvent.changeText(screen.getByLabelText('거리 (km)'), '5');
  await fireEvent.changeText(screen.getByLabelText('분'), '30');
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('같은 기록이 있어요');
  await fireEvent.press(screen.getByRole('button', { name: '계속 저장' }));
  await waitFor(() => expect(createWorkout).toHaveBeenLastCalledWith(expect.objectContaining({ confirmDuplicate: true })));
});
