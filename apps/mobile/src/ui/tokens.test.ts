import { type Colors, themes } from './tokens';

type Rgba = [number, number, number, number];

const parse = (hex: string): Rgba => {
  const value = (index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return [value(0), value(1), value(2), hex.length === 9 ? value(3) / 255 : 1];
};

/** 반투명한 색을 바탕 위에 올렸을 때 보이는 색 */
const over = (top: Rgba, bottom: Rgba): Rgba => [
  top[0] * top[3] + bottom[0] * (1 - top[3]),
  top[1] * top[3] + bottom[1] * (1 - top[3]),
  top[2] * top[3] + bottom[2] * (1 - top[3]),
  1,
];

const luminance = ([r, g, b]: Rgba) => {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG 대비. `background`가 반투명이면 `base` 위에 올린 색으로 계산한다. */
const contrast = (foreground: string, background: string, base: string) => {
  const [a, b] = [luminance(parse(foreground)), luminance(over(parse(background), parse(base)))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe.each(['light', 'dark'] as const)('%s 모드의 대비 (UI_UX §1.3)', (mode) => {
  const color: Colors = themes[mode].color;
  const backgrounds = [color.background.body, color.background.surface];
  const statuses = ['success', 'warning', 'error', 'info'] as const;

  test.each(['primary', 'secondary', ...statuses] as const)('글자색 %s는 바탕과 카드 위에서 4.5:1 이상이다', (tone) => {
    for (const background of backgrounds) expect(contrast(color.text[tone], background, background)).toBeGreaterThanOrEqual(4.5);
  });

  test('주 버튼의 글자는 4.5:1 이상이다', () => {
    expect(contrast(color.onAccent, color.accent, color.accent)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(statuses)('상태 %s의 글자는 옅은 채움 위에서 4.5:1 이상이다', (status) => {
    for (const background of backgrounds) {
      expect(contrast(color.text[status], color[`${status}Muted`], background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('보조 아이콘과 훈련 종류 색은 3:1 이상이다', () => {
    for (const background of backgrounds) {
      for (const foreground of [color.icon.secondary, ...Object.values(color.session)]) {
        expect(contrast(foreground, background, background)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

test('글자 크기는 여섯 가지뿐이다 (UI_UX §3.5)', () => {
  const sizes = new Set(Object.values(themes.light.typography).map((role) => role.fontSize));
  expect([...sizes].sort((a, b) => a - b)).toEqual([12, 14, 17, 20, 24, 35]);
});

test('간격은 4의 배수이고, 예외는 2와 6뿐이다 (UI_UX §3.3)', () => {
  const offGrid = Object.values(themes.light.spacing).filter((value) => value % 4 !== 0);
  expect(offGrid).toEqual([2, 6]);
});
