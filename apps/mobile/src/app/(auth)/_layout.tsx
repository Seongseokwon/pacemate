import { Stack } from 'expo-router';

/** 로그인 전 화면 묶음: 로그인, 동의 (PRD §5.2) */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
