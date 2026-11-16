import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AUTH_ADMIN, UnconfiguredAuthAdmin } from '../src/auth/auth-admin.js';
import { JWKS } from '../src/auth/token-verifier.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { configureApp } from '../src/setup.js';
import { createTestPrisma, resetDatabase, TEST_DATABASE_URL } from './test-db.js';

const config: AppConfig = {
  PORT: 0,
  DATABASE_URL: TEST_DATABASE_URL,
  AUTH_JWKS_URL: 'https://auth.test/jwks.json',
  AUTH_ISSUER: 'https://auth.test/auth/v1',
  AUTH_AUDIENCE: 'authenticated',
  MIN_APP_VERSION: '1.0.0',
};
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CONSENT = { consentVersion: 'v1', agreedTerms: true, agreedPrivacy: true, agreedHealthData: true };

// 필수 동의가 필요한 보통의 경로를 대신한다
@Controller('probe')
class ProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

const prisma = createTestPrisma();
const authAdmin = { deleted: [] as string[], failing: false };
let app: INestApplication;
let sign: (sub: string, provider?: string) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' };
  sign = (sub, provider = 'google') =>
    new SignJWT({ app_metadata: { provider } })
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(sub)
      .setIssuer(config.AUTH_ISSUER)
      .setAudience(config.AUTH_AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(JWKS)
    .useValue(createLocalJWKSet({ keys: [jwk] }))
    .overrideProvider(AUTH_ADMIN)
    .useValue({
      async deleteUser(userId: string) {
        if (authAdmin.failing) throw new Error('인증 서비스 오류');
        authAdmin.deleted.push(userId);
      },
    })
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  authAdmin.deleted = [];
  authAdmin.failing = false;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const call = async (method: 'get' | 'post' | 'delete', path: string, user = USER_A, body?: object) =>
  request(app.getHttpServer())
    [method](path)
    .set({ 'X-App-Version': '1.0.0', 'X-App-Platform': 'ios' })
    .auth(await sign(user), { type: 'bearer' })
    .send(body);

const register = (user = USER_A, body: object = CONSENT) => call('post', '/v1/me', user, body);

/** 계정 삭제로 지워져야 하는 개인 데이터와, 남아야 하는 비용 통계를 만든다. */
async function seedPersonalData(userId: string) {
  await prisma.runnerProfile.create({
    data: {
      userId,
      experience: 'none',
      continuousRun: 'under_10m',
      weeklyRunCount: 3,
      preferredWeekdays: [1, 3, 5],
      level: 'beginner',
    },
  });
  await prisma.trainingPlan.create({
    data: {
      userId,
      status: 'active',
      goalDistance: 'half',
      startDate: new Date('2026-11-16'),
      endDate: new Date('2027-02-07'),
      engineVersion: 'test',
    },
  });
  await prisma.usageCounter.create({ data: { userId, month: '2026-11', chatCount: 3 } });
  await prisma.subscription.create({
    data: { userId, productId: 'pro_monthly', store: 'app_store', expiresAt: new Date('2100-01-01'), willRenew: true },
  });
  await prisma.aiCallLog.create({
    data: {
      userId,
      purpose: 'chat',
      model: 'fake',
      promptVersion: 'v1',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.001,
      toolCallCount: 0,
      success: true,
      latencyMs: 1,
    },
  });
}

describe('GET /v1/me', () => {
  test('동의 전에는 가입하지 않은 상태와 토큰의 로그인 수단을 돌려준다', async () => {
    const res = await call('get', '/v1/me');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      registered: false,
      onboardingCompleted: false,
      hasActivePlan: false,
      authProvider: 'google',
      usage: { tier: 'free', chat: { used: 0, limit: 10 } },
      subscription: null,
    });
    expect(await prisma.user.count()).toBe(0);
  });

  test('프로필, 활성 계획, 구독, 이용량을 내 것만 돌려준다 (DI-07)', async () => {
    await register(USER_A);
    await register(USER_B);
    await seedPersonalData(USER_A);

    expect((await call('get', '/v1/me', USER_A)).body).toMatchObject({
      registered: true,
      onboardingCompleted: true,
      hasActivePlan: true,
      usage: { tier: 'pro', chat: { used: 3, limit: 100 } },
      subscription: { productId: 'pro_monthly', store: 'app_store', expiresAt: '2100-01-01T00:00:00.000Z', willRenew: true },
    });
    expect((await call('get', '/v1/me', USER_B)).body).toMatchObject({
      registered: true,
      onboardingCompleted: false,
      hasActivePlan: false,
      usage: { tier: 'free', chat: { used: 0 } },
      subscription: null,
    });
  });
});

