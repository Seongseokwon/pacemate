import { BottomTabBarHeightContext, Tabs } from 'expo-router/js-tabs';
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, type ScrollViewInstance, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, Press } from './button';
import { EmptyState, Spinner } from './feedback';
import { Icon, type IconName } from './icon';
import { Heading, Text } from './text';
import { useTheme } from './theme';

type ScreenProps = {
  children?: ReactNode;
  /** 머리글의 화면 제목 */
  title?: string;
  /** 주면 머리글에 뒤로 가기 버튼이 생긴다 */
  onBack?: () => void;
  headerRight?: ReactNode;
  /** 하단 고정 영역(주 버튼 등) */
  footer?: ReactNode;
  /** 화면 전체 로딩. 기다림이 긴 경우에만 쓰고, 보통은 본문에 `Skeleton`을 둔다(§6.9) */
  loading?: boolean;
  /** 화면 전체가 실패했을 때 보여 줄 문장 */
  error?: string;
  onRetry?: () => void;
  /** 본문을 스크롤한다. 채팅처럼 본문이 직접 스크롤하면 끈다 */
  scroll?: boolean;
  refreshing?: boolean;
  /** 주면 아래로 당겨 다시 불러올 수 있다 */
  onRefresh?: () => void;
};

/** 화면의 틀: 안전 영역, 머리글, 본문, 하단 고정 영역, 로딩·오류 상태 */
export function Screen({ children, title, onBack, headerRight, footer, loading = false, error, onRetry, scroll = true, refreshing = false, onRefresh }: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // 탭 안에서는 탭 표시줄이 아래 안전 영역을 이미 차지한다
  const bottomInset = useContext(BottomTabBarHeightContext) === undefined ? insets.bottom : 0;
  const hasHeader = title !== undefined || onBack !== undefined || headerRight !== undefined;
  const padding = { padding: t.spacing[4], paddingBottom: t.spacing[4] + (footer === undefined ? bottomInset : 0) };

  return (
    <View style={{ flex: 1, backgroundColor: t.color.background.body }}>
      <View
        style={[
          { paddingTop: insets.top },
          hasHeader && { backgroundColor: t.color.background.surface, borderBottomWidth: t.size.border, borderBottomColor: t.color.border },
        ]}
      >
        {hasHeader && (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], minHeight: t.size.listRow, paddingHorizontal: t.spacing[4] }}
          >
            {onBack && <IconButton icon="back" accessibilityLabel="뒤로" onPress={onBack} />}
            <View style={{ flex: 1 }}>{title !== undefined && <Heading numberOfLines={1}>{title}</Heading>}</View>
            {headerRight}
          </View>
        )}
      </View>

      {loading || error !== undefined ? (
        <View style={[{ flex: 1, justifyContent: 'center' }, padding]}>
          {loading ? (
            <Spinner size="large" />
          ) : (
            <EmptyState icon="warning" message={error ?? ''} actionLabel={onRetry && '다시 시도'} onAction={onRetry} />
          )}
        </View>
      ) : scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={padding}
          refreshControl={onRefresh && <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.color.text.secondary} />}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding]}>{children}</View>
      )}

      {footer !== undefined && (
        <View
          style={{
            padding: t.spacing[4],
            paddingBottom: t.spacing[4] + bottomInset,
            borderTopWidth: t.size.border,
            borderTopColor: t.color.border,
            backgroundColor: t.color.background.surface,
            ...t.shadow.low,
          }}
        >
          {footer}
        </View>
      )}
    </View>
  );
}

type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ value, options, onChange }: SegmentedControlProps<T>) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: t.spacing[0.5], borderRadius: t.radius.element, backgroundColor: t.color.background.muted }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Press
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: t.size.touch,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: t.radius.inner,
              backgroundColor: selected ? t.color.background.surface : undefined,
            }}
          >
            <Text variant="chip" tone={selected ? 'primary' : 'secondary'}>
              {option.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

type TabBarProps = { tabs: readonly { name: string; title: string; icon: IconName }[] };

/** 하단 탭. 화면 이동 라이브러리의 탭을 토큰으로 꾸민다. 탭 묶음의 레이아웃에서 쓴다. */
export function TabBar({ tabs }: TabBarProps) {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.color.text.accent,
        tabBarInactiveTintColor: t.color.text.secondary,
        tabBarStyle: { backgroundColor: t.color.background.surface, borderTopColor: t.color.border },
        tabBarLabelStyle: { fontSize: t.typography.caption.fontSize, fontWeight: t.typography.chip.fontWeight },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused }) => <Icon name={tab.icon} size="large" tone={focused ? 'accent' : 'neutral'} />,
          }}
        />
      ))}
    </Tabs>
  );
}

/** 온보딩 진행 표시. `current`는 1부터 센다. */
export function Stepper({ current, total }: { current: number; total: number }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${total}단계 중 ${current}단계`}
      style={{ flexDirection: 'row', gap: t.spacing[1] }}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: t.spacing[1],
            borderRadius: t.radius.full,
            backgroundColor: index < current ? t.color.accent : t.color.accentMuted,
          }}
        />
      ))}
    </View>
  );
}

type PagerProps = { pages: readonly ReactNode[]; index: number; onIndexChange: (index: number) => void };

/** 옆으로 넘기는 장과 장 위치 표시(점). 인트로에서 쓴다(UI_UX §6.1). `index`는 0부터 센다. */
export function Pager({ pages, index, onIndexChange }: PagerProps) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (width > 0) scroll.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  return (
    <View style={{ flex: 1, gap: t.spacing[6] }}>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onMomentumScrollEnd={(event) => width > 0 && onIndexChange(Math.round(event.nativeEvent.contentOffset.x / width))}
      >
        {pages.map((page, i) => (
          <View key={i} style={{ width, justifyContent: 'center' }} accessibilityElementsHidden={i !== index} importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}>
            {page}
          </View>
        ))}
      </ScrollView>
      <View
        accessible
        accessibilityLabel={`${pages.length}장 중 ${index + 1}장`}
        style={{ flexDirection: 'row', justifyContent: 'center', gap: t.spacing[2] }}
      >
        {pages.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === index ? t.spacing[6] : t.spacing[2],
              height: t.spacing[2],
              borderRadius: t.radius.full,
              backgroundColor: i === index ? t.color.accent : t.color.borderEmphasized,
            }}
          />
        ))}
      </View>
    </View>
  );
}
