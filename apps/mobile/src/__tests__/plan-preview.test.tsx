import type { PlanOption } from '@pacemate/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ApiClientError } from '@/api/client';
import { confirmPlan, previewPlan } from '@/api/plan';
import { advance } from '@/first-run/store';
import { clearDraft, EMPTY_DRAFT, loadDraft } from '@/onboarding/draft';
import PlanPreview from '../app/(onboarding)/plan-preview';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('@/api/plan', () => ({ ...jest.requireActual('@/api/plan'), previewPlan: jest.fn(), confirmPlan: jest.fn() }));
jest.mock('@/first-run/store', () => ({ advance: jest.fn(() => Promise.resolve()) }));
jest.mock('@/onboarding/draft', () => ({ ...jest.requireActual('@/onboarding/draft'), loadDraft: jest.fn(), clearDraft: jest.fn(() => Promise.resolve()) }));

const option = (kind: PlanOption['kind'], patch: Partial<PlanOption> = {}): PlanOption => ({
  kind,
  startDate: '2026-11-16',
  endDate: '2027-01-10',
  totalWeeks: 8,
  sessions: [
    { date: '2026-11-17', type: 'easy', distanceKm: 3, durationMin: null, runIntervalMin: null, paceRange: null, weekNumber: 1, status: 'planned', workoutId: null, original: null },
    { date: '2026-11-19', type: 'easy', distanceKm: 3, durationMin: null, runIntervalMin: null, paceRange: null, weekNumber: 1, status: 'planned', workoutId: null, original: null },
    { date: '2026-11-22', type: kind === 'race_prep' ? 'long' : 'easy', distanceKm: 5, durationMin: null, runIntervalMin: null, paceRange: null, weekNumber: 1, status: 'planned', workoutId: null, original: null },
    { date: '2026-11-24', type: 'easy', distanceKm: 3, durationMin: null, runIntervalMin: null, paceRange: null, weekNumber: 2, status: 'planned', workoutId: null, original: null },
  ],
  warnings: [],
  ...patch,
});

const show = async () => {
  jest.mocked(loadDraft).mockResolvedValue({ ...EMPTY_DRAFT, goalDistance: 'ten_k', step: 7 });
  await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <PlanPreview />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByText('계획을 만들고 있어요')).toBeNull());
};
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => jest.clearAllMocks());

test('요약, 첫 주 일정(날짜 포함)을 보여 주고, 확정하면 답변을 지우고 끝났음을 알린다 (F03-R05, UX-11)', async () => {
  jest.mocked(previewPlan).mockResolvedValue({ options: [option('race_prep')] });
  jest.mocked(confirmPlan).mockResolvedValue({} as never);
  await show();

  expect(await screen.findByText('8주')).toBeOnTheScreen();
  expect(screen.getByText('주 3회')).toBeOnTheScreen();
  expect(screen.getByText('1월 10일')).toBeOnTheScreen();
  expect(screen.getByText('목 11/19')).toBeOnTheScreen();
  expect(screen.queryByText('화 11/24')).toBeNull();
  expect(previewPlan).toHaveBeenCalledWith({ goalDistance: 'ten_k', goalTimeSec: null, raceDate: null });

  await press('이 계획으로 시작');
  await waitFor(() => expect(advance).toHaveBeenCalledWith('planConfirmed'));
  expect(confirmPlan).toHaveBeenCalledWith({ goalDistance: 'ten_k', goalTimeSec: null, raceDate: null, kind: 'race_prep' });
  expect(clearDraft).toHaveBeenCalled();
});

test('두 계획을 만들 수 있으면 고르게 하고, 고른 계획으로 확정한다 (TE-G06)', async () => {
  jest.mocked(previewPlan).mockResolvedValue({ options: [option('race_prep'), option('base_building', { totalWeeks: 6 })] });
  jest.mocked(confirmPlan).mockResolvedValue({} as never);
  await show();

  await press(/^기초 훈련 계획/);
  expect(screen.getByText('6주')).toBeOnTheScreen();
  await press('이 계획으로 시작');
  await waitFor(() => expect(confirmPlan).toHaveBeenCalledWith(expect.objectContaining({ kind: 'base_building' })));
});

test('완주 준비 계획을 만들 수 없으면 그 이유를 안내한다 (TE-G06)', async () => {
  jest.mocked(previewPlan).mockResolvedValue({ options: [option('base_building', { warnings: ['RACE_PREP_NOT_REACHABLE'] })] });
  await show();
  expect(await screen.findByText('기초 훈련 계획')).toBeOnTheScreen();
  expect(screen.getByText(/먼저 기초를 다지는 계획으로 시작해요/)).toBeOnTheScreen();
});

test('이미 확정된 계획이면 실패로 보이지 않고 다음으로 넘어간다', async () => {
  jest.mocked(previewPlan).mockResolvedValue({ options: [option('race_prep')] });
  jest.mocked(confirmPlan).mockRejectedValue(new ApiClientError('PLAN_ALREADY_ACTIVE', '진행 중인 계획이 있어요.'));
  await show();
  await press('이 계획으로 시작');
  await waitFor(() => expect(advance).toHaveBeenCalledWith('planConfirmed'));
});

test('계획을 만들 수 없으면 이유와 [답변 수정]을 보여 준다', async () => {
  jest.mocked(previewPlan).mockRejectedValue(new ApiClientError('PLAN_NOT_FEASIBLE', '입력한 조건으로는 계획을 만들 수 없어요.'));
  await show();
  expect(await screen.findByText('입력한 조건으로는 계획을 만들 수 없어요.')).toBeOnTheScreen();
  await press('답변 수정');
  expect(router.replace).toHaveBeenCalledWith('/(onboarding)');
});
