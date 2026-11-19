import type { HomeResponse, PlanSummary, Session } from '@pacemate/shared';
import { QueryClient } from '@tanstack/react-query';

// 캐시 정리 타이머(기본 5분)가 남으면 Jest 작업자가 끝나지 않아 강제 종료되므로 테스트에서는 타이머를 만들지 않는다
export const testQueryClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });

let next = 0;
export const session = (patch: Partial<Session> = {}): Session => ({
  id: `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
  date: '2026-11-17',
  type: 'easy',
  distanceKm: 5,
  durationMin: null,
  runIntervalMin: null,
  paceRange: null,
  weekNumber: 2,
  status: 'planned',
  workoutId: null,
  original: null,
  ...patch,
});

export const plan = (patch: Partial<PlanSummary> = {}): PlanSummary => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  kind: 'race_prep',
  goalDistance: 'half',
  goalTimeSec: null,
  raceDate: '2026-12-29',
  startDate: '2026-11-09',
  endDate: '2026-12-29',
  version: 1,
  warnings: [],
  progress: { completed: 12, total: 36 },
  isFinished: false,
  focus: null,
  ...patch,
});

export const home = (patch: Partial<HomeResponse> = {}): HomeResponse => ({
  plan: plan(),
  daysToRace: 42,
  todaySession: null,
  weekSessions: [],
  daysToStart: null,
  yesterdaySession: null,
  weekMissedCount: 0,
  managerMessage: { code: 'REST_DAY', text: '오늘은 쉬는 날이에요. 푹 쉬어 주세요.' },
  ...patch,
});
