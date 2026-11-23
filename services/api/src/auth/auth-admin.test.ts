import { describe, expect, test, vi } from 'vitest';
import { createAuthAdmin, SupabaseAuthAdmin, UnconfiguredAuthAdmin } from './auth-admin.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';

const fetchReturning = (status: number) => vi.fn<typeof fetch>(async () => new Response(null, { status }));

describe('인증 서비스의 사용자 삭제 (F01-R06, ARCHITECTURE §9)', () => {
  test('관리 키로 Supabase 관리 API에 삭제를 요청한다', async () => {
    const fetchMock = fetchReturning(200);
    await new SupabaseAuthAdmin('https://ref.supabase.co/', 'sb_secret_test', fetchMock).deleteUser(USER_ID);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://ref.supabase.co/auth/v1/admin/users/${USER_ID}`);
    expect(init?.method).toBe('DELETE');
    expect(init?.headers).toEqual({ apikey: 'sb_secret_test', Authorization: 'Bearer sb_secret_test' });
  });

  test('이미 없는 사용자는 지운 것으로 본다(다시 시도해도 같다)', async () => {
    await expect(new SupabaseAuthAdmin('https://ref.supabase.co', 'key', fetchReturning(404)).deleteUser(USER_ID)).resolves.toBeUndefined();
  });

  test.each([401, 500])('%i 응답은 실패로 알린다(지우지 못한 것을 성공으로 넘기지 않는다)', async (status) => {
    await expect(new SupabaseAuthAdmin('https://ref.supabase.co', 'key', fetchReturning(status)).deleteUser(USER_ID)).rejects.toThrow(String(status));
  });

  test('관리 키가 모두 있을 때만 Supabase 구현을 쓴다', () => {
    expect(createAuthAdmin({ SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_SECRET_KEY: 'key' })).toBeInstanceOf(SupabaseAuthAdmin);
    expect(createAuthAdmin({ SUPABASE_URL: 'https://ref.supabase.co' })).toBeInstanceOf(UnconfiguredAuthAdmin);
    expect(createAuthAdmin({})).toBeInstanceOf(UnconfiguredAuthAdmin);
  });
});


test('관리 API에서 일치하는 공급자의 식별자만 읽는다', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ id: USER_ID, identities: [{ provider: 'google', provider_id: 'google-subject' }] }));
  const admin = new SupabaseAuthAdmin('https://ref.supabase.co', 'key', fetchMock);
  await expect(admin.providerId(USER_ID, 'google')).resolves.toBe('google-subject');
  await expect(admin.providerId(USER_ID, 'apple')).rejects.toThrow();
});
