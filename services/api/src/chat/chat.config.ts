// chat 모듈만 쓰는 (초기값) 수치(ARCHITECTURE §7). 앱과 함께 쓰는 값은 packages/shared에 있다.

/** LLM 호출 1회 제한 시간(§7.2). */
export const LLM_CALL_TIMEOUT_MS = 30_000;

/** 일시적 오류의 재시도 횟수(§7.2). */
export const LLM_RETRY_COUNT = 1;

/** 메시지 1건 전체 처리 제한 시간(§7.2). 앱의 요청 제한 시간 75초보다 짧아야 한다(API_SPEC §3.5) */
export const MESSAGE_PROCESSING_TIMEOUT_MS = 60_000;

/** 이보다 오래 처리 중인 메시지는 실패로 본다(§7.5의 2번) */
export const STALE_PROCESSING_MS = 120_000;

/** 메시지 1건에서 도구를 부르며 LLM을 다시 호출하는 최대 횟수(PRD §6.3의 4단계) */
export const MAX_TOOL_ROUNDS = 5;

/** 컨텍스트에 넣는 최근 대화 수(§7.4) */
export const RECENT_MESSAGE_COUNT = 10;

/** 같은 요청에 되묻는 최대 횟수(PRD AI-04) */
export const CLARIFY_MAX_TURNS = 2;

/** LLM 응답의 최대 출력 토큰. 코치 답변은 2~4문장이다(AI-11) */
export const MAX_OUTPUT_TOKENS = 1000;

/** 답변 출력 토큰에 더해 공급자 모델의 추론(thinking)에 쓰도록 남기는 토큰. 추론도 출력 한도에 들어간다 */
export const LLM_REASONING_HEADROOM_TOKENS = 4000;

/** Claude 호출의 기본 effort. 채팅은 짧은 답이라 낮게 시작하고 평가 세트로 조정한다(T-407). `LLM_EFFORT`로 바꾼다 */
export const DEFAULT_CLAUDE_EFFORT = 'low';
