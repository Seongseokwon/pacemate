import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { LlmToolCall, LlmToolDefinition } from '../llm/llm-provider.js';
import type { Tool, ToolContext } from './tool.js';

/** 도구 하나를 실행한 결과. `content`는 LLM에 돌려줄 도구 결과 메시지다 */
export interface ToolExecution {
  toolCallId: string;
  name: string;
  /** 실행 결과의 JSON 문자열 */
  content: string;
  ok: boolean;
  proposalId?: string;
}

/** LLM이 실행을 요청했지만 실행하지 않은 이유. LLM이 사용자에게 설명할 수 있게 문장을 함께 준다(API_SPEC §6) */
export type ToolErrorCode = 'UNKNOWN_TOOL' | 'INVALID_INPUT' | 'TOOL_FAILED';

const ERROR_MESSAGES: Record<Exclude<ToolErrorCode, 'INVALID_INPUT'>, string> = {
  UNKNOWN_TOOL: '없는 도구예요. 주어진 도구만 쓸 수 있어요.',
  TOOL_FAILED: '정보를 가져오지 못했어요. 사용자에게 잠시 뒤 다시 시도해 달라고 알려 주세요.',
};

/**
 * 도구 정의, 인자 검증, 실행(ARCHITECTURE §7.3).
 * LLM에 보낼 정의는 인자 스키마에서 만들고, LLM이 보낸 인자는 다시 검증한 뒤에만 실행한다.
 */
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools: ReadonlyMap<string, Tool>;
  /** 요청마다 같아야 공급자의 프롬프트 캐시를 쓸 수 있으므로 한 번만 만든다(§7.4) */
  readonly definitions: readonly LlmToolDefinition[];

  constructor(tools: readonly Tool[]) {
    const map = new Map<string, Tool>();
    for (const tool of tools) {
      if (map.has(tool.name)) throw new Error(`도구 이름이 겹친다: ${tool.name}`);
      map.set(tool.name, tool);
    }
    this.tools = map;
    this.definitions = tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: toInputSchema(tool.inputSchema) }));
  }

  /** 실패해도 던지지 않고 LLM에 돌려줄 오류 결과를 만든다(PRD §6.3의 5단계) */
  async execute(context: ToolContext, call: LlmToolCall): Promise<ToolExecution> {
    const result = (ok: boolean, output: object, proposalId?: string): ToolExecution => ({
      toolCallId: call.id,
      name: call.name,
      content: JSON.stringify(output),
      ok,
      ...(proposalId && { proposalId }),
    });

    const tool = this.tools.get(call.name);
    if (!tool) return result(false, { error: 'UNKNOWN_TOOL', message: ERROR_MESSAGES.UNKNOWN_TOOL });

    // 공급자가 스키마를 강제해도 서버가 다시 검증한다(§7.3의 2번)
    const parsed = tool.inputSchema.safeParse(call.input ?? {});
    if (!parsed.success) return result(false, { error: 'INVALID_INPUT', message: invalidInputMessage(parsed.error) });

    try {
      const { output, proposalId } = await tool.execute(context, parsed.data);
      return result(true, output, proposalId);
    } catch (error) {
      // 오류 내용에 사용자 데이터가 들어 있을 수 있어 이름만 남긴다(F11-R04)
      this.logger.error(`도구 실행 실패: ${tool.name} (${error instanceof Error ? error.name : 'unknown'})`);
      return result(false, { error: 'TOOL_FAILED', message: ERROR_MESSAGES.TOOL_FAILED });
    }
  }
}

/** 어느 인자가 왜 틀렸는지만 알린다. 받은 값은 되풀이하지 않는다 */
function invalidInputMessage(error: z.ZodError): string {
  const details = error.issues.slice(0, 5).map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message));
  return `인자가 올바르지 않아 실행하지 않았어요. ${details.join(' / ')}`;
}

/** zod 스키마를 LLM에 보낼 JSON Schema로 바꾼다. 날짜·ID의 긴 정규식은 서버가 다시 검증하므로 빼서 토큰을 아낀다 */
export function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return stripFormatPatterns(json) as Record<string, unknown>;
}

function stripFormatPatterns(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripFormatPatterns);
  if (node === null || typeof node !== 'object') return node;
  const entries = Object.entries(node as Record<string, unknown>);
  const hasFormat = entries.some(([key]) => key === 'format');
  return Object.fromEntries(entries.filter(([key]) => !(hasFormat && key === 'pattern')).map(([key, value]) => [key, stripFormatPatterns(value)]));
}
