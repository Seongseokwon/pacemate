import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getSessions, SESSIONS_KEY } from '@/api/plan';
import { SessionDetailSheet } from '@/components/session-detail';
import {
  addDays,
  deviceToday,
  firstOfMonth,
  formatDate,
  formatMonthDay,
  Heading,
  IconButton,
  List,
  mondayOf,
  MonthGrid,
  monthGridDates,
  Screen,
  SegmentedControl,
  SessionRow,
  Skeleton,
  Stack,
  Text,
  WeekStrip,
} from '@/ui';

type CalendarView = 'week' | 'month';

/** 보기마다 조회할 기간. 월간은 달력에 보이는 칸 전체다(최대 42일, API_SPEC §3.3의 62일 안) */
function rangeOf(view: CalendarView, anchor: string): { from: string; to: string; title: string } {
  if (view === 'week') {
    const from = mondayOf(anchor);
    const to = addDays(from, 6);
    return { from, to, title: `${formatMonthDay(from)} ~ ${formatMonthDay(to)}` };
  }
  const dates = monthGridDates(anchor);
  const [year, month] = anchor.split('-').map(Number);
  return { from: dates[0]!, to: dates[dates.length - 1]!, title: `${year}년 ${month}월` };
}

/** 캘린더(F06, PRD §5.6, UI_UX §6.5). 주간·월간 보기와 고른 날의 훈련 목록 */
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
  const calendarProps = { sessions: items, today, selected, onSelect: setSelected };

  if (sessions.isError && !sessions.data) {
    return <Screen title="캘린더" error={sessions.error.message} onRetry={() => void sessions.refetch()} />;
  }

  return (
    <Screen
      title="캘린더"
      refreshing={sessions.isRefetching}
      onRefresh={() => void sessions.refetch()}
    >
      <Stack gap={4}>
        <SegmentedControl
          value={view}
          options={[
            { value: 'week', label: '주간' },
            { value: 'month', label: '월간' },
          ]}
          onChange={setView}
        />
        <Stack direction="row" align="center" justify="space-between">
          <IconButton icon="back" accessibilityLabel={view === 'week' ? '지난주' : '지난달'} onPress={() => move(-1)} />
          <Text variant="title3">{range.title}</Text>
          <IconButton icon="next" accessibilityLabel={view === 'week' ? '다음 주' : '다음 달'} onPress={() => move(1)} />
        </Stack>
        {view === 'week' ? <WeekStrip weekStart={range.from} {...calendarProps} /> : <MonthGrid month={selected} {...calendarProps} />}
        <Stack gap={2}>
          <Heading level={2}>{formatDate(selected)}</Heading>
          {!sessions.data ? (
            <Skeleton />
          ) : daySessions.length === 0 ? (
            <Text tone="secondary">쉬는 날이에요</Text>
          ) : (
            <List>
              {daySessions.map((session) => (
                <SessionRow key={session.id} session={session} onPress={() => setDetailId(session.id)} />
              ))}
            </List>
          )}
        </Stack>
      </Stack>
      <SessionDetailSheet sessionId={detailId} onClose={() => setDetailId(null)} />
    </Screen>
  );
}
