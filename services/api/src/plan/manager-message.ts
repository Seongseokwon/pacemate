import { type HomeResponse, type PlanSummary, SESSION_TYPE_LABELS, type Session } from '@pacemate/shared';

type ManagerMessage = HomeResponse['managerMessage'];

const amountOf = (session: Session) => (session.distanceKm !== null ? `${session.distanceKm}km` : `${session.durationMin}분`);

/**
 * 홈의 매니저 메시지. LLM을 부르지 않고 규칙으로 고른다(PRD §5.4).
 * 위에서부터 먼저 맞는 것을 쓴다. 순서는 API_SPEC §3.3에 있다.
 */
export function managerMessage(input: {
  plan: PlanSummary | null;
  today: string;
  todaySession: Session | null;
  weekSessions: Session[];
}): ManagerMessage {
  const { plan, today, todaySession, weekSessions } = input;
  if (!plan) return { code: 'NO_PLAN', text: '새 목표를 정하고 훈련을 시작해 보세요.' };
  if (plan.isFinished) return { code: 'PLAN_FINISHED', text: '계획이 끝났어요. 수고하셨어요. 새 목표를 정해 볼까요?' };
  if (plan.startDate > today) {
    const [, month, day] = plan.startDate.split('-').map(Number);
    return { code: 'PLAN_NOT_STARTED', text: `첫 훈련은 ${month}월 ${day}일이에요. 그때까지 편하게 쉬어 주세요.` };
  }
  if (todaySession?.type === 'race') return { code: 'RACE_DAY', text: '오늘은 대회 날이에요. 무리하지 말고 즐겁게 달려요.' };
  if (todaySession?.status === 'completed') return { code: 'TODAY_DONE', text: '오늘 훈련을 마쳤어요. 수고하셨어요.' };
  if (todaySession) {
    return { code: 'TODAY_SESSION', text: `오늘은 ${SESSION_TYPE_LABELS[todaySession.type].name} ${amountOf(todaySession)} 하는 날이에요.` };
  }
  if (weekSessions.some((session) => session.status === 'missed')) {
    return { code: 'MISSED_SESSION', text: '이번 주에 하지 못한 훈련이 있어요. 괜찮아요. 일정을 바꾸고 싶으면 말씀해 주세요.' };
  }
  return { code: 'REST_DAY', text: '오늘은 쉬는 날이에요. 푹 쉬어 주세요.' };
}
