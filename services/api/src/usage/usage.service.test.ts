import { PLAN_LIMITS } from '@pacemate/shared';
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
  const { chat, reschedule } = PLAN_LIMITS.free;
  expect(results.filter(Boolean)).toHaveLength(reschedule);
  expect(await usage.get(userId, '2026-12-31')).toEqual({ tier: 'free', chat: { used: 0, limit: chat, pool: 'month' }, reschedule: { used: reschedule, limit: reschedule, pool: 'month' }, resetsOn: '2027-01-01' });
  expect((await usage.get(userId, '2027-01-01')).reschedule.used).toBe(0);
});

test('이용량 증가는 호출 측 트랜잭션 롤백에 포함된다', async () => {
  await expect(prisma.$transaction(async (tx) => {
    await usage.increment(tx, userId, 'chat', '2026-11-16');
    throw new Error('rollback');
  })).rejects.toThrow('rollback');
  expect((await usage.get(userId, '2026-11-16')).chat.used).toBe(0);
});


test('F10-R03 구독 만료에 따라 이용 한도를 적용하고 사용량을 유지한다', async () => {
  const date = '2026-11-16';
  expect((await usage.get(userId, date)).tier).toBe('free');
  await prisma.subscription.create({ data: { userId, productId: 'monthly', store: 'app_store', expiresAt: new Date('2100-01-01'), willRenew: false } });
  expect(await usage.get(userId, date)).toMatchObject({ tier: 'pro', chat: { limit: PLAN_LIMITS.pro.chat }, reschedule: { limit: PLAN_LIMITS.pro.reschedule } });
  for (let i = 0; i < 3; i++) {
    expect(await prisma.$transaction((tx) => usage.increment(tx, userId, 'reschedule', date))).toBe(true);
  }
  await prisma.subscription.update({ where: { userId }, data: { expiresAt: new Date('2000-01-01') } });
  expect(await usage.get(userId, date)).toMatchObject({ tier: 'free', reschedule: { used: 3, limit: PLAN_LIMITS.free.reschedule } });
  expect(await prisma.$transaction((tx) => usage.increment(tx, userId, 'reschedule', date))).toBe(false);
});

test('DI-12 동시 채팅 이용량은 무료 한도까지 증가한다', async () => {
  const results = await Promise.all(Array.from({ length: 15 }, () =>
    prisma.$transaction((tx) => usage.increment(tx, userId, 'chat', '2026-11-16')),
  ));
  const limit = PLAN_LIMITS.free.chat;
  expect(results.filter(Boolean)).toHaveLength(limit);
  expect((await usage.get(userId, '2026-11-16')).chat).toEqual({ used: limit, limit, pool: 'month' });
});

test('AC-F10-05 체험분을 먼저 쓰고 한 번 소진되면 다음 달에도 월 한도를 쓴다', async () => {
  await prisma.user.update({ where: { id: userId }, data: { identityHash: 'trial-user' } });
  const start = await usage.get(userId, '2026-11-16');
  expect(start.chat).toEqual({ used: 0, limit: 30, pool: 'trial' });
  for (let i = 0; i < 30; i++) expect(await prisma.$transaction((tx) => usage.increment(tx, userId, 'chat', '2026-11-16'))).toBe(true);
  expect((await usage.get(userId, '2026-11-16')).chat).toEqual({ used: 0, limit: 5, pool: 'month' });
  expect(await prisma.$transaction((tx) => usage.increment(tx, userId, 'chat', '2026-11-16'))).toBe(true);
  expect((await usage.get(userId, '2026-12-01')).chat).toEqual({ used: 0, limit: 5, pool: 'month' });
});

test('AC-F10-04 체험분과 월 한도 경계의 동시 차감은 한도를 넘지 않는다', async () => {
  await prisma.user.update({ where: { id: userId }, data: { identityHash: 'trial-user' } });
  await prisma.usageTrial.create({ data: { identityHash: 'trial-user', rescheduleCount: 2 } });
  const results = await Promise.all(Array.from({ length: 8 }, () => prisma.$transaction((tx) => usage.increment(tx, userId, 'reschedule', '2026-11-16'))));
  expect(results.filter(Boolean)).toHaveLength(2);
  expect((await prisma.usageTrial.findUniqueOrThrow({ where: { identityHash: 'trial-user' } })).rescheduleCount).toBe(3);
  expect((await usage.get(userId, '2026-11-16')).reschedule).toEqual({ used: 1, limit: 1, pool: 'month' });
});

test('AC-F10-05 Pro에서는 체험분이 줄지 않고 무료 복귀 후 이어진다', async () => {
  await prisma.user.update({ where: { id: userId }, data: { identityHash: 'trial-user' } });
  await prisma.usageTrial.create({ data: { identityHash: 'trial-user', chatCount: 10 } });
  await prisma.subscription.create({ data: { userId, productId: 'monthly', store: 'app_store', expiresAt: new Date('2100-01-01'), willRenew: false } });
  expect(await prisma.$transaction((tx) => usage.increment(tx, userId, 'chat', '2026-11-16'))).toBe(true);
  expect((await prisma.usageTrial.findUniqueOrThrow({ where: { identityHash: 'trial-user' } })).chatCount).toBe(10);
  await prisma.subscription.update({ where: { userId }, data: { expiresAt: new Date('2000-01-01') } });
  expect((await usage.get(userId, '2026-11-16')).chat).toEqual({ used: 10, limit: 30, pool: 'trial' });
});

test('DI-11 계정을 삭제해도 해시별 체험분 행은 남는다', async () => {
  await prisma.user.update({ where: { id: userId }, data: { identityHash: 'trial-user' } });
  await prisma.$transaction((tx) => usage.increment(tx, userId, 'chat', '2026-11-16'));
  await prisma.user.delete({ where: { id: userId } });
  expect((await prisma.usageTrial.findUniqueOrThrow({ where: { identityHash: 'trial-user' } })).chatCount).toBe(1);
});
