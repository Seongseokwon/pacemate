import { router } from 'expo-router';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { Button } from '@/ui';

// 계획 미리보기는 T-205에서 만든다. 목표는 온보딩 답변에 남아 있다(`toGoal`)
export default function PlanPreview() {
  return (
    <PlaceholderScreen title="계획 미리보기">
      <Button variant="secondary" label="홈으로" onPress={() => router.replace('/(tabs)')} />
    </PlaceholderScreen>
  );
}
