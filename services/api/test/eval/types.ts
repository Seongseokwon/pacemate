import type { Coach, ProposalType, ToolName } from '@pacemate/shared';
import type { FakeLlmStep } from '../../src/chat/llm/fake-llm-provider.js';

// AI 응답 평가 세트(PRD §12, ARCHITECTURE §17)의 형식. 같은 사례를 세 코치로 돌리고(AC-F04-07, AC-F04-08) 규칙 ID별로 채점한다.

export type EvalCategory =
  | 'utterance' // PRD §6.6의 발화 예시(AC-F04-02)
  | 'scenario' // PRD §4의 S2~S4
  | 'clarify' // 되묻기(AI-04)
  | 'pain' // 통증·응급(AI-06, AI-12, AC-F04-04)
  | 'missed' // 놓친 훈련을 몰아서 채우지 않기(AI-11, AC-F04-08)
  | 'out_of_scope' // 범위 밖 요청(AI-09)
  | 'injection' // 지시문 주입(AI-07)
  | 'pending' // 대기 중인 제안에 채팅으로 승인(AI-08)
  | 'tone'; // 코치 말투(AI-11)

/** 채팅 화면의 한 차례. 사용자가 보내는 글 하나다 */
export interface EvalTurnSpec {
  user: string;
  /** 이 차례에서 순서대로 불려야 하는 도구. 다른 도구가 사이에 끼어도 된다 */
  requiredTools?: ToolName[];
  /** 이 차례에서 불리면 안 되는 도구 */
  forbiddenTools?: ToolName[];
  /** 이 차례의 답이 되묻기(제안 없이 질문으로 끝남)여야 하는지 */
  expectClarify?: boolean;
}

export interface EvalExpectation {
  /** 사례가 끝났을 때 대기 중인 제안. null이면 제안이 없어야 한다. 없으면 보지 않는다 */
  proposal?: ProposalType | null;
  /** 마지막 답에 붙어야 하는 카드(제안 카드 말고). `check`는 카드 내용을 확인하고 실패 이유를 돌려준다 */
  card?: { type: 'plan_summary' | 'weekly_summary'; check?: (data: unknown, fixture: EvalFixture) => string | null };
  /** 만들어진 제안 도구 입력에 대한 확인. 실패 이유를 돌려준다. `proposal`이 없어도 제안이 있으면 확인한다 */
  proposalInput?: (input: Record<string, unknown>, fixture: EvalFixture) => string | null;
  /** 답에 그대로 들어 있어야 하는 문장(AI-12의 고정 문장 등) */
  mustInclude?: string[];
  /** 답에 하나라도 들어 있어야 하는 말 */
  mustIncludeAny?: string[];
  /** 같은 요청에 되묻는 최대 횟수(AI-04). 기본값은 CLARIFY_MAX_TURNS */
  maxClarifyTurns?: number;
}

/** 사례를 돌리기 전에 만든 상태. 날짜별 훈련 ID를 사례와 가짜 대본이 쓴다 */
export interface EvalFixture {
  today: string;
  /** 날짜 → 훈련 ID */
  sessions: Record<string, string>;
}

export interface EvalCase {
  id: string;
  category: EvalCategory;
  /** 확인하는 규칙과 인수 기준 */
  rules: string[];
  /** 대화하는 날. 계획은 모든 사례에서 2026-11-17(화)에 만든 5km 계획이다(수·금·일) */
  today: string;
  /** 계획 외에 미리 넣을 기록 */
  workouts?: { date: string; distanceKm: number; durationSec: number; memo?: string }[];
  turns: EvalTurnSpec[];
  expect: EvalExpectation;
  /** 가짜 공급자의 모범 답안. 채점 틀 자체를 검증하는 데 쓴다. 실제 공급자로 돌릴 때는 쓰지 않는다 */
  fake: (fixture: EvalFixture) => FakeLlmStep[];
}

/** 도구 호출 한 번과 그 결과 */
export interface EvalToolCall {
  name: string;
  input: unknown;
  /** 도구 결과(JSON). 다음 LLM 요청에서 읽는다. 마지막 응답에서 부른 도구라 결과가 없으면 null */
  output: unknown;
}

export interface EvalTurnResult {
  user: string;
  /** HTTP 상태 */
  status: number;
  /** 사용자에게 보인 AI의 답 */
  text: string;
  toolCalls: EvalToolCall[];
  /** 답에 붙은 카드. 제안 카드면 proposal, 그 밖에는 data가 있다 */
  card: EvalCard | null;
}

export interface EvalCard {
  type: string;
  data?: unknown;
  proposal?: { id: string; type: ProposalType; status: string };
}

export interface EvalProposalResult {
  id: string;
  type: ProposalType;
  status: string;
  /** 제안 도구에 들어온 입력 */
  input: Record<string, unknown>;
  /** 서버가 계산해 저장한 변경 내용 */
  payload: unknown;
}

export interface EvalTranscript {
  caseId: string;
  coach: Coach;
  fixture: EvalFixture;
  turns: EvalTurnResult[];
  proposals: EvalProposalResult[];
  /** 이 사례에서 공급자를 부른 비용의 합. 공급자 구현이 계산한 추정치다 */
  costUsd: number;
}

export interface EvalCheck {
  /** 규칙 ID와 확인 항목. 예: `AI-06/no-diagnosis` */
  id: string;
  pass: boolean;
  detail?: string;
  /** 낱말 규칙으로만 보는 항목. 실패하면 사람이 답을 읽고 판정한다 */
  heuristic?: boolean;
}

export interface EvalResult {
  caseId: string;
  category: EvalCategory;
  coach: Coach;
  checks: EvalCheck[];
  transcript: EvalTranscript;
}
