import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 서버가 거절한 요청(4xx 등)은 다시 보내도 같으므로, 연결 실패만 한 번 더 시도한다
      retry: (failureCount, error) =>
        error instanceof ApiClientError && error.code === 'NETWORK_ERROR' && failureCount < 1,
    },
  },
});
