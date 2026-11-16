import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { getMe, ME_KEY, nextRoute } from '@/api/me';
import { isRedirectError } from '@/api/query-client';
import { Screen } from '@/ui';

/** 앱을 열면 내 상태를 조회해 갈 화면을 정한다(PRD §5.1, API_SPEC §3.1). */
export default function Index() {
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe });

  if (me.data) return <Redirect href={nextRoute(me.data)} />;
  // 로그인·동의·업데이트 화면으로 보내는 오류는 옮겨 가는 동안 로딩만 보여 준다
  if (me.isError && !isRedirectError(me.error)) return <Screen error={me.error.message} onRetry={() => void me.refetch()} />;
  return <Screen loading />;
}
