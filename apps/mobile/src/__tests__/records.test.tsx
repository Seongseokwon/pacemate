import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiClientError } from '@/api/client';
import { createWorkout, getCandidates, getSimilarWorkouts, getWorkouts, getWorkoutStats, updateWorkout } from '@/api/workouts';
import Records from '../app/(tabs)/records';
import { testQueryClient } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/health/healthkit', () => ({ importHealthkitWorkouts: jest.fn() }));
jest.mock('@/api/workouts', () => ({ getWorkouts: jest.fn(), getWorkoutStats: jest.fn(), getCandidates: jest.fn(), getSimilarWorkouts: jest.fn(), createWorkout: jest.fn(), updateWorkout: jest.fn(), deleteWorkout: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), canDismiss: jest.fn(() => false), dismissAll: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getWorkouts).mockResolvedValue({ items: [], hasMore: false });
  jest.mocked(getWorkoutStats).mockResolvedValue({ week: { distanceKm: 0, count: 0 }, month: { distanceKm: 0, count: 0 } });
  jest.mocked(getCandidates).mockResolvedValue({ items: [] });
});

test('거리와 시간을 입력하고 저장하면 코치 문구와 진행률을 보여 준다', async () => {
  jest.mocked(createWorkout).mockResolvedValue({ workout: {} as never, weekProgress: { completed: 1, planned: 3 }, coachLine: { code: 'WORKOUT_SAVED', text: '수고하셨어요.' } });
  await render(<QueryClientProvider client={testQueryClient()}><Records /></QueryClientProvider>);
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
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  await waitFor(() => expect(screen.queryByText('운동 날짜')).not.toBeOnTheScreen());
});

test('중복 확인에 동의하면 확인 값을 추가해 다시 저장한다', async () => {
  jest.mocked(createWorkout).mockRejectedValueOnce(new ApiClientError('WORKOUT_DUPLICATE', '중복')).mockResolvedValueOnce({ workout: {} as never, weekProgress: null, coachLine: { code: 'WORKOUT_SAVED', text: '수고하셨어요.' } });
  await render(<QueryClientProvider client={testQueryClient()}><Records /></QueryClientProvider>);
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

test('같은 날의 훈련을 연결하고 통증을 저장한다', async () => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  jest.mocked(getCandidates).mockResolvedValue({ items: [{ id: 'session-1', date, type: 'easy', workoutId: null } as never] });
  jest.mocked(createWorkout).mockResolvedValue({ workout: {} as never, weekProgress: null, coachLine: { code: 'WORKOUT_PAIN', text: '쉬면서 몸 상태를 살펴봐 주세요.' } });
  await render(<QueryClientProvider client={testQueryClient()}><Records /></QueryClientProvider>);
  await screen.findByText('아직 운동 기록이 없어요.');
  await fireEvent.press(screen.getAllByRole('button', { name: '기록 추가' })[0]!);
  await fireEvent.changeText(screen.getByLabelText('거리 (km)'), '5');
  await fireEvent.changeText(screen.getByLabelText('분'), '30');
  await fireEvent.press(screen.getByText('있었어요'));
  await fireEvent.changeText(screen.getByLabelText('통증 내용'), '무릎이 아파요');
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByText('쉬면서 몸 상태를 살펴봐 주세요.')).toBeOnTheScreen();
  expect(createWorkout).toHaveBeenCalledWith(expect.objectContaining({ plannedSessionId: 'session-1', memo: '무릎이 아파요' }));
  expect(screen.queryByText(/이번 주 \d+\/\d+회/)).not.toBeOnTheScreen();
});

test('기록을 고칠 때 연결한 훈련을 바꾸지 않으면 연결 값을 보내지 않는다 (F07-R11)', async () => {
  const workout = { id: 'one', date: '2026-11-17', distanceKm: 3, durationSec: 1080, paceSecPerKm: 360, averageHeartRate: null, condition: null, rpe: null, memo: null, plannedSessionId: 'session-1', source: 'healthkit' as const };
  jest.mocked(getWorkouts).mockResolvedValue({ items: [{ ...workout, similarCount: 0 }], hasMore: false });
  jest.mocked(getSimilarWorkouts).mockResolvedValue({ items: [] });
  jest.mocked(updateWorkout).mockResolvedValue(workout);
  await render(<QueryClientProvider client={testQueryClient()}><Records /></QueryClientProvider>);
  await fireEvent.press(await screen.findByText(/3km/));
  await fireEvent.press(await screen.findByRole('button', { name: '수정하기' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(updateWorkout).toHaveBeenCalledTimes(1));
  expect(jest.mocked(updateWorkout).mock.calls[0]![1]).not.toHaveProperty('plannedSessionId');

  // 자유 러닝으로 바꾸면 연결 해제(null)를 보낸다
  await fireEvent.press(await screen.findByText(/3km/));
  await fireEvent.press(await screen.findByRole('button', { name: '수정하기' }));
  await fireEvent.press(await screen.findByText('현재 연결된 훈련'));
  await fireEvent.press(await screen.findByText('자유 러닝'));
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(updateWorkout).toHaveBeenLastCalledWith('one', expect.objectContaining({ plannedSessionId: null })));
});

test('비슷한 기록을 비교하고 다른 달리기로 분리한다', async () => {
  const workout = { id: 'one', date: '2026-11-17', distanceKm: 5, durationSec: 1800, paceSecPerKm: 360, averageHeartRate: null, condition: null, rpe: null, memo: null, plannedSessionId: null, source: 'app' as const };
  const other = { ...workout, id: 'two', distanceKm: 5.1, source: 'healthkit' as const };
  jest.mocked(getWorkouts).mockResolvedValue({ items: [{ ...workout, similarCount: 1 }], hasMore: false });
  jest.mocked(getSimilarWorkouts).mockResolvedValue({ items: [other] });
  jest.mocked(updateWorkout).mockResolvedValue(other);
  await render(<QueryClientProvider client={testQueryClient()}><Records /></QueryClientProvider>);
  await fireEvent.press(await screen.findByText(/비슷한 기록 1개/));
  expect(await screen.findByText('비슷한 기록')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '다른 달리기예요' }));
  await waitFor(() => expect(updateWorkout).toHaveBeenCalledWith('two', { separateRun: true }));
});
