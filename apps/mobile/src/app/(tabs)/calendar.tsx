import type { Session } from '@pacemate/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getSessions, SESSIONS_KEY } from '@/api/plan';
import { SessionDetailSheet } from '@/components/session-detail';
import {
  addDays,
  Banner,
  deviceToday,
  firstOfMonth,
  formatDate,
  formatKm,
  formatShortDate,
  Heading,
  IconButton,
  mondayOf,
  MonthGrid,
  monthGridDates,
  Screen,
  SegmentedControl,
  SessionList,
  SessionRow,
  Skeleton,
  Stack,
  Text,
  WeekStrip,
} from '@/ui';

type CalendarView = 'week' | 'month';

const dayOf = (date: string) => Number(date.slice(8, 10));
const monthNum = (date: string) => Number(date.slice(5, 7));

/** 보기마다 조회할 기간과 제목. 월간은 달력에 보이는 칸 전체다(최대 42일, API_SPEC §3.3의 62일 안) */
function rangeOf(view: CalendarView, anchor: string): { from: string; to: string; title: string } {
  if (view === 'week') {
    const from = mondayOf(anchor);
    const to = addDays(from, 6);
    // C2: "11월 3주차 · 16~22일". 주차는 월요일이 그 달의 몇 번째 주인지다
    const end = monthNum(to) === monthNum(from) ? `${dayOf(to)}일` : `${monthNum(to)}월 ${dayOf(to)}일`;
    return { from, to, title: `${monthNum(from)}월 ${Math.ceil(dayOf(from) / 7)}주차 · ${dayOf(from)}~${end}` };
  }
  const dates = monthGridDates(anchor);
  return { from: dates[0]!, to: dates[dates.length - 1]!, title: `${anchor.slice(0, 4)}년 ${monthNum(anchor)}월` };
}

/** 바뀐 훈련의 안내 한 줄: "금 11/20 → 토 11/21 · 거리 변경 없음" */
function changeLine(session: Session): string {
  const original = session.original!;
  const sameAmount = original.distanceKm === session.distanceKm && original.durationMin === session.durationMin;
  const amount =
    sameAmount ? '거리 변경 없음'
    : session.distanceKm !== null && original.distanceKm !== null ? `${formatKm(original.distanceKm)} → ${formatKm(session.distanceKm)}`
    : '양이 바뀌었어요';
  return `${formatShortDate(original.date)} → ${formatShortDate(session.date)} · ${amount}`;
}

/** 캘린더(F06, PRD §5.6, UI_UX §6.5, C2 S01d). 주간·월간 보기와 고른 날의 훈련 목록 */
export default function Calendar() {
  const today = deviceToday();
  const [view, setView] = useState<CalendarView>('week');
  const [selected, setSelected] = useState(today);
  const [detailId, setDetailId] = useState<string | null>(null);

  const range = rangeOf(view, selected);
  const sessions = useQuery({
    queryKey: [...SESSIONS_KEY, range.from, range.to],
    queryFn: () => getSessions(range.from, range.to),
    placeholderData: keepPreviousData,
  });

  const move = (direction: 1 | -1) => setSelected(view === 'week' ? addDays(mondayOf(selected), direction * 7) : firstOfMonth(selected, direction));
  const items = sessions.data?.items ?? [];
  const daySessions = items.filter((session) => session.date === selected);
  const weekSessions = items.filter((session) => session.date >= mondayOf(selected) && session.date <= addDays(mondayOf(selected), 6));
  const calendarProps = { sessions: items, today, selected, onSelect: setSelected };
  const switcher = (
    <SegmentedControl
      size="compact"
      value={view}
      options={[
        { value: 'week', label: '주간' },
        { value: 'month', label: '월간' },
      ]}
      onChange={setView}
    />
  );

  if (sessions.isError && !sessions.data) {
    return <Screen title="캘린더" headerRight={switcher} error={sessions.error.message} onRetry={() => void sessions.refetch()} />;
  }

  const openDetail = (session: Session) => setDetailId(session.id);
  return (
    <Screen title="캘린더" headerRight={switcher} refreshing={sessions.isRefetching} onRefresh={() => void sessions.refetch()}>
      <Stack gap={4}>
        <Stack direction="row" align="center" justify="space-between">
          <IconButton variant="filled" icon="back" accessibilityLabel={view === 'week' ? '지난주' : '지난달'} onPress={() => move(-1)} />
          <Text variant="title3">{range.title}</Text>
          <IconButton variant="filled" icon="next" accessibilityLabel={view === 'week' ? '다음 주' : '다음 달'} onPress={() => move(1)} />
        </Stack>
        {view === 'week' ? <WeekStrip weekStart={range.from} {...calendarProps} /> : <MonthGrid month={selected} {...calendarProps} />}

        <Stack gap={3}>
          <Stack direction="row" align="center" justify="space-between">
            <Heading level={2}>{formatDate(selected)}</Heading>
            <Text variant="supporting" tone="secondary">
              선택한 날짜
            </Text>
          </Stack>
          {!sessions.data ? (
            <Skeleton />
          ) : daySessions.length === 0 ? (
            <Text tone="secondary">쉬는 날이에요</Text>
          ) : (
            <>
              <SessionList>
                {daySessions.map((session) => (
                  <SessionRow key={session.id} session={session} showDate onPress={() => openDetail(session)} />
                ))}
              </SessionList>
              {daySessions
                .filter((session) => session.original)
                .map((session) => (
                  <Banner key={session.id} icon="swap" title="일정이 변경됐어요">
                    {changeLine(session)}
                  </Banner>
                ))}
            </>
          )}
        </Stack>

        {view === 'week' && weekSessions.length > 0 && (
          <Stack gap={3}>
            <Stack direction="row" align="center" justify="space-between">
              <Heading level={2}>{`${mondayOf(selected) === mondayOf(today) ? '이번 주' : '이 주'} · ${weekSessions.filter((session) => session.status !== 'skipped').length}회`}</Heading>
              <Text variant="supporting" tone="secondary">
                주간 계획
              </Text>
            </Stack>
            <SessionList>
              {weekSessions.map((session) => (
                <SessionRow key={session.id} session={session} showDate onPress={() => openDetail(session)} />
              ))}
            </SessionList>
          </Stack>
        )}
      </Stack>
      <SessionDetailSheet sessionId={detailId} onClose={() => setDetailId(null)} />
    </Screen>
  );
}
