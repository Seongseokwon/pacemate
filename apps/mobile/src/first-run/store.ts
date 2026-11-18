import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '@/api/query-client';
import { type FirstRunEvent, type FirstRunState, INITIAL_STATE, reduce } from './flow';

export const FIRST_RUN_KEY = ['first-run'] as const;

const KEY = 'first-run';

async function save(next: FirstRunState): Promise<void> {
  queryClient.setQueryData(FIRST_RUN_KEY, next);
  const { introSeen, onboardingDeferred, onboardingInProgress, afterPlan } = next;
  await SecureStore.setItemAsync(KEY, JSON.stringify({ introSeen, onboardingDeferred, onboardingInProgress, afterPlan })).catch(() => undefined);
}

/** 기기에 남긴 첫 실행 상태. 읽지 못하면 처음 실행한 기기로 본다. */
export async function loadFirstRun(): Promise<FirstRunState> {
  const cached = queryClient.getQueryData<FirstRunState>(FIRST_RUN_KEY);
  if (cached) return cached;
  try {
    const saved: unknown = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? 'null');
    // 이번 실행에서만 쓰는 값은 저장된 것을 믿지 않는다
    return saved && typeof saved === 'object' ? { ...INITIAL_STATE, ...saved, onboardingStartPassed: false } : INITIAL_STATE;
  } catch {
    return INITIAL_STATE;
  }
}

/**
 * 첫 실행 화면이 끝났음을 알리고 앱 시작 경로로 돌아간다. 다음 화면은 시작 경로(`src/app/index.tsx`)가 정한다(F01-R09).
 * 기기에 저장하지 못해도 이번 실행의 흐름은 이어 간다. 다음에 열 때 앞 화면을 한 번 더 볼 뿐이다.
 */
export async function advance(event: FirstRunEvent): Promise<void> {
  await save(reduce(await loadFirstRun(), event));
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}

/** 로그아웃·계정 삭제 뒤에는 다음 사람이 이어받지 않도록 계정에 딸린 상태만 지운다. 인트로는 기기마다 한 번이다. */
export async function resetAccountFirstRun(): Promise<void> {
  const { introSeen } = await loadFirstRun();
  await save({ ...INITIAL_STATE, introSeen });
}
