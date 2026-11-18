import { COACH_LABELS, DEFAULT_COACH } from '@pacemate/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { getMe, ME_KEY } from '@/api/me';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { Button, CoachAvatar, Icon, List, ListItem, Stack, Text } from '@/ui';

export default function Me() {
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe });
  const coach = me.data?.coach ?? DEFAULT_COACH;

  return (
    <PlaceholderScreen title="마이">
      {/* 마이페이지의 목록은 T-503에서 만든다. AI 코치 줄은 그 목록의 프로필·목표 다음으로 옮긴다(UI_UX §6.7) */}
      <List>
        <ListItem
          title="AI 코치"
          accessibilityLabel={`AI 코치, 지금 코치 ${COACH_LABELS[coach].name}, 코치 바꾸기`}
          onPress={() => router.push('/coach-change')}
          right={
            me.data && (
              <Stack direction="row" align="center" gap={2}>
                <CoachAvatar coach={coach} size="header" />
                <Text tone="secondary">{COACH_LABELS[coach].name}</Text>
                <Icon name="chevron" tone="neutral" />
              </Stack>
            )
          }
        />
      </List>
      {/* 공통 컴포넌트를 기기에서 확인하는 개발용 입구. 마이페이지를 만드는 T-503에서 옮기거나 지운다 */}
      {__DEV__ && <Button variant="secondary" label="컴포넌트 예시" onPress={() => router.push('/ui-gallery')} />}
      {/* 마이페이지의 목록은 T-503에서 만든다. 그때 이 버튼을 목록의 마지막 줄로 옮긴다 */}
      <Button variant="text" label="계정 삭제" onPress={() => router.push('/delete-account')} />
    </PlaceholderScreen>
  );
}
