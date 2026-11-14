import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type Tone, toneColor, useTheme } from './theme';

/** 의미 이름과 실제 아이콘의 대응(§8.3). 아이콘 세트를 바꿀 때 이 파일만 고친다. */
const GLYPHS = {
  home: 'home-outline',
  coach: 'message-text-outline',
  calendar: 'calendar-blank-outline',
  record: 'clipboard-text-outline',
  profile: 'account-outline',
  run: 'run',
  walk: 'walk',
  flag: 'flag-checkered',
  check: 'check',
  close: 'close',
  back: 'arrow-left',
  next: 'arrow-right',
  add: 'plus',
  edit: 'pencil-outline',
  delete: 'trash-can-outline',
  send: 'send',
  swap: 'swap-horizontal',
  warning: 'alert-outline',
  info: 'information-outline',
  bell: 'bell-outline',
  crown: 'crown-outline',
  chevron: 'chevron-right',
  more: 'dots-horizontal',
} as const satisfies Record<string, keyof typeof MaterialCommunityIcons.glyphMap>;

export type IconName = keyof typeof GLYPHS;
export type IconTone = Tone | 'primary' | 'accent' | 'onAccent';

/** 아이콘은 꾸밈이다. 화면 낭독용 이름은 아이콘을 담는 컴포넌트가 붙인다. */
export function Icon({ name, size = 'default', tone = 'primary' }: { name: IconName; size?: 'default' | 'large'; tone?: IconTone }) {
  const t = useTheme();
  const color =
    tone === 'primary' ? t.color.text.primary
    : tone === 'accent' ? t.color.accent
    : tone === 'onAccent' ? t.color.onAccent
    : tone === 'neutral' ? t.color.icon.secondary
    : toneColor(t, tone);
  return (
    <MaterialCommunityIcons
      name={GLYPHS[name]}
      size={size === 'large' ? t.size.iconLarge : t.size.icon}
      color={color}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
