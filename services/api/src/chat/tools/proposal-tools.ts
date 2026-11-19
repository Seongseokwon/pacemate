import {
  PLAN_WARNING_LABELS,
  planWarningSchema,
  proposeGoalChangeInputSchema,
  proposeRescheduleInputSchema,
  proposeWorkoutLogInputSchema,
  SESSION_TYPE_LABELS,
  type Proposal,
  type SessionSnapshot,
} from '@pacemate/shared';
import { addDays } from '../../common/dates.js';
import { today } from '../../common/today.js';
import type { CreateGuard, CreateResult, ProposalService } from '../../proposal/proposal.service.js';
import { defineTool, type ToolContext, type ToolResult } from './tool.js';

// 제안 도구 3개(API_SPEC §6). 대기 상태 제안을 만드는 것까지만 한다. 실제 변경은 사용자가 카드에서 승인할 때만 일어난다(PRD §6.1).
// 훈련의 거리·강도는 입력에 없다. Training Engine이 정한 값을 결과로 돌려준다(AI-03).

/** 목표 변경 요약에 넣을 새 훈련의 기간. 계획 전체를 넣으면 길어서 가까운 2주만 보여 준다 */
const GOAL_CHANGE_PREVIEW_DAYS = 14;

const snapshot = (value: SessionSnapshot | null) => value && { ...value, typeName: SESSION_TYPE_LABELS[value.type].name };

/** 경고 코드는 문구로 바꾼다. 일정 변경의 경고는 이미 문장이다 */
const warningText = (warning: string) => {
  const code = planWarningSchema.safeParse(warning);
  return code.success ? PLAN_WARNING_LABELS[code.data] : warning;
};

/** 저장된 제안을 LLM이 설명할 수 있는 형태로 줄인다. 카드는 저장된 제안으로 그리므로 여기 값은 설명용이다(PRD §6.1) */
export function proposalSummaryOf(proposal: Proposal, date: string) {
  const warnings = proposal.warnings.map(warningText);
  switch (proposal.type) {
    case 'reschedule':
      return {
        type: proposal.type,
        reasonLine: proposal.reasonLine,
        changes: proposal.changes.map((change) => ({ sessionId: change.sessionId, action: change.action, before: snapshot(change.before), after: snapshot(change.after) })),
        impact: proposal.impact,
        warnings,
        consumesQuota: proposal.consumesQuota,
      };
    case 'goal_change': {
      const until = addDays(date, GOAL_CHANGE_PREVIEW_DAYS - 1);
      const added = proposal.changes.flatMap((change) => (change.action === 'add' && change.after ? [change.after] : []));
      return {
        type: proposal.type,
        goal: proposal.goal,
        removedSessionCount: proposal.changes.filter((change) => change.action === 'remove').length,
        addedSessionCount: added.length,
        upcomingSessions: added.filter((session) => session.date <= until).map(snapshot),
        warnings,
        consumesQuota: proposal.consumesQuota,
      };
    }
    case 'workout_log':
      return {
        type: proposal.type,
        workout: proposal.workout && { ...proposal.workout, plannedSession: snapshot(proposal.workout.plannedSession) },
      };
  }
}

function toResult(result: CreateResult): ToolResult {
  if (!result.created) return { output: { created: false, reasonCode: result.reasonCode, message: result.message } };
  const { proposal } = result;
  return { output: { created: true, proposalId: proposal.id, summary: proposalSummaryOf(proposal, today()) }, proposalId: proposal.id };
}

export class MessageNotProcessingError extends Error {
  override readonly name = 'MessageNotProcessingError';
}

/** 처리 소유권 확인. 메시지 행을 잠그고 아직 처리 중인지 본다. 오래되어 실패로 바뀐 처리는 제안을 만들거나 새 제안을 대체하지 못한다 */
const guardOf = ({ userId, messageId }: ToolContext): CreateGuard | undefined =>
  messageId === undefined
    ? undefined
    : async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM chat_messages WHERE id = ${messageId}::uuid AND user_id = ${userId}::uuid AND status = 'processing' FOR UPDATE`;
        if (rows.length === 0) throw new MessageNotProcessingError();
      };

const AFTER_CREATED = '만들어지면 카드가 함께 보인다. 아직 바뀐 것이 아니므로 "이렇게 바꿀까요?"처럼 묻고, 카드의 [적용하기]를 누르면 바뀐다고 안내한다.';

export function proposalTools(proposals: ProposalService) {
  const proposeReschedule = defineTool({
    name: 'propose_reschedule',
    description:
      '이번 주와 다음 주의 훈련 일정을 바꾸는 제안을 만든다. 실제로 바뀌지는 않는다. 바꿀 훈련의 거리와 강도는 서버가 정한다. ' +
      'changeType: move(sessionId 훈련을 targetDate로 옮기기, 같은 주 안에서만), unavailable_dates(unavailableDates 날짜를 피하기, 최대 14일), ' +
      'reduce_count(weekStart 주의 남은 훈련을 maxSessions번으로 줄이기), ease(sessionId 훈련을 easeOption에 따라 rest 쉬기 또는 lighter 가볍게). ' +
      'reason: schedule(일정), fatigue(피로), pain(통증). 통증이 심하다고 하면 이 도구를 쓰지 말고 쉬기와 진료를 안내한다. ' +
      AFTER_CREATED,
    inputSchema: proposeRescheduleInputSchema,
    execute: async (context, input) => toResult(await proposals.createReschedule(context.userId, input, guardOf(context))),
  });

  const proposeGoalChange = defineTool({
    name: 'propose_goal_change',
    description:
      '목표(goalDistance, goalTimeSec 초 단위 목표 기록, raceDate 대회 날짜)를 바꾸고 오늘 이후 계획을 다시 짜는 제안을 만든다. 바꿀 값만 넣는다. ' +
      'null은 값을 지운다. goalDistance를 none으로 바꾸면 goalTimeSec과 raceDate도 null로 넣는다. ' +
      'RECENT_DISTANCE_REQUIRED를 받으면 "요즘 일주일에 얼마나 달려요?"를 묻고, 그 답(km)을 recentWeeklyKm에 넣어 다시 호출한다. 그 밖에는 recentWeeklyKm을 넣지 않는다. ' +
      AFTER_CREATED,
    inputSchema: proposeGoalChangeInputSchema,
    execute: async (context, input) => toResult(await proposals.createGoalChangeFromChat(context.userId, input, guardOf(context))),
  });

  const proposeWorkoutLog = defineTool({
    name: 'propose_workout_log',
    description:
      '사용자가 말한 운동을 기록으로 저장하는 확인 카드를 만든다. 저장은 사용자가 카드에서 승인할 때 된다. ' +
      'date(YYYY-MM-DD), distanceKm, durationSec(초)는 꼭 넣는다. rpe(운동 강도 1~10)는 사용자가 말했을 때만, memo에는 사용자가 말한 통증 내용만 넣는다. ' +
      'sessionId는 그날 계획된 훈련과 연결할 때 get_training_plan에서 얻은 값을 넣는다.',
    inputSchema: proposeWorkoutLogInputSchema,
    execute: async (context, input) => toResult(await proposals.createWorkoutLog(context.userId, input, guardOf(context))),
  });

  return [proposeReschedule, proposeGoalChange, proposeWorkoutLog];
}
