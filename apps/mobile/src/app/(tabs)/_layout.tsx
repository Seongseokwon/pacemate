import { Tabs } from 'expo-router';

/** 하단 탭 묶음 (PRD §5.1). 아이콘과 색은 T-109에서 넣는다. */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="coach" options={{ title: 'AI 코치' }} />
      <Tabs.Screen name="calendar" options={{ title: '캘린더' }} />
      <Tabs.Screen name="records" options={{ title: '기록' }} />
      <Tabs.Screen name="me" options={{ title: '마이' }} />
    </Tabs>
  );
}
