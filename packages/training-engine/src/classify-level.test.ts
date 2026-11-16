import { expect, test } from 'vitest';
import { classifyLevel } from './classify-level.js';
import type { EngineProfile } from './types.js';

const profile = (over: Partial<EngineProfile>): EngineProfile => ({
  experience: 'over_2y', continuousRun: 'over_60m', recentWeeklyKm: 30, recentPaceSecPerKm: null, weeklyRunCount: 3, preferredWeekdays: [2, 4, 7], ...over,
});

test('TE-G01 세 항목이 모두 중급이면 중급이다', () => {
  expect(classifyLevel(profile({}))).toBe('intermediate');
  expect(classifyLevel(profile({ experience: 'under_2y', recentWeeklyKm: 25 }))).toBe('intermediate');
});

test('TE-G01 세 항목 중 가장 낮은 수준을 쓴다', () => {
  expect(classifyLevel(profile({ recentWeeklyKm: 24.9 }))).toBe('novice');
  expect(classifyLevel(profile({ continuousRun: 'under_60m' }))).toBe('novice');
  expect(classifyLevel(profile({ experience: 'under_6m' }))).toBe('novice');
  expect(classifyLevel(profile({ recentWeeklyKm: 9.9 }))).toBe('beginner');
  expect(classifyLevel(profile({ continuousRun: 'under_30m' }))).toBe('beginner');
  expect(classifyLevel(profile({ continuousRun: 'under_10m' }))).toBe('beginner');
  expect(classifyLevel(profile({ experience: 'none' }))).toBe('beginner');
  expect(classifyLevel(profile({ recentWeeklyKm: 10 }))).toBe('novice');
});

test('TE-G05 최근 주간 거리가 없으면 입문이다', () => {
  expect(classifyLevel(profile({ recentWeeklyKm: null }))).toBe('beginner');
  expect(classifyLevel(profile({ recentWeeklyKm: 0 }))).toBe('beginner');
});
