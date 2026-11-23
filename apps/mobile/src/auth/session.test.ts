import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { AuthClient } from '@supabase/auth-js';
import { setAccessTokenProvider } from '@/api/client';
import { queryClient } from '@/api/query-client';
import { resetAccountFirstRun } from '@/first-run/store';
import { clearDraft } from '@/onboarding/draft';
import { chunkedSecureStorage } from './secure-storage';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn(() => Promise.resolve(true)), signIn: jest.fn(), signOut: jest.fn(() => Promise.resolve(null)) },
  isSuccessResponse: (response: { type: string }) => response.type === 'success',
}));
jest.mock('@supabase/auth-js', () => {
  const auth = {
    getSession: jest.fn(),
    signInWithIdToken: jest.fn(),
    signOut: jest.fn(),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  };
  return { auth, AuthClient: jest.fn(() => auth) };
});
jest.mock('@/api/client', () => ({ setAccessTokenProvider: jest.fn() }));
jest.mock('@/api/query-client', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('@/first-run/store', () => ({ resetAccountFirstRun: jest.fn(() => Promise.resolve()) }));
jest.mock('@/onboarding/draft', () => ({ clearDraft: jest.fn(() => Promise.resolve()) }));
jest.mock('./secure-storage', () => ({ chunkedSecureStorage: { removeItem: jest.fn(() => Promise.resolve()) } }));

const auth = (jest.requireMock('@supabase/auth-js') as { auth: Record<string, jest.Mock> }).auth;
const google = jest.mocked(GoogleSignin);

type Session = typeof import('./session');

/** 환경 변수를 넣은 뒤 모듈을 새로 불러온다. 인증 클라이언트는 처음 쓸 때 환경 변수를 읽는다. */
function load(env: Record<string, string | undefined>): Session {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  let session!: Session;
  jest.isolateModules(() => {
    session = jest.requireActual<Session>('./session');
  });
  return session;
}

const CONFIGURED = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://ref.supabase.co/',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client',
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client',
};
const UNCONFIGURED = Object.fromEntries(Object.keys(CONFIGURED).map((key) => [key, undefined]));

beforeEach(() => {
  jest.clearAllMocks();
  auth.signInWithIdToken!.mockResolvedValue({ data: {}, error: null });
  auth.signOut!.mockResolvedValue({ error: null });
});

/** 앱이 등록한 액세스 토큰 함수 */
const registeredProvider = () => jest.mocked(setAccessTokenProvider).mock.calls.at(-1)![0];

describe('Google 로그인 (F01-R01)', () => {
  test('Google ID 토큰을 인증 서비스에 넘겨 세션을 받는다', async () => {
    const { signIn } = load(CONFIGURED);
    google.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-id-token' } } as never);

    await expect(signIn('google')).resolves.toBe(true);

    expect(google.configure).toHaveBeenCalledWith({ webClientId: 'web-client', iosClientId: 'ios-client' });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google-id-token' });
    expect(AuthClient).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://ref.supabase.co/auth/v1', headers: { apikey: 'sb_publishable_test' }, persistSession: true }),
    );
  });

  test('로그인 창을 닫으면 세션을 만들지 않고 false를 돌려준다', async () => {
    const { signIn } = load(CONFIGURED);
    google.signIn.mockResolvedValue({ type: 'cancelled', data: null } as never);

    await expect(signIn('google')).resolves.toBe(false);
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  test('인증 서비스가 거절하면 실패로 알리고 Google 로그인도 되돌린다', async () => {
    const { signIn } = load(CONFIGURED);
    google.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-id-token' } } as never);
    auth.signInWithIdToken!.mockResolvedValue({ data: {}, error: new Error('invalid token') });

    await expect(signIn('google')).rejects.toThrow('invalid token');
    expect(google.signOut).toHaveBeenCalled();
  });

  test('로그인 설정이 없으면 성공한 것처럼 넘어가지 않는다', async () => {
    const { signIn } = load(UNCONFIGURED);

    await expect(signIn('google')).rejects.toThrow();
    expect(google.signIn).not.toHaveBeenCalled();
  });

  test('Apple 로그인은 아직 연결되지 않아 실패한다', async () => {
    const { signIn } = load(CONFIGURED);
    await expect(signIn('apple')).rejects.toThrow();
  });
});

describe('액세스 토큰 (F01-R03)', () => {
  test('저장된 세션의 액세스 토큰을 API 요청에 준다', async () => {
    load(CONFIGURED);
    auth.getSession!.mockResolvedValue({ data: { session: { access_token: 'access-1' } }, error: null });

    await expect(registeredProvider()()).resolves.toBe('access-1');
  });

  test('세션이 없거나 로그인 설정 전이면 토큰 없이 보낸다', async () => {
    load(CONFIGURED);
    auth.getSession!.mockResolvedValue({ data: { session: null }, error: null });
    await expect(registeredProvider()()).resolves.toBeNull();

    load(UNCONFIGURED);
    await expect(registeredProvider()()).resolves.toBeNull();
  });
});

describe('로그아웃 (F01-R04)', () => {
  test('기기의 세션과 데이터를 지우고 Google 계정 선택도 초기화한다', async () => {
    const { signOut } = load(CONFIGURED);

    await signOut();

    expect(clearDraft).toHaveBeenCalled();
    expect(resetAccountFirstRun).toHaveBeenCalled();
    expect(queryClient.clear).toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(chunkedSecureStorage.removeItem).not.toHaveBeenCalled();
    expect(google.signOut).toHaveBeenCalled();
  });

  test('인증 서비스에 닿지 못해도 기기의 세션은 지운다', async () => {
    const { signOut } = load(CONFIGURED);
    auth.signOut!.mockResolvedValue({ error: new Error('network') });

    await signOut();

    expect(chunkedSecureStorage.removeItem).toHaveBeenCalledWith('pacemate.auth');
  });
});
