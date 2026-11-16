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
  /** TE-S13: 한 번의 거리는 최근 `singleRunWindowDays`일 최장 거리의 이 배수를 넘지 않는다 */
  singleRunIncrease: 1.1,
  singleRunWindowDays: 30,
} as const;
