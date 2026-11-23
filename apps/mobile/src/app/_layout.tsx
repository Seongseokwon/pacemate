import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { initMonitoring } from '@/monitoring';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/api/query-client';
// 첫 화면이 내 상태를 묻기 전에 액세스 토큰을 주는 함수를 등록한다
import '@/auth/session';
import { Toast, useTheme } from '@/ui';

initMonitoring();

function RootLayout() {
  const t = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.color.background.body } }} />
      <Toast />
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
