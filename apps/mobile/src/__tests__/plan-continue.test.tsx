import type { PlanOption } from '@pacemate/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ApiClientError } from '@/api/client';
import { confirmPlan, getHome, previewPlan } from '@/api/plan';
import { saveDraft } from '@/onboarding/draft';
import Home from '../app/(tabs)/index';
import PlanContinue from '../app/plan-continue';
import { home, plan } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
jest.mock('@/api/plan', () => ({ ...jest.requireActual('@/api/plan'), getHome: jest.fn(), previewPlan: jest.fn(), confirmPlan: jest.fn() }));
jest.mock('@/first-run/store', () => ({ advance: jest.fn(() => Promise.resolve()) }));
jest.mock('@/home/dismissed', () => ({ loadDismissed: jest.fn(() => Promise.resolve([])), dismiss: jest.fn() }));
jest.mock('@/onboarding/draft', () => ({ ...jest.requireActual('@/onboarding/draft'), saveDraft: jest.fn(() => Promise.resolve()) }));

const show = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
const press = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));

const row = (date: string, weekNumber: number, patch: Partial<PlanOption['sessions'][number]> = {}): PlanOption['sessions'][number] => ({
  date, type: 'easy', distanceKm: 4, durationMin: null, runIntervalMin: null, paceRange: null, weekNumber, status: 'planned', workoutId: null, original: null, ...patch,
});
const maintenance = (sessions: PlanOption['sessions']): PlanOption => ({
  kind: 'maintenance', startDate: sessions[0]!.date, endDate: '2026-12-13', totalWeeks: 4, sessions, warnings: [], focus: 'habit',
});

beforeEach(() => jest.clearAllMocks());

describe('계획이 끝난 홈 (F03-R08, C2 15a)', () => {
  const finished = home({ plan: plan({ isFinished: true, startDate: '2026-09-21', endDate: '2026-11-15', progress: { completed: 21, total: 24 } }), daysToRace: null, managerMessage: { code: 'PLAN_FINISHED', text: '계획을 모두 마쳤어요.' } });

  test('종료 안내와 진행 결과, [이어서 훈련하기]와 [새 목표 설정]을 보여 준다', async () => {
    jest.mocked(getHome).mockResolvedValue(finished);
    await show(<Home />);

    expect(await screen.findByText('계획을 모두 마쳤어요.')).toBeOnTheScreen();
    expect(screen.getByLabelText('완료한 훈련 21/24회')).toBeOnTheScreen();
    expect(screen.getByLabelText('함께한 기간 8주')).toBeOnTheScreen();

    await press('이어서 훈련하기');
    expect(router.push).toHaveBeenCalledWith('/plan-continue');
  });

  test('[새 목표 설정]은 목표 질문부터 시작한다', async () => {
    jest.mocked(getHome).mockResolvedValue(finished);
    await show(<Home />);

    await press('새 목표 설정');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/(onboarding)'));
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ goalOnly: true, goalDistance: null }));
  });
});

describe('유지 계획 미리보기 (F03-R10, AC-F03-08)', () => {
  test('질문 없이 유지 계획을 미리 보여 주고, 확정해야 저장한다', async () => {
    jest.mocked(previewPlan).mockResolvedValue({ options: [maintenance([row('2026-11-17', 1), row('2026-11-19', 1), row('2026-11-22', 1, { type: 'long', distanceKm: 8 }), row('2026-11-24', 2)])] });
    jest.mocked(confirmPlan).mockResolvedValue({} as never);
    await show(<PlanContinue />);

    expect(await screen.findByText('목표: 꾸준히 달리는 습관 만들기')).toBeOnTheScreen();
    expect(previewPlan).toHaveBeenCalledWith({ goalDistance: 'none', continuation: true });
    expect(screen.getByLabelText('기간 4주')).toBeOnTheScreen();
    expect(screen.getByLabelText('훈련 주 3회')).toBeOnTheScreen();
    expect(screen.getByLabelText('첫 주 거리 16km')).toBeOnTheScreen();
    expect(confirmPlan).not.toHaveBeenCalled();

    await press('이 계획으로 시작');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(confirmPlan).toHaveBeenCalledWith({ goalDistance: 'none', kind: 'maintenance' });
  });

  test('대회 뒤 첫 주를 쉬면 훈련이 처음 있는 주를 보여 주고, 시간 기반이면 한 번에 달리는 시간을 보여 준다', async () => {
    const walk = { type: 'walk_run' as const, distanceKm: null, durationMin: 30, runIntervalMin: 15 };
    jest.mocked(previewPlan).mockResolvedValue({ options: [maintenance([row('2026-11-24', 2, walk), row('2026-11-26', 2, walk)])] });
    await show(<PlanContinue />);

    expect(await screen.findByLabelText('훈련 주 2회')).toBeOnTheScreen();
    expect(screen.getByLabelText('한 번에 달리는 시간 15분')).toBeOnTheScreen();
  });

  test('만들 수 없으면 실패를 보여 주고 저장하지 않는다', async () => {
    jest.mocked(previewPlan).mockRejectedValue(new ApiClientError('NOT_FOUND', '이어서 훈련할 끝난 계획이 없어요.'));
    await show(<PlanContinue />);

    expect(await screen.findByText('이어서 훈련할 끝난 계획이 없어요.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '이 계획으로 시작' })).toBeNull();
  });
});
