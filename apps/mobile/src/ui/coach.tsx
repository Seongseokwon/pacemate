import { Image, type ImageSourcePropType } from 'react-native';
import bungae from '../../assets/coaches/bungae.png';
import oni from '../../assets/coaches/oni.png';
import suri from '../../assets/coaches/suri.png';
import { type Theme, useTheme } from './theme';

export type CoachId = 'oni' | 'suri' | 'bungae';

// 원형으로 자른 프로필 이미지(§6.10, D-A10). 1·2·3배 파일은 기기가 고른다
const IMAGES: Record<CoachId, ImageSourcePropType> = {
  oni,
  suri,
  bungae,
};

/** 코치 프로필 이미지(§4.3). 꾸밈이라 화면 낭독에서 따로 읽지 않는다. 고른 코치가 없으면 온이다(D-15). */
export function CoachAvatar({ coach = 'oni', size = 'card' }: { coach?: CoachId; size?: keyof Theme['size']['avatar'] }) {
  const t = useTheme();
  const px = t.size.avatar[size];
  return <Image source={IMAGES[coach]} style={{ width: px, height: px, borderRadius: t.radius.full }} accessible={false} importantForAccessibility="no" />;
}
