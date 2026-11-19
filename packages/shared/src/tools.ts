import { z } from 'zod';
import { dateSchema } from './schemas.js';

// LLM 조회 도구의 입력(API_SPEC §6 조회 도구). 제안 도구의 입력은 proposal.ts에 있다.
// 도구 레지스트리가 이 스키마로 LLM에 보낼 도구 정의를 만들고, LLM이 보낸 인자를 다시 검증한다(ARCHITECTURE §7.3).

/** `get_training_plan`으로 한 번에 조회할 수 있는 최대 일수(API_SPEC §6) */
export const TOOL_PLAN_QUERY_MAX_DAYS = 28;
/** `get_workout_history`로 한 번에 조회할 수 있는 최대 일수(API_SPEC §6) */
export const TOOL_HISTORY_QUERY_MAX_DAYS = 90;

/** LLM에 제공하는 도구 7개의 이름(PRD §6.2). 데이터를 바꾸는 도구는 없다 */
export const toolNameSchema = z.enum([
  'get_runner_profile',
  'get_training_plan',
  'get_workout_history',
  'get_weekly_summary',
  'propose_reschedule',
  'propose_goal_change',
  'propose_workout_log',
]);
export type ToolName = z.infer<typeof toolNameSchema>;

const DAY_MS = 86_400_000;
const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** 시작·끝 날짜를 모두 포함해 `maxDays`일까지인 기간 */
const periodSchema = (maxDays: number) =>
  z
    .object({ from: dateSchema, to: dateSchema })
    .refine(({ from, to }) => from <= to, { path: ['to'], message: '끝 날짜가 시작 날짜보다 빨라요.' })
    .refine(({ from, to }) => (dayOf(to) - dayOf(from)) / DAY_MS < maxDays, {
      path: ['to'],
      message: `한 번에 ${maxDays}일까지 조회할 수 있어요.`,
    });

/** `get_runner_profile`. 입력이 없다 */
export const getRunnerProfileInputSchema = z.object({});
export type GetRunnerProfileInput = z.infer<typeof getRunnerProfileInputSchema>;

/** `get_training_plan`. 최대 28일 */
export const getTrainingPlanInputSchema = periodSchema(TOOL_PLAN_QUERY_MAX_DAYS);
export type GetTrainingPlanInput = z.infer<typeof getTrainingPlanInputSchema>;

/** `get_workout_history`. 최대 90일 */
export const getWorkoutHistoryInputSchema = periodSchema(TOOL_HISTORY_QUERY_MAX_DAYS);
export type GetWorkoutHistoryInput = z.infer<typeof getWorkoutHistoryInputSchema>;

/** `get_weekly_summary`. `weekStart`는 월요일이다 */
export const getWeeklySummaryInputSchema = z.object({
  weekStart: dateSchema.refine((date) => new Date(dayOf(date)).getUTCDay() === 1, '주의 시작은 월요일이어야 해요.'),
});
export type GetWeeklySummaryInput = z.infer<typeof getWeeklySummaryInputSchema>;
