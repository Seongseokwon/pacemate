import { GOAL_DISTANCE_LABELS, PLAN_FOCUS_LABELS, SESSION_TYPE_LABELS, type HomeResponse, type PlanSummary } from '@pacemate/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { getHome, HOME_KEY } from '@/api/plan';
import { SessionDetailSheet } from '@/components/session-detail';
import { advance } from '@/first-run/store';
import { dismiss, loadDismissed } from '@/home/dismissed';
import { coachHref, MISSED_SESSIONS_DRAFT, recordHref } from '@/navigation/links';
import { startNewGoal } from '@/plan/new-goal';
import {
  addDays,
  Button,
  Card,
  ClickableCard,
  CoachAvatar,
  deviceToday,
  EmptyState,
  formatDday,
  formatMonthDay,
  formatShortDate,
  Heading,
  Icon,
  mondayOf,
  ProgressBar,
  RaceGoalCard,
  Screen,
  sessionAmount,
  SessionList,
  SessionRow,
  Skeleton,
  Stack,
  StatTile,
  StatusChip,
  StatusDot,
  Text,
  TodayCard,
  WeekGauge,
  weekdayOf,
} from '@/ui';

const DAY_MS = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** 계획의 전체 주 수와 그 날짜가 몇 주차인지. 주는 월요일에 시작한다 */
const weekOf = (plan: Pick<PlanSummary, 'startDate' | 'endDate'>, date: string) => ({
  current: Math.max(1, Math.floor(days(mondayOf(plan.startDate), date) / 7) + 1),
  total: Math.floor(days(mondayOf(plan.startDate), plan.endDate) / 7) + 1,
});

/** "11/16" */
const monthDaySlash = (date: string) => formatShortDate(date).split(' ')[1];

// 유지 계획은 목표 없음이라 목표 문구(focus)를 쓴다
const KIND_SHORT = { race_prep: '완주 준비', base_building: '기초 훈련', maintenance: '유지' } as const;

/** 목표 이름: "5km 완주 준비", 목표 없음이면 목표 문구(F03-R09) */
const goalName = (plan: PlanSummary) =>
  plan.focus ? PLAN_FOCUS_LABELS[plan.focus] : `${GOAL_DISTANCE_LABELS[plan.goalDistance]} ${KIND_SHORT[plan.kind]}`;

