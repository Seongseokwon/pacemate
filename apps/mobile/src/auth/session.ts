import type { AuthProvider } from '@pacemate/shared';
import { queryClient } from '@/api/query-client';

// 로그인 세션을 다루는 유일한 곳. 인증 서비스의 앱 SDK는 로그인 설정(D-A1)이 끝나면 이 파일에 붙이고,
// 그때 `setAccessTokenProvider`도 여기서 등록한다(ARCHITECTURE §9).

/** Apple 또는 Google로 로그인한다. 아직 연결되지 않아 항상 실패한다. */
export async function signIn(provider: AuthProvider): Promise<void> {
  throw new Error(`${provider} 로그인이 아직 연결되지 않았다`);
}

/** 기기에 남은 로그인 정보와 불러온 데이터를 지운다(F01-R04). */
export async function signOut(): Promise<void> {
  queryClient.clear();
}
