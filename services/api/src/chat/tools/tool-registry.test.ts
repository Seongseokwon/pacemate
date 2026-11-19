import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { defineTool } from './tool.js';
import { ToolRegistry } from './tool-registry.js';

const USER = '11111111-1111-4111-8111-111111111111';

const echo = defineTool({
  name: 'get_training_plan',
  description: '기간의 훈련',
  inputSchema: z.object({ from: z.iso.date(), to: z.iso.date() }).refine(({ from, to }) => from <= to, { path: ['to'], message: '끝 날짜가 빨라요.' }),
  execute: vi.fn(async (context, input) => ({ output: { userId: context.userId, ...input } })),
});

const proposing = defineTool({
  name: 'propose_workout_log',
  description: '기록 등록 제안',
  inputSchema: z.object({ distanceKm: z.number().positive() }),
  execute: async () => ({ output: { created: true, proposalId: 'p-1' }, proposalId: 'p-1' }),
});

const call = (name: string, input: unknown) => ({ id: 'call-1', name, input });
const parse = (content: string) => JSON.parse(content) as Record<string, unknown>;

afterEach(() => vi.restoreAllMocks());

describe('ToolRegistry (ARCHITECTURE §7.3)', () => {
  test('인자 스키마에서 도구 정의를 만든다. 날짜의 긴 정규식은 빼고 형식만 남긴다', () => {
    const registry = new ToolRegistry([echo, proposing]);

    expect(registry.definitions).toEqual([
      {
        name: 'get_training_plan',
        description: '기간의 훈련',
        inputSchema: {
          type: 'object',
          properties: { from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } },
          required: ['from', 'to'],
        },
      },
      expect.objectContaining({ name: 'propose_workout_log' }),
    ]);
  });

  test('같은 이름의 도구를 두 번 등록하지 않는다', () => {
    expect(() => new ToolRegistry([echo, echo])).toThrow('get_training_plan');
  });

  test('검증한 인자와 서버의 사용자 ID로 실행한다. 인자에 넣은 사용자 ID는 버린다 (DI-07)', async () => {
    const registry = new ToolRegistry([echo]);

    const result = await registry.execute({ userId: USER }, call('get_training_plan', { from: '2026-11-16', to: '2026-11-22', userId: 'other' }));

    expect(result).toMatchObject({ toolCallId: 'call-1', name: 'get_training_plan', ok: true });
    expect(parse(result.content)).toEqual({ userId: USER, from: '2026-11-16', to: '2026-11-22' });
  });

  test('제안을 만든 도구는 제안 ID를 함께 돌려준다', async () => {
    const result = await new ToolRegistry([proposing]).execute({ userId: USER }, call('propose_workout_log', { distanceKm: 5 }));

    expect(result).toMatchObject({ ok: true, proposalId: 'p-1' });
  });

  test('레지스트리에 없는 도구는 실행하지 않고 오류를 돌려준다', async () => {
    const result = await new ToolRegistry([echo]).execute({ userId: USER }, call('update_session', { sessionId: 'x' }));

    expect(result.ok).toBe(false);
    expect(parse(result.content)).toMatchObject({ error: 'UNKNOWN_TOOL' });
  });

  test.each([
    ['빠진 인자', { from: '2026-11-16' }, 'to'],
    ['형식이 틀린 인자', { from: '11/16', to: '2026-11-22' }, 'from'],
    ['교차 검증 실패', { from: '2026-11-22', to: '2026-11-16' }, '끝 날짜가 빨라요.'],
    ['객체가 아닌 인자', '이번 주', ''],
  ])('%s는 실행하지 않고 INVALID_INPUT을 돌려준다', async (_name, input, hint) => {
    vi.mocked(echo.execute).mockClear();

    const result = await new ToolRegistry([echo]).execute({ userId: USER }, call('get_training_plan', input));

    expect(result.ok).toBe(false);
    const output = parse(result.content);
    expect(output.error).toBe('INVALID_INPUT');
    expect(output.message).toContain(hint);
    expect(echo.execute).not.toHaveBeenCalled();
  });

  test('인자가 없으면 빈 객체로 검증한다', async () => {
    const noInput = defineTool({ name: 'get_runner_profile', description: '프로필', inputSchema: z.object({}), execute: async () => ({ output: { ok: 1 } }) });

    expect((await new ToolRegistry([noInput]).execute({ userId: USER }, call('get_runner_profile', undefined))).ok).toBe(true);
  });

  test('실행 중 오류는 던지지 않고 TOOL_FAILED로 알린다. 오류 내용은 로그와 결과에 남기지 않는다 (F11-R04)', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failing = defineTool({
      name: 'get_workout_history',
      description: '기록',
      inputSchema: z.object({}),
      execute: async () => {
        throw new Error('메모: 무릎이 아파요');
      },
    });

    const result = await new ToolRegistry([failing]).execute({ userId: USER }, call('get_workout_history', {}));

    expect(result.ok).toBe(false);
    expect(parse(result.content)).toMatchObject({ error: 'TOOL_FAILED' });
    expect(result.content).not.toContain('무릎');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('무릎');
  });
});
