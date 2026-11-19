import { expect, test } from 'vitest';
import {
  getRunnerProfileInputSchema,
  getTrainingPlanInputSchema,
  getWeeklySummaryInputSchema,
  getWorkoutHistoryInputSchema,
  toolNameSchema,
} from './tools.js';

test('도구는 PRD §6.2의 7개다', () => {
  expect(toolNameSchema.options).toHaveLength(7);
});

test('get_runner_profile은 입력이 없고, 넘어온 값은 버린다 (DI-07)', () => {
  expect(getRunnerProfileInputSchema.parse({ userId: 'someone-else' })).toEqual({});
});

test('get_training_plan은 시작·끝을 포함해 28일까지 조회한다 (API_SPEC §6)', () => {
  expect(getTrainingPlanInputSchema.safeParse({ from: '2026-11-16', to: '2026-12-13' }).success).toBe(true);
  expect(getTrainingPlanInputSchema.safeParse({ from: '2026-11-16', to: '2026-12-14' }).success).toBe(false);
  expect(getTrainingPlanInputSchema.safeParse({ from: '2026-11-22', to: '2026-11-16' }).success).toBe(false);
  expect(getTrainingPlanInputSchema.safeParse({ from: '2026-11-16' }).success).toBe(false);
});

test('get_workout_history는 90일까지 조회한다 (API_SPEC §6)', () => {
  expect(getWorkoutHistoryInputSchema.safeParse({ from: '2026-08-22', to: '2026-11-19' }).success).toBe(true);
  expect(getWorkoutHistoryInputSchema.safeParse({ from: '2026-08-21', to: '2026-11-19' }).success).toBe(false);
});

test('get_weekly_summary의 주 시작은 월요일이다', () => {
  expect(getWeeklySummaryInputSchema.safeParse({ weekStart: '2026-11-16' }).success).toBe(true);
  expect(getWeeklySummaryInputSchema.safeParse({ weekStart: '2026-11-17' }).success).toBe(false);
  expect(getWeeklySummaryInputSchema.safeParse({ weekStart: '11/16' }).success).toBe(false);
});
