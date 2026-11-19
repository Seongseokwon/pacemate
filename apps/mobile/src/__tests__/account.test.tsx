import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { createMe, deleteMe, ME_KEY } from '@/api/me';
import { signIn, signOut } from '@/auth/session';
import Consent from '../app/(auth)/consent';
import Login from '../app/(auth)/login';
import DeleteAccount from '../app/delete-account';
import { testQueryClient } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), canDismiss: jest.fn(() => false), dismissAll: jest.fn() } }));
jest.mock('@/api/me', () => ({ ...jest.requireActual('@/api/me'), createMe: jest.fn(), deleteMe: jest.fn() }));
jest.mock('@/auth/session', () => ({ signIn: jest.fn(), signOut: jest.fn(() => Promise.resolve()) }));

const ME = { registered: true, onboardingCompleted: false };
let queryClient: QueryClient;

const show = (ui: ReactElement) => render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = testQueryClient();
});

describe('동의 화면 (F01-R02)', () => {
  test('세 항목을 모두 체크해야 가입 버튼을 누를 수 있다 (AC-F01-02)', async () => {
    await show(<Consent />);
    const submit = () => screen.getByRole('button', { name: '동의하고 시작하기' });
    expect(submit()).toBeDisabled();

    await press(/이용약관/);
    await press(/개인정보 처리방침/);
    expect(submit()).toBeDisabled();

    await press(/운동 데이터 처리/);
    expect(submit()).toBeEnabled();

    await press(/이용약관/);
    expect(submit()).toBeDisabled();
    expect(createMe).not.toHaveBeenCalled();
  });

  test('모두 동의로 한 번에 체크하고, 가입하면 받은 상태를 담아 시작 화면으로 간다', async () => {
    jest.mocked(createMe).mockResolvedValue(ME as never);
    await show(<Consent />);

    await press(/모두 동의/);
    await press('동의하고 시작하기');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(createMe).toHaveBeenCalledWith({ consentVersion: 'draft-1', agreedTerms: true, agreedPrivacy: true, agreedHealthData: true });
    expect(queryClient.getQueryData(ME_KEY)).toEqual(ME);
  });

  test('문서 주소가 없으면 열리지 않는 전문 보기를 두지 않는다', async () => {
    await show(<Consent />);
    expect(screen.queryByRole('button', { name: '전문 보기' })).toBeNull();
  });
});

describe('로그인 화면 (F01-R01)', () => {
  test.each([
    ['Apple로 계속하기', 'apple'],
    ['Google 계정으로 계속하기', 'google'],
  ])('%s를 누르면 로그인하고 시작 화면으로 간다', async (label, provider) => {
    jest.mocked(signIn).mockResolvedValue();
    await show(<Login />);

    await press(label);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(signIn).toHaveBeenCalledWith(provider);
  });

  test('로그인에 실패하면 로그인 화면에 남는다', async () => {
    jest.mocked(signIn).mockRejectedValue(new Error('취소'));
    await show(<Login />);

    await press('Apple로 계속하기');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Apple로 계속하기' })).toBeEnabled());
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('계정 삭제 화면 (F01-R05)', () => {
  test('구독 해지 안내를 보여 주고, 한 번 더 확인한 뒤에만 삭제한다', async () => {
    jest.mocked(deleteMe).mockResolvedValue(undefined);
    await show(<DeleteAccount />);
    expect(screen.getByText(/스토어의 구독 관리에서 따로 해지/)).toBeOnTheScreen();

    await press('계정 삭제');
    expect(deleteMe).not.toHaveBeenCalled();
    await press('삭제');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(deleteMe).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalled();
  });

  test('확인에서 취소하면 삭제하지 않는다', async () => {
    await show(<DeleteAccount />);

    await press('계정 삭제');
    await press('취소');

    expect(deleteMe).not.toHaveBeenCalled();
  });

  test('삭제에 실패하면 로그아웃하지 않고 화면에 남는다', async () => {
    jest.mocked(deleteMe).mockRejectedValue(new Error('서버 오류'));
    await show(<DeleteAccount />);

    await press('계정 삭제');
    await press('삭제');

    await waitFor(() => expect(deleteMe).toHaveBeenCalled());
    expect(signOut).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
