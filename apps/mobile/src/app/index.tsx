import { Redirect } from 'expo-router';

// 로그인·온보딩 상태에 따른 분기는 T-106, T-107에서 넣는다(GET /v1/me)
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
