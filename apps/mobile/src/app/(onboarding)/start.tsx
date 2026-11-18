import { advance } from '@/first-run/store';
import { Button, Heading, Screen, Stack, Text } from '@/ui';

/** 온보딩 시작(F02-R08, UI_UX §6.1). 다음 화면은 시작 경로가 정한다. */
export default function OnboardingStart() {
  return (
    <Screen
      scroll={false}
      footer={
        <Stack>
          <Button size="large" label="시작하기" onPress={() => void advance('onboardingStarted')} />
          <Button variant="text" label="나중에 할게요" onPress={() => void advance('onboardingDeferred')} />
        </Stack>
      }
    >
      <Stack fill justify="center" gap={3}>
        <Heading>나에게 맞는 훈련 계획을 만들어 볼까요?</Heading>
        <Text tone="secondary">몇 가지 질문에 답하면 돼요. 2분이면 끝나요.</Text>
      </Stack>
    </Screen>
  );
}
