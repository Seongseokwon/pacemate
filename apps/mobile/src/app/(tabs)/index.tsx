import { GOAL_DISTANCE_LABELS, PLAN_FOCUS_LABELS, type HomeResponse, type PlanSummary } from '@pacemate/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { getHome, HOME_KEY } from '@/api/plan';
import { SessionDetailSheet } from '@/components/session-detail';
import { advance } from '@/first-run/store';
import { dismiss, loadDismissed } from '@/home/dismissed';
import { coachHref, MISSED_SESSIONS_DRAFT, recordHref } from '@/navigation/links';
import {
  Button,
  Card,
  ClickableCard,
  deviceToday,
  EmptyState,
  formatDate,
  formatDday,
  Heading,
  List,
  mondayOf,
  RaceGoalCard,
  Screen,
  Section,
  SessionRow,
  Skeleton,
  Stack,
  StatusChip,
  Text,
  TodayCard,
  WeekGauge,
} from '@/ui';

const DAY_MS = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** 계획의 전체 주 수와 그 날짜가 몇 주차인지. 주는 월요일에 시작한다 */
const weekOf = (plan: Pick<PlanSummary, 'startDate' | 'endDate'>, date: string) => ({
  current: Math.floor(days(mondayOf(plan.startDate), date) / 7) + 1,
  total: Math.floor(days(mondayOf(plan.startDate), plan.endDate) / 7) + 1,
});

/** 목표 카드의 큰 글자: 시작 전이면 시작까지 남은 날, 대회 날짜가 있으면 D-day, 없으면 주차(§6.3) */
function goalHighlight(home: HomeResponse & { plan: PlanSummary }): string {
  if (home.daysToStart !== null) return `시작까지 ${formatDday(home.daysToStart)}`;
  if (home.daysToRace !== null) return formatDday(home.daysToRace);
  const reference = home.weekSessions[0]?.date ?? home.plan.startDate;
  const { current, total } = weekOf(home.plan, reference);
  return `${current}주차 / 전체 ${total}주`;
}

function HomeSkeleton() {
  return (
    <Stack gap={6}>
      <Skeleton short />
      <Skeleton shape="block" />
      <Skeleton shape="block" />
    </Stack>
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

  if (home.isError && !home.data) return <Screen title="홈" error={home.error.message} onRetry={() => void home.refetch()} />;

  const data = home.data;
  const content = () => {
    if (!data) return <HomeSkeleton />;
    const openCoach = () => router.push(coachHref());
    const managerCard = (
      <ClickableCard accessibilityLabel={`코치에게 물어보기. ${data.managerMessage.text}`} onPress={openCoach}>
        <Text>{data.managerMessage.text}</Text>
      </ClickableCard>
    );

    // 계획 없음: 계획 만들기 카드가 화면의 중심이다(§6.3, F02-R08)
    if (!data.plan) {
      return (
        <Stack gap={6}>
          <ClickableCard accessibilityLabel="나에게 맞는 훈련 계획을 만들어 보세요" onPress={() => void advance('onboardingStarted')}>
            <Stack gap={2}>
              <Heading level={2}>나에게 맞는 훈련 계획을 만들어 보세요</Heading>
              <Text tone="secondary">몇 가지 질문에 답하면 바로 만들어 드려요.</Text>
            </Stack>
          </ClickableCard>
          {managerCard}
        </Stack>
      );
    }

    // 계획이 끝났으면 종료 안내. [이어서 훈련하기]와 [새 목표 설정]은 유지 계획(T-207)에서 붙인다
    if (data.plan.isFinished) return <EmptyState icon="flag" message={data.managerMessage.text} />;

    const plan = data.plan;
    const notStarted = data.daysToStart !== null;
    const yesterday = data.yesterdaySession && !dismissed.includes(data.yesterdaySession.id) ? data.yesterdaySession : null;
    const adjustButton = data.weekMissedCount >= 2 && (
      <Button variant="text" label="코치와 일정 조정하기" onPress={() => router.push(coachHref({ draft: MISSED_SESSIONS_DRAFT }))} />
    );
    const today = data.todaySession;

    return (
      <Stack gap={6}>
        <RaceGoalCard
          // 목표 없음이면 대회와 D-day 대신 목표 문구와 진행 상황을 보여 준다. 계획이 정하지 않은 거리를 쓰지 않는다(F03-R09)
          title={plan.focus ? PLAN_FOCUS_LABELS[plan.focus] : GOAL_DISTANCE_LABELS[plan.goalDistance]}
          highlight={goalHighlight({ ...data, plan })}
          description={
            notStarted ? `${formatDate(plan.startDate)}에 시작해요`
            : plan.focus ? `이번 주 ${data.weekSessions.filter((session) => session.status === 'completed').length}번 달렸어요`
            : undefined
          }
          progress={plan.progress}
        />

        {notStarted ? (
          // 다음 주 시작: 오늘 카드 자리에 준비 안내(서버의 PLAN_NOT_STARTED 문구)
          <TodayCard session={null} heading="첫 주 준비" message={data.managerMessage.text} />
        ) : (
          <TodayCard session={today}>
            {today?.status === 'completed' ? (
              <Stack direction="row" align="center" gap={2}>
                <StatusChip status="completed" />
                <Text variant="supporting" tone="secondary">
                  오늘 기록을 남겼어요
                </Text>
              </Stack>
            ) : (
              today && <Button label="기록하기" onPress={() => router.push(recordHref({ date: today.date, sessionId: today.id }))} />
            )}
          </TodayCard>
        )}

        {yesterday && (
          <Card>
            <Stack>
              <Heading level={2}>어제 훈련을 기록하지 않았어요</Heading>
              <SessionRow session={yesterday} />
              <Stack direction="row" gap={2}>
                <Stack fill>
                  <Button label="기록하기" onPress={() => router.push(recordHref({ date: yesterday.date, sessionId: yesterday.id }))} />
                </Stack>
                <Stack fill>
                  <Button variant="secondary" label="못 했어요" onPress={() => void dismiss(yesterday.id).then(setDismissed)} />
                </Stack>
              </Stack>
              {adjustButton}
            </Stack>
          </Card>
        )}

        {!notStarted && (yesterday || !adjustButton ? managerCard : adjustButton)}

        <Section title={notStarted ? '첫 주 훈련' : '이번 주'}>
          {!notStarted && <WeekGauge weekStart={mondayOf(data.weekSessions[0]?.date ?? deviceToday())} sessions={data.weekSessions} />}
          {data.weekSessions.length === 0 ? (
            <Text tone="secondary">이번 주에는 훈련이 없어요.</Text>
          ) : (
            <List>
              {data.weekSessions.map((session) => (
                <SessionRow key={session.id} session={session} showDate onPress={() => setDetailId(session.id)} />
              ))}
            </List>
          )}
        </Section>
      </Stack>
    );
  };

  return (
    <Screen title="홈" refreshing={home.isRefetching} onRefresh={() => void home.refetch()}>
      {content()}
      <SessionDetailSheet sessionId={detailId} onClose={() => setDetailId(null)} />
    </Screen>
  );
}
