import type { ToolName } from '@pacemate/shared';
import type { z } from 'zod';

/** 도구 실행에 서버가 넣는 값. 사용자 ID는 검증된 토큰에서 온다(DI-07, ARCHITECTURE §7.3) */
export interface ToolContext {
  userId: string;
  /** 지금 처리 중인 사용자 메시지. 제안 도구가 이 메시지가 아직 처리 중일 때만 제안을 만든다 */
  messageId?: string;
}

/** 도구 실행 결과. `output`은 LLM에 그대로 전달된다 */
export interface ToolResult {
  output: Record<string, unknown>;
  /** 이 실행으로 만들어진 대기 제안. 메시지 처리기가 카드를 붙이고, 처리가 실패하면 취소한다(ARCHITECTURE §7.5) */
  proposalId?: string;
}

/**
 * 도구 하나(ARCHITECTURE §7.3). 조회하거나 대기 상태 제안을 만드는 것까지만 한다.
 * 데이터를 바꾸는 도구는 만들지 않는다(PRD §6.1).
 */
export interface Tool<S extends z.ZodType = z.ZodType> {
  name: ToolName;
  description: string;
  inputSchema: S;
  execute(context: ToolContext, input: z.output<S>): Promise<ToolResult>;
}

/** 입력 타입을 유지한 채 도구를 정의한다 */
export const defineTool = <S extends z.ZodType>(tool: Tool<S>): Tool<S> => tool;
