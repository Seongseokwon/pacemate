import { router } from 'expo-router';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { Button, Text } from '@/ui';

// 기록 입력은 T-302에서 만든다. 받는 값은 `src/navigation/links.ts`의 `recordHref`에 있다
export default function WorkoutNew() {
  return (
    <PlaceholderScreen title="기록 입력">
      <Text tone="secondary">기록 입력 화면은 아직 준비 중이에요.</Text>
      <Button variant="secondary" label="돌아가기" onPress={() => router.back()} />
    </PlaceholderScreen>
  );
}
