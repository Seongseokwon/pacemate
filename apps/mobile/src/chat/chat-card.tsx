import {
  GOAL_DISTANCE_LABELS,
  PLAN_WARNING_LABELS,
  planWarningSchema,
  SESSION_TYPE_LABELS,
  type ChatCard,
  type Proposal,
  type ProposalChange,
  type SessionSnapshot,
  type Usage,
} from '@pacemate/shared';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  formatDate,
  formatDuration,
  formatKm,
  formatPace,
  formatShortDate,
  Icon,
  type IconName,
  List,
  mondayOf,
  addDays,
  ProgressBar,
  SessionRow,
  sessionAmount,
  Stack,
  StatusDot,
  Text,
  useTheme,
} from '@/ui';
import type { ProposalFailure } from './proposal-failure';

/** 카드 하나의 승인·취소 진행 상태. 화면이 제안 ID별로 들고 있다. */
export type ProposalCardState = {
  pending?: 'approve' | 'cancel';
  failure?: ProposalFailure;
};

type Props = {
  card: ChatCard;
  /** 일정 변경 이용량 표시에 쓴다. 승인 응답을 받으면 화면이 갱신한다 */
  usage?: Usage;
  state?: ProposalCardState;
  /** 다른 요청을 처리하는 중이라 버튼을 누를 수 없다 */
  disabled: boolean;
  onApprove: (p: Proposal) => void;
  onCancel: (p: Proposal) => void;
  onAlternative: (p: Proposal) => void;
  /** 일시적 실패 뒤 같은 요청을 다시 보낸다 */
  onRetry: (p: Proposal) => void;
  onOpenCalendar: () => void;
};

export function ChatCardView({ card, usage, state, ...rest }: Props) {
  switch (card.type) {
    case 'proposal':
      return (
        <Stack gap={2}>
          <ProposalCard proposal={card.proposal} usage={usage} state={state ?? {}} {...rest} />
          {state?.failure?.kind === 'limit' && (
            <LimitCard title="이번 달 AI 일정 변경을 모두 썼어요" resetsOn={state.failure.resetsOn ?? usage?.resetsOn} />
          )}
        </Stack>
      );
    case 'plan_summary':
      return <PlanSummaryCard data={card.data} />;
    case 'weekly_summary':
      return <WeeklySummaryCard data={card.data} />;
    case 'limit':
      return <LimitCard title="이번 달 AI 대화를 모두 썼어요" resetsOn={card.data.resetsOn} />;
    case 'result':
      // 결과는 서버가 같은 메시지의 본문으로 준 시스템 메시지로 보여 준다
      return null;
  }
}

/** 한도 안내(UI_UX §7.3). [Pro 알아보기]는 구독 화면(T-501)이 생기면 붙인다. */
export function LimitCard({ title, resetsOn }: { title: string; resetsOn?: string }) {
  return (
    <Card>
      <Stack gap={2}>
        <Text variant="title3">{title}</Text>
        {resetsOn && <Text tone="secondary">{formatDate(resetsOn)}에 다시 쓸 수 있어요.</Text>}
        <Text tone="secondary">캘린더와 기록은 계속 쓸 수 있어요.</Text>
      </Stack>
    </Card>
  );
}

function CardTitle({ icon, children }: { icon: IconName; children: string }) {
  return (
    <Stack direction="row" gap={2} align="center">
      <Icon name={icon} />
      <Text variant="title3">{children}</Text>
    </Stack>
  );
}

