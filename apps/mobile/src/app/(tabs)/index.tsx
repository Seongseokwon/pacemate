import { useQuery } from '@tanstack/react-query';
import { getHealth } from '@/api/health';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { Text } from '@/ui';

export default function Home() {
  // 앱과 서버의 연결을 확인하는 임시 표시. 홈 화면을 만드는 T-205에서 지운다
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth });

  return (
    <PlaceholderScreen title="홈">
      <Text testID="server-status">
        {health.isPending ? '서버 연결 확인 중' : health.isError ? `서버 연결 실패: ${health.error.message}` : '서버 연결 정상'}
      </Text>
    </PlaceholderScreen>
  );
}
