import Svg, { Circle, Path } from 'react-native-svg';
import { type Tone, toneColor, useTheme } from './theme';

type Shape = { d?: string[]; circles?: [cx: number, cy: number, r: number][] };

/**
 * 의미 이름과 실제 아이콘의 대응(§8.3). 아이콘은 24 격자에 그린 선 아이콘이며, 모양을 바꿀 때 이 파일만 고친다.
 * Figma `C2/Icon`과 이름이 다른 것: `next` = 오른쪽 꺾쇠, `chevron` = 아래쪽 꺾쇠, `send` = `up`, `profile` = `my`.
 */
const SHAPES = {
  home: { d: ['M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z'] },
  coach: { d: ['M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-4.5 3.5V17H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M8.5 10h7', 'M8.5 13h4'] },
  calendar: { d: ['M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M4 10.5h16', 'M8.5 3.5v4', 'M15.5 3.5v4'] },
  record: { d: ['M3.5 12h4l2.5-6 4 12 2.5-6h4'] },
  profile: { d: ['M4.5 20c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6'], circles: [[12, 8, 4]] },
  run: { d: ['M10 8.5 7 11', 'M10 8.5l3.5 1 2 3 3 .5', 'M10 8.5 9 14l3 2.5-1 4.5', 'M9 14l-2.5 2.5H4'], circles: [[14.5, 4.5, 1.75]] },
  walk: { d: ['M12 8.5 11 14l2.5 3 .5 3.5', 'M12 8.5l-3 2.5v3', 'M12 8.5l2.5 3 2.5 1', 'M11 14l-2 6.5'], circles: [[12.5, 4.5, 1.75]] },
  flag: { d: ['M5.5 21V4', 'M5.5 4.5h11l-2.5 4 2.5 4h-11'] },
  check: { d: ['M5 12.5 9.5 17 19 7.5'] },
  close: { d: ['M6 6l12 12', 'M18 6 6 18'] },
  back: { d: ['M19 12H5', 'M11 6l-6 6 6 6'] },
  next: { d: ['M9.5 5.5 16 12l-6.5 6.5'] },
  add: { d: ['M12 5v14', 'M5 12h14'] },
  edit: { d: ['M4.5 19.5 5.5 15 15 5.5a2.1 2.1 0 0 1 3 3L8.5 18z', 'M13 7.5l3 3'] },
  delete: { d: ['M4.5 7h15', 'M9.5 7V4.5h5V7', 'M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12', 'M10.5 11v5', 'M13.5 11v5'] },
  send: { d: ['M12 19.5V5', 'M6 11l6-6 6 6'] },
  swap: { d: ['M4.5 8.5h14', 'M15 5l3.5 3.5L15 12', 'M19.5 15.5h-14', 'M9 12l-3.5 3.5L9 19'] },
  warning: { d: ['M10.3 4.6 3.4 17a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z', 'M12 9.5v4', 'M12 16.75v.25'] },
  info: { d: ['M12 11v5.5', 'M12 7.75V8'], circles: [[12, 12, 8.5]] },
  bell: { d: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z', 'M10 20.5h4'] },
  crown: { d: ['M4 8l4 4 4-6.5 4 6.5 4-4-1.5 10h-13z'] },
  chevron: { d: ['M5.5 9.5 12 16l6.5-6.5'] },
  more: { circles: [[6, 12, 1.25], [12, 12, 1.25], [18, 12, 1.25]] },
} as const satisfies Record<string, Shape>;

export type IconName = keyof typeof SHAPES;
export type IconTone = Tone | 'primary' | 'accent' | 'onAccent';

/** 선 굵기(초기값). Figma 아이콘과 비교해 맞춘다(§8.3) */
const STROKE_WIDTH = 1.75;

/** 아이콘은 꾸밈이다. 화면 낭독용 이름은 아이콘을 담는 컴포넌트가 붙인다. */
export function Icon({ name, size = 'default', tone = 'primary' }: { name: IconName; size?: 'default' | 'large'; tone?: IconTone }) {
  const t = useTheme();
  const color =
    tone === 'primary' ? t.color.text.primary
    : tone === 'accent' ? t.color.accent
    : tone === 'onAccent' ? t.color.onAccent
    : tone === 'neutral' ? t.color.icon.secondary
    : toneColor(t, tone);
  const px = size === 'large' ? t.size.iconLarge : t.size.icon;
  const shape: Shape = SHAPES[name];
  return (
    <Svg testID={`icon-${name}`} width={px} height={px} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no-hide-descendants">
      {shape.d?.map((d) => (
        <Path key={d} d={d} fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {shape.circles?.map(([cx, cy, r]) => (
        <Circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={r}
          // 점 세 개(`more`)는 채워 그린다
          fill={name === 'more' ? color : 'none'}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
        />
      ))}
    </Svg>
  );
}

export const ICON_NAMES = Object.keys(SHAPES) as IconName[];
