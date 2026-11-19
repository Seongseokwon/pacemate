import { Injectable, Logger } from '@nestjs/common';
import {
  getTrainingPlanInputSchema,
  getWeeklySummaryInputSchema,
  type ChatMessagesResponse,
  type ChatReplyResponse,
  type ListQuery,
  type SendChatMessageRequest,
} from '@pacemate/shared';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../db/prisma.service.js';
import { Prisma, type ChangeProposal, type ChatMessage as ChatMessageRow } from '../generated/prisma/client.js';
import { PlanService } from '../plan/plan.service.js';
import { toChatMessage } from '../proposal/proposal.mapper.js';
import { ProposalService } from '../proposal/proposal.service.js';
import { SummaryService } from '../summary/summary.service.js';
import { UsageService } from '../usage/usage.service.js';
import { LLM_CALL_TIMEOUT_MS, MAX_OUTPUT_TOKENS, MAX_TOOL_ROUNDS, MESSAGE_PROCESSING_TIMEOUT_MS, STALE_PROCESSING_MS } from './chat.config.js';
import { ContextBuilder } from './context-builder.js';
import { LlmGateway } from './llm/llm-gateway.js';
import { LlmError, type LlmMessage, type LlmToolCall } from './llm/llm-provider.js';
import { PROMPT_VERSION } from './prompts/system-prompt.js';
import { ToolRegistry } from './tools/tool-registry.js';

/** `POST /v1/chat/messages`의 결과. 202는 같은 메시지를 처리하는 중이다(API_SPEC §3.5) */
export type SendResult = { status: 200; body: ChatReplyResponse } | { status: 202; body: { status: 'processing' } };

type Card = Pick<Prisma.ChatMessageUncheckedCreateInput, 'cardType' | 'cardData' | 'proposalId'>;

const LIMIT_MESSAGE = '이번 달 AI 대화를 모두 썼어요.';
const busy = () => new AppError('CHAT_BUSY', '앞의 메시지에 답하는 중이에요. 잠시 뒤에 다시 보내 주세요.');
const unavailable = () => new AppError('AI_UNAVAILABLE', '답변을 받지 못했어요. 다시 보내 주세요.');

