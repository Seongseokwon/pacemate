import { createHmac } from 'node:crypto';
import type { AuthProvider } from '@pacemate/shared';

/** 로그인 공급자 식별자는 인증된 토큰에서만 받아야 한다. */
export function identityHash(provider: AuthProvider, subject: string, secret: string): string {
  if (!subject || !secret) throw new Error('계정 식별자와 비밀값이 필요해요.');
  return createHmac('sha256', secret).update(JSON.stringify([provider, subject])).digest('hex');
}
