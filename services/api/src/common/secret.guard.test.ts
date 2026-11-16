import type { ExecutionContext } from '@nestjs/common';
import { expect, test } from 'vitest';
import type { AppConfig } from '../config.js';
import { secretGuard } from './secret.guard.js';

const SECRET = 'job-secret-0123456789abcdef0123456789abcdef';

const check = (config: Partial<AppConfig>, authorization?: string) => {
  const Guard = secretGuard('INTERNAL_JOB_SECRET');
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ header: () => authorization }) }),
  } as unknown as ExecutionContext;
  return () => new Guard(config as AppConfig).canActivate(context);
};

test('비밀값이 맞으면 통과한다', () => {
  expect(check({ INTERNAL_JOB_SECRET: SECRET }, `Bearer ${SECRET}`)()).toBe(true);
});

test.each([
  ['비밀값이 틀리다', `Bearer ${SECRET}x`],
  ['다른 용도의 비밀값이다', 'Bearer webhook-secret-0123456789abcdef0123456789'],
  ['Bearer가 없다', SECRET],
  ['헤더가 없다', undefined],
])('%s → 거절한다', (_name, authorization) => {
  const config = { INTERNAL_JOB_SECRET: SECRET, SUBSCRIPTION_WEBHOOK_SECRET: 'webhook-secret-0123456789abcdef0123456789' };
  expect(check(config, authorization)).toThrow('로그인이 필요해요.');
});

test('서버에 비밀값이 설정되지 않았으면 무엇을 보내도 거절한다', () => {
  expect(check({}, 'Bearer undefined')).toThrow();
  expect(check({}, 'Bearer ')).toThrow();
});
