import {
  type ContinuousRun,
  type Experience,
  type GoalDistance,
  type PreviewPlanRequest,
  PROFILE_LIMITS,
  type SaveProfileRequest,
  saveProfileRequestSchema,
  WORKOUT_LIMITS,
} from '@pacemate/shared';
import * as SecureStore from 'expo-secure-store';

/** 온보딩의 질문 순서(PRD §5.3) */
export const STEPS = ['experience', 'continuousRun', 'weeklyKm', 'recentRecord', 'schedule', 'goalDistance', 'goalTime', 'raceDate'] as const;
export type Step = (typeof STEPS)[number];

/** 온보딩에서 답한 내용. 입력하던 값을 그대로 담아, 앱을 닫았다 열어도 이어서 진행한다(AC-F02-03). */
export type OnboardingDraft = {
  step: number;
  experience: Experience | null;
  continuousRun: ContinuousRun | null;
  /** null이면 아직 답하지 않았거나 "잘 모르겠어요"다 */
  weeklyKm: number | null;
  /** 최근 기록을 거리와 시간으로 넣는지, 1km당 시간으로 넣는지 */
  recordMode: 'record' | 'pace';
  recordKm: number | null;
  recordMin: number | null;
  recordSec: number | null;
  runCount: number | null;
  weekdays: number[];
  goalDistance: GoalDistance | null;
  goalHour: number | null;
  goalMin: number | null;
  goalSec: number | null;
  raceDate: string | null;
};

export const EMPTY_DRAFT: OnboardingDraft = {
  step: 0,
  experience: null,
  continuousRun: null,
  weeklyKm: null,
  recordMode: 'record',
  recordKm: null,
  recordMin: null,
  recordSec: null,
  runCount: null,
  weekdays: [],
  goalDistance: null,
  goalHour: null,
  goalMin: null,
  goalSec: null,
  raceDate: null,
};

const within = (value: number, { min, max }: { min: number; max: number }) => value >= min && value <= max;
const seconds = (...parts: (number | null)[]) => parts.reduce<number>((sum, part) => sum * 60 + (part ?? 0), 0);

/** 최근 기록. 비워 두면 null("잘 모르겠어요"), 입력이 덜 됐거나 범위를 벗어나면 undefined다. */
export function recentRecordOf(draft: OnboardingDraft): SaveProfileRequest['recentRecord'] | undefined {
  const { recordMode, recordKm, recordMin, recordSec } = draft;
  const time = seconds(recordMin, recordSec);
  if (recordMode === 'pace') {
    if (recordMin === null && recordSec === null) return null;
    return within(time, WORKOUT_LIMITS.paceSecPerKm) ? { paceSecPerKm: time } : undefined;
  }
  if (recordKm === null && recordMin === null && recordSec === null) return null;
  if (recordKm === null || !within(recordKm, WORKOUT_LIMITS.distanceKm) || !within(time, WORKOUT_LIMITS.durationSec)) return undefined;
  return within(time / recordKm, WORKOUT_LIMITS.paceSecPerKm) ? { distanceKm: recordKm, durationSec: time } : undefined;
}

/** 목표 기록(초). 비워 두면 null, 0이면 undefined다. */
export function goalTimeSecOf({ goalHour, goalMin, goalSec }: OnboardingDraft): number | null | undefined {
  if (goalHour === null && goalMin === null && goalSec === null) return null;
  return seconds(goalHour, goalMin, goalSec) > 0 ? seconds(goalHour, goalMin, goalSec) : undefined;
}

/** 지금 질문에서 [다음]을 누를 수 있는지. 서버도 같은 범위를 다시 검증한다(AC-F02-01, AC-F02-02). */
export function canProceed(draft: OnboardingDraft): boolean {
  switch (STEPS[draft.step]) {
    case 'experience':
      return draft.experience !== null;
    case 'continuousRun':
      return draft.continuousRun !== null;
    case 'weeklyKm':
      return draft.weeklyKm !== null && within(draft.weeklyKm, PROFILE_LIMITS.recentWeeklyKm);
    case 'recentRecord':
      return !!recentRecordOf(draft);
    case 'schedule':
      return draft.runCount !== null && draft.weekdays.length >= draft.runCount;
    case 'goalDistance':
      return draft.goalDistance !== null;
    case 'goalTime':
      return !!goalTimeSecOf(draft);
    case 'raceDate':
      return draft.raceDate !== null;
    default:
      return false;
  }
}

/** 답변을 프로필 저장 요청으로 바꾼다. 필수 답이 빠졌거나 범위를 벗어나면 null이다. */
export function toProfileRequest(draft: OnboardingDraft): SaveProfileRequest | null {
  const parsed = saveProfileRequestSchema.safeParse({
    experience: draft.experience,
    continuousRun: draft.continuousRun,
    recentWeeklyKm: draft.weeklyKm,
    recentRecord: recentRecordOf(draft),
    weeklyRunCount: draft.runCount,
    preferredWeekdays: [...draft.weekdays].sort((a, b) => a - b),
  });
  return parsed.success ? parsed.data : null;
}

/** 계획 미리보기에 보낼 목표. 미리보기 화면(T-205)이 쓴다. */
export function toGoal(draft: OnboardingDraft): PreviewPlanRequest | null {
  if (draft.goalDistance === null) return null;
  return { goalDistance: draft.goalDistance, goalTimeSec: goalTimeSecOf(draft) ?? null, raceDate: draft.raceDate };
}

// 답변은 서버에 보내기 전까지 기기에만 둔다(DATABASE §3.1)
const KEY = 'onboarding-draft';

export async function loadDraft(): Promise<OnboardingDraft> {
  try {
    const saved: unknown = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? 'null');
    return saved && typeof saved === 'object' ? { ...EMPTY_DRAFT, ...saved } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

// 저장에 실패해도 온보딩은 계속한다. 이어서 하기만 안 될 뿐이다
export const saveDraft = (draft: OnboardingDraft): Promise<void> => SecureStore.setItemAsync(KEY, JSON.stringify(draft)).catch(() => undefined);

export const clearDraft = (): Promise<void> => SecureStore.deleteItemAsync(KEY).catch(() => undefined);
