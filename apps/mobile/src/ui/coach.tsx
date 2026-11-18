import { COACH_LABELS, type Coach } from '@pacemate/shared';
import { Image, type ImageSourcePropType } from 'react-native';
import bungae from '../../assets/coaches/bungae.png';
import oni from '../../assets/coaches/oni.png';
import suri from '../../assets/coaches/suri.png';
import { Chip } from './feedback';
import { SelectableCard, Stack } from './layout';
import { Text } from './text';
import { type Theme, useTheme } from './theme';

export type CoachId = Coach;

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

/**
 * 코치 고르기의 카드 한 장(§4.3, §6.10, C2 08d): 프로필 이미지, 이름, 한 줄 소개, 말투 소개 문장, 말투 표시.
 * 화면 낭독은 "온이, 다정한 러닝 친구, 선택됨"처럼 한 덩어리로 읽는다. `current`는 지금 쓰는 코치다(C2 13f의 "사용 중").
 */
export function CoachSelectCard({ coach, selected, current = false, onPress }: { coach: CoachId; selected: boolean; current?: boolean; onPress: () => void }) {
  const label = COACH_LABELS[coach];
  return (
    <SelectableCard
      selected={selected}
      onPress={onPress}
      accessibilityLabel={[label.name, label.intro, current ? '사용 중' : null].filter(Boolean).join(', ')}
    >
      <Stack gap={3}>
        <Stack direction="row" gap={3}>
          <CoachAvatar coach={coach} size="card" />
          <Stack fill gap={1}>
            <Stack direction="row" align="center" gap={2} wrap>
              <Text variant="title2">{label.name}</Text>
              <Text variant="title3" tone="accent">
                {label.intro}
              </Text>
              {current && <Chip label="사용 중" tone="success" />}
            </Stack>
            <Text variant="supporting" tone="secondary">
              {label.sample}
            </Text>
          </Stack>
        </Stack>
        <Stack direction="row" gap={2} wrap>
          {label.tags.map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </Stack>
      </Stack>
    </SelectableCard>
  );
}
