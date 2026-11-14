import { Body, Controller, Get, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RATE_LIMIT_PER_MINUTE } from '@pacemate/shared';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { CurrentUserId } from '../src/auth/current-user.decorator.js';
import { JWKS } from '../src/auth/token-verifier.js';
import { ZodPipe } from '../src/common/zod.pipe.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { configureApp } from '../src/setup.js';
import { TEST_DATABASE_URL } from './test-db.js';

const config: AppConfig = {
  PORT: 0,
  DATABASE_URL: TEST_DATABASE_URL,
  AUTH_JWKS_URL: 'https://auth.test/jwks.json',
  AUTH_ISSUER: 'https://auth.test/auth/v1',
  AUTH_AUDIENCE: 'authenticated',
  MIN_APP_VERSION: '1.2.0',
};
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const OK_VERSION = { 'X-App-Version': '1.2.0', 'X-App-Platform': 'ios' };

// 실제 엔드포인트가 아직 없어서, 인증이 필요한 경로를 테스트용으로 붙인다
@Controller('probe')
class ProbeController {
  @Get('me')
  me(@CurrentUserId() userId: string) {
    return { userId };
  }

  @Post('echo')
  echo(@Body(new ZodPipe(z.object({ count: z.int().positive() }))) body: { count: number }) {
    return body;
  }

  @Get('boom')
  boom() {
    throw new Error('내부 사정이 담긴 메시지');
  }
}

let app: INestApplication;
let sign: (claims?: { sub?: string; iss?: string; aud?: string; exp?: string }) => Promise<string>;
let signWithOtherKey: () => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const other = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' };

  const token = (key: CryptoKey, c: { sub?: string; iss?: string; aud?: string; exp?: string }) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(c.sub ?? USER_A)
      .setIssuer(c.iss ?? config.AUTH_ISSUER)
      .setAudience(c.aud ?? config.AUTH_AUDIENCE)
      .setExpirationTime(c.exp ?? '5m')
      .sign(key);
  sign = (claims = {}) => token(privateKey, claims);
  signWithOtherKey = () => token(other.privateKey, {});

  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(JWKS)
    .useValue(createLocalJWKSet({ keys: [jwk] }))
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
});

afterAll(() => app.close());

const api = () => request(app.getHttpServer());

describe('상태 확인', () => {
  test('토큰과 앱 버전 없이 응답하고 DB 연결을 확인한다', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('앱 버전 확인 (F11-R06, AC-F11-04)', () => {
  test('지원하지 않는 버전은 426이다. 토큰보다 먼저 확인한다', async () => {
    const res = await api().get('/v1/probe/me').set('X-App-Version', '1.1.9');
    expect(res.status).toBe(426);
    expect(res.body.code).toBe('APP_UPDATE_REQUIRED');
  });

  test('버전 헤더가 없거나 형식이 틀리면 400이다', async () => {
    for (const headers of [{}, { 'X-App-Version': 'latest' }]) {
      const res = await api().get('/v1/probe/me').set(headers);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('인증', () => {
  test('유효한 토큰이면 토큰의 사용자 ID를 얻는다', async () => {
    const res = await api().get('/v1/probe/me').set(OK_VERSION).auth(await sign(), { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: USER_A });
  });

  test('토큰이 없으면 401이다', async () => {
    const res = await api().get('/v1/probe/me').set(OK_VERSION);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' });
  });

  test.each([
    ['형식이 틀린 토큰', async () => 'not-a-token'],
    ['다른 키로 서명한 토큰', () => signWithOtherKey()],
    ['만료된 토큰', () => sign({ exp: '-1m' })],
    ['다른 발급자의 토큰', () => sign({ iss: 'https://evil.test' })],
    ['대상이 다른 토큰', () => sign({ aud: 'service_role' })],
    ['사용자 ID가 uuid가 아닌 토큰', () => sign({ sub: 'admin' })],
  ])('%s은 401이다', async (_name, makeToken) => {
    const res = await api().get('/v1/probe/me').set(OK_VERSION).auth(await makeToken(), { type: 'bearer' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

describe('오류 형식과 입력 검증', () => {
  test('스키마에 맞지 않는 본문은 항목별 사유와 함께 400이다', async () => {
    const res = await api()
      .post('/v1/probe/echo')
      .set(OK_VERSION)
      .auth(await sign(), { type: 'bearer' })
      .send({ count: -1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.fields).toHaveProperty('count');
  });

  test('없는 경로는 404 NOT_FOUND다', async () => {
    const res = await api().get('/v1/nowhere').set(OK_VERSION);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('처리 중 예외는 500이고 내부 메시지를 노출하지 않는다', async () => {
    const res = await api().get('/v1/probe/boom').set(OK_VERSION).auth(await sign(), { type: 'bearer' });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('내부 사정');
  });
});

describe('요청 제한', () => {
  test('사용자별로 분당 한도를 넘으면 429다', async () => {
    const token = await sign({ sub: USER_B });
    const call = () => api().get('/v1/probe/me').set(OK_VERSION).auth(token, { type: 'bearer' });

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE.default; i++) {
      expect((await call()).status).toBe(200);
    }
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');

    // 다른 사용자는 영향받지 않는다
    const other = await api().get('/v1/probe/me').set(OK_VERSION).auth(await sign(), { type: 'bearer' });
    expect(other.status).toBe(200);
  });
});
