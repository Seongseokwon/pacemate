import { SESSION_TYPE_LABELS, type WeeklySummaryResponse } from '@pacemate/shared';
import { Card, formatKm, formatShortDate, ProgressBar, sessionAmount, Stack, Text } from '@/ui';

/**
 * 기록 화면의 이번 주 요약(F08-R01). 수치는 서버가 계산한 값을 그대로 쓴다.
 * 1단계 출시에는 AI 피드백 문장이 없다(PRD §14.3 2번, DECISIONS 2026-11-22). 계획도 기록도 없는 주에는 보여 주지 않는다.
 */
export function WeeklySummaryCard({ summary }: { summary: WeeklySummaryResponse }) {
  if (summary.plannedCount === 0 && summary.totalDistanceKm === 0) return null;
  const next = summary.nextSession;
  return (
    <Card>
      <Stack gap={3}>
        <Text variant="title3">이번 주 요약</Text>
        {summary.plannedCount > 0 && (
          <Stack gap={2}>
            <Stack direction="row" justify="space-between">
              <Text>훈련</Text>
              <Text>
                {summary.completedCount}/{summary.plannedCount}회 완료
              </Text>
            </Stack>
            <ProgressBar value={summary.completionRate} accessibilityLabel={`이번 주 훈련 ${summary.plannedCount}회 중 ${summary.completedCount}회 완료`} />
          </Stack>
        )}
        <Stack direction="row" justify="space-between">
          <Text>달린 거리</Text>
          <Text>{formatKm(summary.totalDistanceKm)}</Text>
        </Stack>
        {next && (
          <Text tone="secondary">
            다음 훈련: {SESSION_TYPE_LABELS[next.type].name} {sessionAmount(next)} · {formatShortDate(next.date)}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
