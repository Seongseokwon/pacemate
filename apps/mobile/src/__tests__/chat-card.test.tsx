import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChatCard, Proposal, Usage } from '@pacemate/shared';
import { ApiClientError } from '@/api/client';
import { ChatCardView, type ProposalCardState } from '../chat/chat-card';
import { proposalFailureOf } from '../chat/proposal-failure';
import { session } from '../test-fixtures';

const proposal: Proposal = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'reschedule',
  status: 'pending',
  expiresAt: '2099-01-01T00:00:00Z',
  reasonLine: '여행 일정에 맞췄어요',
  consumesQuota: true,
  changes: [
    { sessionId: '00000000-0000-4000-8000-0000000000a1', action: 'move', before: { date: '2026-11-21', type: 'long', distanceKm: 6, durationMin: null }, after: { date: '2026-11-19', type: 'long', distanceKm: 6, durationMin: null } },
    { sessionId: '00000000-0000-4000-8000-0000000000a2', action: 'skip', before: { date: '2026-11-19', type: 'easy', distanceKm: 4, durationMin: null }, after: null },
  ],
  impact: { weeklyDistanceBeforeKm: 14, weeklyDistanceAfterKm: 10, skippedCount: 1 },
  warnings: [],
  goal: null,
  workout: null,
};
const usage: Usage = { tier: 'free', chat: { used: 2, limit: 5, pool: 'month' }, reschedule: { used: 0, limit: 1, pool: 'month' }, resetsOn: '2026-12-01' };
const callbacks = { onApprove: jest.fn(), onCancel: jest.fn(), onAlternative: jest.fn(), onRetry: jest.fn(), onOpenCalendar: jest.fn() };
const view = (card: ChatCard, state?: ProposalCardState, disabled = false) => (
  <ChatCardView card={card} usage={usage} state={state} disabled={disabled} {...callbacks} />
);
const show = (card: ChatCard, state?: ProposalCardState) => render(view(card, state));
const withProposal = (patch: Partial<Proposal>): ChatCard => ({ type: 'proposal', proposal: { ...proposal, ...patch } });

beforeEach(() => jest.clearAllMocks());

describe('일정 변경 카드 (UI_UX §7.2)', () => {
  test('훈련별 변경 전후, 생략, 영향 요약, 이유, 이용량과 만료 시각을 보여 준다', async () => {
    await show(withProposal({}));
    expect(screen.getByText('일정 변경 제안')).toBeOnTheScreen();
    expect(screen.getByLabelText('길게 달리기 6km, 토 11/21에서 목 11/19')).toBeOnTheScreen();
    expect(screen.getByLabelText('가볍게 달리기 4km, 목 11/19에서 생략')).toBeOnTheScreen();
    expect(screen.getByText('생략')).toBeOnTheScreen();
    expect(screen.getByLabelText('이번 주 거리 14km → 10km')).toBeOnTheScreen();
    expect(screen.getByText('이번 주 훈련이 1회 줄어요')).toBeOnTheScreen();
    expect(screen.getByText('여행 일정에 맞췄어요')).toBeOnTheScreen();
    expect(screen.getByText('AI 일정 변경 0/1회 사용 · 오늘 자정까지')).toBeOnTheScreen();
  });

  test('체험분을 쓰는 동안에는 남은 체험 일정 변경 횟수를 보여 준다', async () => {
    const trial: Usage = { ...usage, reschedule: { used: 1, limit: 3, pool: 'trial' } };
    await render(<ChatCardView card={withProposal({})} usage={trial} disabled={false} {...callbacks} />);
    expect(screen.getByText('체험 일정 변경 2회 남음 · 오늘 자정까지')).toBeOnTheScreen();
  });

  test('차감되지 않는 일정 변경은 횟수를 쓰지 않는다고 알린다', async () => {
    await show(withProposal({ consumesQuota: false }));
    expect(screen.getByText('이번 변경은 횟수를 쓰지 않아요 · 오늘 자정까지')).toBeOnTheScreen();
  });

  test('날짜가 같고 양만 바뀌면 바뀐 양을 보여 준다', async () => {
    await show(withProposal({ changes: [{ sessionId: null, action: 'modify', before: { date: '2026-11-20', type: 'long', distanceKm: 12, durationMin: null }, after: { date: '2026-11-20', type: 'easy', distanceKm: 6, durationMin: null } }] }));
    expect(screen.getByLabelText('길게 달리기 12km, 금 11/20에서 금 11/20 · 가볍게 달리기 6km')).toBeOnTheScreen();
  });

  test('서버가 문장으로 준 경고는 그대로, 계획 경고 코드는 문구로 보여 준다', async () => {
    await show(withProposal({ warnings: ['거리 합계는 변경 대상 두 주를 합한 값이에요.', 'GOAL_TIME_NOT_CHECKED'] }));
    expect(screen.getByText('거리 합계는 변경 대상 두 주를 합한 값이에요.')).toBeOnTheScreen();
    expect(screen.getByText(/목표 기록이 알맞은지 확인하지 못했어요/)).toBeOnTheScreen();
  });

  test('다른 방법 보기와 적용하기는 각 동작을 호출한다', async () => {
    await show(withProposal({}));
    await fireEvent.press(screen.getByRole('button', { name: '다른 방법 보기' }));
    await fireEvent.press(screen.getByRole('button', { name: '적용하기' }));
    expect(callbacks.onAlternative).toHaveBeenCalledWith(proposal);
    expect(callbacks.onApprove).toHaveBeenCalledWith(proposal);
  });

  test('승인 처리 중에는 두 버튼을 누를 수 없다', async () => {
    await show(withProposal({}), { pending: 'approve' });
    expect(screen.getByRole('button', { name: '적용하기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다른 방법 보기' })).toBeDisabled();
  });

  test('승인되면 적용 문구, 캘린더 이동, 이용량을 보여 준다', async () => {
    await show(withProposal({ status: 'approved' }));
    expect(screen.getByText('적용했어요')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '적용하기' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '캘린더에서 보기' }));
    expect(callbacks.onOpenCalendar).toHaveBeenCalled();
    expect(screen.getByText('AI 일정 변경 0/1회 사용')).toBeOnTheScreen();
  });

  test.each([
    ['cancelled', '취소한 제안이에요'],
    ['superseded', '새 제안으로 바뀌었어요'],
    ['expired', '이 제안은 만료됐어요. 다시 물어봐 주세요'],
  ] as const)('%s 제안은 버튼 없이 "%s"를 보여 준다', async (status, text) => {
    await show(withProposal({ status }));
    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '적용하기' })).toBeNull();
  });

  test('대기 중이어도 만료 시각이 지나면 만료로 보여 준다 (AC-F05-11)', async () => {
    await show(withProposal({ expiresAt: '2020-01-01T00:00:00Z' }));
    expect(screen.getByText('이 제안은 만료됐어요. 다시 물어봐 주세요')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '적용하기' })).toBeNull();
  });
});