/** 이름표와 값 한 줄. 화면 낭독은 한 덩어리로 읽는다 */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label} ${value}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text tone="secondary">{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

function PlanSummaryCard({ data }: { data: Extract<ChatCard, { type: 'plan_summary' }>['data'] }) {
  return (
    <Card>
      <Stack gap={2}>
        <CardTitle icon="calendar">{`${formatShortDate(data.from)} ~ ${formatShortDate(data.to)} 훈련 일정`}</CardTitle>
        {data.sessions.length === 0 ? (
          <Text tone="secondary">이 기간에는 훈련이 없어요.</Text>
        ) : (
          <List>
            {data.sessions.map((s) => (
              <SessionRow key={s.id} session={s} showDate />
            ))}
          </List>
        )}
      </Stack>
    </Card>
  );
}

function WeeklySummaryCard({ data }: { data: Extract<ChatCard, { type: 'weekly_summary' }>['data'] }) {
  const done = `${data.completedCount}/${data.plannedCount}회`;
  return (
    <Card>
      <Stack gap={2}>
        <CardTitle icon="record">{`${formatShortDate(data.weekStart)} ~ ${formatShortDate(addDays(data.weekStart, 6))} 주간 요약`}</CardTitle>
        <DetailRow label="완료한 훈련" value={done} />
        <ProgressBar value={data.completionRate} accessibilityLabel={`완료율 ${Math.round(data.completionRate * 100)}%`} />
        <DetailRow label="달린 거리" value={formatKm(data.totalDistanceKm)} />
        {data.nextSession && (
          <DetailRow
            label="다음 훈련"
            value={`${formatShortDate(data.nextSession.date)} ${SESSION_TYPE_LABELS[data.nextSession.type].name} ${sessionAmount(data.nextSession)}`}
          />
        )}
      </Stack>
    </Card>
  );
}

const TITLES = { reschedule: '일정 변경 제안', goal_change: '목표 변경 제안', workout_log: '기록 확인' } as const;
const ICONS = { reschedule: 'swap', goal_change: 'flag', workout_log: 'record' } as const;
const APPROVE_LABELS = { reschedule: '적용하기', goal_change: '이 계획으로 시작', workout_log: '기록 저장' } as const;
const CLOSED_TEXT = {
  cancelled: '취소한 제안이에요',
  superseded: '새 제안으로 바뀌었어요',
  expired: '이 제안은 만료됐어요. 다시 물어봐 주세요',
} as const;
// 브라우저·기기 타이머가 받는 최대 지연(약 24.8일)
const MAX_TIMER_MS = 2_147_483_647;

/** 대기 중인 제안이 만료 시각을 넘기면 다시 그려 만료로 보여 준다 */
function useExpired(proposal: Proposal): boolean {
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = Date.parse(proposal.expiresAt);
  useEffect(() => {
    if (proposal.status !== 'pending') return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(MAX_TIMER_MS, Math.max(0, expiresAt - Date.now())));
    return () => clearTimeout(timer);
  }, [proposal.status, expiresAt]);
  return proposal.status === 'pending' && expiresAt <= now;
}

type ProposalCardProps = Omit<Props, 'card' | 'state'> & { proposal: Proposal; state: ProposalCardState };

function ProposalCard({ proposal: p, usage, state, disabled, onApprove, onCancel, onAlternative, onRetry, onOpenCalendar }: ProposalCardProps) {
  const t = useTheme();
  const status = useExpired(p) ? 'expired' : p.status;
  const closed = status === 'cancelled' || status === 'superseded' || status === 'expired';
  return (
    // 끝난 제안은 카드 전체를 흐리게 한다(UI_UX §7.2)
    <View style={{ opacity: closed ? t.opacity.pressed : 1 }}>
      <Card>
        <Stack>
          <CardTitle icon={ICONS[p.type]}>{TITLES[p.type]}</CardTitle>
          {p.type === 'reschedule' && <RescheduleBody proposal={p} />}
          {p.type === 'goal_change' && <GoalChangeBody proposal={p} />}
          {p.type === 'workout_log' && <WorkoutBody proposal={p} />}
          {p.reasonLine && <Text>{p.reasonLine}</Text>}
          {status === 'pending' && (
            <PendingActions
              proposal={p}
              usage={usage}
              state={state}
              disabled={disabled}
              onApprove={onApprove}
              onSecondary={p.type === 'reschedule' ? onAlternative : onCancel}
              onRetry={onRetry}
            />
          )}
          {status === 'approved' && (
            <Stack gap={2}>
              <Stack direction="row" align="center" justify="space-between">
                <Stack direction="row" gap={1} align="center">
                  <Icon name="check" tone="success" />
                  <Text variant="label" tone="success">
                    적용했어요
                  </Text>
                </Stack>
                <Button variant="text" label="캘린더에서 보기" onPress={onOpenCalendar} />
              </Stack>
              {p.consumesQuota && usage && (
                <Text variant="caption" tone="secondary">
                  {rescheduleUsageText(usage)}
                </Text>
              )}
            </Stack>
          )}
          {closed && (
            <Text tone="secondary" align="center">
              {CLOSED_TEXT[status]}
            </Text>
          )}
        </Stack>
      </Card>
    </View>
  );
}

