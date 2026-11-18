import type { Href } from 'expo-router';

/**
 * 다른 작업이 만드는 화면으로 가는 주소와 넘기는 값. 받는 화면은 이 값을 읽는다.
 * - 기록 입력(T-302): `date`, `sessionId`가 있으면 채워 둔다(UI_UX §6.6)
 * - AI 코치(T-408): `draft`는 입력창에 채울 문장(자동으로 보내지 않는다, F05-R14), `sessionId`는 변경 요청할 훈련(F05-R11)
 */
export const recordHref = (params: { date?: string; sessionId?: string } = {}): Href => ({ pathname: '/workout-new', params });

export const coachHref = (params: { draft?: string; sessionId?: string } = {}): Href => ({ pathname: '/(tabs)/coach', params });

/** 홈의 [코치와 일정 조정하기]가 채우는 문장(PRD F05-R14) */
export const MISSED_SESSIONS_DRAFT = '이번 주 훈련을 두 번 놓쳤어요. 일정을 조정해 줘';
