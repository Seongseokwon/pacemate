import { Platform } from 'react-native';

/**
 * 스토어의 앱 페이지 주소. 스토어에 앱을 등록해야 정해지므로 환경 변수로 받는다(개발 계획 D-A6).
 * 아직 없으면 undefined다.
 */
export const storeUrl = (): string | undefined =>
  (Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_IOS_STORE_URL : process.env.EXPO_PUBLIC_ANDROID_STORE_URL) || undefined;
