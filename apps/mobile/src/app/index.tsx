import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { getMe, ME_KEY } from '@/api/me';
import { isRedirectError } from '@/api/query-client';
import { firstRunRoute } from '@/first-run/flow';
import { FIRST_RUN_KEY, loadFirstRun } from '@/first-run/store';
import { Screen } from '@/ui';

/**
 * 앱 시작 경로. 첫 실행 흐름의 화면은 끝나면 여기로 돌아오고, 다음 화면은 여기서만 정한다(PRD §5.1, F01-R09).
 * 인트로를 보기 전에는 내 상태를 조회하지 않는다. 로그인 전이라 `401`이 인트로를 건너뛰고 로그인으로 보내기 때문이다.
 */
export default function Index() {
  const state = useQuery({ queryKey: FIRST_RUN_KEY, queryFn: loadFirstRun, staleTime: Infinity });
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe, enabled: state.data?.introSeen === true });

  if (!state.data) return <Screen loading />;
  // 앞 화면에서 바뀐 서버 상태를 반영하도록, 다시 받아 오는 동안에는 이전 값으로 정하지 않는다
  const route = firstRunRoute(state.data, me.data && !me.isFetching ? me.data : null);
  if (route) return <Redirect href={route} />;
  // 로그인·동의·업데이트 화면으로 보내는 오류는 옮겨 가는 동안 로딩만 보여 준다
  if (me.isError && !me.isFetching && !isRedirectError(me.error)) {
    return <Screen error={me.error.message} onRetry={() => void me.refetch()} />;
  }
  return <Screen loading />;
}
