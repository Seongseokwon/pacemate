import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Press } from './button';
import { Icon } from './icon';
import { Heading } from './text';
import { type Theme, useTheme } from './theme';

type StackProps = {
  children: ReactNode;
  direction?: 'column' | 'row';
  /** 간격 토큰의 이름(§3.3) */
  gap?: keyof Theme['spacing'];
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  /** 남는 공간을 채운다 */
  fill?: boolean;
};

export function Stack({ children, direction = 'column', gap = 3, align, justify, wrap = false, fill = false }: StackProps) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: direction,
        gap: t.spacing[gap],
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : undefined,
        flex: fill ? 1 : undefined,
      }}
    >
      {children}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack>
      <Heading level={2}>{title}</Heading>
      {children}
    </Stack>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: t.size.border, backgroundColor: t.color.border }} />;
}

function useCardStyle(selected = false): ViewStyle {
  const t = useTheme();
  return {
    padding: t.spacing[4],
    borderRadius: t.radius.container,
    borderWidth: t.size.border,
    // 카드는 테두리 대신 패널 단계로 구분하고, 선택 표시에만 테두리를 쓴다(§3.7)
    borderColor: selected ? t.color.accent : 'transparent',
    backgroundColor: selected ? t.color.accentMuted : t.color.background.surface,
  };
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={useCardStyle()}>{children}</View>;
}

type ClickableCardProps = { children: ReactNode; onPress: () => void; accessibilityLabel?: string };

export function ClickableCard({ children, onPress, accessibilityLabel }: ClickableCardProps) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={useCardStyle()}>
      {children}
    </Press>
  );
}

export function SelectableCard({ children, selected, onPress, accessibilityLabel }: ClickableCardProps & { selected: boolean }) {
  const t = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[useCardStyle(selected), { flexDirection: 'row', alignItems: 'center', gap: t.spacing[3] }]}
    >
      <View style={{ flex: 1 }}>{children}</View>
      {/* 색만으로 구분하지 않도록 선택 표시를 함께 둔다(§10) */}
      {selected && <Icon name="check" tone="accent" />}
    </Press>
  );
}
