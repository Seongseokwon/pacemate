import { expect, test } from 'vitest';
import { mergeTurns } from './context-builder.js';

test('같은 쪽의 연이은 메시지를 합치고, 사용자 메시지로 시작한다', () => {
  expect(
    mergeTurns([
      { role: 'assistant', content: '[앱 알림] 일정을 변경했어요', toolCalls: [] },
      { role: 'user', content: '이번 주 훈련 알려 줘' },
      { role: 'assistant', content: '세 번 있어요.', toolCalls: [] },
      { role: 'assistant', content: '[앱 알림] 일정을 변경했어요', toolCalls: [] },
      { role: 'user', content: '고마워요' },
      { role: 'user', content: '내일은요?' },
    ]),
  ).toEqual([
    { role: 'user', content: '이번 주 훈련 알려 줘' },
    { role: 'assistant', content: '세 번 있어요.\n[앱 알림] 일정을 변경했어요', toolCalls: [] },
    { role: 'user', content: '고마워요\n내일은요?' },
  ]);
});
