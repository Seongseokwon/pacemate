import { expect, test } from 'vitest';
import { coachChoiceSchema, confirmPlanRequestSchema, previewPlanRequestSchema } from './api.js';
import { coachSchema } from './enums.js';
import { COACH_LABELS, DEFAULT_COACH, planFocusOf } from './labels.js';

const week = (runIntervalMin: number | null, weekNumber = 1) => ({ weekNumber, runIntervalMin });

test('F03-R09 목표 없음의 목표 문구는 첫 주로 정한다', () => {
  expect(planFocusOf('none', [week(1), week(1), week(2, 2)])).toBe('continuous_30min');
  expect(planFocusOf('none', [week(30), week(30)])).toBe('habit');
  expect(planFocusOf('none', [week(null), week(null)])).toBe('habit');
  expect(planFocusOf('none', [week(30), week(10, 2)])).toBe('habit');
});

test('거리 목표에는 목표 문구가 없다', () => {
  expect(planFocusOf('five_k', [week(1)])).toBeNull();
});

test('F02-R07 목표 없음에는 목표 기록과 대회 날짜를 받지 않는다', () => {
  expect(previewPlanRequestSchema.safeParse({ goalDistance: 'none' }).success).toBe(true);
  expect(previewPlanRequestSchema.safeParse({ goalDistance: 'none', goalTimeSec: null, raceDate: null }).success).toBe(true);
  expect(previewPlanRequestSchema.safeParse({ goalDistance: 'none', goalTimeSec: 1800 }).success).toBe(false);
  expect(previewPlanRequestSchema.safeParse({ goalDistance: 'none', raceDate: '2027-01-10' }).success).toBe(false);
  expect(previewPlanRequestSchema.safeParse({ goalDistance: 'five_k', goalTimeSec: 1800, raceDate: '2027-01-10' }).success).toBe(true);
});

test('F04-R11 코치 세 명의 이름과 소개가 있고, 소개 문장에 훈련 수치가 없다', () => {
  expect(coachSchema.options.map((coach) => COACH_LABELS[coach].name)).toEqual(['온이', '수리', '번개']);
  for (const coach of coachSchema.options) expect(COACH_LABELS[coach].sample).not.toMatch(/\d/);
  expect(DEFAULT_COACH).toBe('oni');
});

test('F04-R13 코치 바꾸기 요청은 정해진 세 값만 받는다', () => {
  expect(coachChoiceSchema.safeParse({ coach: 'suri' }).success).toBe(true);
  expect(coachChoiceSchema.safeParse({ coach: 'other' }).success).toBe(false);
  expect(coachChoiceSchema.safeParse({}).success).toBe(false);
});

test('F03-R10 유지 계획의 목표 문구는 첫 주와 관계없이 습관 만들기다', () => {
  expect(planFocusOf('none', [week(5)], 'maintenance')).toBe('habit');
  expect(planFocusOf('none', [], 'maintenance')).toBe('habit');
  expect(planFocusOf('none', [week(5)], 'base_building')).toBe('continuous_30min');
});

test('F03-R10 이어서 훈련하기와 유지 계획 확정은 목표 없음으로만 보낸다', () => {
  expect(previewPlanRequestSchema.safeParse({ goalDistance: 'none', continuation: true }).success).toBe(true);
  expect(previewPlanRequestSchema.safeParse({ goalDistance: 'five_k', continuation: true }).success).toBe(false);
  expect(previewPlanRequestSchema.safeParse({ goalDistance: 'five_k', continuation: false }).success).toBe(true);
  expect(confirmPlanRequestSchema.safeParse({ goalDistance: 'none', kind: 'maintenance' }).success).toBe(true);
  expect(confirmPlanRequestSchema.safeParse({ goalDistance: 'half', kind: 'maintenance' }).success).toBe(false);
});
