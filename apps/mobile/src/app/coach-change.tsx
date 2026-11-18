import { COACH_LABELS, DEFAULT_COACH, type Coach } from '@pacemate/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { getMe, ME_KEY } from '@/api/me';
import { CoachCards, CoachSaveError, useCoachChoice } from '@/components/coach-picker';
import { Button, Screen, showToast, Stack, Text } from '@/ui';

/** 코치 바꾸기(F04-R13, UI_UX §6.7). 마이에서 전체 화면으로 연다. */
export default function CoachChange() {
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe });

  if (!me.data) {
    return <Screen title="코치 바꾸기" onBack={() => router.back()} loading={me.isPending} error={me.error?.message} onRetry={() => void me.refetch()} />;
  }
  return <CoachChangeForm current={me.data.coach ?? DEFAULT_COACH} />;
}

function CoachChangeForm({ current }: { current: Coach }) {
  // 지금 코치가 골라진 상태로 연다
  const { selected, select, save, failed } = useCoachChoice(current, (coach) => {
    showToast(`다음 답변부터 ${COACH_LABELS[coach].name}가 함께해요`);
    router.back();
  });

  return (
    <Screen
      title="코치 바꾸기"
      onBack={() => router.back()}
      footer={
        <Button
          size="large"
          label={failed ? '다시 시도' : '이 코치로 바꾸기'}
          disabled={selected === current}
          loading={save.isPending}
          onPress={() => selected && save.mutate(selected)}
        />
      }
    >
      <Stack gap={6}>
        {failed && <CoachSaveError />}
        <CoachCards selected={selected} current={current} onSelect={select} />
        <Text variant="supporting" tone="secondary">
          {'코치를 바꿔도 훈련 계획과 기록은 그대로예요.\n다음 답변부터 말투만 바뀌어요.'}
        </Text>
      </Stack>
    </Screen>
  );
}
