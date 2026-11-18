import type { ProposalFailureCode, ProposalReason, ProposalType, ProposeRescheduleInput } from '@pacemate/shared';
import { mondayOf } from '../common/dates.js';

// 제안 카드의 이유 한 줄과 결과 메시지는 서버의 템플릿이다. LLM의 문장을 쓰지 않는다(F05-R03, PRD §6.1).

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** `11/20(금)` */
export const shortDate = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`);
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()}(${WEEKDAYS[value.getUTCDay()]})`;
};

const PREFIX: Record<ProposalReason, string> = {
  schedule: '일정에 맞춰',
  fatigue: '피곤하다고 하셔서',
  pain: '몸이 불편하다고 하셔서',
};

/** 사유와 요청 내용으로 만든 이유 한 줄 */
export function reasonLineOf(input: ProposeRescheduleInput, today: string): string {
  const prefix = PREFIX[input.reason];
  switch (input.changeType) {
    case 'move':
      return `${prefix} ${shortDate(input.targetDate!)}로 옮겼어요`;
    case 'ease':
      return input.easeOption === 'rest' ? `${prefix} 그날 훈련은 쉬도록 바꿨어요` : `${prefix} 그날 훈련을 가볍게 줄였어요`;
    case 'unavailable_dates': {
      const dates = [...input.unavailableDates!].sort();
      const first = dates[0]!;
      const last = dates[dates.length - 1]!;
      const range = first === last ? shortDate(first) : `${shortDate(first)}~${shortDate(last)}`;
      return `${prefix} 운동할 수 없는 날(${range})을 피했어요`;
    }
    case 'reduce_count': {
      const week = input.weekStart === mondayOf(today) ? '이번 주' : '다음 주';
      return input.maxSessions === 0 ? `${prefix} ${week} 남은 훈련은 쉬도록 바꿨어요` : `${prefix} ${week} 남은 훈련을 ${input.maxSessions}번으로 줄였어요`;
    }
  }
}

/** 제안을 만들 수 없을 때 LLM에 돌려주는 설명(API_SPEC §6) */
export const FAILURE_MESSAGES: Record<ProposalFailureCode, string> = {
  NO_ACTIVE_PLAN: '진행 중인 계획이 없어요.',
  TARGET_NOT_CHANGEABLE: '이미 끝났거나 지난 훈련은 바꿀 수 없어요.',
  OUT_OF_WEEK: '훈련은 같은 주 안에서만 옮길 수 있어요.',
  OUT_OF_RANGE: '이번 주와 다음 주의 일정만 바꿀 수 있어요.',
  RECENT_DISTANCE_REQUIRED: '최근 기록이 충분하지 않아요. 요즘 일주일에 얼마나 달리는지 알려 주세요.',
  RACE_DAY_FIXED: '대회 날짜의 일정은 바꿀 수 없어요.',
  PERIOD_TOO_LONG: '운동할 수 없는 기간은 14일까지만 반영할 수 있어요.',
  NO_SAFE_OPTION: '안전하게 바꿀 방법을 찾지 못했어요.',
  NOTHING_TO_CHANGE: '그 기간에는 바꿀 훈련이 없어요.',
  SESSION_ALREADY_COMPLETED: '이미 기록이 연결된 훈련이에요.',
  WORKOUT_DUPLICATE: '같은 운동 기록이 이미 있어요.',
  INVALID_VALUE: '입력한 값을 확인해 주세요.',
};

/** 승인 뒤 대화에 추가하는 결과 메시지 */
export const RESULT_MESSAGES: Record<ProposalType, string> = {
  reschedule: '일정을 바꿨어요. 홈과 캘린더에 반영했어요.',
  goal_change: '새 목표로 계획을 다시 만들었어요. 홈과 캘린더에 반영했어요.',
  workout_log: '운동 기록을 저장했어요.',
};

/** 승인할 수 없을 때의 안내(PRD §6.4) */
export const APPROVE_ERRORS = {
  notFound: '제안을 찾을 수 없어요.',
  expired: '이 제안은 만료됐어요. 다시 물어봐 주세요.',
  notPending: '더 이상 유효하지 않은 제안이에요.',
  planChanged: '그 사이 일정이 바뀌었어요. 다시 요청해 주세요.',
  targetChanged: '그 사이 일정이 바뀌었어요. 다시 요청해 주세요.',
  safety: '지금은 이 변경을 안전하게 적용할 수 없어요. 다시 요청해 주세요.',
  limit: '이번 달 AI 일정 변경 횟수를 모두 썼어요.',
} as const;
