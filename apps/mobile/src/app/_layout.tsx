import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/api/query-client';
import { Toast, useTheme } from '@/ui';

export default function RootLayout() {
  const t = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.color.background.body } }} />
      <Toast />
    </QueryClientProvider>
  );
}
