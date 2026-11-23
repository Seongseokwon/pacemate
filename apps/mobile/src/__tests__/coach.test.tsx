import type { MeResponse } from '@pacemate/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { ApiClientError } from '@/api/client';
import { getMe, ME_KEY, setCoach } from '@/api/me';
import { advance } from '@/first-run/store';
import { showToast } from '@/ui';
import Me from '../app/(tabs)/me';
import CoachChange from '../app/coach-change';
import CoachSelect from '../app/coach-select';
import { testQueryClient } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() } }));
jest.mock('@/api/me', () => ({ ...jest.requireActual('@/api/me'), getMe: jest.fn(), setCoach: jest.fn() }));
jest.mock('@/first-run/store', () => ({ advance: jest.fn(() => Promise.resolve()) }));
jest.mock('@/ui', () => ({ ...jest.requireActual('@/ui'), showToast: jest.fn() }));

const ME: MeResponse = {
  registered: true,
  onboardingCompleted: true,
  hasActivePlan: true,
  authProvider: 'apple',
  coach: 'oni',
  usage: { tier: 'free', chat: { used: 0, limit: 30, pool: 'trial' }, reschedule: { used: 0, limit: 3, pool: 'trial' }, resetsOn: '2026-12-01' },
  subscription: null,
};
let queryClient: QueryClient;

const show = (ui: ReactElement) => render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
const card = (name: RegExp) => screen.getByRole('button', { name });
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = testQueryClient();
  jest.mocked(getMe).mockResolvedValue(ME);
});

describe('코치 고르기 (F04-R12, UI_UX §6.10)', () => {
  test('처음에는 아무것도 골라져 있지 않아 시작할 수 없다', async () => {
    await show(<CoachSelect />);

    expect(button('이 코치와 시작하기')).toBeDisabled();
    for (const name of [/^온이, 다정한 러닝 친구/, /^수리, 차분한 데이터 코치/, /^번개, 힘찬 스포츠 코치/]) {
      expect(card(name)).not.toBeSelected();
    }
  });

  test('고른 코치를 저장한 뒤에만 다음으로 가고, 내 상태에 반영한다', async () => {
    queryClient.setQueryData(ME_KEY, ME);
    jest.mocked(setCoach).mockResolvedValue({ coach: 'suri' });
    await show(<CoachSelect />);

    await fireEvent.press(card(/^수리/));
    expect(card(/^수리/)).toBeSelected();
    await fireEvent.press(button('이 코치와 시작하기'));

    await waitFor(() => expect(advance).toHaveBeenCalledWith('coachSelected'));
    expect(setCoach).toHaveBeenCalledWith('suri');
    expect(queryClient.getQueryData<MeResponse>(ME_KEY)?.coach).toBe('suri');
  });

  test('저장에 실패하면 화면에 남아 알리고, 다시 시도할 수 있다', async () => {
    jest.mocked(setCoach).mockRejectedValueOnce(new ApiClientError('NETWORK_ERROR', '연결 실패')).mockResolvedValueOnce({ coach: 'bungae' });
    await show(<CoachSelect />);

    await fireEvent.press(card(/^번개/));
    await fireEvent.press(button('이 코치와 시작하기'));

    expect(await screen.findByText('코치를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeOnTheScreen();
    expect(advance).not.toHaveBeenCalled();

    await fireEvent.press(button('다시 시도'));
    await waitFor(() => expect(advance).toHaveBeenCalledWith('coachSelected'));
    expect(setCoach).toHaveBeenLastCalledWith('bungae');
  });
});

describe('코치 바꾸기 (F04-R13, UI_UX §6.7)', () => {
  test('지금 코치가 골라진 채로 열리고, 같은 코치로는 바꿀 수 없다', async () => {
    jest.mocked(getMe).mockResolvedValue({ ...ME, coach: 'bungae' });
    await show(<CoachChange />);

    expect(await screen.findByRole('button', { name: /^번개, 힘찬 스포츠 코치, 사용 중/ })).toBeSelected();
    expect(button('이 코치로 바꾸기')).toBeDisabled();
  });

  test('바꾸면 알림을 띄우고 닫는다', async () => {
    jest.mocked(setCoach).mockResolvedValue({ coach: 'suri' });
    await show(<CoachChange />);

    await fireEvent.press(await screen.findByRole('button', { name: /^수리/ }));
    await fireEvent.press(button('이 코치로 바꾸기'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(setCoach).toHaveBeenCalledWith('suri');
    expect(showToast).toHaveBeenCalledWith('다음 답변부터 수리가 함께해요');
    expect(queryClient.getQueryData<MeResponse>(ME_KEY)?.coach).toBe('suri');
  });

  test('저장에 실패하면 닫지 않고 바뀐 것처럼 알리지 않는다', async () => {
    jest.mocked(setCoach).mockRejectedValue(new ApiClientError('INTERNAL_ERROR', '오류'));
    await show(<CoachChange />);

    await fireEvent.press(await screen.findByRole('button', { name: /^수리/ }));
    await fireEvent.press(button('이 코치로 바꾸기'));

    expect(await screen.findByText('코치를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<MeResponse>(ME_KEY)?.coach).toBe('oni');
  });
});

test('마이의 AI 코치 줄은 지금 코치를 보여 주고 코치 바꾸기를 연다', async () => {
  jest.mocked(getMe).mockResolvedValue({ ...ME, coach: 'suri' });
  await show(<Me />);

  await fireEvent.press(await screen.findByRole('button', { name: 'AI 코치, 지금 코치 수리, 코치 바꾸기' }));
  expect(router.push).toHaveBeenCalledWith('/coach-change');
});
