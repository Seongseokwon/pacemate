import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChatCard, Proposal } from '@pacemate/shared';
import { ChatCardView } from '../chat/chat-card';
import { session } from '../test-fixtures';

const proposal: Proposal = { id: '00000000-0000-4000-8000-000000000001', type: 'reschedule', status: 'pending', expiresAt: '2099-01-01T00:00:00Z', reasonLine: '여행 일정에 맞췄어요', consumesQuota: true, changes: [], impact: null, warnings: [], goal: null, workout: null };
const callbacks = { onApprove: jest.fn(), onCancel: jest.fn(), onAlternative: jest.fn() };
const show = (card: ChatCard) => render(<ChatCardView card={card} busy={false} {...callbacks} />);

test('일정 변경 제안에서 다른 방법과 적용 버튼은 각 동작을 호출한다', async () => {
  await show({ type: 'proposal', proposal });
  await fireEvent.press(screen.getByRole('button', { name: '다른 방법 보기' }));
  await fireEvent.press(screen.getByRole('button', { name: '적용하기' }));
  expect(callbacks.onAlternative).toHaveBeenCalledWith(proposal);
  expect(callbacks.onApprove).toHaveBeenCalledWith(proposal);
});

test('만료된 제안은 승인 버튼 대신 만료 문구를 보여 준다', async () => {
  await show({ type: 'proposal', proposal: { ...proposal, status: 'expired' } });
  expect(screen.getByText('이 제안은 만료됐어요. 다시 물어봐 주세요')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '적용하기' })).toBeNull();
});

test('목표와 기록 제안의 취소 및 승인 버튼을 표시한다', async () => {
  const view = await show({ type: 'proposal', proposal: { ...proposal, type: 'goal_change' } });
  expect(screen.getByRole('button', { name: '이 계획으로 시작' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '취소' }));
  expect(callbacks.onCancel).toHaveBeenCalled();
  await view.rerender(<ChatCardView card={{ type: 'proposal', proposal: { ...proposal, type: 'workout_log' } }} busy={false} {...callbacks} />);
  expect(screen.getByRole('button', { name: '기록 저장' })).toBeOnTheScreen();
});

test('일정, 주간 요약, 한도, 결과 카드를 구분한다', async () => {
  const view = await show({ type: 'plan_summary', data: { from: '2026-11-16', to: '2026-11-22', sessions: [session()] } });
  expect(screen.getByText('훈련 일정')).toBeOnTheScreen();
  await view.rerender(<ChatCardView card={{ type: 'weekly_summary', data: { weekStart: '2026-11-16', plannedCount: 3, completedCount: 1, totalDistanceKm: 5, completionRate: 1 / 3, nextSession: null } }} busy={false} {...callbacks} />);
  expect(screen.getByText('주간 요약')).toBeOnTheScreen();
  await view.rerender(<ChatCardView card={{ type: 'limit', data: { resetsOn: '2026-12-01' } }} busy={false} {...callbacks} />);
  expect(screen.getByText('이번 달 AI 대화를 모두 썼어요')).toBeOnTheScreen();
  await view.rerender(<ChatCardView card={{ type: 'result', data: { proposalType: 'reschedule' } }} busy={false} {...callbacks} />);
  expect(screen.queryByText('이번 달 AI 대화를 모두 썼어요')).toBeNull();
});
