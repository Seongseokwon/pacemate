import type { ClassifyLevel } from '@pacemate/training-engine';

/** 수준 분류 함수(TE-G01). 기준은 Training Engine만 정한다(AGENTS.md 구조 규칙 4). */
export const LEVEL_CLASSIFIER = Symbol('LEVEL_CLASSIFIER');

/** Training Engine에 분류 함수가 생기기 전의 구현. 임의의 수준을 저장하지 않고 실패한다. */
export const unavailableLevelClassifier: ClassifyLevel = () => {
  throw new Error('수준 분류 기준이 아직 없다(T-201, T-203)');
};
