import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createLlmProvider } from '../../src/chat/llm/create-llm-provider.js';
import { LLM_PROVIDER } from '../../src/chat/llm/llm-provider.js';
import { createTestApp } from '../test-app.js';
import { createTestPrisma } from '../test-db.js';
import { EVAL_CASES } from './cases.js';
import { PLAN_DAY, runSuite, SwitchableProvider, type EvalEnv } from './runner.js';
import { formatReport, verdictOf } from './scoring.js';

// 실제 공급자로 평가 세트를 돌려 공급자를 비교한다(T-407, D-03). 비용이 드는 실행이라 EVAL_MODELS가 있을 때만 돈다.
//   EVAL_MODELS="anthropic:claude-opus-5-5@low,openai:gpt-모델:1.25:10" pnpm --filter @pacemate/api eval
// 항목 형식: 공급자:모델[@effort][:입력 단가:출력 단가[:캐시 입력 단가]] (단가는 USD / 100만 토큰, 표에 없는 모델만)
// 키는 ANTHROPIC_API_KEY, OPENAI_API_KEY 환경 변수에서 읽는다. 결과는 test/eval/reports/에 남는다(저장소에 올리지 않는다).

interface Target {
  label: string;
  config: Parameters<typeof createLlmProvider>[0];
}

export function parseTargets(spec: string, env: NodeJS.ProcessEnv = process.env): Target[] {
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const [vendor, modelPart, input, output, cached] = item.split(':');
      if (vendor !== 'anthropic' && vendor !== 'openai') throw new Error(`공급자는 anthropic 또는 openai다: ${item}`);
      if (!modelPart) throw new Error(`모델이 없다: ${item}`);
      const [model, effort] = modelPart.split('@');
      const number = (value: string | undefined) => (value === undefined ? undefined : Number(value));
      return {
        label: item.split(':').slice(0, 2).join(':'),
        config: {
          LLM_PROVIDER: vendor,
          LLM_MODEL: model,
          ...(effort && { LLM_EFFORT: effort }),
          ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
          OPENAI_API_KEY: env.OPENAI_API_KEY,
          LLM_INPUT_USD_PER_MTOK: number(input),
          LLM_OUTPUT_USD_PER_MTOK: number(output),
          LLM_CACHED_INPUT_USD_PER_MTOK: number(cached),
        },
      };
    });
}

const spec = process.env.EVAL_MODELS ?? '';

describe.skipIf(!spec)('실제 공급자 평가 (T-407)', () => {
  const prisma = createTestPrisma();
  const provider = new SwitchableProvider();
  let env: EvalEnv;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${PLAN_DAY}T03:00:00Z`) });
    const app = await createTestApp({ override: (builder) => builder.overrideProvider(LLM_PROVIDER).useValue(provider) });
    env = { app, prisma, provider };
  });

  afterAll(async () => {
    vi.useRealTimers();
    await env?.app.app.close();
    await prisma.$disconnect();
  });

  for (const target of parseTargets(spec)) {
    test(target.label, { timeout: 60 * 60_000 }, async () => {
      const real = createLlmProvider(target.config);
      const { results, consistency } = await runSuite(env, EVAL_CASES, () => real);
      const report = formatReport(target.label, results, consistency);
      const dir = new URL('./reports/', import.meta.url);
      mkdirSync(dir, { recursive: true });
      const file = new URL(`${new Date().toISOString().slice(0, 10)}-${target.label.replace(/[^a-zA-Z0-9.-]+/g, '_')}.md`, dir);
      writeFileSync(file, report);
      console.log(`${target.label}: ${verdictOf(results).pass ? '확정 기준을 넘음' : '확정 기준을 넘지 못함'} → ${file.pathname}`);
      // 판정은 보고서로 남기고, 실행 자체는 실패로 치지 않는다. 공급자를 비교하려면 모든 모델의 결과가 필요하다
      expect(results.length).toBeGreaterThan(0);
    });
  }
});

describe('평가 대상 형식', () => {
  test('공급자, 모델, effort, 단가를 읽는다', () => {
    const [claude, gpt] = parseTargets('anthropic:claude-opus-5-5@low, openai:gpt-x:1.25:10:0.125', { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' });
    expect(claude).toMatchObject({ label: 'anthropic:claude-opus-5-5@low', config: { LLM_PROVIDER: 'anthropic', LLM_MODEL: 'claude-opus-5-5', LLM_EFFORT: 'low', ANTHROPIC_API_KEY: 'a' } });
    expect(gpt).toMatchObject({ label: 'openai:gpt-x', config: { LLM_PROVIDER: 'openai', LLM_MODEL: 'gpt-x', LLM_INPUT_USD_PER_MTOK: 1.25, LLM_OUTPUT_USD_PER_MTOK: 10, LLM_CACHED_INPUT_USD_PER_MTOK: 0.125 } });
  });

  test('공급자 이름이 틀리면 실행하지 않는다', () => {
    expect(() => parseTargets('google:gemini')).toThrow();
  });
});
