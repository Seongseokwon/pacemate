import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  AUTH_JWKS_URL: z.url(),
  AUTH_ISSUER: z.string().min(1),
  AUTH_AUDIENCE: z.string().min(1).default('authenticated'),
  // 계정 삭제 때 인증 서비스의 사용자를 지우는 관리 키(T-106). 둘 중 하나라도 없으면 계정 삭제가 끝나지 않는다
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  // LLM 공급자(T-407, D-03). LLM_PROVIDER가 없으면 채팅이 AI_UNAVAILABLE로 답한다. 키는 비밀값이다
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).optional(),
  LLM_MODEL: z.string().min(1).optional(),
  // Claude는 effort(low~max, 기본 low), GPT는 추론 모델의 reasoning_effort다
  LLM_EFFORT: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  // 단가 표(chat/llm/pricing.ts)에 없는 모델의 단가. GPT 모델은 넣어야 한다
  LLM_INPUT_USD_PER_MTOK: z.coerce.number().positive().optional(),
  LLM_OUTPUT_USD_PER_MTOK: z.coerce.number().positive().optional(),
  LLM_CACHED_INPUT_USD_PER_MTOK: z.coerce.number().positive().optional(),
  MIN_APP_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  // 웹훅과 내부 작업의 호출자를 확인하는 비밀값. 없으면 그 경로는 모든 요청을 거절한다
  SUBSCRIPTION_WEBHOOK_SECRET: z.string().min(32).optional(),
  INTERNAL_JOB_SECRET: z.string().min(32).optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

/** 환경 변수를 읽는다. 빠졌거나 형식이 틀리면 서버를 띄우지 않는다. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
