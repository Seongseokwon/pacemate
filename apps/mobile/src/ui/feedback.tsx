import type { SessionType } from '@pacemate/shared';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { type Status, type Tone, toneColor, useReduceMotion, useTheme } from './theme';

type EmptyStateProps = { icon: IconName; message: string; actionLabel?: string; onAction?: () => void };

export function EmptyState({ icon, message, actionLabel, onAction }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: t.spacing[3], paddingVertical: t.spacing[8] }}>
      <Icon name={icon} size="large" tone="neutral" />
      <Text tone="secondary" align="center">
        {message}
      </Text>
      {actionLabel && onAction && <Button variant="secondary" label={actionLabel} onPress={onAction} />}
    </View>
  );
}

const BANNER_ICON: Record<Status, IconName> = { info: 'info', success: 'check', warning: 'warning', error: 'warning' };

export function Banner({ status = 'info', children }: { status?: Status; children: string }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityRole={status === 'warning' || status === 'error' ? 'alert' : 'text'}
      style={{
        flexDirection: 'row',
        gap: t.spacing[2],
        padding: t.spacing[3],
        borderRadius: t.radius.element,
        backgroundColor: t.color[`${status}Muted`],
      }}
    >
      <Icon name={BANNER_ICON[status]} tone={status} />
      <View style={{ flex: 1 }}>
        <Text variant="supporting" tone={status}>
          {children}
        </Text>
      </View>
    </View>
  );
}

let toast: { message: string } | null = null;
const toastListeners = new Set<() => void>();
const setToast = (next: typeof toast) => {
  toast = next;
  toastListeners.forEach((listener) => listener());
};

/** 결과 알림을 잠깐 띄운다. 앱에 `Toast`가 하나 놓여 있어야 보인다. */
export const showToast = (message: string): void => setToast({ message });

/** 토스트가 뜨는 자리. 최상위 레이아웃에 하나만 둔다. 열려 있는 시트·대화 상자 위에는 뜨지 않는다. */
export function Toast() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const current = useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    },
    () => toast,
  );
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    AccessibilityInfo.announceForAccessibility(current.message);
    const fade = (toValue: number, easing: (value: number) => number) =>
      Animated.timing(opacity, { toValue, duration: t.duration.fast, easing, useNativeDriver: true });
    fade(1, t.ease.standard).start();
    const timer = setTimeout(
      () => fade(0, t.ease.exit).start(() => toast === current && setToast(null)),
      t.duration.toast,
    );
    return () => clearTimeout(timer);
  }, [current, opacity, t]);

  if (!current) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + t.spacing[2],
        left: t.spacing[4],
        right: t.spacing[4],
        padding: t.spacing[3],
        borderRadius: t.radius.element,
        backgroundColor: t.color.accent,
        opacity,
        ...t.shadow.medium,
      }}
    >
      <Text variant="supporting" tone="onAccent" align="center">
        {current.message}
      </Text>
    </Animated.View>
  );
}

/** 상태나 훈련 종류의 색 점. 꾸밈이므로 항상 글자와 함께 쓴다(§10). */
export function StatusDot({ tone = 'neutral', session }: { tone?: Tone; session?: SessionType }) {
  const t = useTheme();
  return (
    <View
      style={{ width: t.spacing[2], height: t.spacing[2], borderRadius: t.radius.full, backgroundColor: toneColor(t, tone, session) }}
    />
  );
}

type ChipProps = { label: string; tone?: Tone; session?: SessionType; icon?: IconName };

/** 상태 칩은 옅은 채움, 훈련 종류 칩은 종류 색 테두리로 표시한다(§8.1). */
export function Chip({ label, tone = 'neutral', session, icon }: ChipProps) {
  const t = useTheme();
  const filled = tone === 'neutral' || tone === 'disabled' ? t.color.background.muted : t.color[`${tone}Muted`];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: t.spacing[1],
        paddingHorizontal: t.spacing[2],
        paddingVertical: t.spacing[0.5],
        borderRadius: t.radius.inner,
        borderWidth: t.size.border,
        borderColor: session ? toneColor(t, tone, session) : 'transparent',
        backgroundColor: session ? t.color.background.surface : filled,
      }}
    >
      {icon && <Icon name={icon} tone={session ? 'primary' : tone} />}
      <Text variant="chip" tone={session ? 'primary' : tone === 'neutral' ? 'secondary' : tone}>
        {label}
      </Text>
    </View>
  );
}

export function Badge({ count }: { count: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        minWidth: t.spacing[5],
        paddingHorizontal: t.spacing[1.5],
        alignItems: 'center',
        alignSelf: 'flex-start',
        borderRadius: t.radius.full,
        backgroundColor: t.color.accent,
      }}
    >
      <Text variant="caption" tone="onAccent" tabular>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

/** `value`는 0~1이다. */
export function ProgressBar({ value, accessibilityLabel }: { value: number; accessibilityLabel: string }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const ratio = Math.min(1, Math.max(0, value));
  const filled = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(filled, {
      toValue: ratio,
      duration: reduce ? 0 : t.duration.slow,
      easing: t.ease.standard,
      useNativeDriver: false,
    }).start();
  }, [filled, ratio, reduce, t]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      style={{ height: t.spacing[2], borderRadius: t.radius.full, backgroundColor: t.color.background.muted, overflow: 'hidden' }}
    >
      <Animated.View
        style={{
          height: '100%',
          borderRadius: t.radius.full,
          backgroundColor: t.color.accent,
          width: filled.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

/** 로딩 자리 표시. 실제 배치와 같은 모양으로 조립해 쓴다(§6.9). */
export function Skeleton({ shape = 'line', short = false }: { shape?: 'line' | 'block' | 'circle'; short?: boolean }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) return;
    const step = (toValue: number) =>
      Animated.timing(opacity, { toValue, duration: t.duration.slow, easing: t.ease.standard, useNativeDriver: true });
    const pulse = Animated.loop(Animated.sequence([step(t.opacity.pressed), step(1)]));
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reduce, t]);

  const size = {
    line: { height: t.spacing[4], width: short ? '60%' : '100%', borderRadius: t.radius.inner },
    block: { height: t.size.block, borderRadius: t.radius.container },
    circle: { height: t.size.touch, width: t.size.touch, borderRadius: t.radius.full },
  } as const;
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[size[shape], { backgroundColor: t.color.skeleton, opacity }]}
    />
  );
}

export function Spinner({ size = 'small' }: { size?: 'small' | 'large' }) {
  const t = useTheme();
  return <ActivityIndicator size={size} color={t.color.text.secondary} accessibilityLabel="불러오는 중" />;
}
