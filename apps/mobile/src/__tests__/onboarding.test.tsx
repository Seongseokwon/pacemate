import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { saveProfile } from '@/api/profile';
import { EMPTY_DRAFT, loadDraft, type OnboardingDraft, saveDraft } from '@/onboarding/draft';
import Onboarding from '../app/(onboarding)/index';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), canDismiss: jest.fn(() => false), dismissAll: jest.fn() } }));
jest.mock('@/api/profile', () => ({ saveProfile: jest.fn() }));
jest.mock('@/onboarding/draft', () => ({ ...jest.requireActual('@/onboarding/draft'), loadDraft: jest.fn(), saveDraft: jest.fn(() => Promise.resolve()) }));

const show = async (draft: OnboardingDraft = EMPTY_DRAFT) => {
  jest.mocked(loadDraft).mockResolvedValue(draft);
  await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <Onboarding />
    </QueryClientProvider>,
  );
  await screen.findByRole('progressbar');
};
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const next = () => screen.getByRole('button', { name: /^(다음|계획 만들기)$/ });

beforeEach(() => jest.clearAllMocks());

test('질문에 답해야 다음으로 넘어가고, 끝까지 답하면 프로필을 저장한 뒤 시작 경로로 돌아간다 (F02-R01, F02-R04)', async () => {
  jest.mocked(saveProfile).mockResolvedValue({} as never);
  await show();

  expect(screen.getByText('달리기를 얼마나 해 보셨어요?')).toBeOnTheScreen();
  expect(next()).toBeDisabled();
  await press('처음이에요');
  await fireEvent.press(next());

  await press('10분 미만');
  await fireEvent.press(next());

  await fireEvent.changeText(screen.getByLabelText('일주일 동안 달린 거리 (km)'), '8');
  await fireEvent.press(next());

  expect(screen.getByText('최근 기록이나 평소 속도를 알려 주세요')).toBeOnTheScreen();
  await press('잘 모르겠어요');

  await fireEvent.press(screen.getByText('3번'));
  await press('월요일');
  await press('수요일');
  expect(screen.getByText('달릴 수 있는 요일을 3개 이상 골라 주세요.')).toBeOnTheScreen();
  expect(next()).toBeDisabled();
  await press('토요일');
  await fireEvent.press(next());

  await press('10km');
  await fireEvent.press(next());

  expect(screen.getByText('목표 기록이 있나요?')).toBeOnTheScreen();
  await press('건너뛰기');

  expect(screen.getByText('나갈 대회 날짜가 정해져 있나요?')).toBeOnTheScreen();
  expect(saveProfile).not.toHaveBeenCalled();
  await press('건너뛰기');

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(jest.mocked(saveProfile).mock.calls[0]?.[0]).toEqual({
    experience: 'none',
    continuousRun: 'under_10m',
    recentWeeklyKm: 8,
    recentRecord: null,
    weeklyRunCount: 3,
    preferredWeekdays: [1, 3, 6],
  });
});

test('답할 때마다 기기에 저장하고, 다시 열면 하던 질문부터 이어진다 (AC-F02-03)', async () => {
  await show({ ...EMPTY_DRAFT, step: 1, experience: 'under_2y' });

  expect(screen.getByText('쉬지 않고 얼마나 달릴 수 있나요?')).toBeOnTheScreen();
  await press('30~60분');
  expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ step: 1, experience: 'under_2y', continuousRun: 'under_60m' }));

  await press('뒤로');
  expect(screen.getByText('달리기를 얼마나 해 보셨어요?')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '6개월에서 2년 사이예요' })).toBeSelected();
});

test('저장에 실패하면 미리보기로 가지 않고 마지막 질문에 남는다', async () => {
  jest.mocked(saveProfile).mockRejectedValue(new Error('입력한 내용을 확인해 주세요.'));
  await show({ ...EMPTY_DRAFT, step: 7, experience: 'none', continuousRun: 'under_10m', weeklyKm: 0, runCount: 2, weekdays: [2, 4], goalDistance: 'five_k' });

  await press('건너뛰기');

  await waitFor(() => expect(saveProfile).toHaveBeenCalled());
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByText('나갈 대회 날짜가 정해져 있나요?')).toBeOnTheScreen();
});
