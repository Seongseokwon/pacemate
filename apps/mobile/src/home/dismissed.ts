import * as SecureStore from 'expo-secure-store';

// 홈의 어제 훈련 기록 카드에서 [못 했어요]로 닫은 훈련. 훈련 상태는 바꾸지 않고 이 기기에만 남긴다(PRD §5.4)
const KEY = 'dismissed-yesterday';
// 카드는 어제 훈련에만 나오므로 최근 몇 개만 남기면 된다
const KEEP = 10;

export async function loadDismissed(): Promise<string[]> {
  try {
    const saved: unknown = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function dismiss(sessionId: string): Promise<string[]> {
  const next = [sessionId, ...(await loadDismissed()).filter((id) => id !== sessionId)].slice(0, KEEP);
  // 저장하지 못해도 이번에는 닫는다. 앱을 다시 열면 한 번 더 보일 뿐이다
  await SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}
