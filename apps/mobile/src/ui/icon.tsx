import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { type Tone, toneColor, useTheme } from './theme';

type Element =
  | { d: string; strokeWidth?: number }
  | { circle: [cx: number, cy: number, r: number] }
  | { rect: [x: number, y: number, width: number, height: number, rx: number] };

/**
 * 의미 이름과 실제 아이콘의 대응(§8.3). 값은 `docs/design/icons/*.svg`(C2/Icon, 24 격자)를 옮긴 것이다. 모양을 바꿀 때 이 파일만 고친다.
 * Figma `C2/Icon`과 이름이 다른 것: `calendar` = `cal`, `record` = `log`, `profile` = `my`, `next` = `chev`, `add` = `plus`, `send` = `up`.
 */
const SHAPES = {
  home: [{ d: 'M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-5.5h-6v5.5H5A1.5 1.5 0 0 1 3.5 19z' }],
  coach: [{ d: 'M20.5 11.5a8 7.5 0 0 1-11.6 6.7L4 19.5l1.4-3.9a7.2 7.2 0 0 1-1.9-4.1 8.5 7.5 0 0 1 17 0z' }, { d: 'M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01', strokeWidth: 2.4 }],
  calendar: [{ rect: [3.5, 5, 17, 15.5, 3] }, { d: 'M3.5 10h17M8 3v4M16 3v4' }],
  record: [{ d: 'M4 20h16M7 16.5v-5M12 16.5v-9M17 16.5V12' }],
  profile: [{ circle: [12, 8, 4] }, { d: 'M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5' }],
  run: [{ circle: [14, 4.5, 2] }, { d: 'M8 21l3-6 3 2v5M6 12l3-4h5l2 3 3 1M11 8l-1 5' }],
  walk: [{ circle: [13, 4.5, 2] }, { d: 'M11.5 8.5 10 14.5l3 2.5v4M10 14.5 8 21M11.5 8.5l3 1.5 1.5 3 2.5 1M11.5 8.5 8.5 11v3' }],
  flag: [{ d: 'M5 21V4M5 4h11l-2 4 2 4H5' }],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
  close: [{ d: 'M6 6l12 12M18 6 6 18' }],
  back: [{ d: 'M15 5l-7 7 7 7' }],
  next: [{ d: 'M9 6l6 6-6 6' }],
  add: [{ d: 'M12 5v14M5 12h14' }],
  edit: [{ d: 'M4 20h4.2L19.3 8.9a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8z' }, { d: 'M13.5 6.5l4 4' }],
  delete: [{ d: 'M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v5.5M14 11v5.5' }],
  send: [{ d: 'M12 19V5M6 11l6-6 6 6' }],
  swap: [{ d: 'M4 8h14l-3-3M20 16H6l3 3' }],
  warning: [{ d: 'M10.3 4.9a2 2 0 0 1 3.4 0l7.3 12.6a2 2 0 0 1-1.7 3H4.7a2 2 0 0 1-1.7-3z' }, { d: 'M12 9.5v4' }, { d: 'M12 16.8h.01', strokeWidth: 2.4 }],
  info: [{ circle: [12, 12, 8.5] }, { d: 'M12 11v5.5' }, { d: 'M12 7.8h.01', strokeWidth: 2.4 }],
  bell: [{ d: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 21a2.2 2.2 0 0 0 4 0' }],
  crown: [{ d: 'M4 8.5l4.2 3.7L12 6l3.8 6.2L20 8.5 18.6 17H5.4z' }, { d: 'M5.5 20.5h13' }],
  chevron: [{ d: 'M6 9.5l6 6 6-6' }],
  more: [{ d: 'M6 12h.01M12 12h.01M18 12h.01', strokeWidth: 2.8 }],
} as const satisfies Record<string, readonly Element[]>;

export type IconName = keyof typeof SHAPES;
export type IconTone = Tone | 'primary' | 'accent' | 'onAccent';

/** C2/Icon의 선 굵기 */
const STROKE_WIDTH = 1.8;

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
  const line = { fill: 'none', stroke: color, strokeWidth: STROKE_WIDTH, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg testID={`icon-${name}`} width={px} height={px} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no-hide-descendants">
      {(SHAPES[name] as readonly Element[]).map((element, index) =>
        'd' in element ? <Path key={index} d={element.d} {...line} strokeWidth={element.strokeWidth ?? STROKE_WIDTH} />
        : 'circle' in element ? <Circle key={index} cx={element.circle[0]} cy={element.circle[1]} r={element.circle[2]} {...line} />
        : <Rect key={index} x={element.rect[0]} y={element.rect[1]} width={element.rect[2]} height={element.rect[3]} rx={element.rect[4]} {...line} />,
      )}
    </Svg>
  );
}

export const ICON_NAMES = Object.keys(SHAPES) as IconName[];
