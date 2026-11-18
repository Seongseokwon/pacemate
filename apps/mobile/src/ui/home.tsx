import { SESSION_TYPE_LABELS, type Session } from '@pacemate/shared';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { addDays, weekdayOf } from './dates';
import { ProgressBar, StatusDot } from './feedback';
import { Icon } from './icon';
import { sessionAmount } from './session';
import { Text } from './text';
import { useTheme } from './theme';

// 오늘 훈련 카드의 등고선 무늬와 경로선. 100×100 좌표에 그려 카드 크기에 맞춰 늘린다
const CONTOURS = [
  'M-5 78 C 15 64, 32 88, 52 72 S 88 58, 105 70',
  'M-5 88 C 18 74, 36 98, 58 82 S 90 70, 105 80',
  'M-5 66 C 20 50, 38 76, 60 60 S 86 44, 105 56',
];
const CONTOUR_OPACITY = 0.35;
// 오른쪽 위의 경로선(C2/TodayCard). 끝점은 흰 점이다
const ROUTE = 'M4 40 C 10 28, 20 30, 22 18 S 34 2, 42 10 S 40 30, 48 34';

type TodayCardProps = {
  /** 오늘 훈련. null이면 쉬는 날이거나 시작 전이다 */
  session: Pick<Session, 'type' | 'distanceKm' | 'durationMin' | 'status'> | null;
  /** 위쪽 알약 모양 이름표. 기본은 "오늘의 훈련" */
  label?: string;
  /** 훈련이 없을 때의 제목 */
  title?: string;
  /** 훈련이 없을 때 크게 쓰는 숫자(시작까지 남은 날 등) */
  highlight?: string;
  /** 보조 문장 */
  message?: string;
  /** 기록하기 버튼, 완료 표시와 기록 요약 */
  children?: ReactNode;
};

/** 홈의 오늘 훈련 카드(§4.3, §6.3). `hero` 그러데이션 위에 등고선 무늬, 훈련이 있으면 주황 경로선을 그린다. */
export function TodayCard({ session, label = '오늘의 훈련', title, highlight, message, children }: TodayCardProps) {
  const t = useTheme();
  const routeSize = t.size.block * 0.6;
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
      </Svg>
      {session && (
        <Svg
          style={{ position: 'absolute', top: t.spacing[4], right: t.spacing[4] }}
          width={routeSize}
          height={routeSize}
          viewBox="0 0 52 44"
          accessible={false}
        >
          <Path d={ROUTE} fill="none" stroke={t.color.accent} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={4} cy={40} r={2} fill={t.color.text.primary} />
        </Svg>
      )}
      <View style={{ padding: t.spacing[4], gap: t.spacing[3] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: t.spacing[1],
            paddingHorizontal: t.spacing[2],
            paddingVertical: t.spacing[0.5],
            borderRadius: t.radius.full,
            backgroundColor: t.color.accentMuted,
          }}
        >
          <View style={{ width: t.spacing[1.5], height: t.spacing[1.5], borderRadius: t.radius.full, backgroundColor: t.color.accent }} />
          <Text variant="caption" tone="accent">
            {label}
          </Text>
        </View>
        {session ? (
          <View style={{ gap: t.spacing[1] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
              <StatusDot session={session.type} />
              <Text variant="title2">{SESSION_TYPE_LABELS[session.type].name}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.spacing[2], flexWrap: 'wrap' }}>
              <Text variant="display" tabular>
                {sessionAmount(session)}
              </Text>
              <Text variant="supporting" tone="secondary">
                {SESSION_TYPE_LABELS[session.type].guidance}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: t.spacing[1] }}>
            <Text variant="title2">{title ?? '오늘은 쉬는 날이에요'}</Text>
            {highlight !== undefined && (
              <Text variant="display" tabular>
                {highlight}
              </Text>
            )}
          </View>
        )}
        {message !== undefined && (
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
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(weekStart, index);
          const day = counted.filter((session) => session.date === date);
          const completed = day.some((session) => session.status === 'completed');
          return (
            <View key={date} style={{ alignItems: 'center', justifyContent: 'flex-end', gap: t.spacing[1] }}>
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
  /** 목표 대회 이름 또는 목표 없음 계획의 목표 문구 */
  title: string;
  /** 크게 쓰는 값: "D-42", "시작까지 D-6" */
  highlight: string;
  /** 오른쪽의 보조 값. 목표 기록 */
  side?: { label: string; value: string };
  /** 진행 막대 왼쪽 위의 글자: "4 / 10주차" */
  week: string;
  progress: { completed: number; total: number };
};

/** 홈의 목표 카드: 목표와 D-day, 주차와 진행률(§4.3, §6.3, C2/RaceGoalCard) */
export function RaceGoalCard({ title, highlight, side, week, progress }: RaceGoalCardProps) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing[3], padding: t.spacing[4], borderRadius: t.radius.container, backgroundColor: t.color.background.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[2] }}>
        <Text variant="supporting">{title}</Text>
        <Icon name="flag" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.spacing[2] }}>
        <Text variant="display" tabular>
          {highlight}
        </Text>
        {side && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" tone="secondary">
              {side.label}
            </Text>
            <Text variant="title1" tabular>
              {side.value}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" tone="secondary" tabular>
          {week}
        </Text>
        <Text variant="caption" tabular>
          {`${progress.completed} / ${progress.total}회 완료`}
        </Text>
      </View>
      <ProgressBar
        value={progress.total === 0 ? 0 : progress.completed / progress.total}
        accessibilityLabel={`훈련 ${progress.total}개 중 ${progress.completed}개 완료`}
      />
    </View>
  );
}
