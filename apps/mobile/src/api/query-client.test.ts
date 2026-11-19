import { router } from 'expo-router';
import { ApiClientError } from './client';
import { queryClient, redirectOnApiError } from './query-client';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), canDismiss: jest.fn(() => true), dismissAll: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());
// 앱 전체가 함께 쓰는 클라이언트라 캐시 정리 타이머가 남으면 Jest 작업자가 끝나지 않는다
afterEach(() => queryClient.clear());

test.each([
  ['UNAUTHENTICATED', '/login'],
  ['CONSENT_REQUIRED', '/consent'],
  ['APP_UPDATE_REQUIRED', '/update'],
] as const)('%s 오류는 쌓인 화면을 걷고 %s 화면으로 보낸다 (API_SPEC §1.1)', (code, href) => {
  redirectOnApiError(new ApiClientError(code, '문장'));
  expect(router.dismissAll).toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith(href);
});

test('그 밖의 오류는 화면을 옮기지 않는다', () => {
  redirectOnApiError(new ApiClientError('NOT_FOUND', '요청한 내용을 찾을 수 없어요.'));
  redirectOnApiError(new ApiClientError('NETWORK_ERROR', '인터넷 연결을 확인하고 다시 시도해 주세요.'));
  redirectOnApiError(new Error('boom'));
  expect(router.replace).not.toHaveBeenCalled();
});

test('조회와 변경 요청이 실패하면 같은 분기를 탄다 (AC-F11-04)', async () => {
  const fail = () => Promise.reject(new ApiClientError('APP_UPDATE_REQUIRED', '새 버전으로 업데이트해 주세요.'));
  await expect(queryClient.fetchQuery({ queryKey: ['probe'], queryFn: fail })).rejects.toBeInstanceOf(ApiClientError);
  await expect(queryClient.getMutationCache().build(queryClient, { mutationFn: fail, gcTime: Infinity }).execute(undefined)).rejects.toBeInstanceOf(ApiClientError);
  expect(router.replace).toHaveBeenCalledTimes(2);
  expect(router.replace).toHaveBeenLastCalledWith('/update');
});
