import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { type Theme, useTheme } from './theme';

export type TextVariant = keyof Theme['typography'];
export type TextTone = keyof Theme['color']['text'] | 'onAccent';

type TextProps = Pick<RNTextProps, 'children' | 'numberOfLines' | 'testID' | 'accessibilityLabel' | 'accessibilityRole'> & {
  variant?: TextVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
  /** 숫자가 나란히 놓이는 곳(페이스, 거리, 시간)에 고정 폭 숫자를 쓴다 */
  tabular?: boolean;
};

export function Text({ variant = 'body', tone = 'primary', align, tabular = false, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={t.maxFontScale}
      style={[
        t.typography[variant],
        { color: tone === 'onAccent' ? t.color.onAccent : t.color.text[tone], textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
      ]}
      {...rest}
    />
  );
}

export function Heading({ level = 1, ...rest }: Omit<TextProps, 'variant' | 'accessibilityRole'> & { level?: 1 | 2 | 3 }) {
  return <Text variant={`title${level}`} accessibilityRole="header" {...rest} />;
}
