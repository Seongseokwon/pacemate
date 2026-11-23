import type { WeeklySummaryResponse } from '@pacemate/shared';
import { render, screen } from '@testing-library/react-native';
import { WeeklySummaryCard } from '@/summary/weekly-summary-card';

const summary = (patch: Partial<WeeklySummaryResponse> = {}): WeeklySummaryResponse => ({
  weekStart: '2026-11-16',
  plannedCount: 3,
  completedCount: 1,
  totalDistanceKm: 5.2,
  completionRate: 1 / 3,
  nextSession: { id: '00000000-0000-4000-8000-000000000001', date: '2026-11-19', type: 'easy', distanceKm: 6, durationMin: null, runIntervalMin: null, walkIntervalMin: null, repeatCount: null, intensity: 'easy', status: 'scheduled', isRace: false, note: null } as never,
  aiFeedback: null,
  aiFeedbackAvailable: false,
  ...patch,
});

describe('기록 화면의 이번 주 요약 (F08-R01)', () => {
  test('완료/계획 횟수, 진행률, 달린 거리, 다음 훈련을 서버 값 그대로 보여 준다 (AC-F08-01)', async () => {
    await render(<WeeklySummaryCard summary={summary()} />);
    expect(screen.getByText('이번 주 요약')).toBeOnTheScreen();
    expect(screen.getByText('1/3회 완료')).toBeOnTheScreen();
    expect(screen.getByLabelText('이번 주 훈련 3회 중 1회 완료')).toBeOnTheScreen();
    expect(screen.getByText(/5\.2/)).toBeOnTheScreen();
    expect(screen.getByText(/다음 훈련: 가볍게 달리기/)).toBeOnTheScreen();
  });

  test('계획 없이 달린 주에는 거리만 보여 준다', async () => {
    await render(<WeeklySummaryCard summary={summary({ plannedCount: 0, completedCount: 0, completionRate: 0, nextSession: null })} />);
    expect(screen.queryByText(/회 완료/)).toBeNull();
    expect(screen.getByText(/5\.2/)).toBeOnTheScreen();
  });

  test('계획도 기록도 없는 주에는 보여 주지 않는다 (F08-R03과 같은 조건)', async () => {
    await render(<WeeklySummaryCard summary={summary({ plannedCount: 0, completedCount: 0, totalDistanceKm: 0, completionRate: 0, nextSession: null })} />);
    expect(screen.queryByText('이번 주 요약')).toBeNull();
  });
});
