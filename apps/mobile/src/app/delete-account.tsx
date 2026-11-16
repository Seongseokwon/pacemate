import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { deleteMe } from '@/api/me';
import { isRedirectError } from '@/api/query-client';
import { signOut } from '@/auth/session';
import { Banner, Button, Dialog, Screen, showToast, Stack, Text } from '@/ui';

/** 계정 삭제(F01-R05, UI_UX §6.7). 지워지는 내용과 구독 해지 안내를 보여 준 뒤 한 번 더 확인한다. */
export default function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: deleteMe,
    onSuccess: async () => {
      await signOut();
      router.replace('/login');
    },
    onError: (error) => {
      if (!isRedirectError(error)) showToast('계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
    },
  });

  return (
    <Screen
      title="계정 삭제"
      onBack={() => router.back()}
      footer={<Button size="large" variant="danger" label="계정 삭제" loading={remove.isPending} onPress={() => setConfirming(true)} />}
    >
      <Stack>
        <Text>계정을 삭제하면 아래 내용이 모두 지워지고 되돌릴 수 없어요.</Text>
        <Text tone="secondary">{'· 러닝 프로필과 목표\n· 훈련 계획과 변경 내역\n· 운동 기록\n· AI 코치와 나눈 대화'}</Text>
        <Banner status="warning">구독은 함께 해지되지 않아요. 구독 중이라면 스토어의 구독 관리에서 따로 해지해 주세요.</Banner>
      </Stack>
      <Dialog
        visible={confirming}
        danger
        title="계정을 삭제할까요?"
        message="삭제한 데이터는 되돌릴 수 없어요."
        confirmLabel="삭제"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          remove.mutate();
        }}
      />
    </Screen>
  );
}
