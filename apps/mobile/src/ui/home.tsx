import { SESSION_TYPE_LABELS, type Session } from '@pacemate/shared';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { addDays, weekdayOf } from './dates';
import { ProgressBar, StatusDot } from './feedback';
import { sessionAmount } from './session';
import { Text } from './text';
import { useTheme } from './theme';

// 오늘 훈련 카드의 등고선 무늬와 경로선. 100×100 좌표에 그려 카드 크기에 맞춰 늘린다
const CONTOURS = [
  'M-5 78 C 15 64, 32 88, 52 72 S 88 58, 105 70',
  'M-5 88 C 18 74, 36 98, 58 82 S 90 70, 105 80',
  'M-5 66 C 20 50, 38 76, 60 60 S 86 44, 105 56',
  'M40 -5 C 52 12, 70 8, 78 24 S 96 40, 105 36',
];
const ROUTE = 'M58 92 C 66 80, 62 70, 74 64 S 90 56, 88 44 S 80 30, 94 22';
const CONTOUR_OPACITY = 0.5;

type TodayCardProps = {
  /** 오늘 훈련. null이면 쉬는 날이다 */
  session: Pick<Session, 'type' | 'distanceKm' | 'durationMin' | 'status'> | null;
  /** 제목 줄. 기본은 "오늘의 훈련" */
  heading?: string;
  /** 쉬는 날이나 시작 전 안내 문장 */
  message?: string;
  /** 기록하기 버튼, 완료 표시와 기록 요약 */
  children?: ReactNode;
};

/** 홈의 오늘 훈련 카드(§4.3, §6.3). 바탕은 `hero` 그러데이션 위에 등고선 무늬와 주황 경로선이다. */
export function TodayCard({ session, heading = '오늘의 훈련', message, children }: TodayCardProps) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: t.radius.container, overflow: 'hidden', backgroundColor: t.color.hero.to }}>
      <Svg style={{ position: 'absolute', width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none" accessible={false}>
        <Defs>
          <LinearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.color.hero.from} />
            <Stop offset="1" stopColor={t.color.hero.to} />
          </LinearGradient>
        </Defs>
        <Path d="M0 0H100V100H0Z" fill="url(#hero)" />
        {CONTOURS.map((d) => (
          <Path key={d} d={d} fill="none" stroke={t.color.borderEmphasized} strokeOpacity={CONTOUR_OPACITY} strokeWidth={0.6} />
        ))}
        {session && <Path d={ROUTE} fill="none" stroke={t.color.accent} strokeWidth={1.2} strokeLinecap="round" />}
      </Svg>
      <View style={{ padding: t.spacing[4], gap: t.spacing[3] }}>
        <Text variant="chip" tone="accent">
          {heading}
        </Text>
        {session ? (
          <View style={{ gap: t.spacing[1] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
              <StatusDot session={session.type} />
              <Text variant="title3">{SESSION_TYPE_LABELS[session.type].name}</Text>
            </View>
            <Text variant="display" tabular>
              {sessionAmount(session)}
            </Text>
            <Text variant="supporting" tone="secondary">
              {SESSION_TYPE_LABELS[session.type].guidance}
            </Text>
          </View>
        ) : (
          <Text variant="title3">{message ?? '오늘은 쉬는 날이에요'}</Text>
        )}
        {session && message && (
          <Text variant="supporting" tone="secondary">
            {message}
          </Text>
        )}
        {children}
      </View>
    </View>
  );
}

type WeekGaugeProps = {
  /** 그 주의 월요일 */
  weekStart: string;
  sessions: readonly Pick<Session, 'date' | 'status'>[];
};

/** 이번 주 진행: 반원 게이지(완료 / 계획)와 요일별 막대(§4.3). 생략한 훈련은 세지 않는다. */
export function WeekGauge({ weekStart, sessions }: WeekGaugeProps) {
  const t = useTheme();
  const counted = sessions.filter((session) => session.status !== 'skipped');
  const done = counted.filter((session) => session.status === 'completed').length;
  const ratio = counted.length === 0 ? 0 : done / counted.length;

  // 게이지 너비는 덩어리 크기(size.block)를 쓴다(초기값)
  const width = t.size.block;
  const stroke = t.spacing[2];
  const radius = (width - stroke) / 2;
  const arc = `M ${stroke / 2} ${radius + stroke / 2} A ${radius} ${radius} 0 0 1 ${width - stroke / 2} ${radius + stroke / 2}`;
  const length = Math.PI * radius;

  return (
    <View
      accessible
      accessibilityLabel={`이번 주 훈련 ${counted.length}번 중 ${done}번 완료`}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing[4], padding: t.spacing[4], borderRadius: t.radius.container, backgroundColor: t.color.background.surface }}
    >
      <View style={{ width, alignItems: 'center' }}>
        <Svg width={width} height={radius + stroke} accessible={false}>
          <Path d={arc} fill="none" stroke={t.color.background.raised} strokeWidth={stroke} strokeLinecap="round" />
          {done > 0 && (
            <Path
              d={arc}
              fill="none"
              stroke={t.color.accent}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${length} ${length}`}
              strokeDashoffset={length * (1 - ratio)}
            />
          )}
        </Svg>
        <Text variant="title3" tabular>
          {`${done} / ${counted.length}회`}
        </Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(weekStart, index);
          const day = counted.filter((session) => session.date === date);
          const completed = day.some((session) => session.status === 'completed');
          return (
            <View key={date} style={{ alignItems: 'center', gap: t.spacing[1] }}>
              <View
                style={{
                  width: t.spacing[2],
                  height: day.length > 0 ? t.spacing[8] : t.spacing[2],
                  borderRadius: t.radius.full,
                  backgroundColor: completed ? t.color.accent : day.length > 0 ? t.color.background.raised : t.color.border,
                  borderWidth: t.size.border,
                  borderColor: day.some((session) => session.status === 'missed') ? t.color.text.warning : 'transparent',
                }}
              />
              <Text variant="caption" tone="secondary">
                {weekdayOf(date)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

type RaceGoalCardProps = {
  /** "하프마라톤", "10km" 또는 목표 없음 계획의 목표 문구 */
  title: string;
  /** "D-42", "N주차 / 전체 M주", "시작까지 D-6" */
  highlight: string;
  /** 보조 한 줄. 시작 날짜 등 */
  description?: string;
  progress: { completed: number; total: number };
};

/** 홈의 목표 카드: 목표와 D-day, 진행률(§4.3, §6.3) */
export function RaceGoalCard({ title, highlight, description, progress }: RaceGoalCardProps) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing[2] }}>
      <Text variant="supporting" tone="secondary">
        {title}
      </Text>
      <Text variant="display" tabular>
        {highlight}
      </Text>
      {description !== undefined && (
        <Text variant="supporting" tone="secondary">
          {description}
        </Text>
      )}
      <ProgressBar
        value={progress.total === 0 ? 0 : progress.completed / progress.total}
        accessibilityLabel={`훈련 ${progress.total}개 중 ${progress.completed}개 완료`}
      />
      <Text variant="supporting" tone="secondary" tabular>
        {`${progress.completed} / ${progress.total} 완료`}
      </Text>
    </View>
  );
}
