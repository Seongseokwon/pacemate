import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import type { ReactElement } from 'react';
import { getMe } from '@/api/me';
import { INITIAL_STATE } from '@/first-run/flow';
import { advance, loadFirstRun } from '@/first-run/store';
import OnboardingStart from '../app/(onboarding)/start';
import Index from '../app/index';
import Intro from '../app/intro';
import NotificationPermission from '../app/notification-permission';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>, router: { replace: jest.fn() } };
});
jest.mock('expo-notifications', () => ({ requestPermissionsAsync: jest.fn() }));
jest.mock('@/api/me', () => ({ ...jest.requireActual('@/api/me'), getMe: jest.fn() }));
jest.mock('@/first-run/store', () => ({ ...jest.requireActual('@/first-run/store'), advance: jest.fn(() => Promise.resolve()), loadFirstRun: jest.fn() }));

const show = (element: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => jest.clearAllMocks());

test('인트로는 3장을 [다음]으로 넘기고, 마지막 장의 [시작하기]로 끝난다 (F01-R08)', async () => {
  await show(<Intro />);
  expect(screen.getByLabelText('3장 중 1장')).toBeOnTheScreen();
  await press('다음');
  expect(screen.getByLabelText('3장 중 2장')).toBeOnTheScreen();
  await press('다음');
  expect(advance).not.toHaveBeenCalled();
  await press('시작하기');
  expect(advance).toHaveBeenCalledWith('introDone');
});

test('온보딩 시작 화면은 고른 일만 알리고 다음 화면을 정하지 않는다 (F02-R08, F01-R09)', async () => {
  await show(<OnboardingStart />);
  await press('나중에 할게요');
  expect(advance).toHaveBeenLastCalledWith('onboardingDeferred');
  await press('시작하기');
  expect(advance).toHaveBeenLastCalledWith('onboardingStarted');
});

test('알림 권한은 허용을 누르면 기기에 묻고, 결과와 상관없이 다음으로 간다 (F09-R03)', async () => {
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({} as never);
  await show(<NotificationPermission />);
  await press('알림 받기');
  await waitFor(() => expect(advance).toHaveBeenCalledWith('notificationsDone'));
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

test('시작 경로는 인트로 전에는 내 상태를 조회하지 않고 인트로로 보낸다 (AC-F01-05)', async () => {
  jest.mocked(loadFirstRun).mockResolvedValue(INITIAL_STATE);
  await show(<Index />);
  expect(await screen.findByTestId('redirect')).toHaveTextContent('/intro');
  expect(getMe).not.toHaveBeenCalled();
});

test('시작 경로는 기기 상태와 내 상태로 다음 화면을 정한다 (F01-R07)', async () => {
  jest.mocked(loadFirstRun).mockResolvedValue({ ...INITIAL_STATE, introSeen: true });
  jest.mocked(getMe).mockResolvedValue({ registered: true, onboardingCompleted: false, hasActivePlan: false } as never);
  await show(<Index />);
  expect(await screen.findByTestId('redirect')).toHaveTextContent('/(onboarding)/start');
});
