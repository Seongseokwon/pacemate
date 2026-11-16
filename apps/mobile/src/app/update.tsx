import * as Linking from 'expo-linking';
import { storeUrl } from '@/api/store';
import { Button, EmptyState, Screen, showToast } from '@/ui';

/** 서버가 이 앱 버전을 더 지원하지 않을 때의 화면(F11-R06, UI_UX §6.9). 닫는 방법이 없다. */
export default function Update() {
  const url = storeUrl();
  return (
    <Screen
      footer={
        url && (
          <Button
            size="large"
            label="업데이트하러 가기"
            onPress={() => {
              Linking.openURL(url).catch(() => showToast('스토어를 열지 못했어요. 스토어에서 직접 업데이트해 주세요.'));
            }}
          />
        )
      }
    >
      <EmptyState icon="info" message={'새 버전이 나왔어요.\n계속 쓰려면 스토어에서 업데이트해 주세요.'} />
    </Screen>
  );
}
