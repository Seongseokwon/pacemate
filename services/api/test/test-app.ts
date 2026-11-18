import type { INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { JWKS } from '../src/auth/token-verifier.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { configureApp } from '../src/setup.js';
import { TEST_DATABASE_URL } from './test-db.js';

const config: AppConfig = {
  PORT: 0,
  DATABASE_URL: TEST_DATABASE_URL,
  AUTH_JWKS_URL: 'https://auth.test/jwks.json',
  AUTH_ISSUER: 'https://auth.test/auth/v1',
  AUTH_AUDIENCE: 'authenticated',
  MIN_APP_VERSION: '1.0.0',
};

/** 로컬 키로 서명한 토큰을 받는 앱을 띄운다. `override`로 외부 연동을 가짜로 바꾼다. */
export async function createTestApp(options: { controllers?: Type[]; override?: (builder: TestingModuleBuilder) => void } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' };
  const builder = Test.createTestingModule({ imports: [AppModule], controllers: options.controllers })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(JWKS)
    .useValue(createLocalJWKSet({ keys: [jwk] }));
  options.override?.(builder);
  const app: INestApplication = (await builder.compile()).createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const sign = (userId: string) =>
    new SignJWT({ app_metadata: { provider: 'google' } })
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(userId)
      .setIssuer(config.AUTH_ISSUER)
      .setAudience(config.AUTH_AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);

  /** `userId`로 로그인한 앱의 요청 */
  const call = async (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, userId: string, body?: object) =>
    request(app.getHttpServer())[method](path)
      .set({ 'X-App-Version': '1.0.0', 'X-App-Platform': 'ios' })
      .auth(await sign(userId), { type: 'bearer' })
      .send(body);

  return { app, call };
}
