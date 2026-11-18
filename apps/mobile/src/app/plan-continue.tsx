import { PLAN_FOCUS_LABELS, type PlanOption } from '@pacemate/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ApiClientError } from '@/api/client';
import { ME_KEY } from '@/api/me';
import { confirmPlan, HOME_KEY, previewPlan } from '@/api/plan';
import { isRedirectError } from '@/api/query-client';
import { startNewGoal } from '@/plan/new-goal';
import { Button, formatKm, Heading, Screen, SessionList, SessionRow, showToast, Stack, StatTile, Text } from '@/ui';

const CONTINUE = { goalDistance: 'none', continuation: true } as const;

/** 첫 주에 훈련이 없으면(대회 뒤 쉬는 주) 훈련이 처음 있는 주를 보여 준다 */
const firstWeekOf = (option: PlanOption) => {
  const first = Math.min(...option.sessions.map((session) => session.weekNumber));
  return option.sessions.filter((session) => session.weekNumber === first);
};

/** 유지 계획 미리보기(F03-R10, C2 15c). 홈의 [이어서 훈련하기]에서 질문 없이 연다. 확정해야 저장된다(AC-F03-08). */
export default function PlanContinue() {
  const queryClient = useQueryClient();
  const preview = useQuery({ queryKey: ['plan-preview', CONTINUE], queryFn: () => previewPlan(CONTINUE) });
  const confirm = useMutation({
    mutationFn: () => confirmPlan({ goalDistance: 'none', kind: 'maintenance' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      await queryClient.invalidateQueries({ queryKey: HOME_KEY });
      router.back();
    },
    onError: (error) => {
      if (!isRedirectError(error)) showToast(error.message);
    },
  });
  const header = { title: '이런 계획은 어때요?', onBack: () => router.back() };

  const option = preview.data?.options[0];
  if (!option) {
    const retryable = preview.error instanceof ApiClientError && preview.error.code === 'NETWORK_ERROR';
    return <Screen {...header} loading={preview.isPending} error={preview.error?.message} onRetry={retryable ? () => void preview.refetch() : undefined} />;
  }

  const firstWeek = firstWeekOf(option);
  const timeBased = firstWeek.every((session) => session.distanceKm === null);
  const firstWeekKm = firstWeek.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);

  return (
    <Screen
      {...header}
      footer={
        <Stack>
          <Button size="large" label="이 계획으로 시작" loading={confirm.isPending} onPress={() => confirm.mutate()} />
          <Button variant="text" label="새 목표 설정" disabled={confirm.isPending} onPress={() => void startNewGoal()} />
        </Stack>
      }
    >
      <Stack gap={6}>
        <Stack gap={1}>
          <Heading level={2}>{`목표: ${PLAN_FOCUS_LABELS[option.focus ?? 'habit']}`}</Heading>
          <Text variant="supporting" tone="secondary">{`유지 계획 · ${option.totalWeeks}주 동안 훈련량을 늘리지 않아요`}</Text>
        </Stack>
        <Stack direction="row" gap={2}>
          <StatTile value={`${option.totalWeeks}주`} label="기간" />
          <StatTile value={`주 ${firstWeek.length}회`} label="훈련" />
          {timeBased ? (
            <StatTile value={`${firstWeek[0]?.runIntervalMin ?? 0}분`} label="한 번에 달리는 시간" />
          ) : (
            <StatTile value={formatKm(firstWeekKm)} label="첫 주 거리" />
          )}
        </Stack>
        <Stack gap={3}>
          <Heading level={2}>첫 주 일정</Heading>
          <SessionList>
            {firstWeek.map((session) => (
              <SessionRow key={`${session.date}-${session.type}`} session={session} showDate />
            ))}
          </SessionList>
        </Stack>
      </Stack>
    </Screen>
  );
}
