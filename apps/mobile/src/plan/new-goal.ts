import { router } from 'expo-router';
import { NEW_GOAL_DRAFT, saveDraft } from '@/onboarding/draft';

/** 끝난 계획 뒤 [새 목표 설정]. 프로필은 그대로 두고 목표 질문부터 시작한다(F03-R08, UI_UX §6.3) */
export async function startNewGoal(): Promise<void> {
  await saveDraft(NEW_GOAL_DRAFT);
  router.push('/(onboarding)');
}
