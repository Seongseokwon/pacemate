import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { ApiClientError, type ApiClientErrorCode } from './client';

/** 어느 화면에서 나든 같은 화면으로 보내는 오류(API_SPEC §1.1). 그 밖의 오류는 각 화면이 `message`를 보여 준다. */
const REDIRECTS: Partial<Record<ApiClientErrorCode, Href>> = {
  UNAUTHENTICATED: '/login',
  CONSENT_REQUIRED: '/consent',
  APP_UPDATE_REQUIRED: '/update',
};

const redirectOf = (error: unknown) => (error instanceof ApiClientError ? REDIRECTS[error.code] : undefined);

/** 다른 화면으로 보내는 오류인지. 그런 오류는 화면이 따로 안내하지 않는다. */
export const isRedirectError = (error: unknown): boolean => redirectOf(error) !== undefined;

export function redirectOnApiError(error: unknown): void {
  const href = redirectOf(error);
  if (!href) return;
  // 위에 쌓인 화면을 걷어 내야 뒤로 가기로 원래 화면에 돌아가지 않는다
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: redirectOnApiError }),
  mutationCache: new MutationCache({ onError: redirectOnApiError }),
  defaultOptions: {
    queries: {
      // 서버가 거절한 요청(4xx 등)은 다시 보내도 같으므로, 연결 실패만 한 번 더 시도한다
      retry: (failureCount, error) =>
        error instanceof ApiClientError && error.code === 'NETWORK_ERROR' && failureCount < 1,
    },
  },
});
