import { Easing } from 'react-native';

/**
 * 디자인 토큰 (UI_UX §3, §8.1). 값의 기준은 UI_UX.md이고, 바꿀 때는 문서와 이 파일을 함께 고친다.
 * 컴포넌트는 이 파일을 직접 읽지 않고 `useTheme()`으로 받는다.
 */
const dark = {
  background: { body: '#0B1018', surface: '#151C26', raised: '#1E2733', muted: '#1E2733' },
  text: {
    primary: '#F3F5F8',
    secondary: '#B4BCC8',
    disabled: '#7D8899',
    accent: '#FF8A5C',
    success: '#5FD39A',
    warning: '#FFC266',
    error: '#FF8B85',
    info: '#8DBBFF',
  },
  icon: { secondary: '#97A1B0' },
  accent: '#FF5A1F',
  onAccent: '#0B1018',
  accentMuted: '#3A2419',
  border: '#252F3C',
  borderEmphasized: '#334052',
  overlay: '#000000B3',
  skeleton: '#222B37',
  successMuted: '#163329',
  warningMuted: '#33290F',
  errorMuted: '#3A1C1E',
  infoMuted: '#17253A',
  session: { walkRun: '#3CC8C8', easy: '#6AA6FF', tempo: '#B8E04A', long: '#A98BFF', race: '#FF6FC4' },
  /** 오늘 훈련 카드(`TodayCard`) 바탕 그러데이션 */
  hero: { from: '#1F2938', to: '#151C26' },
};

export type Colors = typeof dark;

const light: Colors = {
  background: { body: '#F4F5F7', surface: '#FFFFFF', raised: '#F0F2F5', muted: '#F0F2F5' },
  text: {
    primary: '#0E141C',
    secondary: '#4A5463',
    disabled: '#6B7482',
    accent: '#C2410C',
    success: '#12784A',
    warning: '#9A5B00',
    error: '#B42318',
    info: '#1F5FBF',
  },
  icon: { secondary: '#5C6573' },
  accent: '#EE4F14',
  onAccent: '#0B1018',
  accentMuted: '#FFEDE4',
  border: '#E3E7ED',
  borderEmphasized: '#CDD3DC',
  overlay: '#0E141C80',
  skeleton: '#EBEEF2',
  successMuted: '#E2F4EA',
  warningMuted: '#FFF3DC',
  errorMuted: '#FDE7E5',
  infoMuted: '#E3EEFC',
  session: { walkRun: '#0E8F8F', easy: '#1E6FE0', tempo: '#567300', long: '#6B3FE0', race: '#D63A9E' },
  hero: { from: '#FFFFFF', to: '#FFF4EE' },
};

const shared = {
  spacing: { 0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40, 11: 44, 12: 48 },
  radius: { inner: 10, element: 14, container: 20, page: 28, chat: 18, full: 9999 },
  typography: {
    display: { fontSize: 35, lineHeight: 44, fontWeight: '700' },
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
