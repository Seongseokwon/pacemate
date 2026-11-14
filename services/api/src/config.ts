import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  AUTH_JWKS_URL: z.url(),
  AUTH_ISSUER: z.string().min(1),
  AUTH_AUDIENCE: z.string().min(1).default('authenticated'),
  MIN_APP_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

/** 환경 변수를 읽는다. 빠졌거나 형식이 틀리면 서버를 띄우지 않는다. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
