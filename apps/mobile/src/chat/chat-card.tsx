import { GOAL_DISTANCE_LABELS, PLAN_WARNING_LABELS, SESSION_TYPE_LABELS, planWarningSchema, type ChatCard, type Proposal, type SessionSnapshot } from '@pacemate/shared';
import { useEffect, useState } from 'react';
import { Banner, Button, Card, formatDate, formatKm, sessionAmount, Stack, Text } from '@/ui';

const session = (s: SessionSnapshot | null) => s ? `${formatDate(s.date)} ${SESSION_TYPE_LABELS[s.type].name} ${sessionAmount(s)}` : '없음';
const titles = { reschedule: '일정 변경 제안', goal_change: '목표 변경 제안', workout_log: '기록 확인' } as const;
const statusText = { approved: '적용했어요', cancelled: '취소한 제안이에요', superseded: '새 제안으로 바뀌었어요', expired: '이 제안은 만료됐어요. 다시 물어봐 주세요' } as const;

type Props = { card: ChatCard; busy: boolean; error?: string; onApprove: (p: Proposal) => void; onCancel: (p: Proposal) => void; onAlternative: (p: Proposal) => void };
export function ChatCardView({ card, busy, error, onApprove, onCancel, onAlternative }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (card.type !== 'proposal' || card.proposal.status !== 'pending') return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(0, Date.parse(card.proposal.expiresAt) - Date.now())));
    return () => clearTimeout(timer);
  }, [card]);
  if (card.type === 'result') return null;
  if (card.type === 'limit') return <Card><Stack><Text variant="title3">이번 달 AI 대화를 모두 썼어요</Text><Text>{formatDate(card.data.resetsOn)}에 다시 쓸 수 있어요.</Text><Text>캘린더와 기록은 계속 쓸 수 있어요.</Text></Stack></Card>;
  if (card.type === 'plan_summary') return <Card><Stack><Text variant="title3">훈련 일정</Text>{card.data.sessions.map((s) => <Text key={s.id}>{session(s)}</Text>)}</Stack></Card>;
  if (card.type === 'weekly_summary') return <Card><Stack><Text variant="title3">주간 요약</Text><Text>{card.data.completedCount} / {card.data.plannedCount}회 완료 · {formatKm(card.data.totalDistanceKm)}</Text></Stack></Card>;
  const p = card.proposal;
  const status = p.status === 'pending' && Date.parse(p.expiresAt) <= now ? 'expired' : p.status;
  return <Card><Stack>
    <Text variant="title3">{titles[p.type]}</Text>
    {p.type === 'reschedule' && p.changes.map((c, i) => <Text key={i}>{session(c.before)} → {c.action === 'skip' ? '생략' : session(c.after)}</Text>)}
    {p.type === 'reschedule' && p.impact && <Text>이번 주 거리 {formatKm(p.impact.weeklyDistanceBeforeKm)} → {formatKm(p.impact.weeklyDistanceAfterKm)}</Text>}
    {p.type === 'goal_change' && p.goal && <Text>{GOAL_DISTANCE_LABELS[p.goal.before.goalDistance]} → {GOAL_DISTANCE_LABELS[p.goal.after.goalDistance]}</Text>}
    {p.type === 'goal_change' && <Text>훈련 {p.changes.filter((c) => c.action === 'remove').length}개를 바꾸고 {p.changes.filter((c) => c.action === 'add').length}개를 만들어요.</Text>}
    {p.type === 'workout_log' && p.workout && <><Text>{formatDate(p.workout.date)} · {formatKm(p.workout.distanceKm)} · {Math.floor(p.workout.durationSec / 60)}분 {p.workout.durationSec % 60}초</Text><Text>페이스: 1km에 {Math.floor(p.workout.paceSecPerKm / 60)}분 {p.workout.paceSecPerKm % 60}초</Text>{p.workout.plannedSession && <Text>연결할 훈련: {session(p.workout.plannedSession)}</Text>}</>}
    {p.warnings.map((warning, i) => { const parsed = planWarningSchema.safeParse(warning); return <Banner key={i} status="warning">{parsed.success ? PLAN_WARNING_LABELS[parsed.data] : warning}</Banner>; })}
    {p.reasonLine && <Text>{p.reasonLine}</Text>}
    {error && <Banner status="error">{error}</Banner>}
    {status === 'pending' ? <><Stack direction="row" gap={2}><Button variant="secondary" label={p.type === 'reschedule' ? '다른 방법 보기' : '취소'} disabled={busy} onPress={() => p.type === 'reschedule' ? onAlternative(p) : onCancel(p)} /><Button label={p.type === 'workout_log' ? '기록 저장' : p.type === 'goal_change' ? '이 계획으로 시작' : '적용하기'} loading={busy} onPress={() => onApprove(p)} /></Stack><Text variant="caption" tone="secondary">{p.type === 'reschedule' && !p.consumesQuota ? '이번 변경은 횟수를 쓰지 않아요 · ' : ''}오늘 자정까지</Text></> : <Text tone={status === 'approved' ? 'success' : 'secondary'}>{statusText[status]}</Text>}
  </Stack></Card>;
}
