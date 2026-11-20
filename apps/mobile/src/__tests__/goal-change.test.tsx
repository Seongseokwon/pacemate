import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { apiFetch, ApiClientError } from '@/api/client';
import { approveProposal } from '@/api/chat';
import GoalChange from '../app/goal-change';
import { testQueryClient } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { back: jest.fn(), navigate: jest.fn(), replace: jest.fn(), canDismiss: jest.fn(() => false) } }));
jest.mock('@/api/client', () => ({ ...jest.requireActual('@/api/client'), apiFetch: jest.fn() }));
jest.mock('@/api/chat', () => ({ approveProposal: jest.fn(), cancelProposal: jest.fn() }));
const proposal = { id: '00000000-0000-4000-8000-000000000001', type: 'goal_change', status: 'pending', expiresAt: '2099-01-01T00:00:00Z', reasonLine: null, consumesQuota: false, changes: [], impact: null, warnings: [], goal: null, workout: null };
const show = () => render(<QueryClientProvider client={testQueryClient()}><GoalChange /></QueryClientProvider>);
const chooseGoal = async () => { await fireEvent.press(screen.getByRole('button', { name: /아직 목표가 없어요/ })); await fireEvent.press(screen.getByRole('button', { name: '변경 미리보기' })); };

test('목표 제안은 승인 전에는 적용하지 않고 미리보기를 보여 준다 (AC-F02-04)', async () => {
  jest.mocked(apiFetch).mockResolvedValue(proposal);
  await show(); await chooseGoal();
  expect(await screen.findByText('목표 변경 제안')).toBeOnTheScreen();
  expect(approveProposal).not.toHaveBeenCalled();
});

test('기록이 부족하다는 서버 응답에만 주간 거리를 다시 묻는다 (AC-F02-06)', async () => {
  jest.mocked(apiFetch).mockReset().mockRejectedValueOnce(new ApiClientError('RECENT_DISTANCE_REQUIRED', '주간 거리를 알려 주세요.')).mockResolvedValueOnce(proposal);
  await show(); await chooseGoal();
  expect(await screen.findByText('요즘 일주일에 얼마나 달려요?')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('일주일 동안 달린 거리 (km)'), '12');
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  await waitFor(() => expect(apiFetch).toHaveBeenLastCalledWith('/v1/proposals/goal-change', expect.anything(), expect.objectContaining({ body: expect.objectContaining({ profile: { recentWeeklyKm: 12 } }) })));
  expect(await screen.findByText('목표 변경 제안')).toBeOnTheScreen();
});
