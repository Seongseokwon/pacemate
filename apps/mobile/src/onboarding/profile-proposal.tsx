import { GOAL_DISTANCE_LABELS, PLAN_WARNING_LABELS, planWarningSchema, type Proposal } from '@pacemate/shared';
import { useEffect, useState } from 'react';
import type { ProposalFailure } from '@/chat/proposal-failure';
import { Banner, Button, Card, formatKm, Stack, Text } from '@/ui';

export function ProfileProposal({ proposal, busy, failure, onApply, onCancel, onRetry }: { proposal: Proposal; busy: boolean; failure?: ProposalFailure; onApply: () => void; onCancel: () => void; onRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(0, Date.parse(proposal.expiresAt) - Date.now())));
    return () => clearTimeout(timer);
  }, [proposal.expiresAt]);
  const expired = proposal.status === 'expired' || Date.parse(proposal.expiresAt) <= now;
  const added = proposal.changes.filter((change) => change.action === 'add' && change.after);
  const removed = proposal.changes.filter((change) => change.action === 'remove');
  const firstDate = added[0]?.after?.date;
  const firstWeek = firstDate ? added.filter((change) => change.after && change.after.date <= firstDate) : [];
  return <Card><Stack>
    <Text variant="title3">프로필 변경 제안</Text>
    {proposal.goal && <Text>목표: {GOAL_DISTANCE_LABELS[proposal.goal.before.goalDistance]} → {GOAL_DISTANCE_LABELS[proposal.goal.after.goalDistance]}</Text>}
    <Text>남은 훈련 {removed.length}개를 새 훈련 {added.length}개로 바꿔요.</Text>
    {firstWeek.length > 0 && <Text>첫 훈련: {firstDate} · {firstWeek.map((change) => change.after?.distanceKm === null ? `${change.after?.durationMin}분` : formatKm(change.after!.distanceKm!)).join(', ')}</Text>}
    {proposal.warnings.map((warning) => { const parsed = planWarningSchema.safeParse(warning); return <Banner key={warning} status="info">{parsed.success ? PLAN_WARNING_LABELS[parsed.data] : warning}</Banner>; })}
    {expired ? <Text tone="secondary">이 제안은 만료됐어요. 다시 물어봐 주세요</Text> : failure?.kind === 'retry' ? <><Banner status="error">{failure.message}</Banner><Button label="다시 시도" disabled={busy} onPress={onRetry} /></> : failure?.kind === 'final' || failure?.kind === 'not_pending' ? <Banner status="error">{failure.message}</Banner> : <Stack direction="row"><Stack fill><Button label="취소" variant="secondary" disabled={busy} onPress={onCancel} /></Stack><Stack fill><Button label="적용하기" loading={busy} onPress={onApply} /></Stack></Stack>}
  </Stack></Card>;
}
