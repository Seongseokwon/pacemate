import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { getSession, getSessions } from '@/api/plan';
import Calendar from '../app/(tabs)/calendar';
import { session } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
jest.mock('@/api/plan', () => ({ ...jest.requireActual('@/api/plan'), getSessions: jest.fn(), getSession: jest.fn() }));

const changed = session({ date: '2026-11-19', type: 'long', distanceKm: 12, original: { date: '2026-11-21', type: 'long', distanceKm: 12, durationMin: null } });
const items = [
  session({ date: '2026-11-16', status: 'completed', workoutId: '00000000-0000-4000-8000-0000000000bb' }),
  session({ date: '2026-11-17', status: 'missed' }),
  changed,
];

const show = async () => {
  jest.mocked(getSessions).mockResolvedValue({ items });
  await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Calendar />
    </QueryClientProvider>,
  );
};
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 10, 18, 9), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] });
});
afterEach(() => jest.useRealTimers());

test('주간 보기에서 예정·완료·미완료가 구분되고, 이번 주를 조회한다 (AC-F06-01)', async () => {
  await show();
  expect(await screen.findByRole('button', { name: /11월 16일 \(월\), 가볍게 달리기 완료/ })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /11월 17일 \(화\), 가볍게 달리기 미완료/ })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /11월 18일 \(수\), 오늘/ })).toBeOnTheScreen();
  expect(getSessions).toHaveBeenCalledWith('2026-11-16', '2026-11-22');
  expect(screen.getByText('쉬는 날이에요')).toBeOnTheScreen();
});

test('날짜를 고르면 그날 훈련이 보이고, 변경된 훈련에는 "변경됨"이 붙는다 (AC-F06-02)', async () => {
  await show();
  await press(/11월 19일 \(목\)/);
  expect(screen.getByLabelText('목요일, 길게 달리기 12킬로미터, 변경됨, 예정')).toBeOnTheScreen();
});

test('훈련 상세에서 원래 일정, 기록 입력, AI 변경 요청으로 이동할 수 있다 (AC-F06-02, AC-F06-03)', async () => {
  jest.mocked(getSession).mockResolvedValue({ ...changed, workout: null, changes: [] });
  await show();
  await press(/11월 19일 \(목\)/);
  await press('목요일, 길게 달리기 12킬로미터, 변경됨, 예정');
  expect(await screen.findByText('원래 일정: 11월 21일 (토)')).toBeOnTheScreen();

  await press('기록하기');
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/workout-new', params: { date: '2026-11-19', sessionId: changed.id } });

  await press('목요일, 길게 달리기 12킬로미터, 변경됨, 예정');
  await press('AI에게 변경 요청');
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/coach', params: { sessionId: changed.id } });
});

test('월간 보기로 바꾸면 달력에 보이는 칸 전체를 조회하고, 다음 달로 넘길 수 있다', async () => {
  await show();
  await fireEvent.press(screen.getByRole('tab', { name: '월간' }));
  await waitFor(() => expect(getSessions).toHaveBeenLastCalledWith('2026-10-26', '2026-12-06'));
  expect(screen.getByText('2026년 11월')).toBeOnTheScreen();
  await press('다음 달');
  await waitFor(() => expect(getSessions).toHaveBeenLastCalledWith('2026-11-30', '2027-01-03'));
});
