// 모델별 단가(USD / 100만 토큰). 메시지당 비용을 호출 기록에 남기고 공급자를 비교하는 데 쓴다(D-03, T-407).
// Claude 단가는 2026-11 기준 공개 가격이다. 바뀌면 이 표나 환경 변수(LLM_*_USD_PER_MTOK)로 고친다.

export interface ModelPrice {
  input: number;
  output: number;
  /** 캐시에서 읽은 입력 */
  cachedInput: number;
  /** 캐시에 쓴 입력. 공급자가 따로 받지 않으면 input과 같다 */
  cacheWrite: number;
}

const claude = (input: number, output: number, cachedInput: number): ModelPrice => ({ input, output, cachedInput, cacheWrite: input * 1.25 });

export const KNOWN_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5-5': claude(4, 20, 0.2),
  'claude-opus-5': claude(5, 25, 0.5),
  'claude-sonnet-5-5': claude(2, 10, 0.1),
  'claude-sonnet-5': claude(2, 10, 0.2),
  'claude-haiku-5-5': claude(0.1, 0.5, 0.01),
  'claude-opus-4-8': claude(5, 25, 0.5),
};

export interface PriceOverride {
  LLM_INPUT_USD_PER_MTOK?: number;
  LLM_OUTPUT_USD_PER_MTOK?: number;
  LLM_CACHED_INPUT_USD_PER_MTOK?: number;
}

/** 환경 변수가 있으면 그 값을, 없으면 표의 값을 쓴다. 단가를 모르면 null이다(비용을 0으로 남기지 않도록 시작을 막는다) */
export function priceOf(model: string, override: PriceOverride): ModelPrice | null {
  const known = KNOWN_PRICES[model];
  const input = override.LLM_INPUT_USD_PER_MTOK ?? known?.input;
  const output = override.LLM_OUTPUT_USD_PER_MTOK ?? known?.output;
  if (input === undefined || output === undefined) return null;
  const cachedInput = override.LLM_CACHED_INPUT_USD_PER_MTOK ?? known?.cachedInput ?? input;
  return { input, output, cachedInput, cacheWrite: override.LLM_INPUT_USD_PER_MTOK === undefined && known ? known.cacheWrite : input };
}

/** 토큰 수를 비용으로 바꾼다. uncachedInput은 캐시와 관계없는 입력이다 */
export function costOf(price: ModelPrice, t: { uncachedInput: number; cachedInput: number; cacheWrite: number; output: number }): number {
  return (t.uncachedInput * price.input + t.cachedInput * price.cachedInput + t.cacheWrite * price.cacheWrite + t.output * price.output) / 1_000_000;
}
