import { PLAN } from './safety-config.js';

export type * from './types.js';
export { classifyLevel } from './classify-level.js';
export { generate } from './generate.js';
export { ENGINE_VERSION } from './safety-config.js';
export { validate } from './validate.js';
export { reschedule } from './reschedule.js';

/** 유지 계획이 시작 훈련량을 구할 때 보는 주 수(TE-G10). API가 기록을 조회할 범위를 정할 때 쓴다 */
export const MAINTENANCE_RECENT_WEEKS = PLAN.maintenance.recentWeeks;
