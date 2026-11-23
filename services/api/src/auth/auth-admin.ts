import { type AuthProvider } from '@pacemate/shared';
import { z } from 'zod';

/** 인증 서비스의 관리 기능. 계정 삭제에서 인증 서비스 쪽 사용자를 지운다(ARCHITECTURE §9). */
export interface AuthAdmin {
  deleteUser(userId: string): Promise<void>;
  providerId(userId: string, provider: AuthProvider): Promise<string>;
}

export const AUTH_ADMIN = Symbol('AUTH_ADMIN');

/** 인증 서비스의 관리 키가 없을 때의 구현. 지우지 못한 것을 성공으로 넘기지 않는다. */
export class UnconfiguredAuthAdmin implements AuthAdmin {
  async providerId(): Promise<string> {
    throw new Error('인증 서비스의 관리 기능이 설정되지 않았다');
  }

  async deleteUser(): Promise<void> {
    throw new Error('인증 서비스의 관리 기능이 설정되지 않았다');
  }
}

/** Supabase 관리 API로 인증 서비스의 사용자를 지운다. 이미 없는 사용자는 지운 것으로 본다(다시 시도해도 결과가 같다). */
export class SupabaseAuthAdmin implements AuthAdmin {
  constructor(
    private readonly baseUrl: string,
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async providerId(userId: string, provider: AuthProvider): Promise<string> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
    const response = await this.fetchImpl(url, {
      headers: { apikey: this.secretKey, Authorization: `Bearer ${this.secretKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`인증 서비스의 사용자를 조회하지 못했다: ${response.status}`);
    const parsed = z.object({ id: z.literal(userId), identities: z.array(z.object({ provider: z.string(), provider_id: z.string().min(1) })) }).safeParse(await response.json());
    const identities = parsed.success ? parsed.data.identities.filter((identity) => identity.provider === provider) : [];
    if (identities.length !== 1) throw new Error('인증 서비스의 로그인 식별자를 확인하지 못했다');
    return identities[0]!.provider_id;
  }

  async deleteUser(userId: string): Promise<void> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
    const response = await this.fetchImpl(url, {
      method: 'DELETE',
      headers: { apikey: this.secretKey, Authorization: `Bearer ${this.secretKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok || response.status === 404) return;
    // 응답 본문에는 사용자 정보가 있을 수 있어 상태 코드만 남긴다
    throw new Error(`인증 서비스의 사용자를 지우지 못했다: ${response.status}`);
  }
}

/** 관리 키가 있으면 Supabase 구현을, 없으면(로그인 설정 전) 지우지 못한 것을 성공으로 넘기지 않는 구현을 쓴다. */
export function createAuthAdmin(config: { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string }): AuthAdmin {
  return config.SUPABASE_URL && config.SUPABASE_SECRET_KEY
    ? new SupabaseAuthAdmin(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY)
    : new UnconfiguredAuthAdmin();
}
