import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { getMe } from '@/api/me';
import Me from '../app/(tabs)/me';
import { testQueryClient } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/api/me', () => ({ ...jest.requireActual('@/api/me'), getMe: jest.fn() }));

test('목표 변경 전에 계획과 기록에 관한 확인 문구를 보여 준다 (AC-F02-06)', async () => {
  jest.mocked(getMe).mockResolvedValue({ coach: 'oni' } as never);
  await render(<QueryClientProvider client={testQueryClient()}><Me /></QueryClientProvider>);
  await fireEvent.press(screen.getByRole('button', { name: '목표 바꾸기' }));
  expect(screen.getByText('목표를 바꾸면 남은 계획이 새로 만들어져요. 지금까지의 기록과 진행률은 그대로 남아요.')).toBeOnTheScreen();
  expect(router.push).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '바꾸기' }));
  expect(router.push).toHaveBeenCalledWith('/goal-change');
});
