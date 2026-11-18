import { SESSION_STATUS_LABELS, SESSION_TYPE_LABELS, type Session } from '@pacemate/shared';
import { View } from 'react-native';
import { Press } from './button';
import { addDays, dayOfMonth, formatDate, monthGridDates, monthOf, weekdayOf } from './dates';
import { Icon } from './icon';
import { Text } from './text';
import { toneColor, useTheme } from './theme';

type DaySession = Pick<Session, 'date' | 'type' | 'status'>;

/** 날짜별 훈련. 칸의 표시는 생략이 아닌 첫 훈련으로 정한다 */
const byDate = (sessions: readonly DaySession[]) => {
  const map = new Map<string, DaySession[]>();
  for (const session of sessions) map.set(session.date, [...(map.get(session.date) ?? []), session]);
  return map;
};

const WEEKDAY_HEADER = ['월', '화', '수', '목', '금', '토', '일'];

type DayCellProps = {
  date: string;
  sessions: DaySession[];
  today: string;
  selected: boolean;
  /** 월간 보기에서 다른 달의 날짜 */
  dimmed?: boolean;
  /** 주간 보기는 칸 안에 요일을 쓴다(C2/WeekStrip) */
  showWeekday?: boolean;
  onPress: () => void;
};

/** 날짜 칸. 예정은 종류 색 점, 완료는 체크, 미완료는 빈 테두리 점, 생략은 표시 없음(§6.5) */
function DayCell({ date, sessions, today, selected, dimmed = false, showWeekday = false, onPress }: DayCellProps) {
  const t = useTheme();
  const shown = sessions.find((session) => session.status !== 'skipped');
  const isToday = date === today;
  const label = [
    formatDate(date),
    isToday ? '오늘' : null,
    ...sessions.map((session) => `${SESSION_TYPE_LABELS[session.type].name} ${SESSION_STATUS_LABELS[session.status]}`),
  ]
    .filter(Boolean)
    .join(', ');

  const dot = t.spacing[1.5];
  // 고른 날은 주황 채움이라 표시를 남색으로 바꾼다
  const markerColor = (color: string) => (selected ? t.color.onAccent : color);
  const marker =
    !shown ? <View style={{ height: dot }} />
    : shown.status === 'completed' ? <Icon name="check" tone={selected ? 'onAccent' : 'success'} />
    : shown.status === 'missed' ? (
      <View style={{ width: dot, height: dot, borderRadius: t.radius.full, borderWidth: t.size.border, borderColor: markerColor(t.color.text.warning) }} />
    ) : (
      <View style={{ width: dot, height: dot, borderRadius: t.radius.full, backgroundColor: markerColor(toneColor(t, 'neutral', shown.type)) }} />
    );

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: t.size.listRow,
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.spacing[1],
        paddingVertical: t.spacing[2],
        borderRadius: t.radius.element,
        // 오늘은 테두리, 고른 날은 채움(§6.5)
        borderWidth: t.size.border,
        borderColor: isToday && !selected ? t.color.accent : 'transparent',
        backgroundColor: selected ? t.color.accent : undefined,
        opacity: dimmed ? t.opacity.pressed : 1,
      }}
    >
      {showWeekday && (
        <Text variant="caption" tone={selected ? 'onAccent' : 'secondary'}>
          {weekdayOf(date)}
        </Text>
      )}
      <Text variant="title3" tone={selected ? 'onAccent' : isToday ? 'accent' : 'primary'} tabular>
        {String(dayOfMonth(date))}
      </Text>
      {marker}
    </Press>
  );
}

function WeekdayHeader() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing[1] }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {WEEKDAY_HEADER.map((name) => (
        <View key={name} style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="caption" tone="secondary">
            {name}
          </Text>
        </View>
      ))}
    </View>
  );
}

type CalendarProps = {
  sessions: readonly DaySession[];
  /** 기기의 오늘. 표시에만 쓴다 */
  today: string;
  selected: string;
  onSelect: (date: string) => void;
};

/** 한 주의 요일 7칸과 훈련 표시(§4.3, C2/WeekStrip). `weekStart`는 월요일이다. */
export function WeekStrip({ weekStart, ...rest }: CalendarProps & { weekStart: string }) {
  const t = useTheme();
  const map = byDate(rest.sessions);
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing[1], padding: t.spacing[2], borderRadius: t.radius.container, backgroundColor: t.color.background.surface }}>
      {Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map((date) => (
        <DayCell
          key={date}
          date={date}
          sessions={map.get(date) ?? []}
          today={rest.today}
          selected={date === rest.selected}
          showWeekday
          onPress={() => rest.onSelect(date)}
        />
      ))}
    </View>
  );
}

/** 월간 달력(§4.3). `month`는 그 달의 아무 날짜다. */
export function MonthGrid({ month, ...rest }: CalendarProps & { month: string }) {
  const t = useTheme();
  const map = byDate(rest.sessions);
  const dates = monthGridDates(month);
  const current = monthOf(month).month;
  const weeks = Array.from({ length: dates.length / 7 }, (_, index) => dates.slice(index * 7, index * 7 + 7));
  return (
    <View style={{ gap: t.spacing[1], padding: t.spacing[2], borderRadius: t.radius.container, backgroundColor: t.color.background.surface }}>
      <WeekdayHeader />
      {weeks.map((week) => (
        <View key={week[0]} style={{ flexDirection: 'row', gap: t.spacing[1] }}>
          {week.map((date) => (
            <DayCell
              key={date}
              date={date}
              sessions={map.get(date) ?? []}
              today={rest.today}
              selected={date === rest.selected}
              dimmed={monthOf(date).month !== current}
              onPress={() => rest.onSelect(date)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
