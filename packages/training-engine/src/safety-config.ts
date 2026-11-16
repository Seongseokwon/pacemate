/** 훈련 안전 규칙의 초기값. */
export const SAFETY = {
  longRunShare: { threshold: 3, upToThree: 0.5, fourOrMore: 0.4 },
  maxSessionsPerWeek: 6,
  minSessionsForTempo: 3,
  maxTempoPerWeek: 1,
} as const;
