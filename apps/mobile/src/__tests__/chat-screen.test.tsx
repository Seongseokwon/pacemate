import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { apiFetch, ApiClientError } from '@/api/client';
import Coach from '../app/(tabs)/coach';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ draft: '훈련을 바꾸고 싶어요' }), router: { replace: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001') }));
jest.mock('@/api/client', () => ({ ...jest.requireActual('@/api/client'), apiFetch: jest.fn() }));
const usage = { tier: 'free', chat: { used: 2, limit: 5 }, reschedule: { used: 0, limit: 1 }, resetsOn: '2026-12-01' };
const userMessage = { id: '00000000-0000-4000-8000-000000000002', role: 'user', status: 'done', content: '훈련을 바꾸고 싶어요', createdAt: '2026-11-19T00:00:00Z', card: null };
const reply = { ...userMessage, id: '00000000-0000-4000-8000-000000000003', role: 'assistant', content: '어떻게 도와드릴까요?' };
const mockFetch = jest.mocked(apiFetch);
const show = async () => {
  await render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}><Coach /></QueryClientProvider>);
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
