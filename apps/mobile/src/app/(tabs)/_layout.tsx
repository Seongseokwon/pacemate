import { TabBar } from '@/ui';

/** 하단 탭 묶음 (PRD §5.1) */
export default function TabsLayout() {
  return (
    <TabBar
      tabs={[
        { name: 'index', title: '홈', icon: 'home' },
        { name: 'coach', title: 'AI 코치', icon: 'coach' },
        { name: 'calendar', title: '캘린더', icon: 'calendar' },
        { name: 'records', title: '기록', icon: 'record' },
        { name: 'me', title: '마이', icon: 'profile' },
      ]}
    />
  );
}
