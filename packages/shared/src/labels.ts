import type { GoalDistance, PlanKind, PlanWarning, SessionStatus, SessionType } from './enums.js';

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

/** 목표 거리의 화면 표시 이름 */
export const GOAL_DISTANCE_LABELS: Record<GoalDistance, string> = {
  five_k: '5km',
  ten_k: '10km',
  half: '하프마라톤',
};

/** 계획 종류의 이름과 한 줄 설명(F03-R01, UI_UX §6.2) */
export const PLAN_KIND_LABELS: Record<PlanKind, { name: string; description: string }> = {
  race_prep: { name: '완주 준비 계획', description: '대회에서 끝까지 달리는 것을 목표로 해요' },
  base_building: { name: '기초 훈련 계획', description: '무리하지 않고 달리는 몸을 먼저 만들어요' },
};
