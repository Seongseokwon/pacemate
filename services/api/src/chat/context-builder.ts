import { Injectable } from '@nestjs/common';
import { type ChatCardType } from '../generated/prisma/client.js';
import { addDays, mondayOf } from '../common/dates.js';
import { today } from '../common/today.js';
import { PrismaService } from '../db/prisma.service.js';
import { toSession } from '../plan/session.mapper.js';
import { toProposal } from '../proposal/proposal.mapper.js';
import { RECENT_MESSAGE_COUNT } from './chat.config.js';
import type { LlmMessage } from './llm/llm-provider.js';
import { fixedInstructionsOf } from './prompts/system-prompt.js';
import { toolSessionOf } from './tools/query-tools.js';
import { ToolRegistry } from './tools/tool-registry.js';

export interface ChatContext {
  system: string;
  messages: LlmMessage[];
}

export interface NewUserMessage {
  /** 지금 처리하는 사용자 메시지. 최근 대화에서 뺀다 */
  id: string;
  content: string;
  /** 훈련 상세에서 들어온 경우의 대상 훈련(F05-R11) */
  sessionId?: string | undefined;
}

const PROPOSAL_TYPE_NAMES = { reschedule: '일정 변경', goal_change: '목표 변경', workout_log: '기록 확인' } as const;
const PROPOSAL_STATUS_NAMES = { pending: '대기 중', approved: '적용됨', cancelled: '취소됨', superseded: '새 제안으로 바뀜', expired: '만료됨' } as const;
const CARD_NAMES: Record<Exclude<ChatCardType, 'proposal'>, string> = {
  plan_summary: '훈련 일정 카드',
  weekly_summary: '주간 요약 카드',
  limit: '이용 한도 안내',
  result: '',
};

/**
 * LLM에 보낼 내용을 정해진 순서로 조립한다(ARCHITECTURE §7.4).
 * 도구 정의 → 공통 지침 → 코치 말투 → 지금 상황(사용자·날짜별) → 최근 대화 → 새 메시지.
 */
@Injectable()
export class ContextBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolRegistry,
  ) {}

  async build(userId: string, message: NewUserMessage): Promise<ChatContext> {
    const [user, situation, history] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coach: true } }),
      this.situationOf(userId, message.sessionId),
      this.historyOf(userId, message.id),
    ]);
    // 지금 상황은 대화의 출발점일 뿐이다. 계획·기록을 답할 때는 조회 도구를 부른다(AI-01)
    const system = `${fixedInstructionsOf(user.coach)}\n\n[지금 상황]\n${JSON.stringify(situation)}`;
    return { system, messages: mergeTurns([...history, { role: 'user', content: message.content }]) };
  }

  /** 오늘 날짜, 프로필 요약, 이번 주 계획, 대기 중인 제안, 대상 훈련. 조회 도구와 같은 형식으로 만든다 */
  private async situationOf(userId: string, sessionId: string | undefined) {
    const date = today();
    const weekStart = mondayOf(date);
    const run = async (name: string, input: object) => {
      const result = await this.tools.execute({ userId }, { id: `context-${name}`, name, input });
      return JSON.parse(result.content) as Record<string, unknown>;
    };
    const [profile, week, pending, target] = await Promise.all([
      run('get_runner_profile', {}),
      run('get_training_plan', { from: weekStart, to: addDays(weekStart, 6) }),
      this.prisma.changeProposal.findFirst({ where: { userId, status: 'pending', expiresAt: { gt: new Date() } }, select: { type: true } }),
      sessionId
        ? this.prisma.plannedSession.findFirst({ where: { id: sessionId, userId }, include: { workout: { select: { id: true } } } })
        : Promise.resolve(null),
    ]);
    return {
      today: date,
      weekday: ['일', '월', '화', '수', '목', '금', '토'][new Date(`${date}T00:00:00Z`).getUTCDay()],
      runner: { profile: profile.profile ?? null, level: profile.level ?? null, goal: profile.goal ?? null },
      thisWeek: { plan: week.plan ?? null, sessions: week.sessions ?? [] },
      pendingProposal: pending ? PROPOSAL_TYPE_NAMES[pending.type] : null,
      // 사용자가 훈련 상세의 [AI에게 변경 요청]으로 들어왔다. 이 훈련에 대한 요청으로 본다
      targetSession: target ? toolSessionOf(toSession(target, date)) : null,
    };
  }

  /** 최근 대화. 실패한 메시지는 뺀다. 카드는 짧은 글로 바꾼다(§7.4) */
  private async historyOf(userId: string, currentId: string): Promise<LlmMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { userId, id: { not: currentId }, status: 'done' },
      include: { proposal: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RECENT_MESSAGE_COUNT,
    });
    return rows.reverse().map((row): LlmMessage => {
      if (row.role === 'user') return { role: 'user', content: row.content };
      let card = '';
      if (row.cardType === 'proposal' && row.proposal) {
        const proposal = toProposal(row.proposal);
        card = `[${PROPOSAL_TYPE_NAMES[proposal.type]} 제안 카드, 상태: ${PROPOSAL_STATUS_NAMES[proposal.status]}]`;
      } else if (row.cardType && row.cardType !== 'proposal' && CARD_NAMES[row.cardType]) {
        card = `[${CARD_NAMES[row.cardType]}]`;
      }
      // 앱이 만든 결과·한도 메시지는 AI의 말이 아니라는 것을 표시한다
      const content = row.role === 'system' ? `[앱 알림] ${row.content}` : row.content;
      return { role: 'assistant', content: [content, card].filter(Boolean).join('\n'), toolCalls: [] };
    });
  }
}

/** 같은 쪽의 연이은 메시지를 합치고, 대화가 사용자 메시지로 시작하게 한다. 공급자마다 차례가 엇갈려야 하는 제약이 있다 */
export function mergeTurns(messages: LlmMessage[]): LlmMessage[] {
  const merged: LlmMessage[] = [];
  for (const message of messages) {
    if (merged.length === 0 && message.role !== 'user') continue;
    const last = merged[merged.length - 1];
    if (last && last.role === message.role && message.role !== 'tool') {
      merged[merged.length - 1] = { ...last, content: `${last.content}\n${message.content}` } as LlmMessage;
    } else {
      merged.push(message);
    }
  }
  return merged;
}
