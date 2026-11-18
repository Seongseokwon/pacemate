import { SESSION_STATUS_LABELS, SESSION_TYPE_LABELS, type Session, type SessionSnapshot, type SessionStatus } from '@pacemate/shared';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { formatDate, formatKm, formatShortDate, weekdayOf } from './dates';
import { Chip } from './feedback';
import { List, ListItem } from './list';
import { Text } from './text';
import { type Tone, toneColor, useTheme } from './theme';

/** 훈련의 양: 거리 또는 시간(§9.3) */
export const sessionAmount = (session: Pick<SessionSnapshot, 'distanceKm' | 'durationMin'>): string =>
  session.distanceKm !== null ? formatKm(session.distanceKm) : `${session.durationMin ?? 0}분`;

/** 화면 낭독용 양. "12킬로미터", "30분" */
const spokenAmount = (session: Pick<SessionSnapshot, 'distanceKm' | 'durationMin'>): string =>
  session.distanceKm !== null ? `${Math.round(session.distanceKm * 10) / 10}킬로미터` : `${session.durationMin ?? 0}분`;

const STATUS_TONE: Record<SessionStatus, Tone> = { planned: 'neutral', completed: 'success', missed: 'warning', skipped: 'disabled' };

/** 상태 칩(§8.2). 미완료에 오류 색을 쓰지 않는다. */
export function StatusChip({ status }: { status: SessionStatus }) {
  return <Chip label={SESSION_STATUS_LABELS[status]} tone={STATUS_TONE[status]} icon={status === 'completed' ? 'check' : undefined} />;
}

type SessionRowProps = {
  session: Pick<Session, 'date' | 'type' | 'distanceKm' | 'durationMin' | 'status' | 'original'>;
  /** 날짜를 함께 보여 준다(계획 미리보기, 홈의 이번 주 목록) */
  showDate?: boolean;
  onPress?: () => void;
};

/** 훈련 한 줄: 종류 색 막대, 종류 이름, 양과 날짜, 상태(§4.3, C2/SessionRow). 화면 낭독은 한 덩어리로 읽는다(§10). */
export function SessionRow({ session, showDate = false, onPress }: SessionRowProps) {
  const t = useTheme();
  const changed = session.original !== null;
  const label = [
    `${weekdayOf(session.date)}요일`,
    `${SESSION_TYPE_LABELS[session.type].name} ${spokenAmount(session)}`,
    changed ? '변경됨' : null,
    SESSION_STATUS_LABELS[session.status],
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <ListItem
      title={SESSION_TYPE_LABELS[session.type].name}
      description={showDate ? `${sessionAmount(session)} · ${formatShortDate(session.date)}` : sessionAmount(session)}
      left={<View style={{ width: t.spacing[1], alignSelf: 'stretch', borderRadius: t.radius.full, backgroundColor: toneColor(t, 'neutral', session.type) }} />}
      right={
        <View style={{ flexDirection: 'row', gap: t.spacing[1] }}>
          {changed && <Chip label="변경됨" tone="info" />}
          <StatusChip status={session.status} />
        </View>
      }
      onPress={onPress}
      accessibilityLabel={label}
    />
  );
}

/** 훈련 목록을 담는 카드. 행 사이에 구분선을 넣는다(§2의 원칙 5, C2 샘플 화면) */
export function SessionList({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: t.spacing[4], borderRadius: t.radius.container, backgroundColor: t.color.background.surface }}>
      <List>{children}</List>
    </View>
  );
}

/** 바뀐 훈련의 원래 일정 문구. "원래 일정: 11월 21일 (토)" */
export const originalLine = (original: SessionSnapshot): string => `원래 일정: ${formatDate(original.date)}`;

/** 숫자 하나와 이름표(§4.3) */
export function StatTile({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value}`}
      style={{ flex: 1, alignItems: 'center', gap: t.spacing[1], paddingVertical: t.spacing[4], paddingHorizontal: t.spacing[2], borderRadius: t.radius.container, backgroundColor: t.color.background.surface }}
    >
      <Text variant="title2" align="center" tabular>
        {value}
      </Text>
      <Text variant="caption" tone="secondary" align="center">
        {label}
      </Text>
    </View>
  );
}
