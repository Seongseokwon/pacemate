import { useQuery } from '@tanstack/react-query';
import { getHealth } from '@/api/health';
import { getMe, ME_KEY } from '@/api/me';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { advance } from '@/first-run/store';
import { ClickableCard, Text } from '@/ui';

export default function Home() {
  // 앱과 서버의 연결을 확인하는 임시 표시. 홈 화면을 만드는 T-205에서 지운다
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth });
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe });

  return (
    <PlaceholderScreen title="홈">
      {me.data && !me.data.hasActivePlan && (
        <ClickableCard accessibilityLabel="나에게 맞는 훈련 계획을 만들어 보세요" onPress={() => void advance('onboardingStarted')}>
          <Text variant="title3">나에게 맞는 훈련 계획을 만들어 보세요</Text>
        </ClickableCard>
      )}
      <Text testID="server-status">
        {health.isPending ? '서버 연결 확인 중' : health.isError ? `서버 연결 실패: ${health.error.message}` : '서버 연결 정상'}
      </Text>
    </PlaceholderScreen>
  );
}
