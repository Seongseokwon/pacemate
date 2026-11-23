import type { Usage } from '@pacemate/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { getMe } from '@/api/me';
import { signOut } from '@/auth/session';
import Me from '../app/(tabs)/me';
import { testQueryClient } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(() => Promise.resolve()) }));
jest.mock('@/api/me', () => ({ ...jest.requireActual('@/api/me'), getMe: jest.fn() }));
jest.mock('@/auth/session', () => ({ signOut: jest.fn(() => Promise.resolve()) }));

const usage = (patch: Partial<Usage> = {}): Usage => ({
  tier: 'free',
  chat: { used: 3, limit: 30, pool: 'trial' },
  reschedule: { used: 1, limit: 3, pool: 'trial' },
  resetsOn: '2026-12-01',
  ...patch,
});
const show = async (u: Usage = usage()) => {
  jest.mocked(getMe).mockResolvedValue({ registered: true, onboardingCompleted: true, hasActivePlan: true, authProvider: 'google', coach: 'suri', usage: u, subscription: null } as never);
  await render(
    <QueryClientProvider client={testQueryClient()}>
      <Me />
    </QueryClientProvider>,
  );
  await screen.findByText('현재 요금제');
};

beforeEach(() => jest.clearAllMocks());

describe('마이페이지 (PRD §5.8, UI_UX §6.7)', () => {
  test('체험분을 쓰는 동안 남은 횟수와 체험 뒤 월 한도를 보여 준다 (F10-R07, AC-F10-08)', async () => {
    await show();
    expect(screen.getByText('무료')).toBeOnTheScreen();
    expect(screen.getByText('체험 대화 27회 남음')).toBeOnTheScreen();
    expect(screen.getByText('체험 2회 남음')).toBeOnTheScreen();
    expect(screen.getByText('체험분을 다 쓰면 매달 AI 대화 5회 · 일정 변경 1회')).toBeOnTheScreen();
  });

  test('체험분을 다 쓰면 이번 달 사용/한도와 다음 초기화 날짜를 보여 준다', async () => {
    await show(usage({ chat: { used: 2, limit: 5, pool: 'month' }, reschedule: { used: 0, limit: 1, pool: 'month' } }));
    expect(screen.getByText('이번 달 2/5')).toBeOnTheScreen();
    expect(screen.getByText('이번 달 0/1')).toBeOnTheScreen();
    expect(screen.getByText('다음 초기화: 12월 1일')).toBeOnTheScreen();
  });

  test('1단계 출시에는 구독으로 가는 버튼이 없다', async () => {
    await show();
    expect(screen.queryByText(/Pro 알아보기|구독 복원/)).toBeNull();
  });

  test('로그아웃은 한 번 더 확인한 뒤 기기의 로그인 정보를 지우고 로그인 화면으로 간다 (F01-R04)', async () => {
    await show();
    await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
    expect(signOut).not.toHaveBeenCalled();

    await fireEvent.press(screen.getAllByRole('button', { name: '로그아웃' }).at(-1)!);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  test('계정 삭제 화면으로 간다', async () => {
    await show();
    await fireEvent.press(screen.getByRole('button', { name: '계정 삭제' }));
    expect(router.push).toHaveBeenCalledWith('/delete-account');
  });

  test('약관 주소와 문의 주소가 없으면 그 줄을 보여 주지 않는다', async () => {
    await show();
    expect(screen.queryByText('이용약관')).toBeNull();
    expect(screen.queryByText('문의하기')).toBeNull();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
