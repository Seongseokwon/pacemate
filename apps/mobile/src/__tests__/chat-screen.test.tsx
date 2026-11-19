import type { Usage } from '@pacemate/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { apiFetch, ApiClientError } from '@/api/client';
import Coach from '../app/(tabs)/coach';
import { testQueryClient } from '../test-fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ draft: '훈련을 바꾸고 싶어요' }), router: { replace: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001') }));
jest.mock('@/api/client', () => ({ ...jest.requireActual('@/api/client'), apiFetch: jest.fn() }));
const usage: Usage = { tier: 'free', chat: { used: 2, limit: 5 }, reschedule: { used: 0, limit: 1 }, resetsOn: '2026-12-01' };
const userMessage = { id: '00000000-0000-4000-8000-000000000002', role: 'user', status: 'done', content: '훈련을 바꾸고 싶어요', createdAt: '2026-11-19T00:00:00Z', card: null };
const reply = { ...userMessage, id: '00000000-0000-4000-8000-000000000003', role: 'assistant', content: '어떻게 도와드릴까요?' };
const mockFetch = jest.mocked(apiFetch);
const show = async () => {
  await render(<QueryClientProvider client={testQueryClient()}><Coach /></QueryClientProvider>);
  await screen.findByDisplayValue('훈련을 바꾸고 싶어요');
};
beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockImplementation(async (path) => {
    if (path === '/v1/me') return { coach: 'oni', usage };
    if (path === '/v1/chat/messages') return { items: [], hasMore: false };
    if (path === '/v1/chat/suggestions') return { suggestions: [{ code: 'THIS_WEEK', text: '이번 주 훈련 알려 줘' }] };
    throw new Error(path);
  });
});

test('홈에서 받은 문장을 입력하고 이용량과 빠른 질문을 표시한다', async () => {
  await show();
  expect(await screen.findByText('이번 달 2/5')).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: '이번 주 훈련 알려 줘' })).toBeOnTheScreen();
  expect(mockFetch.mock.calls.filter(([path, , options]) => path === '/v1/chat/messages' && options?.method === 'POST')).toHaveLength(0);
});

test('빠른 질문을 전송하고 답과 이용량을 표시한다', async () => {
  const original = mockFetch.getMockImplementation()!;
  mockFetch.mockImplementation(async (path, schema, options) => options?.method === 'POST' ? { userMessage, replies: [reply], usage } : original(path, schema, options));
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: '이번 주 훈련 알려 줘' }));
  expect(await screen.findByText('어떻게 도와드릴까요?')).toBeOnTheScreen();
  expect(mockFetch).toHaveBeenCalledWith('/v1/chat/messages', expect.anything(), expect.objectContaining({ body: expect.objectContaining({ content: '이번 주 훈련 알려 줘' }), timeoutMs: 75000 }));
});

test('실패하면 다시 보내기를 표시하고 사용자가 재전송할 수 있다', async () => {
  const original = mockFetch.getMockImplementation()!;
  let attempts = 0;
  mockFetch.mockImplementation(async (path, schema, options) => {
    if (options?.method !== 'POST') return original(path, schema, options);
    if (++attempts === 1) throw new ApiClientError('AI_UNAVAILABLE', '다시 보내 주세요.');
    return { userMessage, replies: [reply], usage };
  });
  await show();
  await fireEvent.press(screen.getByRole('button', { name: '보내기' }));
  await fireEvent.press(await screen.findByRole('button', { name: '다시 보내기' }));
  await waitFor(() => expect(screen.getByText('어떻게 도와드릴까요?')).toBeOnTheScreen());
  expect(attempts).toBe(2);
});

test('다른 방법은 제안을 취소하고 입력창만 채운다', async () => {
  const proposal = { id: '00000000-0000-4000-8000-000000000004', type: 'reschedule', status: 'pending', expiresAt: '2099-01-01T00:00:00Z', reasonLine: null, consumesQuota: true, changes: [], impact: null, warnings: [], goal: null, workout: null };
  const original = mockFetch.getMockImplementation()!;
  mockFetch.mockImplementation(async (path, schema, options) => {
    if (path === '/v1/chat/messages' && !options?.method) return { items: [{ ...reply, card: { type: 'proposal', proposal } }], hasMore: false };
    if (path.includes('/cancel')) return { ...proposal, status: 'cancelled' };
    return original(path, schema, options);
  });
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: '다른 방법 보기' }));
  expect(await screen.findByDisplayValue('다른 방법도 알려 줘')).toBeOnTheScreen();
  expect(screen.getByText('취소한 제안이에요')).toBeOnTheScreen();
  expect(mockFetch.mock.calls.filter(([path, , options]) => path === '/v1/chat/messages' && options?.method === 'POST')).toHaveLength(0);
});