/** "1시간 59분 0초" 대신 "1:59:00" */
const clock = (sec: number) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(sec / 3600);
  const rest = `${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
};

function HomeSkeleton() {
  return (
    <Stack gap={6}>
      <Skeleton short />
      <Skeleton shape="block" />
      <Skeleton shape="block" />
    </Stack>
  );
}

/** 코치 프로필과 두 줄 문구가 있는 카드(C2 홈의 코치 카드) */
function CoachCard({ title, body, onPress, children }: { title: string; body: string; onPress?: () => void; children?: ReactNode }) {
  const content = (
    <Stack gap={3}>
      <Stack direction="row" align="center" gap={3}>
        <CoachAvatar size="card" />
        <Stack fill gap={1}>
          <Text variant="title3">{title}</Text>
          <Text variant="supporting" tone="secondary">
            {body}
          </Text>
        </Stack>
        {onPress && <Icon name="next" tone="neutral" />}
      </Stack>
      {children}
    </Stack>
  );
  return onPress ? (
    <ClickableCard accessibilityLabel={`${title}. ${body}`} onPress={onPress}>
      {content}
    </ClickableCard>
  ) : (
    <Card>{content}</Card>
  );
}

/** 홈(F06, PRD §5.4, UI_UX §6.3) */
export default function Home() {
  const home = useQuery({ queryKey: HOME_KEY, queryFn: getHome });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    void loadDismissed().then(setDismissed);
  }, []);

  const data = home.data;
  const plan = data?.plan ?? null;
  const notStarted = data?.daysToStart != null;
  const weekRef = data?.weekSessions[0]?.date ?? deviceToday();
  const subtitle =
    !plan || plan.isFinished ? undefined
    : notStarted ? `${goalName(plan)} · 시작 전`
    : `${goalName(plan)} · ${weekOf(plan, weekRef).current}주 차 / 전체 ${weekOf(plan, weekRef).total}주`;

  if (home.isError && !data) return <Screen title="반가워요!" error={home.error.message} onRetry={() => void home.refetch()} />;

  const openCoach = () => router.push(coachHref());

  const content = (data: HomeResponse) => {
    // 계획 없음: 계획 만들기 카드가 화면의 중심이다(§6.3, F02-R08)
    if (!plan) {
      return (
        <Stack gap={4}>
          <Card>
            <Stack gap={3}>
              <Heading level={2}>나에게 맞는 계획 만들기</Heading>
              <Text tone="secondary">몇 가지 질문에 답하면 지금 실력에 맞는 훈련 계획을 받을 수 있어요.</Text>
              <Button label="계획 만들기" onPress={() => void advance('onboardingStarted')} />
            </Stack>
          </Card>
          <CoachCard title="AI 코치에게 물어보기" body="계획이 없어도 달리기에 대해 무엇이든 물어볼 수 있어요." onPress={openCoach} />
        </Stack>
      );
    }

    // 계획이 끝났으면 종료 안내와 [이어서 훈련하기]·[새 목표 설정](F03-R08, F03-R10, C2 15a·15b)
    if (plan.isFinished) {
      return (
        <Stack gap={4}>
          <EmptyState icon="flag" message={data.managerMessage.text} />
          <Stack direction="row" gap={2}>
            <StatTile value={`${plan.progress.completed}/${plan.progress.total}회`} label="완료한 훈련" />
            <StatTile value={`${weekOf(plan, plan.endDate).total}주`} label="함께한 기간" />
          </Stack>
          <Button size="large" label="이어서 훈련하기" onPress={() => router.push('/plan-continue')} />
          <Button size="large" variant="secondary" label="새 목표 설정" onPress={() => void startNewGoal()} />
        </Stack>
      );
    }

    const yesterday = data.yesterdaySession && !dismissed.includes(data.yesterdaySession.id) ? data.yesterdaySession : null;
    const today = data.todaySession;
    const weekStart = mondayOf(weekRef);
    const week = weekOf(plan, weekRef);
    const firstSession = data.weekSessions[0];

    return (
      <Stack gap={4}>
        {data.daysToRace !== null ? (
          <RaceGoalCard
            title={`${GOAL_DISTANCE_LABELS[plan.goalDistance]} 대회 · ${formatMonthDay(plan.raceDate!)}`}
            highlight={formatDday(data.daysToRace)}
            side={plan.goalTimeSec !== null ? { label: '목표 기록', value: clock(plan.goalTimeSec) } : undefined}
            week={notStarted ? `전체 ${week.total}주` : `${week.current} / ${week.total}주차`}
            progress={plan.progress}
          />
        ) : (
          // 대회 날짜가 없으면 D-day 대신 주차를 머리글에 쓰고, 전체 진행률만 보여 준다(§6.3)
          <Stack gap={2}>
            <Stack direction="row" justify="space-between">
              <Text variant="supporting" tone="secondary">
                전체 진행
              </Text>
              <Text variant="supporting" tabular>{`${plan.progress.completed} / ${plan.progress.total}회 완료`}</Text>
            </Stack>
            <ProgressBar
              value={plan.progress.total === 0 ? 0 : plan.progress.completed / plan.progress.total}
              accessibilityLabel={`훈련 ${plan.progress.total}개 중 ${plan.progress.completed}개 완료`}
            />
          </Stack>
        )}

        {notStarted ? (
          // 다음 주 시작: 오늘 카드 자리에 준비 안내(서버의 PLAN_NOT_STARTED 문구)
          <TodayCard
            session={null}
            label="첫 주 준비"
            title={firstSession ? `첫 훈련은 ${weekdayOf(firstSession.date)}요일이에요` : '곧 시작해요'}
            highlight={formatDday(data.daysToStart!)}
            message={data.managerMessage.text}
          />
        ) : (
          <TodayCard session={today} message={today ? undefined : '푹 쉬고 다음 훈련을 준비해요.'}>
            {today?.status === 'completed' ? (
              <Stack direction="row" align="center" gap={2}>
                <StatusChip status="completed" />
                <Text variant="supporting" tone="secondary">
                  오늘 기록을 남겼어요
                </Text>
              </Stack>
            ) : (
              today && <Button size="large" label="기록하기" onPress={() => router.push(recordHref({ date: today.date, sessionId: today.id }))} />
            )}
          </TodayCard>
        )}

        {yesterday && (
          <Card>
            <Stack gap={3}>
              <Heading level={3}>어제 훈련을 기록하지 않았어요</Heading>
              <Stack direction="row" align="center" gap={2}>
                <StatusDot session={yesterday.type} />
                <Text variant="supporting" tone="secondary">
                  {`${formatShortDate(yesterday.date)} · ${SESSION_TYPE_LABELS[yesterday.type].name} ${sessionAmount(yesterday)}`}
                </Text>
              </Stack>
              <Stack direction="row" gap={2}>
                <Stack fill>
                  <Button variant="secondary" label="못 했어요" onPress={() => void dismiss(yesterday.id).then(setDismissed)} />
                </Stack>
                <Stack fill>
                  <Button label="기록하기" onPress={() => router.push(recordHref({ date: yesterday.date, sessionId: yesterday.id }))} />
                </Stack>
              </Stack>
            </Stack>
          </Card>
        )}

        {!notStarted &&
          (data.weekMissedCount >= 2 ? (
            // 미완료가 2회 이상이면 매니저 메시지 자리에 일정 조정 안내를 둔다(F05-R14)
            <CoachCard title="이번 주 훈련을 두 번 놓쳤어요" body="괜찮아요. 남은 일정을 같이 다시 짜 볼까요?">
              <Button variant="secondary" label="코치와 일정 조정하기" onPress={() => router.push(coachHref({ draft: MISSED_SESSIONS_DRAFT }))} />
            </CoachCard>
          ) : (
            <CoachCard title={data.managerMessage.text} body="AI 코치에게 일정이나 훈련을 물어볼 수 있어요." onPress={openCoach} />
          ))}

        <Stack gap={3}>
          <Stack direction="row" align="center" justify="space-between">
            <Heading level={2}>{notStarted ? '첫 주 훈련' : '이번 주'}</Heading>
            <Text variant="supporting" tone="secondary" tabular>
              {`${monthDaySlash(weekStart)} ~ ${monthDaySlash(addDays(weekStart, 6))}`}
            </Text>
          </Stack>
          {!notStarted && <WeekGauge weekStart={weekStart} sessions={data.weekSessions} />}
          {data.weekSessions.length === 0 ? (
            <Text tone="secondary">이번 주에는 훈련이 없어요.</Text>
          ) : (
            <SessionList>
              {data.weekSessions.map((session) => (
                <SessionRow key={session.id} session={session} showDate onPress={() => setDetailId(session.id)} />
              ))}
            </SessionList>
          )}
        </Stack>
      </Stack>
    );
  };

  return (
    <Screen title="반가워요!" subtitle={subtitle} refreshing={home.isRefetching} onRefresh={() => void home.refetch()}>
      {data ? content(data) : <HomeSkeleton />}
      <SessionDetailSheet sessionId={detailId} onClose={() => setDetailId(null)} />
    </Screen>
  );
}

