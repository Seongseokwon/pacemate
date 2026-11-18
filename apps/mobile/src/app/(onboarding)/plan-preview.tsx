import { PLAN_FOCUS_LABELS, PLAN_KIND_LABELS, PLAN_WARNING_LABELS, type PlanKind, type PlanOption } from '@pacemate/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ApiClientError } from '@/api/client';
import { ME_KEY } from '@/api/me';
import { confirmPlan, HOME_KEY, previewPlan } from '@/api/plan';
import { isRedirectError } from '@/api/query-client';
import { advance } from '@/first-run/store';
import { clearDraft, loadDraft, type OnboardingDraft, toGoal } from '@/onboarding/draft';
import {
  Banner,
  Button,
  EmptyState,
  formatMonthDay,
  Heading,
  List,
  Screen,
  SelectableCard,
  SessionRow,
  showToast,
  Spinner,
  Stack,
  StatTile,
  Text,
} from '@/ui';

/** 주당 횟수는 첫 주의 훈련 수로 보여 준다 */
const weeklyCount = (option: PlanOption) => option.sessions.filter((session) => session.weekNumber === 1).length;

/** 계획 미리보기(F03, PRD §5.3, UI_UX §6.2). 확정하면 다음 화면은 시작 경로가 정한다. */
export default function PlanPreview() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [kind, setKind] = useState<PlanKind | null>(null);

  useEffect(() => {
    void loadDraft().then(setDraft);
  }, []);

  const goal = draft && toGoal(draft);
  const preview = useQuery({ queryKey: ['plan-preview', goal], queryFn: () => previewPlan(goal!), enabled: !!goal });

  const finish = async () => {
    await clearDraft();
    await queryClient.invalidateQueries({ queryKey: ME_KEY });
    await queryClient.invalidateQueries({ queryKey: HOME_KEY });
    await advance('planConfirmed');
  };
  const confirm = useMutation({
    mutationFn: (body: Parameters<typeof confirmPlan>[0]) => confirmPlan(body),
    onSuccess: finish,
    onError: (error) => {
      // 연타나 재전송으로 이미 확정된 경우다
      if (error instanceof ApiClientError && error.code === 'PLAN_ALREADY_ACTIVE') return void finish();
      if (!isRedirectError(error)) showToast(error.message);
    },
  });

  const editAnswers = () => router.replace('/(onboarding)');

  if (!draft || (goal && preview.isPending)) {
    return (
      <Screen scroll={false}>
        <Stack fill justify="center" align="center" gap={4}>
          <Spinner size="large" />
          <Text tone="secondary">계획을 만들고 있어요</Text>
        </Stack>
      </Screen>
    );
  }
  if (!goal || preview.isError) {
    const retryable = preview.isError && preview.error instanceof ApiClientError && preview.error.code === 'NETWORK_ERROR';
    return (
      <Screen scroll={false}>
        <Stack fill justify="center">
          <EmptyState
            icon="warning"
            message={preview.error?.message ?? '답변을 다시 확인해 주세요.'}
            actionLabel={retryable ? '다시 시도' : '답변 수정'}
            onAction={retryable ? () => void preview.refetch() : editAnswers}
          />
        </Stack>
      </Screen>
    );
  }

  const options = preview.data!.options;
  const option = options.find((item) => item.kind === kind) ?? options[0]!;
  const firstWeek = option.sessions.filter((session) => session.weekNumber === 1);

  return (
    <Screen
      title="계획 미리보기"
      footer={
        <Stack>
          <Button
            size="large"
            label="이 계획으로 시작"
            loading={confirm.isPending}
            onPress={() => confirm.mutate({ ...goal, kind: option.kind })}
          />
          <Button variant="text" label="답변 수정" disabled={confirm.isPending} onPress={editAnswers} />
        </Stack>
      }
    >
      <Stack gap={6}>
        {options.length > 1 && (
          <Stack>
            {options.map((item) => (
              <SelectableCard
                key={item.kind}
                accessibilityLabel={`${PLAN_KIND_LABELS[item.kind].name}, ${PLAN_KIND_LABELS[item.kind].description}`}
                selected={item.kind === option.kind}
                onPress={() => setKind(item.kind)}
              >
                <Text variant="title3">{PLAN_KIND_LABELS[item.kind].name}</Text>
                <Text variant="supporting" tone="secondary">
                  {PLAN_KIND_LABELS[item.kind].description}
                </Text>
              </SelectableCard>
            ))}
          </Stack>
        )}
        {/* 목표 없음이면 선택 카드와 안내 없이 목표 문구를 쓴다(UI_UX §6.2, F03-R09) */}
        {option.focus ? (
          <Stack gap={1}>
            <Text variant="supporting" tone="secondary">
              {PLAN_KIND_LABELS[option.kind].name}
            </Text>
            <Heading level={2}>{PLAN_FOCUS_LABELS[option.focus]}</Heading>
          </Stack>
        ) : (
          options.length === 1 && <Heading level={2}>{PLAN_KIND_LABELS[option.kind].name}</Heading>
        )}
        <Stack direction="row" gap={2}>
          <StatTile value={`${option.totalWeeks}주`} label="전체 기간" />
          <StatTile value={`주 ${weeklyCount(option)}회`} label="주당 횟수" />
          <StatTile value={formatMonthDay(option.endDate)} label="종료일" />
        </Stack>
        {option.warnings.map((warning) => (
          // 완주 준비 계획을 만들 수 없는 이유는 안내, 목표 기록 경고는 주의로 보여 준다(§6.2)
          <Banner key={warning} status={warning === 'RACE_PREP_NOT_REACHABLE' ? 'info' : 'warning'}>
            {PLAN_WARNING_LABELS[warning]}
          </Banner>
        ))}
        <Stack gap={2}>
          <Heading level={2}>첫 주 일정</Heading>
          <List>
            {firstWeek.map((session) => (
              <SessionRow key={`${session.date}-${session.type}`} session={session} showDate />
            ))}
          </List>
        </Stack>
      </Stack>
    </Screen>
  );
}
