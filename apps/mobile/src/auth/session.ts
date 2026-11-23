import type { AuthProvider } from '@pacemate/shared';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { AuthClient, type GoTrueClient } from '@supabase/auth-js';
import { AppState } from 'react-native';
import { setAccessTokenProvider } from '@/api/client';
import { queryClient } from '@/api/query-client';
import { resetAccountFirstRun } from '@/first-run/store';
import { clearDraft } from '@/onboarding/draft';
import { chunkedSecureStorage } from './secure-storage';

// 로그인 세션을 다루는 유일한 곳(ARCHITECTURE §9). 앱은 인증 서비스(Supabase)를 로그인에만 쓰므로
// DB 접근까지 담은 전체 SDK가 아니라 인증 SDK(`@supabase/auth-js`)만 쓴다.

const STORAGE_KEY = 'pacemate.auth';

let client: GoTrueClient | null | undefined;

/** 인증 서비스 주소와 공개 키가 없으면(로그인 설정 전) null이다. */
function authClient(): GoTrueClient | null {
  if (client !== undefined) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client =
    url && key
      ? new AuthClient({
          url: `${url.replace(/\/+$/, '')}/auth/v1`,
          headers: { apikey: key },
          storageKey: STORAGE_KEY,
          storage: chunkedSecureStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        })
      : null;
  return client;
}

/** 저장된 세션의 액세스 토큰. 만료가 가까우면 인증 SDK가 갱신해서 준다. 갱신도 안 되면 null이고, API의 `401`이 로그인 화면으로 보낸다(F01-R03). */
async function accessToken(): Promise<string | null> {
  const auth = authClient();
  if (!auth) return null;
  const { data } = await auth.getSession();
  return data.session?.access_token ?? null;
}

setAccessTokenProvider(accessToken);

// 앱이 앞에 있을 때만 토큰을 미리 갱신한다(인증 SDK의 React Native 사용법)
AppState.addEventListener('change', (state) => {
  const auth = authClient();
  if (!auth) return;
  if (state === 'active') void auth.startAutoRefresh();
  else void auth.stopAutoRefresh();
});

let googleConfigured = false;

function configureGoogle(webClientId: string): void {
  if (googleConfigured) return;
  // 받은 ID 토큰의 대상이 웹 클라이언트여야 인증 서비스가 받아 준다
  GoogleSignin.configure({ webClientId, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID });
  googleConfigured = true;
}

/**
 * Apple 또는 Google로 로그인한다(F01-R01). 사용자가 로그인 창을 닫으면 false를 돌려준다.
 * 실패하면 예외를 던지고, 세션은 남기지 않는다.
 */
export async function signIn(provider: AuthProvider): Promise<boolean> {
  if (provider === 'apple') throw new Error('Apple 로그인은 Apple 개발자 계정 등록 뒤에 연결한다');

  const auth = authClient();
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!auth || !webClientId) throw new Error('로그인 설정(EXPO_PUBLIC_SUPABASE_*, EXPO_PUBLIC_GOOGLE_*)이 없다');

  configureGoogle(webClientId);
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return false;

  const token = response.data.idToken;
  if (!token) throw new Error('Google이 ID 토큰을 주지 않았다');
  const { error } = await auth.signInWithIdToken({ provider: 'google', token });
  if (error) {
    await GoogleSignin.signOut().catch(() => undefined);
    throw error;
  }
  return true;
}

/** 기기에 남은 로그인 정보와 불러온 데이터를 지운다(F01-R04). */
export async function signOut(): Promise<void> {
  // 다음에 로그인하는 사람이 이전 사람의 온보딩 답변을 보지 않게 한다
  await clearDraft();
  await resetAccountFirstRun();
  queryClient.clear();

  const auth = authClient();
  if (auth) {
    const { error } = await auth.signOut({ scope: 'local' });
    // 인증 서비스에 닿지 못하면 SDK가 세션을 지우지 않으므로 기기에서 직접 지운다
    if (error) await chunkedSecureStorage.removeItem(STORAGE_KEY);
  }
  // 다음 로그인에서 계정을 다시 고를 수 있게 한다
  await GoogleSignin.signOut().catch(() => undefined);
}
