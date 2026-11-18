import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { advance } from '@/first-run/store';
import { View } from 'react-native';
import { Button, Card, Heading, Icon, Screen, showToast, Stack, StatusDot, Text, useTheme } from '@/ui';

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
          <Button size="large" label="알림 켜기" loading={pending} onPress={() => void allow()} />
          <Button variant="text" label="나중에 할게요" disabled={pending} onPress={() => void advance('notificationsDone')} />
        </Stack>
      }
    >
      <Stack gap={6}>
        <Stack align="center">
          <IconBadge />
        </Stack>
        <Stack gap={3}>
          <Heading>알림을 켜 둘까요?</Heading>
          <Text tone="secondary">훈련이 있는 날과 한 주를 마칠 때 알려 드려요. 훈련을 잊지 않게 챙겨 드릴게요.</Text>
        </Stack>
        {/* C2 시안의 '훈련 전날'·'일정 변경' 알림은 PRD F09-R01에 없어 PRD의 알림 종류로 쓴다 */}
        <Stack gap={3}>
          {KINDS.map((kind) => (
            <Card key={kind.title}>
              <Stack direction="row" align="center" gap={3}>
                <StatusDot tone="info" />
                <Stack fill gap={1}>
                  <Text variant="title3">{kind.title}</Text>
                  <Text variant="supporting" tone="secondary">
                    {kind.body}
                  </Text>
                </Stack>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Screen>
  );
}

const KINDS = [
  { title: '훈련 날 알림', body: '훈련이 있는 날 정한 시각에 알려 드려요' },
  { title: '주간 요약', body: '일요일 저녁에 한 주를 정리해 드려요' },
];

/** 가운데 원 안의 종 아이콘(C2 09) */
function IconBadge() {
  const t = useTheme();
  return (
    <View
      style={{
        width: t.size.avatar.profile,
        height: t.size.avatar.profile,
        borderRadius: t.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.color.background.raised,
      }}
    >
      <Icon name="bell" size="large" tone="accent" />
    </View>
  );
}
