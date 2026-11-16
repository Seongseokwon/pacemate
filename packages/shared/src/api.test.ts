import { expect, test } from 'vitest';
import {
  createMeRequestSchema,
  createWorkoutRequestSchema,
  goalChangeRequestSchema,
  listQuerySchema,
  saveProfileRequestSchema,
  sendChatMessageResponseSchema,
  sessionsQuerySchema,
  updateWorkoutRequestSchema,
  weeklySummaryQuerySchema,
} from './api.js';

const profile = {
  experience: 'under_6m',
  continuousRun: 'under_30m',
  weeklyRunCount: 3,
  preferredWeekdays: [1, 3, 6],
};

test('필수 동의가 하나라도 빠지면 계정을 만들 수 없다 (F01-R02)', () => {
  const consent = { consentVersion: '2026-11', agreedTerms: true, agreedPrivacy: true, agreedHealthData: true };
  expect(createMeRequestSchema.safeParse(consent).success).toBe(true);
  expect(createMeRequestSchema.safeParse({ ...consent, agreedHealthData: false }).success).toBe(false);
});

test('목록 조회 개수는 기본 30, 최대 100이고 주소의 문자열을 숫자로 받는다 (API_SPEC §1)', () => {
  expect(listQuerySchema.parse({})).toEqual({ limit: 30 });
  expect(listQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  expect(listQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
});

test('프로필: 선호 요일은 주간 횟수 이상이어야 하고 겹칠 수 없다 (API_SPEC §3.2)', () => {
  expect(saveProfileRequestSchema.safeParse(profile).success).toBe(true);
  expect(saveProfileRequestSchema.safeParse({ ...profile, preferredWeekdays: [1, 3] }).success).toBe(false);
  expect(saveProfileRequestSchema.safeParse({ ...profile, preferredWeekdays: [1, 1, 3] }).success).toBe(false);
  expect(saveProfileRequestSchema.safeParse({ ...profile, weeklyRunCount: 6, preferredWeekdays: [1, 2, 3, 4, 5, 6] }).success).toBe(false);
});

test('프로필: 최근 주간 거리의 "잘 모르겠어요"(null)와 0을 모두 받는다 (TE-G05)', () => {
  expect(saveProfileRequestSchema.parse({ ...profile, recentWeeklyKm: null }).recentWeeklyKm).toBeNull();
  expect(saveProfileRequestSchema.parse({ ...profile, recentWeeklyKm: 0 }).recentWeeklyKm).toBe(0);
  expect(saveProfileRequestSchema.safeParse({ ...profile, recentRecord: { paceSecPerKm: 400 } }).success).toBe(true);
  expect(saveProfileRequestSchema.safeParse({ ...profile, recentRecord: { distanceKm: 5 } }).success).toBe(false);
});

test('훈련 목록은 62일까지만 조회한다 (API_SPEC §3.3)', () => {
  expect(sessionsQuerySchema.safeParse({ from: '2026-11-01', to: '2027-01-01' }).success).toBe(true);
  expect(sessionsQuerySchema.safeParse({ from: '2026-11-01', to: '2027-01-02' }).success).toBe(false);
  expect(sessionsQuerySchema.safeParse({ from: '2026-11-02', to: '2026-11-01' }).success).toBe(false);
});

test('운동 기록: 거리와 시간의 범위를 지킨다 (F07-R03)', () => {
  const workout = { date: '2026-11-14', distanceKm: 5, durationSec: 1800 };
  expect(createWorkoutRequestSchema.safeParse(workout).success).toBe(true);
  expect(createWorkoutRequestSchema.safeParse({ ...workout, distanceKm: 0.05 }).success).toBe(false);
  expect(createWorkoutRequestSchema.safeParse({ ...workout, durationSec: 43201 }).success).toBe(false);
  expect(createWorkoutRequestSchema.safeParse({ ...workout, memo: 'ㄱ'.repeat(501) }).success).toBe(false);
  // 수정은 바꿀 값만 보낸다. 연결 해제는 null이다
  expect(updateWorkoutRequestSchema.parse({ plannedSessionId: null })).toEqual({ plannedSessionId: null });
});

test('목표 변경 제안은 바꿀 값이 하나는 있어야 한다 (API_SPEC §3.6)', () => {
  expect(goalChangeRequestSchema.safeParse({}).success).toBe(false);
  expect(goalChangeRequestSchema.safeParse({ goal: {} }).success).toBe(false);
  expect(goalChangeRequestSchema.safeParse({ goal: { raceDate: null } }).success).toBe(true);
  expect(goalChangeRequestSchema.safeParse({ profile: { weeklyRunCount: 4 } }).success).toBe(true);
});

test('채팅 전송의 응답은 완료 결과이거나 처리 중이다 (API_SPEC §3.5)', () => {
  expect(sendChatMessageResponseSchema.parse({ status: 'processing' })).toEqual({ status: 'processing' });
  expect(sendChatMessageResponseSchema.safeParse({ status: 'done' }).success).toBe(false);
});

test('주간 요약의 주 시작은 월요일이다 (API_SPEC §3.7)', () => {
  expect(weeklySummaryQuerySchema.safeParse({}).success).toBe(true);
  expect(weeklySummaryQuerySchema.safeParse({ weekStart: '2026-11-16' }).success).toBe(true);
  expect(weeklySummaryQuerySchema.safeParse({ weekStart: '2026-11-17' }).success).toBe(false);
});
