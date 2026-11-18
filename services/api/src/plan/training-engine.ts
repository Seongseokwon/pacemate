import type { Generate, Reschedule, Validate } from '@pacemate/training-engine';

/** 계획을 만들고 바꾸고 검증하는 Training Engine 함수. `app.module.ts`에서 `packages/training-engine`의 구현을 연결한다. */
export const TRAINING_ENGINE = Symbol('TRAINING_ENGINE');

export type TrainingEngine = { generate: Generate; validate: Validate; reschedule: Reschedule; version: string };
