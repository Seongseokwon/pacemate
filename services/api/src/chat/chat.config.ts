// chat 모듈만 쓰는 (초기값) 수치(ARCHITECTURE §7). 앱과 함께 쓰는 값은 packages/shared에 있다.

/** LLM 호출 1회 제한 시간(§7.2). */
export const LLM_CALL_TIMEOUT_MS = 30_000;

/** 일시적 오류의 재시도 횟수(§7.2). */
export const LLM_RETRY_COUNT = 1;
