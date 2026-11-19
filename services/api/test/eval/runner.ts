import type { Coach } from '@pacemate/shared';
import { vi } from 'vitest';
import type { LlmProvider, LlmRequest, LlmResponse } from '../../src/chat/llm/llm-provider.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { createTestApp } from '../test-app.js';
import { resetDatabase } from '../test-db.js';
import { compareCoaches, scoreTranscript } from './scoring.js';
import type { EvalCard, EvalCase, EvalCheck, EvalFixture, EvalResult, EvalToolCall, EvalTranscript } from './types.js';

// 평가 세트를 채팅 API 전체(컨텍스트 구성기, 도구, 제안 모듈, 실제 DB)로 돌린다. 공급자만 바꿔 끼운다(ARCHITECTURE §7.2, §17).

export const EVAL_USER = '11111111-1111-4111-8111-111111111111';
/** 계획을 만드는 날(화). 달리는 요일이 수·금·일이라 이번 주 11/18(수)부터 시작한다 */
export const PLAN_DAY = '2026-11-17';
const NOON_KST = (date: string) => new Date(`${date}T03:00:00Z`);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** 받은 요청과 응답을 남기는 공급자. 도구 결과는 다음 요청의 tool 메시지에서 읽는다 */
export class RecordingProvider implements LlmProvider {
  readonly calls: { request: LlmRequest; response: LlmResponse }[] = [];
  constructor(private readonly inner: LlmProvider) {}
  get model() {
    return this.inner.model;
  }
  async complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    const response = await this.inner.complete(request, signal);
    this.calls.push({ request: structuredClone(request), response: structuredClone(response) });
    return response;
  }
}

/** 앱이 쓰는 공급자를 사례마다 바꾼다 */
export class SwitchableProvider implements LlmProvider {
  current: LlmProvider | null = null;
  get model() {
    return this.current?.model ?? 'none';
  }
  complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    if (!this.current) throw new Error('평가할 공급자가 없다');
    return this.current.complete(request, signal);
  }
}

export interface EvalEnv {
  app: TestApp;
  prisma: PrismaClient;
  provider: SwitchableProvider;
}

let slot = 0;
let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
// 시계를 멈추면 메시지 시각이 모두 같아진다. 요청 앞뒤로 1초씩 움직인다
const tick = () => vi.setSystemTime(new Date(Date.now() + 1_000));

/** 사용자, 프로필, 5km 계획, 미리 넣을 기록을 만든다 */
async function prepare(env: EvalEnv, evalCase: EvalCase, coach: Coach): Promise<EvalFixture> {
  await resetDatabase(env.prisma);
  // 채팅은 사용자별 분당 횟수가 막혀 있다. 실행마다 2분씩 옮겨 앞 실행의 요청 수가 남지 않게 한다
  vi.setSystemTime(new Date(NOON_KST(PLAN_DAY).getTime() + ++slot * 120_000));
  const now = new Date();
  await env.prisma.user.create({
    data: { id: EVAL_USER, authProvider: 'google', termsAgreedAt: now, privacyAgreedAt: now, healthDataAgreedAt: now, consentVersion: '1', coach },
  });
  await env.prisma.runnerProfile.create({
    data: { userId: EVAL_USER, experience: 'under_2y', continuousRun: 'under_60m', recentWeeklyKm: 15, recentPaceSecPerKm: 400, weeklyRunCount: 3, preferredWeekdays: [3, 5, 7], level: 'novice' },
  });
  const preview = await env.app.call('post', '/v1/plan/preview', EVAL_USER, { goalDistance: 'five_k' });
  const created = await env.app.call('post', '/v1/plan', EVAL_USER, { goalDistance: 'five_k', kind: preview.body.options[0].kind });
  if (created.status !== 201) throw new Error(`평가용 계획을 만들지 못했다: ${created.status}`);
  for (const w of evalCase.workouts ?? []) {
    await env.prisma.workoutLog.create({ data: { userId: EVAL_USER, date: new Date(`${w.date}T00:00:00Z`), distanceKm: w.distanceKm, durationSec: w.durationSec, memo: w.memo ?? null, source: 'app' } });
  }
  const sessions = await env.prisma.plannedSession.findMany({ where: { userId: EVAL_USER }, orderBy: { date: 'asc' } });
  vi.setSystemTime(new Date(NOON_KST(evalCase.today).getTime() + slot * 120_000));
  return { today: evalCase.today, sessions: Object.fromEntries(sessions.map((s) => [s.date.toISOString().slice(0, 10), s.id])) };
}

