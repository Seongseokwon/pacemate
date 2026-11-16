import type { ReactNode } from 'react';
import { Screen, Stack } from '@/ui';

/**
 * 아직 만들지 않은 화면의 자리 표시.
 * 화면을 구현하는 작업에서 실제 화면으로 바꾸고, 쓰는 곳이 없어지면 이 파일을 지운다.
 */
export function PlaceholderScreen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Screen title={title}>
      <Stack>{children}</Stack>
    </Screen>
  );
}
