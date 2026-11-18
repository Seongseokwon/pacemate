import type { MeResponse } from '@pacemate/shared';
import type { Href } from 'expo-router';

/** 계획을 확정한 뒤 차례로 거치는 화면. 코치 고르기(T-411)는 알림 권한 앞에 들어간다(PRD §5.1). */
export type AfterPlanStep = 'notifications';

/** 첫 실행 흐름에서 기기에 남기는 상태. 서버가 아는 것(가입, 프로필, 계획)은 `GET /v1/me`로 판단한다. */
export type FirstRunState = {
  /** 인트로를 본 기기인지(F01-R08) */
  introSeen: boolean;
  /** 온보딩 시작 화면에서 [나중에 할게요]를 골랐는지(F02-R08) */
  onboardingDeferred: boolean;
  /** 온보딩을 시작했고 아직 계획을 확정하지 않았는지. 프로필을 저장한 뒤 계획 미리보기로 이어 간다 */
  onboardingInProgress: boolean;
  afterPlan: AfterPlanStep[];
  /** 이번 실행에서 온보딩 시작 화면을 지났는지. 기기에 남기지 않아 앱을 다시 열면 시작 화면부터 보여 준다(F01-R07) */
  onboardingStartPassed: boolean;
};

export const INITIAL_STATE: FirstRunState = {
  introSeen: false,
  onboardingDeferred: false,
  onboardingInProgress: false,
  afterPlan: [],
  onboardingStartPassed: false,
};

/** 첫 실행 화면이 끝날 때 알리는 일. 화면은 다음 화면을 정하지 않고 이 일만 알린다(F01-R09). */
export type FirstRunEvent =
  | 'introDone'
  /** 온보딩 시작 화면의 [시작하기], 홈의 계획 만들기 카드 */
  | 'onboardingStarted'
  | 'onboardingDeferred'
  | 'planConfirmed'
  | 'notificationsDone';

export function reduce(state: FirstRunState, event: FirstRunEvent): FirstRunState {
  switch (event) {
    case 'introDone':
      return { ...state, introSeen: true };
    case 'onboardingStarted':
      return { ...state, onboardingDeferred: false, onboardingInProgress: true, onboardingStartPassed: true };
    case 'onboardingDeferred':
      return { ...state, onboardingDeferred: true, onboardingInProgress: false, onboardingStartPassed: false };
    case 'planConfirmed':
      return { ...state, onboardingInProgress: false, onboardingStartPassed: false, afterPlan: ['notifications'] };
    case 'notificationsDone':
      return { ...state, afterPlan: state.afterPlan.filter((step) => step !== 'notifications') };
  }
}

const AFTER_PLAN_ROUTES: Record<AfterPlanStep, Href> = { notifications: '/notification-permission' };

type Me = Pick<MeResponse, 'registered' | 'onboardingCompleted' | 'hasActivePlan'>;

/**
 * 첫 실행 흐름에서 다음에 보여 줄 화면(PRD §5.1, UI_UX §5). 다음 화면은 여기서만 정한다.
 * `me`가 null이면 아직 내 상태를 모른다. 로그인하지 않은 경우는 `401` 분기가 로그인 화면으로 보낸다.
 */
export function firstRunRoute(state: FirstRunState, me: Me | null): Href | null {
  if (!state.introSeen) return '/intro';
  if (!me) return null;
  if (!me.registered) return '/consent';
  if (me.hasActivePlan) {
    const [step] = state.afterPlan;
    return step ? AFTER_PLAN_ROUTES[step] : '/(tabs)';
  }
  if (!me.onboardingCompleted) {
    if (state.onboardingDeferred) return '/(tabs)';
    return state.onboardingStartPassed ? '/(onboarding)' : '/(onboarding)/start';
  }
  // 프로필은 있고 계획이 없다. 온보딩 중이면 미리보기로, 아니면 홈의 계획 만들기 카드에서 다시 시작한다
  return state.onboardingInProgress ? '/(onboarding)/plan-preview' : '/(tabs)';
}
