import { z } from 'zod';
import { usageSchema } from './schemas.js';

/** 오류 코드와 HTTP 상태(API_SPEC §1.1). 문서의 표와 같은지 테스트가 확인한다. */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  CONSENT_REQUIRED: 403,
  LIMIT_REACHED: 403,
  PRO_REQUIRED: 403,
  NOT_FOUND: 404,
  NO_ACTIVE_PLAN: 404,
  PLAN_ALREADY_ACTIVE: 409,
  PLAN_ACTIVE: 409,
  PROPOSAL_EXPIRED: 409,
  PROPOSAL_NOT_PENDING: 409,
  PLAN_CHANGED: 409,
  TARGET_CHANGED: 409,
  SESSION_ALREADY_COMPLETED: 409,
  WORKOUT_DUPLICATE: 409,
  CHAT_BUSY: 409,
  PACE_OUT_OF_RANGE: 422,
  SAFETY_CHECK_FAILED: 422,
  PLAN_NOT_FEASIBLE: 422,
  APP_UPDATE_REQUIRED: 426,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  AI_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const errorCodes = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
export const errorCodeSchema = z.enum(errorCodes);

/** 오류 응답 본문. `message`는 사용자에게 그대로 보여 줄 수 있는 한국어 문장이다. */
export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  /** `VALIDATION_ERROR`일 때 항목별 사유 */
  fields: z.record(z.string(), z.string()).optional(),
  /** `LIMIT_REACHED`일 때 현재 이용량 */
  usage: usageSchema.optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
