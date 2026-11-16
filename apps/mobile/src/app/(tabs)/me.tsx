import { router } from 'expo-router';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { Button } from '@/ui';

export default function Me() {
  return (
    <PlaceholderScreen title="마이">
      {/* 공통 컴포넌트를 기기에서 확인하는 개발용 입구. 마이페이지를 만드는 T-503에서 옮기거나 지운다 */}
      {__DEV__ && <Button variant="secondary" label="컴포넌트 예시" onPress={() => router.push('/ui-gallery')} />}
      {/* 마이페이지의 목록은 T-503에서 만든다. 그때 이 버튼을 목록의 마지막 줄로 옮긴다 */}
      <Button variant="text" label="계정 삭제" onPress={() => router.push('/delete-account')} />
    </PlaceholderScreen>
  );
}
