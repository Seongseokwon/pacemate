import { ActivityIndicator, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';
import { useTheme } from './theme';

/** 눌림 표시가 있는 누르기 영역. 누를 수 있는 컴포넌트는 모두 이것으로 만든다(§4.4). */
export function Press({ style, ...rest }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <Pressable style={({ pressed }) => [style, pressed && { opacity: t.opacity.pressed }]} {...rest} />;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'text' | 'danger';
  size?: 'default' | 'large';
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
};

export function Button({ label, onPress, variant = 'primary', size = 'default', loading = false, disabled = false, testID }: ButtonProps) {
  const t = useTheme();
  const look: Record<typeof variant, { fill?: string; border?: string; text: TextTone }> = {
    primary: { fill: t.color.accent, text: 'onAccent' },
    secondary: { fill: t.color.background.surface, border: t.color.borderEmphasized, text: 'primary' },
    text: { text: 'primary' },
    danger: { fill: t.color.errorMuted, text: 'error' },
  };
  const { fill, border, text } = look[variant];
  const textTone = disabled ? 'disabled' : text;

  return (
    <Press
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={{
        // 글자가 커져도 잘리지 않도록 높이를 고정하지 않는다(§10)
        minHeight: size === 'large' ? t.size.buttonLarge : t.size.button,
        paddingHorizontal: t.spacing[4],
        paddingVertical: t.spacing[2],
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radius.element,
        borderWidth: t.size.border,
        borderColor: border ?? 'transparent',
        backgroundColor: disabled && fill ? t.color.background.muted : fill,
      }}
    >
      {loading ? (
        <ActivityIndicator color={textTone === 'onAccent' ? t.color.onAccent : t.color.text[textTone]} />
      ) : (
        <Text variant="label" tone={textTone} align="center">
          {label}
        </Text>
      )}
    </Press>
  );
}

type IconButtonProps = { icon: IconName; accessibilityLabel: string; onPress: () => void; disabled?: boolean; testID?: string };

export function IconButton({ icon, accessibilityLabel, onPress, disabled = false, testID }: IconButtonProps) {
  const t = useTheme();
  return (
    <Press
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={(t.size.touch - t.size.iconButton) / 2}
      style={{
        width: t.size.iconButton,
        height: t.size.iconButton,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radius.full,
      }}
    >
      <Icon name={icon} tone={disabled ? 'disabled' : 'primary'} />
    </Press>
  );
}
