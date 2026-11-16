import { afterAll, beforeEach, expect, test } from 'vitest';
import { UsageService } from './usage.service.js';
import { createTestPrisma, resetDatabase } from '../../test/test-db.js';

const prisma = createTestPrisma();
const usage = new UsageService(prisma);
const userId = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  await resetDatabase(prisma);
  const now = new Date();
  await prisma.user.create({ data: { id: userId, authProvider: 'apple', termsAgreedAt: now, privacyAgreedAt: now, healthDataAgreedAt: now, consentVersion: '1' } });
});
afterAll(() => prisma.$disconnect());

test('DI-12 동시 요청은 한도를 넘지 않고 월별로 분리된다', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    prisma.$transaction((tx) => usage.increment(tx, userId, 'reschedule', '2026-12-31')),
  ));
  expect(results.filter(Boolean)).toHaveLength(2);
  expect(await usage.get(userId, '2026-12-31')).toEqual({ tier: 'free', chat: { used: 0, limit: 10 }, reschedule: { used: 2, limit: 2 }, resetsOn: '2027-01-01' });
  expect((await usage.get(userId, '2027-01-01')).reschedule.used).toBe(0);
});

test('이용량 증가는 호출 측 트랜잭션 롤백에 포함된다', async () => {
  await expect(prisma.$transaction(async (tx) => {
    await usage.increment(tx, userId, 'chat', '2026-11-16');
    throw new Error('rollback');
  })).rejects.toThrow('rollback');
  expect((await usage.get(userId, '2026-11-16')).chat.used).toBe(0);
});
