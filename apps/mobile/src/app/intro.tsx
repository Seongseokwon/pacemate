import { useState } from 'react';
import { advance } from '@/first-run/store';
import { Button, Heading, Icon, type IconName, Pager, Screen, Stack, Text } from '@/ui';

// 각 장의 그림과 문구는 Figma에서 정한다(UI_UX §6.1). Figma를 받기 전의 임시 문구다
const PAGES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'run', title: '나에게 맞는 훈련 계획', body: '지금 달리는 정도와 목표에 맞춰 무리하지 않는 계획을 만들어 드려요.' },
  { icon: 'coach', title: '말로 바꾸는 훈련 일정', body: '바쁜 날이 생기면 코치에게 말해 주세요. 바뀐 일정을 보여 드리고, 확인하면 반영해요.' },
  { icon: 'calendar', title: '한눈에 보는 진행 상황', body: '달린 기록을 남기면 이번 주 훈련이 얼마나 남았는지 바로 보여 드려요.' },
];

/** 인트로 3장(F01-R08). 기기마다 처음 한 번만 보여 준다. 다음 화면은 시작 경로가 정한다. */
export default function Intro() {
  const [index, setIndex] = useState(0);
  const last = index === PAGES.length - 1;

  return (
    <Screen
      scroll={false}
      footer={<Button size="large" label={last ? '시작하기' : '다음'} onPress={() => (last ? void advance('introDone') : setIndex(index + 1))} />}
    >
      <Pager
        index={index}
        onIndexChange={setIndex}
        pages={PAGES.map((page) => (
          <Stack key={page.title} align="center" gap={4}>
            <Icon name={page.icon} size="large" tone="accent" />
            <Heading align="center">{page.title}</Heading>
            <Text tone="secondary" align="center">
              {page.body}
            </Text>
          </Stack>
        ))}
      />
    </Screen>
  );
}
