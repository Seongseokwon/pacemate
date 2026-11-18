import { CoachCards, CoachSaveError, useCoachChoice } from '@/components/coach-picker';
import { advance } from '@/first-run/store';
import { Button, Heading, Screen, Stack, Text } from '@/ui';

/**
 * 코치 고르기(F04-R12, UI_UX §6.10). 계획 미리보기 다음·알림 권한 앞에서 한 번 묻는다.
 * 처음에는 아무것도 골라져 있지 않다. 저장에 성공해야 다음으로 가고, 다음 화면은 시작 경로가 정한다.
 */
export default function CoachSelect() {
  const { selected, select, save, failed } = useCoachChoice(null, () => advance('coachSelected'));

  return (
    <Screen
      footer={
        <Button
          size="large"
          label={failed ? '다시 시도' : '이 코치와 시작하기'}
          disabled={selected === null}
          loading={save.isPending}
          onPress={() => selected && save.mutate(selected)}
        />
      }
    >
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading>어떤 코치와 함께 달릴까요?</Heading>
          <Text tone="secondary">{'말투만 달라지고 훈련 계획과 안전 기준은 같아요.\n마이 > 코치 바꾸기에서 언제든 바꿀 수 있어요.'}</Text>
        </Stack>
        {failed && <CoachSaveError />}
        <CoachCards selected={selected} onSelect={select} />
      </Stack>
    </Screen>
  );
}
