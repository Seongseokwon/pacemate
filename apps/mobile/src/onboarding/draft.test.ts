import * as SecureStore from 'expo-secure-store';
import {
  activeSteps,
  canProceed,
  clearDraft,
  EMPTY_DRAFT,
  NEW_GOAL_DRAFT,
  goalTimeSecOf,
  isLastStep,
  loadDraft,
  nextStep,
  type OnboardingDraft,
  previousStep,
  progressOf,
  recentRecordOf,
  saveDraft,
  STEPS,
  toGoal,
  toProfileRequest,
} from './draft';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

const at = (step: (typeof STEPS)[number], patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({ ...EMPTY_DRAFT, ...patch, step: STEPS.indexOf(step) });

const ANSWERED: OnboardingDraft = {
  ...EMPTY_DRAFT,
  experience: 'under_6m',
  continuousRun: 'under_30m',
  weeklyKm: 12.5,
  runCount: 3,
  weekdays: [6, 1, 3],
  goalDistance: 'ten_k',
};

describe('다음으로 넘어갈 수 있는지 (AC-F02-01, AC-F02-02)', () => {
  test.each([
    ['경험을 고르기 전', at('experience'), false],
    ['경험을 고른 뒤', at('experience', { experience: 'none' }), true],
    ['주간 거리 0', at('weeklyKm', { weeklyKm: 0 }), true],
    ['주간 거리가 범위를 넘음', at('weeklyKm', { weeklyKm: 100.5 }), false],
    ['주간 거리를 비움', at('weeklyKm'), false],
    ['기록을 비움("잘 모르겠어요"로만 넘어간다)', at('recentRecord'), false],
    ['기록의 거리만 넣음', at('recentRecord', { recordKm: 5 }), false],
    ['기록을 다 넣음', at('recentRecord', { recordKm: 5, recordMin: 30 }), true],
    ['횟수보다 요일이 적음', at('schedule', { runCount: 3, weekdays: [1, 3] }), false],
    ['횟수만큼 요일을 고름', at('schedule', { runCount: 3, weekdays: [1, 3, 5] }), true],
    ['목표 기록이 0', at('goalTime', { goalMin: 0 }), false],
    ['목표 기록을 넣음', at('goalTime', { goalMin: 55 }), true],
    ['대회 날짜를 고름', at('raceDate', { raceDate: '2027-03-21' }), true],
  ])('%s', (_name, draft, expected) => {
    expect(canProceed(draft)).toBe(expected);
  });
});

describe('최근 기록과 목표 기록', () => {
  test('거리와 시간, 1km당 시간을 요청 형식으로 바꾼다', () => {
    expect(recentRecordOf({ ...EMPTY_DRAFT, recordKm: 5, recordMin: 30, recordSec: 15 })).toEqual({ distanceKm: 5, durationSec: 1815 });
    expect(recentRecordOf({ ...EMPTY_DRAFT, recordMode: 'pace', recordMin: 6, recordSec: 30 })).toEqual({ paceSecPerKm: 390 });
    expect(recentRecordOf(EMPTY_DRAFT)).toBeNull();
  });

  test('범위를 벗어난 기록은 받지 않는다', () => {
    // 42km를 10분에: 거리와 시간은 각각 범위 안이지만 속도가 비정상이다
    expect(recentRecordOf({ ...EMPTY_DRAFT, recordKm: 42, recordMin: 10 })).toBeUndefined();
    expect(recentRecordOf({ ...EMPTY_DRAFT, recordMode: 'pace', recordMin: 1 })).toBeUndefined();
  });

  test('목표 기록을 초로 바꾼다', () => {
    expect(goalTimeSecOf({ ...EMPTY_DRAFT, goalHour: 1, goalMin: 59, goalSec: 30 })).toBe(7170);
    expect(goalTimeSecOf(EMPTY_DRAFT)).toBeNull();
  });
});

describe('서버에 보낼 내용', () => {
  test('답변을 프로필 저장 요청으로 바꾼다. 요일은 순서대로 정리한다', () => {
    expect(toProfileRequest(ANSWERED)).toEqual({
      experience: 'under_6m',
      continuousRun: 'under_30m',
      recentWeeklyKm: 12.5,
      recentRecord: null,
      weeklyRunCount: 3,
      preferredWeekdays: [1, 3, 6],
    });
  });

  test('"잘 모르겠어요"는 0이 아니라 빈 값으로 보낸다 (TE-G05)', () => {
    expect(toProfileRequest({ ...ANSWERED, weeklyKm: null })?.recentWeeklyKm).toBeNull();
  });

  test('필수 답이 빠지면 요청을 만들지 않는다 (AC-F02-01)', () => {
    expect(toProfileRequest({ ...ANSWERED, experience: null })).toBeNull();
    expect(toProfileRequest({ ...ANSWERED, weekdays: [1] })).toBeNull();
  });

  test('목표는 계획 미리보기에 보낼 형식으로 꺼낸다', () => {
    expect(toGoal({ ...ANSWERED, goalMin: 55, raceDate: '2027-03-21' })).toEqual({ goalDistance: 'ten_k', goalTimeSec: 3300, raceDate: '2027-03-21' });
    expect(toGoal(ANSWERED)).toEqual({ goalDistance: 'ten_k', goalTimeSec: null, raceDate: null });
    expect(toGoal(EMPTY_DRAFT)).toBeNull();
  });
});

describe('기기 저장 (AC-F02-03)', () => {
  test('저장한 답변을 다시 읽고, 지우면 처음 상태가 된다', async () => {
    expect(await loadDraft()).toEqual(EMPTY_DRAFT);

    await saveDraft({ ...ANSWERED, step: 4 });
    expect(await loadDraft()).toEqual({ ...ANSWERED, step: 4 });

    await clearDraft();
    expect(await loadDraft()).toEqual(EMPTY_DRAFT);
  });

  test('읽을 수 없는 내용이 저장돼 있으면 처음부터 시작한다', async () => {
    await SecureStore.setItemAsync('onboarding-draft', '{깨진 내용');
    expect(await loadDraft()).toEqual(EMPTY_DRAFT);
  });
});

describe('목표 없음 (F02-R07, AC-F02-05)', () => {
  const none = (step: (typeof STEPS)[number]) => at(step, { ...ANSWERED, goalDistance: 'none' });

  test('목표 기록과 대회 날짜를 묻지 않고, 전체 단계 수가 줄어든다', () => {
    expect(activeSteps({ goalDistance: 'none' })).not.toContain('goalTime');
    expect(activeSteps({ goalDistance: 'none' })).not.toContain('raceDate');
    expect(progressOf(none('goalDistance'))).toEqual({ current: 6, total: 6 });
    expect(progressOf(at('goalDistance', ANSWERED))).toEqual({ current: 6, total: 8 });
  });

  test('목표 거리가 마지막 질문이 된다', () => {
    expect(isLastStep(none('goalDistance'))).toBe(true);
    expect(isLastStep(at('goalDistance', ANSWERED))).toBe(false);
    expect(nextStep(at('goalDistance', ANSWERED))).toBe(STEPS.indexOf('goalTime'));
    expect(previousStep(none('goalDistance'))).toBe(STEPS.indexOf('schedule'));
  });

  test('미리보기에는 목표 기록과 대회 날짜를 보내지 않는다', () => {
    expect(toGoal({ ...ANSWERED, goalDistance: 'none', goalMin: 30, raceDate: '2027-03-21' })).toEqual({ goalDistance: 'none', goalTimeSec: null, raceDate: null });
  });
});

describe('끝난 계획 뒤 새 목표 (F03-R08, UI_UX §6.3)', () => {
  test('목표 질문만 묻고 목표 거리부터 시작한다', () => {
    expect(activeSteps(NEW_GOAL_DRAFT)).toEqual(['goalDistance', 'goalTime', 'raceDate']);
    expect(STEPS[NEW_GOAL_DRAFT.step]).toBe('goalDistance');
    expect(progressOf(NEW_GOAL_DRAFT)).toEqual({ current: 1, total: 3 });
    expect(previousStep(NEW_GOAL_DRAFT)).toBe(STEPS.indexOf('goalDistance'));
  });

  test('목표 없음을 고르면 목표 거리가 마지막 질문이다', () => {
    expect(isLastStep({ ...NEW_GOAL_DRAFT, goalDistance: 'none' })).toBe(true);
    expect(activeSteps({ ...NEW_GOAL_DRAFT, goalDistance: 'none' })).toEqual(['goalDistance']);
  });
});