describe('승인 실패 (UI_UX §7.2)', () => {
  test('다시 물어봐야 하는 실패는 서버 문구를 보여 주고 버튼을 없앤다 (AC-F05-05)', async () => {
    await show(withProposal({}), { failure: { kind: 'final', message: '계획이 바뀌었어요. 다시 요청해 주세요.' } });
    expect(screen.getByText('계획이 바뀌었어요. 다시 요청해 주세요.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '적용하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });

  test('일시적 실패는 다시 시도를 둔다', async () => {
    await show(withProposal({}), { failure: { kind: 'retry', message: '인터넷 연결을 확인하고 다시 시도해 주세요.' } });
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    expect(callbacks.onRetry).toHaveBeenCalledWith(proposal);
  });

  test('일정 변경 한도를 넘으면 카드는 대기로 두고 아래에 한도 안내를 붙인다', async () => {
    await show(withProposal({}), { failure: { kind: 'limit', resetsOn: '2026-12-01' } });
    expect(screen.getByRole('button', { name: '적용하기' })).toBeEnabled();
    expect(screen.getByText('이번 달 AI 일정 변경을 모두 썼어요')).toBeOnTheScreen();
    expect(screen.getByText('12월 1일 (화)에 다시 쓸 수 있어요.')).toBeOnTheScreen();
  });

  test.each([
    ['PROPOSAL_EXPIRED', 'expired'],
    ['PROPOSAL_NOT_PENDING', 'not_pending'],
    ['LIMIT_REACHED', 'limit'],
    ['PLAN_CHANGED', 'final'],
    ['TARGET_CHANGED', 'final'],
    ['SAFETY_CHECK_FAILED', 'final'],
    ['NETWORK_ERROR', 'retry'],
    ['INTERNAL_ERROR', 'retry'],
  ] as const)('%s 오류는 %s로 처리한다', (code, kind) => {
    expect(proposalFailureOf(new ApiClientError(code, '문장')).kind).toBe(kind);
  });
});

describe('목표 변경과 기록 등록 카드', () => {
  test('목표 변경은 전후 목표, 바뀌는 훈련 수, 첫 주 구성을 보여 주고 취소할 수 있다', async () => {
    await show(
      withProposal({
        type: 'goal_change',
        reasonLine: null,
        consumesQuota: false,
        impact: null,
        goal: { before: { goalDistance: 'five_k', goalTimeSec: null, raceDate: null }, after: { goalDistance: 'ten_k', goalTimeSec: 3600, raceDate: '2027-03-01' } },
        changes: [
          { sessionId: '00000000-0000-4000-8000-0000000000b1', action: 'remove', before: { date: '2026-11-21', type: 'easy', distanceKm: 5, durationMin: null }, after: null },
          { sessionId: null, action: 'add', before: null, after: { date: '2026-11-24', type: 'easy', distanceKm: 5, durationMin: null } },
          { sessionId: null, action: 'add', before: null, after: { date: '2026-11-26', type: 'long', distanceKm: 8, durationMin: null } },
          { sessionId: null, action: 'add', before: null, after: { date: '2026-12-01', type: 'easy', distanceKm: 5, durationMin: null } },
        ],
      }),
    );
    expect(screen.getByLabelText('목표 5km → 10km · 목표 1시간')).toBeOnTheScreen();
    expect(screen.getByLabelText('대회 날짜 없음 → 월 3/1')).toBeOnTheScreen();
    expect(screen.getByText('남은 훈련 1개를 새 훈련 3개로 바꿔요.')).toBeOnTheScreen();
    expect(screen.getByLabelText('새 계획 첫 주 2회 · 13km')).toBeOnTheScreen();
    expect(screen.getByText('오늘 자정까지')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(callbacks.onCancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '이 계획으로 시작' })).toBeOnTheScreen();
  });

  test('기록 등록은 날짜, 거리, 시간, 페이스, 연결할 훈련을 보여 주고 이용량은 보여 주지 않는다', async () => {
    await show(
      withProposal({
        type: 'workout_log',
        reasonLine: null,
        consumesQuota: false,
        changes: [],
        impact: null,
        workout: {
          date: '2026-11-19',
          distanceKm: 5,
          durationSec: 1830,
          paceSecPerKm: 366,
          condition: null,
          rpe: null,
          memo: null,
          plannedSessionId: '00000000-0000-4000-8000-0000000000c1',
          plannedSession: { date: '2026-11-19', type: 'easy', distanceKm: 5, durationMin: null },
        },
      }),
    );
    expect(screen.getByText('기록 확인')).toBeOnTheScreen();
    expect(screen.getByLabelText('날짜 11월 19일 (목)')).toBeOnTheScreen();
    expect(screen.getByLabelText('시간 30분 30초')).toBeOnTheScreen();
    expect(screen.getByLabelText(`페이스 6'06"/km`)).toBeOnTheScreen();
    expect(screen.getByLabelText('연결할 훈련 목 11/19 가볍게 달리기 5km')).toBeOnTheScreen();
    expect(screen.getByText('오늘 자정까지')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '기록 저장' })).toBeOnTheScreen();
  });
});

