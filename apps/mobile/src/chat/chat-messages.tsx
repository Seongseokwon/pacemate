import type { ChatMessage } from '@pacemate/shared';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CoachAvatar, type CoachId, Divider, formatDate, Icon, Spinner, Stack, Text, useTheme } from '@/ui';

/** 날짜가 바뀌는 곳의 구분선(UI_UX §7.1) */
export function DateDivider({ date }: { date: string }) {
  return (
    <Stack direction="row" gap={2} align="center">
      <Stack fill>
        <Divider />
      </Stack>
      <Text variant="caption" tone="secondary">
        {formatDate(date)}
      </Text>
      <Stack fill>
        <Divider />
      </Stack>
    </Stack>
  );
}

/** 서버가 만든 결과 메시지. 가운데에 아이콘과 한 줄(UI_UX §4.2 `ChatSystemMessage`) */
export function ChatSystemMessage({ children }: { children: string }) {
  return (
    <Stack direction="row" gap={1} align="center" justify="center">
      <Icon name="check" tone="success" />
      <Text variant="caption" tone="success">
        {children}
      </Text>
    </Stack>
  );
}

/** 사용자 말풍선은 오른쪽, AI 글은 왼쪽에 말풍선 없이 코치 사진과 함께(UI_UX §7.1) */
export function ChatBubble({ message, coach, children }: { message: ChatMessage; coach: CoachId; children?: ReactNode }) {
  const t = useTheme();
  if (message.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', gap: t.spacing[2] }}>
        <View style={{ backgroundColor: t.color.background.muted, borderRadius: t.radius.chat, padding: t.spacing[3] }}>
          <Text>{message.content}</Text>
        </View>
        {children}
      </View>
    );
  }
  return (
    <Stack gap={2}>
      {message.content !== '' && (
        <Stack direction="row" gap={2}>
          <CoachAvatar coach={coach} size="message" />
          <Stack fill>
            <Text>{message.content}</Text>
          </Stack>
        </Stack>
      )}
      {children}
    </Stack>
  );
}

/** 응답을 기다리는 동안의 표시(UI_UX §4.2 `TypingIndicator`) */
export function TypingIndicator({ coach }: { coach: CoachId }) {
  return (
    <Stack direction="row" gap={2} align="center">
      <CoachAvatar coach={coach} size="message" />
      <Spinner />
      <Text tone="secondary">답변을 준비하고 있어요.</Text>
    </Stack>
  );
}