const rescheduleUsageText = (usage: Usage) => `AI 일정 변경 ${usage.reschedule.used}/${usage.reschedule.limit}회 사용`;

type PendingActionsProps = {
  proposal: Proposal;
  usage?: Usage;
  state: ProposalCardState;
  disabled: boolean;
  onApprove: (p: Proposal) => void;
  onSecondary: (p: Proposal) => void;
  onRetry: (p: Proposal) => void;
};

function PendingActions({ proposal: p, usage, state, disabled, onApprove, onSecondary, onRetry }: PendingActionsProps) {
  const failure = state.failure;
  if (failure?.kind === 'final' || failure?.kind === 'not_pending') return <Banner status="error">{failure.message}</Banner>;
  if (failure?.kind === 'retry') {
    return (
      <Stack gap={2}>
        <Banner status="error">{failure.message}</Banner>
        <Button variant="secondary" label="다시 시도" disabled={disabled} onPress={() => onRetry(p)} />
      </Stack>
    );
  }
  const busy = disabled || state.pending !== undefined;
  const notes = [
    p.type === 'reschedule' && !p.consumesQuota ? '이번 변경은 횟수를 쓰지 않아요' : null,
    p.consumesQuota && usage ? rescheduleUsageText(usage) : null,
    '오늘 자정까지',
  ].filter((note): note is string => note !== null);
  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2}>
        <Stack fill>
          <Button
            variant="secondary"
            label={p.type === 'reschedule' ? '다른 방법 보기' : '취소'}
            disabled={busy}
            loading={state.pending === 'cancel'}
            onPress={() => onSecondary(p)}
          />
        </Stack>
        <Stack fill>
          <Button label={APPROVE_LABELS[p.type]} disabled={busy} loading={state.pending === 'approve'} onPress={() => onApprove(p)} />
        </Stack>
      </Stack>
      <Text variant="caption" tone="secondary">
        {notes.join(' · ')}
      </Text>
    </Stack>
  );
}

const sessionName = (s: SessionSnapshot) => `${SESSION_TYPE_LABELS[s.type].name} ${sessionAmount(s)}`;

/** 바뀐 뒤의 표시. 날짜가 같고 양이나 종류만 바뀌면 바뀐 내용을 보여 준다 */
function afterText(change: ProposalChange): string | null {
  const { before, after } = change;
  if (!after) return null;
  if (!before) return formatShortDate(after.date);
  const parts = [formatShortDate(after.date)];
  if (after.type !== before.type || sessionAmount(after) !== sessionAmount(before)) parts.push(sessionName(after));
  return parts.join(' · ');
}

function ChangeRow({ change }: { change: ProposalChange }) {
  const t = useTheme();
  const shown = change.before ?? change.after;
  if (!shown) return null;
  const after = change.action === 'skip' || change.action === 'remove' ? null : afterText(change);
  const dropLabel = change.action === 'remove' ? '삭제' : '생략';
  const beforeText = change.before ? formatShortDate(change.before.date) : '새 훈련';
  return (
    <Card nested>
      <View accessible accessibilityLabel={`${sessionName(shown)}, ${beforeText}에서 ${after ?? dropLabel}`} style={{ gap: t.spacing[1] }}>
        <Stack direction="row" gap={2} align="center">
          <StatusDot session={shown.type} />
          <Text variant="label">{sessionName(shown)}</Text>
        </Stack>
        <Stack direction="row" gap={2} align="center">
          <Stack fill>
            <Text tone="secondary">{beforeText}</Text>
          </Stack>
          <Icon name="next" tone="neutral" />
          <Stack fill>{after ? <Text variant="label">{after}</Text> : <Chip label={dropLabel} tone="warning" />}</Stack>
        </Stack>
      </View>
    </Card>
  );
}