describe('POST /v1/me (F01-R02)', () => {
  test('세 동의가 모두 있어야 계정이 만들어진다', async () => {
    const res = await register(USER_A, { ...CONSENT, agreedHealthData: false });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.user.count()).toBe(0);
  });

  test('동의를 저장하고 가입한 상태를 돌려준다', async () => {
    const res = await register();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ registered: true, onboardingCompleted: false, authProvider: 'google' });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: USER_A } })).toMatchObject({
      authProvider: 'google',
      consentVersion: 'v1',
      termsAgreedAt: expect.any(Date),
      privacyAgreedAt: expect.any(Date),
      healthDataAgreedAt: expect.any(Date),
    });
  });

  test('이미 가입한 계정이 다시 보내면 기존 상태를 그대로 돌려준다', async () => {
    await register();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: USER_A } });

    const res = await register(USER_A, { ...CONSENT, consentVersion: 'v2' });

    expect(res.body.registered).toBe(true);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: USER_A } })).toEqual(before);
  });
});

describe('필수 동의 확인 (AC-F01-02)', () => {
  test('동의 전의 계정은 다른 경로를 쓸 수 없고, 가입하면 쓸 수 있다', async () => {
    const before = await call('get', '/v1/probe');
    expect(before.status).toBe(403);
    expect(before.body).toEqual({ code: 'CONSENT_REQUIRED', message: '약관 동의가 필요해요.' });

    await register();
    expect((await call('get', '/v1/probe')).body).toEqual({ ok: true });
    expect((await call('get', '/v1/probe', USER_B)).status).toBe(403);
  });
});

describe('DELETE /v1/me (F01-R05, F01-R06, DI-11)', () => {
  test('개인 데이터와 인증 서비스의 사용자를 지우고, 같은 계정은 새 계정으로 시작한다 (AC-F01-04)', async () => {
    await register(USER_A);
    await register(USER_B);
    await seedPersonalData(USER_A);
    await seedPersonalData(USER_B);

    expect((await call('delete', '/v1/me')).status).toBe(204);

    expect(authAdmin.deleted).toEqual([USER_A]);
    expect(await prisma.user.findUnique({ where: { id: USER_A } })).toBeNull();
    for (const count of [
      prisma.runnerProfile.count({ where: { userId: USER_A } }),
      prisma.trainingPlan.count({ where: { userId: USER_A } }),
      prisma.usageCounter.count({ where: { userId: USER_A } }),
      prisma.subscription.count({ where: { userId: USER_A } }),
    ]) {
      expect(await count).toBe(0);
    }
    // 본문이 없는 비용 통계는 사용자만 비우고 남긴다(DATABASE §7)
    expect(await prisma.aiCallLog.count({ where: { userId: null } })).toBe(1);
    expect(await prisma.runnerProfile.count({ where: { userId: USER_B } })).toBe(1);

    expect((await call('get', '/v1/me')).body).toMatchObject({ registered: false, onboardingCompleted: false });
    expect((await register()).body).toMatchObject({ registered: true, onboardingCompleted: false, hasActivePlan: false });
  });

  test('인증 서비스 쪽이 실패하면 500이고, 다시 호출하면 이어서 끝낸다', async () => {
    await register();
    await seedPersonalData(USER_A);
    authAdmin.failing = true;

    const failed = await call('delete', '/v1/me');
    expect(failed.status).toBe(500);
    expect(failed.body.code).toBe('INTERNAL_ERROR');
    // 개인 데이터는 이미 지워졌고, 다시 시도하라는 표시만 남는다
    expect(await prisma.runnerProfile.count()).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: USER_A } })).deletionRequestedAt).toBeInstanceOf(Date);
    expect((await call('get', '/v1/me')).body.registered).toBe(false);
    expect((await call('get', '/v1/probe')).status).toBe(403);

    authAdmin.failing = false;
    expect((await call('delete', '/v1/me')).status).toBe(204);
    expect(authAdmin.deleted).toEqual([USER_A]);
    expect(await prisma.user.count()).toBe(0);
  });

  test('삭제가 끝나지 않은 계정이 다시 동의하면 새 계정으로 시작한다', async () => {
    await register();
    authAdmin.failing = true;
    await call('delete', '/v1/me');

    const res = await register(USER_A, { ...CONSENT, consentVersion: 'v2' });

    expect(res.body).toMatchObject({ registered: true, onboardingCompleted: false });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: USER_A } })).toMatchObject({
      consentVersion: 'v2',
      deletionRequestedAt: null,
    });
  });

  test('가입한 적 없는 계정은 지울 것이 없다', async () => {
    const res = await call('delete', '/v1/me');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
    expect(authAdmin.deleted).toEqual([]);
  });

  test('관리 기능이 설정되지 않은 기본 구현은 성공한 것처럼 넘어가지 않는다', async () => {
    await expect(new UnconfiguredAuthAdmin().deleteUser()).rejects.toThrow();
  });
});
