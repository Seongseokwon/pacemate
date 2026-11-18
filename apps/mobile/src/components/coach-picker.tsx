import { type Coach, coachSchema, type MeResponse } from '@pacemate/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ME_KEY, setCoach } from '@/api/me';
import { isRedirectError } from '@/api/query-client';
import { Banner, CoachSelectCard, Stack } from '@/ui';

/**
 * 코치 고르기와 코치 바꾸기가 함께 쓰는 선택과 저장(F04-R11~R13, UI_UX §6.10).
 * 저장에 성공해야만 `onSaved`를 부른다. 실패하면 화면에 남아 오류를 보여 준다.
 */
export function useCoachChoice(initial: Coach | null, onSaved: (coach: Coach) => void | Promise<void>) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Coach | null>(initial);
  const save = useMutation({
    mutationFn: (coach: Coach) => setCoach(coach),
    onSuccess: async ({ coach }) => {
      queryClient.setQueryData<MeResponse>(ME_KEY, (me) => (me ? { ...me, coach } : me));
      await onSaved(coach);
    },
  });
  // 로그인·동의·업데이트 화면으로 보내는 오류는 옮겨 가므로 따로 알리지 않는다
  const failed = save.isError && !isRedirectError(save.error);
  return { selected, select: setSelected, save, failed };
}

export function CoachCards({ selected, current, onSelect }: { selected: Coach | null; current?: Coach; onSelect: (coach: Coach) => void }) {
  return (
    <Stack gap={3}>
      {coachSchema.options.map((coach) => (
        <CoachSelectCard key={coach} coach={coach} selected={coach === selected} current={coach === current} onPress={() => onSelect(coach)} />
      ))}
    </Stack>
  );
}

export function CoachSaveError() {
  return <Banner status="error">코치를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.</Banner>;
}
