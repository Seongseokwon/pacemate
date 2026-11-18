/** 이 파일의 값을 바꾸면 올린다. 계획에 함께 저장해 어떤 값으로 만든 계획인지 남긴다(DATABASE §3.3). */
export const ENGINE_VERSION = '2026-11-18.2';

/** 훈련 안전 규칙의 초기값(PRD §7.4). `D-04`를 확정할 때 값만 바꾼다. */
export const SAFETY = {
  /** TE-S01, TE-S14: 주간 거리·시간은 최근 `peakWeeks`주 고점의 이 배수를 넘지 않는다 */
  weeklyIncrease: 1.1,
  peakWeeks: 4,
  /** TE-S03 */
  longRunShare: { threshold: 3, upToThree: 0.5, fourOrMore: 0.4 },
  /** TE-S05: 주 1일 이상 휴식 */
  maxSessionsPerWeek: 6,
  /** TE-S07 */
  minSessionsForTempo: 3,
  maxTempoPerWeek: 1,
  /** TE-S02: 고점보다 `recoveryMinReduction` 이상 적은 주가 회복 주다. 회복 주 없이 `recoveryEveryWeeks`주째에는 고점을 넘기지 않는다 */
  recoveryMinReduction: 0.2,
  recoveryEveryWeeks: 4,
  /** TE-S08: 대회가 있는 주의 훈련 거리는 고점보다 이만큼 이상 적어야 한다 */
  taperMinReduction: 0.25,
  /** TE-S08: 대회가 이 요일(1=월)까지면 그 전 주에도 같은 기준을 적용한다 */
  taperPreviousWeekUntilWeekday: 3,
  /** TE-S13: 한 번의 거리는 최근 `singleRunWindowDays`일 최장 거리의 이 배수를 넘지 않는다 */
  singleRunIncrease: 1.1,
  singleRunWindowDays: 30,
  /** TE-S14: 첫 주에 한 번에 달리는 시간(분)의 상한. "쉬지 않고 달릴 수 있는 시간" 범주의 하한이다. 10분 미만은 하한이 없어 1분으로 둔다 */
  continuousRunMin: { under_10m: 1, under_30m: 10, under_60m: 30, over_60m: 60 },
} as const;

/** 일정 변경의 초기값(TE-R05, 2026-11-18 개발자 결정). */
export const RESCHEDULE = { maxUnavailableDays: 14, lighterFactor: 0.5 } as const;

/** 생성기의 초기값(`DECISIONS.md` 2026-11-16 "생성기의 초기값", `docs/T-201-TRAINING-DRAFT.md` §10). `D-04`를 확정할 때 값만 바꾼다. */
export const PLAN = {
  /** TE-G01: 세 항목을 각각 판정해 가장 낮은 수준을 쓴다. 주간 거리는 이 값 이상일 때 그 수준이다 */
  level: {
    continuousRun: { under_10m: 'beginner', under_30m: 'beginner', under_60m: 'novice', over_60m: 'intermediate' },
    experience: { none: 'beginner', under_6m: 'novice', under_2y: 'intermediate', over_2y: 'intermediate' },
    weeklyKm: { novice: 10, intermediate: 25 },
  },
  /** TE-G05, TE-S06: 최근 주간 거리가 이보다 적거나 없으면 시간 기반 계획으로 시작한다 */
  distanceBasedMinWeeklyKm: 6,
  /** TE-G03. `none`은 목표 없음이다 */
  standardWeeks: { five_k: 8, ten_k: 10, half: 12, none: 9 },
  raceKm: { five_k: 5, ten_k: 10, half: 21.1 },
  /** TE-G06: 조정 주 전에 `long` 한 번이 닿아야 하는 거리 */
  reachKm: { five_k: 4, ten_k: 8, half: 16 },
  /** TE-S02: `cycleWeeks`주째마다 최근 4주 고점의 `recoveryFactor`배로 줄인다 */
  cycleWeeks: 4,
  recoveryFactor: 0.75,
  /** 주간 거리를 늘리는 주의 증가율(TE-S01의 한도 안) */
  weeklyIncrease: { race_prep: 0.1, base_building: 0.05 },
  /** `easy` 한 번이 이보다 짧아지면 그 주의 횟수를 줄인다 */
  minSessionKm: 2,
  minSessionsPerWeek: 2,
  /** 주당 횟수별 주간 거리의 비율(TE-S03의 한도 안). `long`은 주 1회다 */
  shares: {
    2: { long: 0.5, easy: 0.5 },
    3: { long: 0.45, easy: 0.275 },
    4: { long: 0.37, easy: 0.21 },
    5: { long: 0.32, easy: 0.17 },
  },
  /** `tempo`는 `long`과 이만큼 떨어진 요일에만 둔다(TE-S04) */
  tempoMinGapDays: 2,
  /** TE-G02, TE-S08: 조정 주의 주간 목표(최근 4주 고점 대비). `weekBefore`가 없는 목표는 조정 주가 1주다 */
  taper: { raceWeek: 0.6, weekBefore: { five_k: null, ten_k: null, half: 0.75 } },
  /** TE-S14: 시간 기반 계획. 한 번에 달리는 시간(분)은 한 주에 한 단계 오른다 */
  timeBased: {
    sessionMin: 30,
    maxSessionsPerWeek: 3,
    runIntervalLadder: [1, 2, 3, 5, 8, 10, 15, 20, 30],
    startRunInterval: { under_10m: 1, under_30m: 10, under_60m: 30, over_60m: 30 },
  },
  /**
   * TE-G03, TE-G10: 유지 계획(2026-11-18 개발자 확인, `DECISIONS.md`). `recentWeeks`주의 주마다 계획 거리와 기록 거리 중 적은 쪽의 평균에서 시작한다.
   * 대회 뒤 `postRaceDays`일 안에 시작하면 첫 주를 `postRaceFactor`배로 줄이고, 입문 수준이면 첫 주를 쉰다. 그 뒤로는 `singleRunIncrease`만큼씩만 되돌린다.
   */
  maintenance: { weeks: 4, recentWeeks: 4, postRaceDays: 14, postRaceFactor: { five_k: 0.7, ten_k: 0.6, half: 0.5 } },
  /** 권장 페이스(최근 페이스 대비 배수). 최근 페이스가 대회 기록일 수 있어 느리게 잡는다 */
  pace: { easy: [1.1, 1.25], long: [1.1, 1.25], tempo: [1, 1.05] },
  /** TE-G06: 목표 페이스가 최근 페이스보다 이 비율을 넘게 빠르면 경고한다 */
  goalPaceWarning: { five_k: 0.15, ten_k: 0.1, half: 0.05 },
} as const;
