import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { apiFetch, ApiClientError } from '@/api/client';
import { approveProposal } from '@/api/chat';
import GoalChange from '../app/goal-change';
import { testQueryClient } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
let mockMode = '';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ mode: mockMode }), router: { back: jest.fn(), navigate: jest.fn(), replace: jest.fn(), canDismiss: jest.fn(() => false) } }));
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

test('목표 미리보기에서 승인한 뒤에만 완료 화면을 보여 준다 (AC-F02-04)', async () => {
  jest.mocked(apiFetch).mockResolvedValue(proposal);
  jest.mocked(approveProposal).mockResolvedValue({ proposal: { ...proposal, status: 'approved' }, resultMessage: { id: '00000000-0000-4000-8000-000000000002', role: 'system', status: 'done', content: '적용했어요', createdAt: '2026-11-20T00:00:00Z', card: null }, usage: { tier: 'free', chat: { used: 0, limit: 5 }, reschedule: { used: 0, limit: 1 }, resetsOn: '2026-12-01' } } as never);
  await show(); await chooseGoal();
  await fireEvent.press(await screen.findByRole('button', { name: '이 계획으로 시작' }));
  expect(await screen.findByText('계획을 바꿨어요')).toBeOnTheScreen();
  expect(approveProposal).toHaveBeenCalledWith(proposal.id, expect.anything());
});

test('계획이 바뀌어 승인에 실패하면 서버 오류를 보여 준다', async () => {
  jest.mocked(apiFetch).mockResolvedValue(proposal);
  jest.mocked(approveProposal).mockRejectedValue(new ApiClientError('PLAN_CHANGED', '계획이 바뀌었어요. 다시 요청해 주세요.'));
  await show(); await chooseGoal();
  await fireEvent.press(await screen.findByRole('button', { name: '이 계획으로 시작' }));
  expect(await screen.findByText('계획이 바뀌었어요. 다시 요청해 주세요.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '이 계획으로 시작' })).toBeNull();
});


test('프로필 변경은 서버 제안을 받아 승인 전 미리보기로 간다 (F02-R05)', async () => {
  mockMode = 'profile';
  jest.mocked(apiFetch).mockReset().mockImplementation(async (path) => path === '/v1/profile' ? { experience: 'none', continuousRun: 'under_10m', recentWeeklyKm: 5, recentRecord: null, weeklyRunCount: 2, preferredWeekdays: [1, 3], level: 'beginner' } : proposal);
  try {
    await show();
    expect(await screen.findByRole('button', { name: '변경 미리보기' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('최근 주간 거리 (km)'), '6');
    await fireEvent.press(screen.getByRole('button', { name: '변경 미리보기' }));
    expect(await screen.findByText('프로필 변경 제안')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '적용하기' })).toBeOnTheScreen();
    expect(apiFetch).toHaveBeenCalledWith('/v1/proposals/goal-change', expect.anything(), expect.objectContaining({ body: expect.objectContaining({ profile: expect.objectContaining({ weeklyRunCount: 2, preferredWeekdays: [1, 3] }) }) }));
  } finally { mockMode = ''; }
});

test('최근 페이스 입력만 열고 값을 그대로 두면 변경 미리보기를 누를 수 없다', async () => {
  mockMode = 'profile';
  jest.mocked(apiFetch).mockReset().mockImplementation(async (path) => path === '/v1/profile' ? { experience: 'none', continuousRun: 'under_10m', recentWeeklyKm: 5, recentRecord: { paceSecPerKm: 400 }, weeklyRunCount: 2, preferredWeekdays: [1, 3], level: 'beginner' } : proposal);
  try {
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: '최근 페이스 바꾸기' }));
    expect(screen.queryByRole('button', { name: '최근 페이스 바꾸기' })).toBeNull();
    expect(screen.getByRole('button', { name: '변경 미리보기' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('1km당 초'), '50');
    expect(screen.getByRole('button', { name: '변경 미리보기' })).toBeEnabled();
  } finally { mockMode = ''; }
});