describe('요약·한도·결과 카드', () => {
  test('기간의 훈련 일정을 날짜와 함께 보여 준다', async () => {
    await show({ type: 'plan_summary', data: { from: '2026-11-16', to: '2026-11-22', sessions: [session({ date: '2026-11-17' })] } });
    expect(screen.getByText('월 11/16 ~ 일 11/22 훈련 일정')).toBeOnTheScreen();
    expect(screen.getByText('5km · 화 11/17')).toBeOnTheScreen();
  });

  test('주간 요약은 완료 횟수, 거리, 다음 훈련을 보여 준다', async () => {
    await show({ type: 'weekly_summary', data: { weekStart: '2026-11-16', plannedCount: 3, completedCount: 1, totalDistanceKm: 5, completionRate: 1 / 3, nextSession: session({ date: '2026-11-19', type: 'long', distanceKm: 10 }) } });
    expect(screen.getByLabelText('완료한 훈련 1/3회')).toBeOnTheScreen();
    expect(screen.getByLabelText('달린 거리 5km')).toBeOnTheScreen();
    expect(screen.getByLabelText('다음 훈련 목 11/19 길게 달리기 10km')).toBeOnTheScreen();
  });

  test('대화 한도 카드는 초기화 날짜와 계속 쓸 수 있는 기능을 알린다', async () => {
    await show({ type: 'limit', data: { resetsOn: '2026-12-01' } });
    expect(screen.getByText('이번 달 AI 대화를 모두 썼어요')).toBeOnTheScreen();
    expect(screen.getByText('캘린더와 기록은 계속 쓸 수 있어요.')).toBeOnTheScreen();
  });

  test('결과 카드는 따로 그리지 않는다', async () => {
    await show({ type: 'result', data: { proposalType: 'reschedule' } });
    expect(screen.toJSON()).toBeNull();
  });
});