test('기록 제안을 승인하면 서버 결과와 저장 메시지를 표시한다', async () => {
  const proposal = { id: '00000000-0000-4000-8000-000000000004', type: 'workout_log', status: 'pending', expiresAt: '2099-01-01T00:00:00Z', reasonLine: null, consumesQuota: false, changes: [], impact: null, warnings: [], goal: null, workout: null };
  const original = mockFetch.getMockImplementation()!;
  mockFetch.mockImplementation(async (path, schema, options) => {
    if (path === '/v1/chat/messages' && !options?.method) return { items: [{ ...reply, card: { type: 'proposal', proposal } }], hasMore: false };
    if (path.includes('/approve')) return { proposal: { ...proposal, status: 'approved' }, resultMessage: { ...reply, id: '00000000-0000-4000-8000-000000000005', role: 'system', content: '기록을 저장했어요' }, usage };
    return original(path, schema, options);
  });
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: '기록 저장' }));
  expect(await screen.findByText('기록을 저장했어요')).toBeOnTheScreen();
  expect(screen.getByText('적용했어요')).toBeOnTheScreen();
});

describe('승인 실패와 중복 승인 (AC-F05-04, AC-F05-05, AC-F05-11)', () => {
  const proposal = { id: '00000000-0000-4000-8000-000000000004', type: 'reschedule', status: 'pending', expiresAt: '2099-01-01T00:00:00Z', reasonLine: null, consumesQuota: true, changes: [], impact: null, warnings: [], goal: null, workout: null };
  const approveCalls = () => mockFetch.mock.calls.filter(([path]) => path.endsWith('/approve'));
  const withApprove = (approve: () => Promise<unknown>, extra: (path: string) => unknown = () => undefined) => {
    const original = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (path, schema, options) => {
      if (path === '/v1/chat/messages' && !options?.method) return { items: [{ ...reply, card: { type: 'proposal', proposal } }], hasMore: false };
      if (path.endsWith('/approve')) return approve();
      return extra(path) ?? original(path, schema, options);
    });
  };
  const approved = { proposal: { ...proposal, status: 'approved' }, resultMessage: { ...reply, id: '00000000-0000-4000-8000-000000000005', role: 'system', content: '일정을 변경했어요' }, usage: { ...usage, reschedule: { used: 1, limit: 1 } } };

  test('적용하기를 연속으로 눌러도 승인 요청은 한 번만 보낸다', async () => {
    let finish: (value: unknown) => void = () => undefined;
    withApprove(() => new Promise((resolve) => { finish = resolve; }));
    await show();
    const button = await screen.findByRole('button', { name: '적용하기' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(screen.getByRole('button', { name: '적용하기' }));
    expect(approveCalls()).toHaveLength(1);
    finish(approved);
    expect(await screen.findByText('일정을 변경했어요')).toBeOnTheScreen();
    expect(screen.getByText('적용했어요')).toBeOnTheScreen();
    expect(screen.getByText('AI 일정 변경 1/1회 사용')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '캘린더에서 보기' }));
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/calendar');
  });

  test('계획이 바뀌어 거절되면 서버 문구를 보여 주고 버튼을 없앤다', async () => {
    withApprove(() => Promise.reject(new ApiClientError('PLAN_CHANGED', '계획이 바뀌었어요. 다시 요청해 주세요.')));
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: '적용하기' }));
    expect(await screen.findByText('계획이 바뀌었어요. 다시 요청해 주세요.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '적용하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '다른 방법 보기' })).toBeNull();
  });

  test('만료로 거절되면 카드를 만료 상태로 바꾼다', async () => {
    withApprove(() => Promise.reject(new ApiClientError('PROPOSAL_EXPIRED', '이 제안은 만료됐어요. 다시 물어봐 주세요.')));
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: '적용하기' }));
    expect(await screen.findByText('이 제안은 만료됐어요. 다시 물어봐 주세요')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '적용하기' })).toBeNull();
  });

  test('이미 처리된 제안이면 다시 불러와 실제 상태를 보여 준다', async () => {
    withApprove(
      () => Promise.reject(new ApiClientError('PROPOSAL_NOT_PENDING', '이미 처리된 제안이에요.')),
      (path) => (path === `/v1/proposals/${proposal.id}` ? { ...proposal, status: 'superseded' } : undefined),
    );
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: '적용하기' }));
    expect(await screen.findByText('새 제안으로 바뀌었어요')).toBeOnTheScreen();
  });

  test('연결이 끊겨 실패하면 다시 시도로 같은 승인을 보낸다', async () => {
    let attempts = 0;
    withApprove(() => (++attempts === 1 ? Promise.reject(new ApiClientError('NETWORK_ERROR', '인터넷 연결을 확인하고 다시 시도해 주세요.')) : Promise.resolve(approved)));
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: '적용하기' }));
    await fireEvent.press(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('적용했어요')).toBeOnTheScreen();
    expect(approveCalls()).toHaveLength(2);
  });

  test('일정 변경 한도를 넘으면 카드는 그대로 두고 한도 안내를 붙인다', async () => {
    withApprove(() => Promise.reject(new ApiClientError('LIMIT_REACHED', '이번 달 일정 변경을 모두 썼어요.', { usage: { ...usage, reschedule: { used: 1, limit: 1 } } })));
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: '적용하기' }));
    expect(await screen.findByText('이번 달 AI 일정 변경을 모두 썼어요')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '적용하기' })).toBeEnabled();
  });
});

