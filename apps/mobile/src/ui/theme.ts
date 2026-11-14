import type { SessionType } from '@pacemate/shared';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { themes } from './tokens';

export type Theme = (typeof themes)['light' | 'dark'];

/** 현재 모드의 토큰. MVP는 라이트 고정이다(UX-03). 다크를 열 때 여기서 기기 설정을 읽는다. */
export const useTheme = (): Theme => themes.light;

export type Status = 'success' | 'warning' | 'error' | 'info';
/** 색의 뜻. `neutral`은 보조 글자색이다. */
export type Tone = 'neutral' | 'disabled' | Status;

const SESSION_COLOR: Record<SessionType, keyof Theme['color']['session']> = {
  walk_run: 'walkRun',
  easy: 'easy',
  tempo: 'tempo',
  long: 'long',
  race: 'race',
};

/** 상태나 훈련 종류를 나타내는 색. 훈련 종류가 있으면 그 색이 우선한다(§8.1, §8.2). */
export const toneColor = (t: Theme, tone: Tone, session?: SessionType): string =>
  session ? t.color.session[SESSION_COLOR[session]] : t.color.text[tone === 'neutral' ? 'secondary' : tone];

/** 기기의 "동작 줄이기" 설정(§3.8) */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => subscription.remove();
  }, []);
  return reduce;
}
