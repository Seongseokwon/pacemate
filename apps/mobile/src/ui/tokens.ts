import { Easing } from 'react-native';

/**
 * 디자인 토큰 (UI_UX §3, §8.1). 값의 기준은 UI_UX.md이고, 바꿀 때는 문서와 이 파일을 함께 고친다.
 * 컴포넌트는 이 파일을 직접 읽지 않고 `useTheme()`으로 받는다.
 */
const light = {
  background: { body: '#F5F5F5', surface: '#FFFFFF', muted: '#EFEFEF' },
  text: {
    primary: '#111111',
    secondary: '#555555',
    disabled: '#9A9A9A',
    success: '#1B7A33',
    warning: '#8A6100',
    error: '#C0262C',
    info: '#0B5FC4',
  },
  icon: { secondary: '#6B6B6B' },
  accent: '#111111',
  onAccent: '#FFFFFF',
  accentMuted: '#E3E3E3',
  border: '#0000001A',
  borderEmphasized: '#CFCFCF',
  overlay: '#00000080',
  skeleton: '#EBEBEB',
  successMuted: '#DDF2E1',
  warningMuted: '#FBEBC2',
  errorMuted: '#FBDAD8',
  infoMuted: '#DCEAFB',
  session: { walkRun: '#0E8F8F', easy: '#1E6FE0', tempo: '#D9620A', long: '#6B3FE0', race: '#D63A9E' },
};

export type Colors = typeof light;

const dark: Colors = {
  background: { body: '#111111', surface: '#1C1C1C', muted: '#262626' },
  text: {
    primary: '#F5F5F5',
    secondary: '#A8A8A8',
    disabled: '#5E5E5E',
    success: '#7FD492',
    warning: '#F0C75A',
    error: '#FF9C96',
    info: '#8DBEFF',
  },
  icon: { secondary: '#A8A8A8' },
  accent: '#F5F5F5',
  onAccent: '#111111',
  accentMuted: '#3A3A3A',
  border: '#FFFFFF1F',
  borderEmphasized: '#4A4A4A',
  overlay: '#000000B3',
  skeleton: '#2E2E2E',
  successMuted: '#7FD49233',
  warningMuted: '#F0C75A33',
  errorMuted: '#FF9C9633',
  infoMuted: '#8DBEFF33',
  session: { walkRun: '#3FC4C4', easy: '#5B9DFF', tempo: '#FF9447', long: '#A58BFF', race: '#FF7CCB' },
};

const shared = {
  spacing: { 0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40, 11: 44, 12: 48 },
  radius: { inner: 6, element: 10, container: 12, page: 28, chat: 28, full: 9999 },
  typography: {
    display: { fontSize: 35, lineHeight: 44, fontWeight: '600' },
    title1: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
    title2: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
    title3: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
    body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
    label: { fontSize: 17, lineHeight: 24, fontWeight: '500' },
    supporting: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
    chip: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
    caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  },
  /** 기기 글자 크기 설정의 배율 상한 (초기값) */
  maxFontScale: 1.3,
  size: {
    buttonLarge: 52,
    button: 44,
    input: 48,
    iconButton: 36,
    touch: 44,
    listRow: 56,
    icon: 20,
    iconLarge: 24,
    /** 여러 줄 입력창의 최소 높이, 덩어리 모양 로딩 자리 표시 (초기값) */
    block: 96,
    border: 1,
  },
  /** 눌림 표시 (초기값) */
  opacity: { pressed: 0.6 },
  shadow: {
    low: { shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: -1 }, elevation: 2 },
    medium: { shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
    high: { shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 12 },
  },
  /** ms. `toast`는 토스트가 떠 있는 시간 (초기값) */
  duration: { fast: 120, medium: 300, slow: 700, toast: 3000 },
  ease: { standard: Easing.out(Easing.cubic), exit: Easing.in(Easing.cubic) },
} as const;

export const themes = {
  light: { mode: 'light', color: light, ...shared },
  dark: { mode: 'dark', color: dark, ...shared },
} as const;