describe('서버와 대화 상태 맞추기', () => {
  const pending = { id: '00000000-0000-4000-8000-000000000004', type: 'reschedule', status: 'pending', expiresAt: '2099-01-01T00:00:00Z', reasonLine: null, consumesQuota: true, changes: [], impact: null, warnings: [], goal: null, workout: null };
  const newer = { ...pending, id: '00000000-0000-4000-8000-000000000006', reasonLine: '새로 맞춘 일정이에요' };

  test('새 제안을 받으면 이전 대기 제안의 상태를 서버에서 다시 받아 대체로 바꾼다 (DI-05)', async () => {
    const original = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (path, schema, options) => {
      if (path === '/v1/chat/messages' && !options?.method) return { items: [{ ...reply, card: { type: 'proposal', proposal: pending } }], hasMore: false };
      if (path === '/v1/chat/messages') return { userMessage, replies: [{ ...reply, id: '00000000-0000-4000-8000-000000000007', content: '다른 방법이에요', card: { type: 'proposal', proposal: newer } }], usage };
      if (path === `/v1/proposals/${pending.id}`) return { ...pending, status: 'superseded' };
      return original(path, schema, options);
    });
    await show();
    expect(await screen.findAllByRole('button', { name: '적용하기' })).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: '보내기' }));
    expect(await screen.findByText('새 제안으로 바뀌었어요')).toBeOnTheScreen();
    expect(screen.getByText('새로 맞춘 일정이에요')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: '적용하기' })).toHaveLength(1);
    expect(mockFetch).not.toHaveBeenCalledWith(`/v1/proposals/${newer.id}`, expect.anything());
  });

  test('다시 열었을 때 처리 중인 메시지가 있으면 대화를 다시 받아 답을 보여 준다', async () => {
    const processing = { ...userMessage, status: 'processing' };
    let reads = 0;
    const original = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (path, schema, options) => {
      if (path === '/v1/chat/messages' && !options?.method) return ++reads === 1 ? { items: [processing], hasMore: false } : { items: [reply, userMessage], hasMore: false };
      return original(path, schema, options);
    });
    await show();
    expect(await screen.findByText('어떻게 도와드릴까요?')).toBeOnTheScreen();
    expect(reads).toBeGreaterThanOrEqual(2);
    await waitFor(() => expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled());
  });

  test('처리 중이던 메시지가 실패로 끝나면 다시 보내기를 보여 준다', async () => {
    let reads = 0;
    const original = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (path, schema, options) => {
      if (path === '/v1/chat/messages' && !options?.method) return { items: [{ ...userMessage, status: ++reads === 1 ? 'processing' : 'failed' }], hasMore: false };
      return original(path, schema, options);
    });
    await show();
    expect(await screen.findByText('보내지 못했어요')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeEnabled();
  });
});
