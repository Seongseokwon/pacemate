import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { advance } from '@/first-run/store';
import { Button, Heading, Icon, Screen, showToast, Stack, Text } from '@/ui';

/**
 * 알림 권한(F09-R03). 첫 계획을 확정한 직후에 한 번 묻는다. 허용 여부와 상관없이 다음 화면은 시작 경로가 정한다.
 * 푸시 토큰 등록과 알림 설정은 T-601에서 붙인다.
 */
export default function NotificationPermission() {
  const [pending, setPending] = useState(false);

  const allow = async () => {
    setPending(true);
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      showToast('알림 권한을 요청하지 못했어요. 마이 > 알림 설정에서 다시 켤 수 있어요.');
    } finally {
      setPending(false);
    }
    await advance('notificationsDone');
  };

  return (
    <Screen
      scroll={false}
      footer={
        <Stack>
          <Button size="large" label="알림 받기" loading={pending} onPress={() => void allow()} />
          <Button variant="text" label="나중에 할게요" disabled={pending} onPress={() => void advance('notificationsDone')} />
        </Stack>
      }
    >
      <Stack fill justify="center" gap={3}>
        <Icon name="bell" size="large" tone="accent" />
        <Heading>훈련 날을 알려 드릴까요?</Heading>
        <Text tone="secondary">훈련이 있는 날과 한 주를 마칠 때 알림을 보내 드려요. 알림 설정은 언제든 바꿀 수 있어요.</Text>
      </Stack>
    </Screen>
  );
}
