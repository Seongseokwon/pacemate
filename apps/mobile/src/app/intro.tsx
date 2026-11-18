import { useState } from 'react';
import { advance } from '@/first-run/store';
import { Button, Heading, Illustration, type IllustrationName, Pager, Screen, Stack, Text } from '@/ui';

// 각 장의 그림과 문구는 Figma에서 정한다(UI_UX §6.1). C2 02a~02c의 문구다
const PAGES: { illustration: IllustrationName; title: string; body: string }[] = [
  { illustration: 'plan', title: '나에게 꼭 맞는 계획', body: '지금 실력에서 시작해요.\n달리기 경험과 생활 패턴에 맞춰 계획을 짜 드려요.' },
  { illustration: 'chat', title: '채팅으로 일정 조정', body: '갑자기 출장이 잡혀도 괜찮아요.\n코치에게 말하면 일정을 다시 맞춰 드려요.' },
  { illustration: 'progress', title: '다치지 않고 꾸준히', body: '무리하지 않고 조금씩 늘려 가요.\n오래 즐겁게 달리는 게 목표예요.' },
];

/** 인트로 3장(F01-R08). 기기마다 처음 한 번만 보여 준다. 다음 화면은 시작 경로가 정한다. */
export default function Intro() {
  const [index, setIndex] = useState(0);
  const last = index === PAGES.length - 1;

  return (
    <Screen
      scroll={false}
      footer={
        // C2: 앞 두 장은 글자 버튼 [다음], 마지막 장은 주 버튼 [시작하기]
        last ? (
          <Button size="large" label="시작하기" onPress={() => void advance('introDone')} />
        ) : (
          <Button size="large" variant="text" label="다음" onPress={() => setIndex(index + 1)} />
        )
      }
    >
      <Pager
        index={index}
        onIndexChange={setIndex}
        pages={PAGES.map((page) => (
          <Stack key={page.title} gap={6}>
            <Illustration name={page.illustration} />
            <Stack gap={3}>
              <Heading>{page.title}</Heading>
              <Text tone="secondary">{page.body}</Text>
            </Stack>
          </Stack>
        ))}
      />
    </Screen>
  );
}