/** 처리를 멈춘 이유. 로그에는 이 코드만 남긴다(F11-R04) */
class ChatFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * 메시지 처리기(ARCHITECTURE §7.1, §7.5). 중복 확인, 한도 확인, LLM과 도구 반복, 저장, 응답 조립을 한다.
 * 사용자당 처리 중인 메시지는 1건이다. 실패하면 이용량을 올리지 않고, 그 사이 만든 대기 제안을 취소한다.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly context: ContextBuilder,
    private readonly gateway: LlmGateway,
    private readonly tools: ToolRegistry,
    private readonly proposals: ProposalService,
    private readonly plans: PlanService,
    private readonly summaries: SummaryService,
  ) {}

  /** 대화 조회. 최신 메시지부터 돌려준다. 제안 카드는 제안의 현재 상태로 그린다(API_SPEC §2.5) */
  async list(userId: string, { before, limit }: ListQuery): Promise<ChatMessagesResponse> {
    const cursor = before ? await this.prisma.chatMessage.findFirst({ where: { id: before, userId } }) : null;
    if (before && !cursor) throw new AppError('NOT_FOUND', '메시지를 찾을 수 없어요.');
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        userId,
        ...(cursor && { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }),
      },
      include: { proposal: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return { items: rows.slice(0, limit).map((row) => toChatMessage(row, row.proposal)), hasMore: rows.length > limit };
  }

  async send(userId: string, request: SendChatMessageRequest): Promise<SendResult> {
    // 오래 처리 중인 메시지는 실패로 본다. 서버가 처리 중에 멈춰도 사용자가 계속 막히지 않는다(§7.5의 2번)
    await this.prisma.chatMessage.updateMany({
      where: { userId, status: 'processing', createdAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
      data: { status: 'failed' },
    });
    const existing = await this.findByClientId(userId, request.clientMessageId);
    if (existing) return this.replay(userId, existing);

    if (request.sessionId) {
      const session = await this.prisma.plannedSession.findFirst({ where: { id: request.sessionId, userId }, select: { id: true } });
      if (!session) throw new AppError('NOT_FOUND', '훈련을 찾을 수 없어요.');
    }

    let message: ChatMessageRow;
    try {
      message = await this.prisma.chatMessage.create({
        data: { userId, role: 'user', content: request.content, status: 'processing', clientMessageId: request.clientMessageId },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      // 같은 메시지가 동시에 왔거나, 다른 메시지를 처리하는 중이다
      const raced = await this.findByClientId(userId, request.clientMessageId);
      if (raced) return this.replay(userId, raced);
      throw busy();
    }

    // 한도를 넘으면 LLM을 부르지 않고 한도 안내를 남긴다(F04-R06, AC-F04-03)
    const usage = await this.usage.get(userId);
    if (usage.chat.used >= usage.chat.limit) {
      const limitCard: Card = { cardType: 'limit', cardData: { resetsOn: usage.resetsOn } };
      return { status: 200, body: await this.finish(userId, message, { role: 'system', content: LIMIT_MESSAGE, ...limitCard }, false) };
    }
    return { status: 200, body: await this.process(userId, message, request.sessionId) };
  }

  /** LLM과 도구를 반복하고 결과를 저장한다(§7.5의 4~6번) */
  private async process(userId: string, message: ChatMessageRow, sessionId: string | undefined): Promise<ChatReplyResponse> {
    const createdProposals: string[] = [];
    try {
      const deadline = Date.now() + MESSAGE_PROCESSING_TIMEOUT_MS;
      const { system, messages } = await this.context.build(userId, { id: message.id, content: message.content, sessionId });
      const conversation: LlmMessage[] = [...messages];
      const summaryCalls: LlmToolCall[] = [];

      let text: string | undefined;
      for (let round = 0; text === undefined; round++) {
        // 남은 시간이 LLM 호출 1회의 제한 시간보다 짧으면 부르지 않는다. 앱이 먼저 끊지 않게 한다
        if (deadline - Date.now() < LLM_CALL_TIMEOUT_MS) throw new ChatFailure('TIMEOUT');
        const response = await this.gateway.complete(
          { system, messages: conversation, tools: [...this.tools.definitions], maxOutputTokens: MAX_OUTPUT_TOKENS },
          { userId, purpose: 'chat', promptVersion: PROMPT_VERSION },
        );
        if (response.toolCalls.length === 0) {
          text = response.text;
          break;
        }
        if (round >= MAX_TOOL_ROUNDS) throw new ChatFailure('TOO_MANY_TOOL_ROUNDS');
        conversation.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls });
        for (const call of response.toolCalls) {
          const result = await this.tools.execute({ userId }, call);
          if (result.proposalId) createdProposals.push(result.proposalId);
          if (result.ok && (call.name === 'get_training_plan' || call.name === 'get_weekly_summary')) summaryCalls.push(call);
          conversation.push({ role: 'tool', toolCallId: call.id, content: result.content });
        }
      }
      if (!text.trim()) throw new ChatFailure('EMPTY_RESPONSE');

      const card = (await this.proposalCard(userId, createdProposals)) ?? (await this.summaryCard(userId, summaryCalls.at(-1)));
      return await this.finish(userId, message, { role: 'assistant', content: text.trim(), ...card }, true);
    } catch (error) {
      await this.fail(userId, message, createdProposals, error);
      throw unavailable();
    }
  }

  /** AI 메시지를 저장하고, 사용자 메시지를 완료로 바꾸고, 이용량을 올린다. 셋은 한 트랜잭션이다(§7.5의 5번) */
  private async finish(
    userId: string,
    message: ChatMessageRow,
    reply: Pick<Prisma.ChatMessageUncheckedCreateInput, 'role' | 'content'> & Card,
    countsUsage: boolean,
  ): Promise<ChatReplyResponse> {
    const saved = await this.prisma.$transaction(async (tx) => {
      // 답은 항상 사용자 메시지 뒤에 정렬되어야 한다. 같은 밀리초에 저장되면 순서가 ID에 따라 뒤바뀐다
      const createdAt = new Date(Math.max(Date.now(), message.createdAt.getTime() + 1));
      const created = await tx.chatMessage.create({ data: { userId, status: 'done', createdAt, ...reply } });
      await tx.chatMessage.update({ where: { id: message.id }, data: { status: 'done' } });
      // 사용자당 동시에 처리하는 메시지가 1건이라 "확인 후 처리, 성공 시 증가"로도 한도를 넘지 않는다(DI-12)
      if (countsUsage) await this.usage.increment(tx, userId, 'chat');
      return created;
    });
    const withProposal = await this.prisma.chatMessage.findUniqueOrThrow({ where: { id: saved.id }, include: { proposal: true } });
    return this.replyOf(userId, { ...message, status: 'done' }, [withProposal]);
  }

  /** 실패하면 사용자 메시지를 실패로 바꾸고, 그 사이 만든 대기 제안을 취소한다. 이용량은 올리지 않는다(§7.5의 6번, F04-R10) */
  private async fail(userId: string, message: ChatMessageRow, proposalIds: string[], error: unknown): Promise<void> {
    const code = error instanceof ChatFailure || error instanceof LlmError ? error.code : error instanceof Error ? error.name : 'UNKNOWN';
    this.logger.warn(`채팅 처리 실패: ${code}`);
    await this.prisma.chatMessage.update({ where: { id: message.id }, data: { status: 'failed' } });
    for (const id of proposalIds) {
      // 이미 다른 제안으로 대체된 것은 그대로 둔다
      await this.proposals.cancel(userId, id).catch(() => undefined);
    }
  }

  /** 이번 처리에서 만든 제안 중 아직 대기 중인 마지막 것. 새 제안은 이전 대기 제안을 대체한다(DI-05) */
  private async proposalCard(userId: string, proposalIds: string[]): Promise<Card | null> {
    for (const id of [...proposalIds].reverse()) {
      const row = await this.prisma.changeProposal.findFirst({ where: { id, userId, status: 'pending' }, select: { id: true } });
      if (row) return { cardType: 'proposal', proposalId: row.id };
    }
    return null;
  }

  /** 제안이 없을 때, 마지막으로 조회한 일정이나 주간 요약을 카드로 붙인다. 카드 내용은 서버가 다시 조회한 값이다(PRD §6.1) */
  private async summaryCard(userId: string, call: LlmToolCall | undefined): Promise<Card> {
    if (call?.name === 'get_training_plan') {
      const { from, to } = getTrainingPlanInputSchema.parse(call.input);
      const { items } = await this.plans.listSessions(userId, { from, to });
      if (items.length > 0) return { cardType: 'plan_summary', cardData: { from, to, sessions: items } };
    }
    if (call?.name === 'get_weekly_summary') {
      const { weekStart } = getWeeklySummaryInputSchema.parse(call.input);
      return { cardType: 'weekly_summary', cardData: await this.summaries.weeklyNumbers(userId, weekStart) };
    }
    return {};
  }

  private findByClientId(userId: string, clientMessageId: string) {
    return this.prisma.chatMessage.findUnique({ where: { userId_clientMessageId: { userId, clientMessageId } } });
  }

  /**
   * 이미 받은 메시지의 현재 상태를 돌려준다(§7.5의 1번). 처리 중이면 202, 완료면 저장된 결과, 실패면 503이다.
   * 저장된 답은 그 사용자 메시지 다음부터 다음 사용자 메시지 전까지의 AI·한도 메시지다. 승인 결과 메시지는 넣지 않는다.
   */
  private async replay(userId: string, message: ChatMessageRow): Promise<SendResult> {
    if (message.status === 'processing') return { status: 202, body: { status: 'processing' } };
    if (message.status === 'failed') throw unavailable();
    const next = await this.prisma.chatMessage.findFirst({
      where: { userId, role: 'user', OR: [{ createdAt: { gt: message.createdAt } }, { createdAt: message.createdAt, id: { gt: message.id } }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { createdAt: true },
    });
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        userId,
        role: { not: 'user' },
        OR: [{ cardType: null }, { cardType: { not: 'result' } }],
        createdAt: { gte: message.createdAt, ...(next && { lt: next.createdAt }) },
      },
      include: { proposal: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { status: 200, body: await this.replyOf(userId, message, rows) };
  }

  private async replyOf(userId: string, message: ChatMessageRow, rows: (ChatMessageRow & { proposal: ChangeProposal | null })[]): Promise<ChatReplyResponse> {
    return {
      userMessage: toChatMessage(message),
      replies: rows.map((row) => toChatMessage(row, row.proposal)),
      usage: await this.usage.get(userId),
    };
  }
}
