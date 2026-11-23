import type { AuthProvider } from '@pacemate/shared';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { signIn } from '@/auth/session';
import { Button, Heading, Screen, showToast, Stack, Text } from '@/ui';

/** 로그인(PRD §5.2, UI_UX §6.1). Apple 로그인은 Apple 개발자 계정 등록 뒤에 연결한다(`T-106`). */
export default function Login() {
  const [pending, setPending] = useState<AuthProvider | null>(null);

  const start = async (provider: AuthProvider) => {
    setPending(provider);
    try {
      // 로그인 창을 닫았으면 안내 없이 로그인 화면에 남는다
      if (await signIn(provider)) router.replace('/');
    } catch {
      showToast('로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPending(null);
    }
  };

  return (
    <Screen
      scroll={false}
      footer={
        <Stack>
          <Button size="large" label="Apple로 계속하기" loading={pending === 'apple'} disabled={pending !== null} onPress={() => void start('apple')} />
          <Button
            size="large"
            variant="secondary"
            label="Google 계정으로 계속하기"
            loading={pending === 'google'}
            disabled={pending !== null}
            onPress={() => void start('google')}
          />
        </Stack>
      }
    >
      <Stack fill justify="center" align="center">
        <Heading>{Constants.expoConfig?.name ?? ''}</Heading>
        <Text tone="secondary" align="center">
          대화로 훈련 계획을 관리하는 러닝 매니저
        </Text>
      </Stack>
    </Screen>
  );
}