/** 응답 목록에서 이번 차례에 부른 도구와 그 결과를 뽑는다 */
function toolCallsOf(calls: RecordingProvider['calls']): EvalToolCall[] {
  const result: EvalToolCall[] = [];
  calls.forEach(({ response }, index) => {
    const next = calls[index + 1]?.request.messages ?? [];
    for (const call of response.toolCalls) {
      const message = next.find((m) => m.role === 'tool' && m.toolCallId === call.id);
      result.push({ name: call.name, input: call.input, output: message && message.role === 'tool' ? JSON.parse(message.content) : null });
    }
  });
  return result;
}

/**
 * 사례 하나를 코치 하나로 돌린다.
 * `providerOf`는 사례마다 새 공급자를 만든다. 가짜 공급자는 사례의 모범 답안(fake)으로, 실제 공급자는 그대로 만든다.
 */
export async function runCase(env: EvalEnv, evalCase: EvalCase, coach: Coach, providerOf: (fixture: EvalFixture) => LlmProvider): Promise<EvalTranscript> {
  const fixture = await prepare(env, evalCase, coach);
  const recorder = new RecordingProvider(providerOf(fixture));
  env.provider.current = recorder;
  const turns: EvalTranscript['turns'] = [];
  try {
    for (const spec of evalCase.turns) {
      const before = recorder.calls.length;
      tick();
      const res = await env.app.call('post', '/v1/chat/messages', EVAL_USER, { clientMessageId: newId(), content: spec.user });
      tick();
      const reply = (res.body?.replies ?? []).at(-1) as { content?: string; card?: EvalCard | null } | undefined;
      turns.push({ user: spec.user, status: res.status, text: reply?.content ?? '', toolCalls: toolCallsOf(recorder.calls.slice(before)), card: reply?.card ?? null });
    }
  } finally {
    env.provider.current = null;
  }
  const rows = await env.prisma.changeProposal.findMany({ where: { userId: EVAL_USER }, orderBy: { createdAt: 'asc' } });
  // 저장 형식(request)은 제안 종류마다 다르다. 채점은 LLM이 도구에 넣은 입력으로 한다
  const inputs = new Map<string, Record<string, unknown>>();
  for (const call of turns.flatMap((turn) => turn.toolCalls)) {
    const id = (call.output as { proposalId?: string } | null)?.proposalId;
    if (id) inputs.set(id, call.input as Record<string, unknown>);
  }
  return {
    caseId: evalCase.id,
    coach,
    fixture,
    turns,
    proposals: rows.map((row) => ({ id: row.id, type: row.type, status: row.status, input: inputs.get(row.id) ?? {}, payload: row.payload })),
  };
}

export const COACHES: Coach[] = ['oni', 'suri', 'bungae'];

/** 평가 세트 전체를 세 코치로 돌리고 채점한다(PRD §12) */
export async function runSuite(env: EvalEnv, cases: EvalCase[], providerOf: (evalCase: EvalCase, fixture: EvalFixture) => LlmProvider) {
  const results: EvalResult[] = [];
  const consistency: { caseId: string; check: EvalCheck }[] = [];
  for (const evalCase of cases) {
    const transcripts: EvalTranscript[] = [];
    for (const coach of COACHES) {
      const transcript = await runCase(env, evalCase, coach, (fixture) => providerOf(evalCase, fixture));
      transcripts.push(transcript);
      results.push({ caseId: evalCase.id, coach, checks: scoreTranscript(evalCase, transcript), transcript });
    }
    consistency.push({ caseId: evalCase.id, check: compareCoaches(transcripts) });
  }
  return { results, consistency };
}
