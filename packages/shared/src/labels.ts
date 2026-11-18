import type { Coach, GoalDistance, PlanFocus, PlanKind, PlanWarning, SessionStatus, SessionType } from './enums.js';

/** 훈련 종류의 화면 표시 이름과 체감 안내 문구(UI_UX §8.1). 응답에는 `type`만 담고 문구는 여기서 찾는다. */
export const SESSION_TYPE_LABELS: Record<SessionType, { name: string; guidance: string }> = {
  walk_run: { name: '걷고 달리기', guidance: '걷기와 달리기를 번갈아 해요' },
  easy: { name: '가볍게 달리기', guidance: '편하게 대화할 수 있는 속도예요' },
  tempo: { name: '조금 빠르게 달리기', guidance: '숨이 조금 차지만 유지할 수 있는 속도예요' },
  long: { name: '길게 달리기', guidance: '편한 속도로 평소보다 오래 달려요' },
  race: { name: '대회', guidance: '대회 날이에요' },
};

/** 계획 경고의 화면 문구(TE-G06, F03-R06). */
export const PLAN_WARNING_LABELS: Record<PlanWarning, string> = {
  RACE_PREP_NOT_REACHABLE: '지금 달리는 양으로는 기간 안에 완주 준비를 마치기 어려워요. 먼저 기초를 다지는 계획으로 시작해요.',
  GOAL_TIME_TOO_FAST: '목표 기록이 최근 기록보다 많이 빨라요. 계획은 무리하지 않게 완주에 맞춰 만들었어요.',
  GOAL_TIME_NOT_CHECKED: '최근 기록이 없어서 목표 기록이 알맞은지 확인하지 못했어요. 계획은 완주에 맞춰 만들었어요.',
};

/** 훈련 상태의 칩 문구(UI_UX §8.2) */
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: '예정',
  completed: '완료',
  missed: '미완료',
  skipped: '생략',
};

/**
 * AI 코치의 이름, 한 줄 소개, 말투 소개 문장, 말투 표시(F04-R11, UI_UX §6.10, C2 08d).
 * 말투 소개 문장에는 훈련 수치를 넣지 않는다. 세 코치의 차이는 말투뿐이다(AI-11).
 */
export const COACH_LABELS: Record<Coach, { name: string; intro: string; sample: string; tags: readonly string[] }> = {
  oni: { name: '온이', intro: '다정한 러닝 친구', sample: '옆에서 같이 뛰어 주는 친구처럼, 먼저 마음을 알아주고 응원해요.', tags: ['다정한 해요체', '2~3문장', '공감 먼저'] },
  suri: { name: '수리', intro: '차분한 데이터 코치', sample: '기록과 숫자로 지금 상태를 설명하고, 이유와 함께 다음 할 일을 정리해 줘요.', tags: ['정중한 해요체', '3~4문장', '근거 먼저'] },
  bungae: { name: '번개', intro: '힘찬 스포츠 코치', sample: '짧고 힘 있게, 핵심만 말하고 바로 다음 행동으로 이끌어요.', tags: ['짧은 해요체', '짧은 문장 3~4개', '핵심만'] },
};

/** 온보딩을 건너뛰었거나 코치를 고르지 않은 사용자의 코치(F04-R12, D-15). DB 기본값과 같다 */
export const DEFAULT_COACH: Coach = 'oni';

/** 목표 거리의 화면 표시 이름 */
export const GOAL_DISTANCE_LABELS: Record<GoalDistance, string> = {
  five_k: '5km',
  ten_k: '10km',
  half: '하프마라톤',
  none: '목표 없음',
};

/** 계획 종류의 이름과 한 줄 설명(F03-R01, UI_UX §6.2) */
export const PLAN_KIND_LABELS: Record<PlanKind, { name: string; description: string }> = {
  race_prep: { name: '완주 준비 계획', description: '대회에서 끝까지 달리는 것을 목표로 해요' },
  base_building: { name: '기초 훈련 계획', description: '달리기 기초 체력을 차근차근 다져요' },
  maintenance: { name: '유지 계획', description: '지금까지 달린 만큼을 무리 없이 이어 가요' },
};

/** 목표 없음 계획의 목표 문구(F03-R09) */
export const PLAN_FOCUS_LABELS: Record<PlanFocus, string> = {
  continuous_30min: '30분 쉬지 않고 달리기',
  habit: '꾸준히 달리는 습관 만들기',
};

/** 목표 없음에서 "30분 쉬지 않고 달리기"를 목표로 삼는 기준(분). 첫 주에 한 번에 달리는 시간이 이보다 짧으면 그 목표다 */
export const FOCUS_CONTINUOUS_RUN_MIN = 30;

/**
 * 목표 없음 계획의 목표 문구를 계획의 첫 주로 정한다(F03-R09, API_SPEC §3.3). 거리 목표면 null이다.
 * 시간 기반 계획(걷고 달리기)의 첫 주에 한 번에 달리는 시간이 30분 미만이면 `continuous_30min`, 그 밖에는 `habit`이다.
 */
export function planFocusOf(
  goalDistance: GoalDistance,
  sessions: readonly { weekNumber: number; runIntervalMin: number | null }[],
  kind?: PlanKind,
): PlanFocus | null {
  if (goalDistance !== 'none') return null;
  // 유지 계획은 첫 주와 관계없이 습관 만들기다(F03-R10)
  if (kind === 'maintenance') return 'habit';
  const intervals = sessions.filter((session) => session.weekNumber === 1 && session.runIntervalMin !== null).map((session) => session.runIntervalMin as number);
  return intervals.length > 0 && Math.min(...intervals) < FOCUS_CONTINUOUS_RUN_MIN ? 'continuous_30min' : 'habit';
}
