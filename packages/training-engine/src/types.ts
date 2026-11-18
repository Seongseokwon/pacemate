import type {
  ContinuousRun,
  Experience,
  GoalDistance,
  PlanKind,
  PlanWarning,
  ProposalAction,
  ProposalReason,
  RunnerLevel,
  SessionSnapshot,
  SessionType,
} from '@pacemate/shared';

// 생성기·변경기·검증기의 입출력(ARCHITECTURE §6, PRD §7).
// 오늘 날짜는 항상 인자로 받는다. 같은 입력이면 같은 결과가 나와야 한다(TE-R09).

/** `YYYY-MM-DD`. 시간대가 없다(ARCHITECTURE §13). */
export type DateString = string;

export type EngineProfile = {
  experience: Experience;
  continuousRun: ContinuousRun;
  /** null이면 "잘 모르겠어요"다. 0과 구분한다(TE-G05) */
  recentWeeklyKm: number | null;
  recentPaceSecPerKm: number | null;
  weeklyRunCount: number;
  /** 1(월)~7(일) */
  preferredWeekdays: number[];
  /**
   * 최근에 실제로 마친 걷고 달리기의 한 번에 달리는 시간(분). 유지 계획을 만들 때만 생성기가 채운다(TE-G10).
   * 있으면 첫 주 상한(TE-S14)을 이 값까지 넓힌다. 끝난 계획에서 이미 달린 단계를 낮추지 않기 위해서다.
   */
  recentRunIntervalMin?: number | null;
};

export type EngineGoal = {
  goalDistance: GoalDistance;
  goalTimeSec: number | null;
  raceDate: DateString | null;
};

/** 계획 안의 훈련 한 건. 거리 기반이면 `distanceKm`, 시간 기반이면 `durationMin`이 있다(TE-S14). */
export type EngineSession = {
  date: DateString;
  type: SessionType;
  distanceKm: number | null;
  durationMin: number | null;
  paceRange: { minSecPerKm: number; maxSecPerKm: number } | null;
  /** 걷고 달리기에서 한 번에 달리는 시간(분). 시간 기반 걷고 달리기에는 꼭 있다(TE-S14) */
  runIntervalMin: number | null;
  weekNumber: number;
};

// 수준 분류(TE-G01). 프로필을 저장할 때와 계획을 만들 때 같은 기준을 쓴다
export type ClassifyLevel = (profile: EngineProfile) => RunnerLevel;

// 생성기
/** 유지 계획(TE-G10)의 재료. 끝난 계획과 최근 기록이다. 훈련량은 생성기가 이것으로 정한다. */
export type Continuation = {
  ended: {
    goalDistance: GoalDistance;
    raceDate: DateString | null;
    /** 생략하지 않은 훈련. `completed`는 기록이 연결되었는지다 */
    sessions: (Omit<EngineSession, 'paceRange' | 'weekNumber'> & { completed: boolean })[];
  };
  /** 오늘 전 최근 몇 주의 운동 기록. 범위 밖의 기록은 생성기가 무시한다 */
  workouts: { date: DateString; distanceKm: number }[];
};

/** `continuation`이 있으면 유지 계획만 만든다. 이때 목표는 목표 없음이어야 한다(F03-R10). */
export type GenerateInput = { profile: EngineProfile; goal: EngineGoal; today: DateString; continuation?: Continuation };

export type PlanOption = {
  kind: PlanKind;
  startDate: DateString;
  endDate: DateString;
  totalWeeks: number;
  sessions: EngineSession[];
  warnings: PlanWarning[];
};

export type GenerateResult = {
  level: RunnerLevel;
  /** 계획을 만들고 검증할 때 쓴 프로필. 유지 계획이면 최근 훈련량을 반영한 값이다. 다시 검증할 때 이 값을 넘긴다(TE-S12) */
  profile: EngineProfile;
  /** 만들 수 있는 계획만 담는다. 비어 있으면 어떤 계획도 만들 수 없다(TE-G06) */
  options: PlanOption[];
};

export type Generate = (input: GenerateInput) => GenerateResult;

// 검증기와 변경기가 받는 계획 상태
export type PlanSessionState = EngineSession & {
  id: string;
  /** 연결된 기록이 있다(DI-10) */
  completed: boolean;
  skipped: boolean;
};

export type PlanState = {
  kind: PlanKind;
  goal: EngineGoal;
  profile: EngineProfile;
  level: RunnerLevel;
  startDate: DateString;
  endDate: DateString;
  sessions: PlanSessionState[];
};

// 검증기. TE-S10(재계산 제안)과 TE-S12(호출하는 쪽의 책임)는 계획의 통과·위반이 아니라서 없다
export type SafetyRuleId =
  | 'TE-S01' | 'TE-S02' | 'TE-S03' | 'TE-S04' | 'TE-S05' | 'TE-S06' | 'TE-S07'
  | 'TE-S08' | 'TE-S09' | 'TE-S11' | 'TE-S13' | 'TE-S14';

export type ValidateInput = {
  plan: PlanState;
  today: DateString;
  /** 일정 변경(PRD §7.5)의 변경안을 검증할 때 넘긴다. `plan`은 변경을 적용한 뒤의 상태다(TE-S09, TE-S11) */
  change?: { previous: PlanState; reason: ProposalReason };
};
export type ValidateResult = { ok: true } | { ok: false; violations: SafetyRuleId[] };
export type Validate = (input: ValidateInput) => ValidateResult;

// 변경기. 훈련의 거리와 강도는 요청에 없다. Engine이 정한다(AI-03)
export type ChangeRequest =
  | { changeType: 'move'; sessionId: string; targetDate: DateString }
  | { changeType: 'unavailable_dates'; unavailableDates: DateString[] }
  | { changeType: 'reduce_count'; weekStart: DateString; maxSessions: number }
  | { changeType: 'ease'; sessionId: string; easeOption: 'rest' | 'lighter' };

export type RescheduleInput = {
  plan: PlanState;
  request: ChangeRequest;
  reason: ProposalReason;
  today: DateString;
};

export type SessionChange = {
  /** 새로 추가되는 훈련은 null */
  sessionId: string | null;
  action: ProposalAction;
  before: SessionSnapshot | null;
  after: SessionSnapshot | null;
};

/** 변경안을 만들 수 없는 이유(API_SPEC §6의 `reasonCode` 중 Engine이 판정하는 것) */
export type RescheduleFailure =
  | 'TARGET_NOT_CHANGEABLE'
  | 'OUT_OF_WEEK'
  | 'OUT_OF_RANGE'
  | 'RACE_DAY_FIXED'
  | 'PERIOD_TOO_LONG'
  | 'NO_SAFE_OPTION'
  | 'NOTHING_TO_CHANGE';

export type RescheduleResult =
  | {
      ok: true;
      changes: SessionChange[];
      impact: { weeklyDistanceBeforeKm: number; weeklyDistanceAfterKm: number; skippedCount: number };
      warnings: string[];
    }
  | { ok: false; reasonCode: RescheduleFailure };

export type Reschedule = (input: RescheduleInput) => RescheduleResult;
