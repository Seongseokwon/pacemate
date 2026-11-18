import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { getHome } from '@/api/plan';
import { advance } from '@/first-run/store';
import { loadDismissed } from '@/home/dismissed';
import Home from '../app/(tabs)/index';
import { home, plan, session } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
jest.mock('@/api/plan', () => ({ ...jest.requireActual('@/api/plan'), getHome: jest.fn(), getSession: jest.fn() }));
jest.mock('@/first-run/store', () => ({ advance: jest.fn(() => Promise.resolve()) }));
jest.mock('@/home/dismissed', () => ({ loadDismissed: jest.fn(() => Promise.resolve([])), dismiss: jest.fn((id: string) => Promise.resolve([id])) }));

const show = async (data = home()) => {
  jest.mocked(getHome).mockResolvedValue(data);
  await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Home />
    </QueryClientProvider>,
  );
};
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => jest.clearAllMocks());

describe('첫 홈의 세 가지 상태 (AC-F06-05)', () => {
  test('계획 없음: 계획 만들기 카드를 누르면 온보딩을 시작한다', async () => {
    await show(home({ plan: null, daysToRace: null, managerMessage: { code: 'NO_PLAN', text: '새 목표를 정하고 훈련을 시작해 보세요.' } }));
    await press('계획 만들기');
    expect(advance).toHaveBeenCalledWith('onboardingStarted');
  });

  test('이번 주 시작: D-day, 진행률, 오늘의 훈련, 이번 주 훈련이 보인다', async () => {
    const today = session({ date: '2026-11-17', type: 'easy', distanceKm: 5 });
    await show(home({ todaySession: today, weekSessions: [today, session({ date: '2026-11-22', type: 'long', distanceKm: 12 })] }));
    expect(await screen.findByText('D-42')).toBeOnTheScreen();
    expect(screen.getByText('12 / 36회 완료')).toBeOnTheScreen();
    expect(screen.getByText('오늘의 훈련')).toBeOnTheScreen();
    expect(screen.getByLabelText('일요일, 길게 달리기 12킬로미터, 예정')).toBeOnTheScreen();
    expect(screen.getByLabelText('이번 주 훈련 2번 중 0번 완료')).toBeOnTheScreen();
  });

  test('다음 주 시작: 시작까지 남은 날과 준비 안내, 첫 주 훈련이 보인다', async () => {
    await show(
      home({
        plan: plan({ startDate: '2026-11-23' }),
        daysToStart: 6,
        weekSessions: [session({ date: '2026-11-25', weekNumber: 1 })],
        managerMessage: { code: 'PLAN_NOT_STARTED', text: '첫 훈련은 11월 23일이에요. 그때까지 편하게 쉬어 주세요.' },
      }),
    );
    expect(await screen.findByText('D-6')).toBeOnTheScreen();
    expect(screen.getByText('첫 훈련은 11월 23일이에요. 그때까지 편하게 쉬어 주세요.')).toBeOnTheScreen();
    expect(screen.getByText('첫 주 훈련')).toBeOnTheScreen();
  });
});

test('대회 날짜가 없으면 D-day 대신 주차를 보여 준다', async () => {
  await show(home({ plan: plan({ raceDate: null, startDate: '2026-11-09', endDate: '2027-01-03' }), daysToRace: null, weekSessions: [session({ date: '2026-11-17' })] }));
  expect(await screen.findByText(/2주 차 \/ 전체 8주/)).toBeOnTheScreen();
  expect(screen.getByText('12 / 36회 완료')).toBeOnTheScreen();
});

test('오늘 훈련을 기록했으면 버튼 대신 완료 표시를 보여 준다', async () => {
  await show(home({ todaySession: session({ status: 'completed', workoutId: '00000000-0000-4000-8000-0000000000bb' }) }));
  expect(await screen.findByText('오늘 기록을 남겼어요')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '기록하기' })).toBeNull();
});

describe('어제 훈련 기록 카드 (AC-F06-04)', () => {
  const yesterday = session({ date: '2026-11-16', status: 'missed' });

  test('[기록하기]는 날짜와 훈련이 채워진 기록 입력을 연다', async () => {
    await show(home({ yesterdaySession: yesterday }));
    expect(await screen.findByText('어제 훈련을 기록하지 않았어요')).toBeOnTheScreen();
    await press('기록하기');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(tabs)/records', params: { date: '2026-11-16', sessionId: yesterday.id } });
  });

  test('[못 했어요]를 누르면 카드를 닫고, 닫은 훈련은 다시 보여 주지 않는다', async () => {
    await show(home({ yesterdaySession: yesterday }));
    await press('못 했어요');
    await waitFor(() => expect(screen.queryByText('어제 훈련을 기록하지 않았어요')).toBeNull());
  });

  test('이 기기에서 이미 닫은 훈련이면 보여 주지 않는다', async () => {
    jest.mocked(loadDismissed).mockResolvedValueOnce([yesterday.id]);
    await show(home({ yesterdaySession: yesterday }));
    await screen.findByText('D-42');
    await waitFor(() => expect(screen.queryByText('어제 훈련을 기록하지 않았어요')).toBeNull());
  });
});

describe('[코치와 일정 조정하기] (F05-R14)', () => {
  test('이번 주 미완료가 2회 이상이면 보이고, 누르면 문구가 채워진 AI 코치를 연다', async () => {
    await show(home({ weekMissedCount: 2 }));
    await press('코치와 일정 조정하기');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(tabs)/coach', params: { draft: '이번 주 훈련을 두 번 놓쳤어요. 일정을 조정해 줘' } });
  });

  test('1회면 보이지 않고 매니저 메시지가 보인다', async () => {
    await show(home({ weekMissedCount: 1 }));
    expect(await screen.findByText('오늘은 쉬는 날이에요. 푹 쉬어 주세요.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '코치와 일정 조정하기' })).toBeNull();
  });
});

test('목표 없음이면 대회와 D-day 대신 목표 문구와 진행 상황을 보여 준다 (F03-R09)', async () => {
  await show(
    home({
      plan: plan({ goalDistance: 'none', raceDate: null, focus: 'habit', startDate: '2026-11-09', endDate: '2027-01-10' }),
      daysToRace: null,
      weekSessions: [session({ date: '2026-11-16', status: 'completed' }), session({ date: '2026-11-19' })],
    }),
  );
  expect(await screen.findByText('꾸준히 달리는 습관 만들기 · 2주 차 / 전체 9주')).toBeOnTheScreen();
  expect(screen.getByLabelText('이번 주 훈련 2번 중 1번 완료')).toBeOnTheScreen();
  expect(screen.queryByText('목표 없음')).toBeNull();
});