function WarningBanners({ warnings, status }: { warnings: string[]; status: 'warning' | 'info' }) {
  return (
    <>
      {warnings.map((warning) => {
        const code = planWarningSchema.safeParse(warning);
        // 일정 변경의 경고는 서버가 문장으로 준다. 계획 경고만 코드로 오므로 문구를 찾는다
        return (
          <Banner key={warning} status={status}>
            {code.success ? PLAN_WARNING_LABELS[code.data] : warning}
          </Banner>
        );
      })}
    </>
  );
}

function RescheduleBody({ proposal: p }: { proposal: Proposal }) {
  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2}>
        <Stack fill>
          <Text variant="caption" tone="secondary">
            변경 전
          </Text>
        </Stack>
        <Stack fill>
          <Text variant="caption" tone="secondary">
            변경 후
          </Text>
        </Stack>
      </Stack>
      {p.changes.map((change, i) => (
        <ChangeRow key={change.sessionId ?? `new-${i}`} change={change} />
      ))}
      {p.impact && (
        <>
          <Divider />
          <DetailRow label="이번 주 거리" value={`${formatKm(p.impact.weeklyDistanceBeforeKm)} → ${formatKm(p.impact.weeklyDistanceAfterKm)}`} />
          {p.impact.skippedCount > 0 && <Banner status="warning">{`이번 주 훈련이 ${p.impact.skippedCount}회 줄어요`}</Banner>}
        </>
      )}
      <WarningBanners warnings={p.warnings} status="warning" />
    </Stack>
  );
}

const goalText = (goal: NonNullable<Proposal['goal']>['before']) =>
  [GOAL_DISTANCE_LABELS[goal.goalDistance], goal.goalTimeSec ? `목표 ${formatDuration(goal.goalTimeSec)}` : null].filter(Boolean).join(' · ');

function GoalChangeBody({ proposal: p }: { proposal: Proposal }) {
  const added = p.changes.flatMap((c) => (c.action === 'add' && c.after ? [c.after] : [])).sort((a, b) => a.date.localeCompare(b.date));
  const removed = p.changes.filter((c) => c.action === 'remove').length;
  const firstWeekStart = added[0] ? mondayOf(added[0].date) : null;
  const firstWeek = firstWeekStart ? added.filter((s) => s.date <= addDays(firstWeekStart, 6)) : [];
  const firstWeekKm = firstWeek.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
  return (
    <Stack gap={2}>
      {p.goal && (
        <>
          <DetailRow label="목표" value={`${goalText(p.goal.before)} → ${goalText(p.goal.after)}`} />
          {(p.goal.before.raceDate || p.goal.after.raceDate) && p.goal.before.raceDate !== p.goal.after.raceDate && (
            <DetailRow
              label="대회 날짜"
              value={`${p.goal.before.raceDate ? formatShortDate(p.goal.before.raceDate) : '없음'} → ${p.goal.after.raceDate ? formatShortDate(p.goal.after.raceDate) : '없음'}`}
            />
          )}
        </>
      )}
      <Text>{`남은 훈련 ${removed}개를 새 훈련 ${added.length}개로 바꿔요.`}</Text>
      {firstWeek.length > 0 && (
        <DetailRow label="새 계획 첫 주" value={[`${firstWeek.length}회`, firstWeekKm > 0 ? formatKm(firstWeekKm) : null].filter(Boolean).join(' · ')} />
      )}
      <WarningBanners warnings={p.warnings} status="info" />
    </Stack>
  );
}

function WorkoutBody({ proposal: p }: { proposal: Proposal }) {
  const w = p.workout;
  if (!w) return null;
  return (
    <Stack gap={2}>
      <DetailRow label="날짜" value={formatDate(w.date)} />
      <DetailRow label="거리" value={formatKm(w.distanceKm)} />
      <DetailRow label="시간" value={formatDuration(w.durationSec)} />
      <DetailRow label="페이스" value={formatPace(w.paceSecPerKm)} />
      <DetailRow
        label="연결할 훈련"
        value={w.plannedSession ? `${formatShortDate(w.plannedSession.date)} ${sessionName(w.plannedSession)}` : '연결하지 않아요'}
      />
    </Stack>
  );
}
