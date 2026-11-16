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
  /** TE-S13: 한 번의 거리는 최근 `singleRunWindowDays`일 최장 거리의 이 배수를 넘지 않는다 */
  singleRunIncrease: 1.1,
  singleRunWindowDays: 30,
  /** TE-S14: 첫 주에 한 번에 달리는 시간(분)의 상한. "쉬지 않고 달릴 수 있는 시간" 범주의 하한이다. 10분 미만은 하한이 없어 1분으로 둔다 */
  continuousRunMin: { under_10m: 1, under_30m: 10, under_60m: 30, over_60m: 60 },
} as const;
