import { PLAN_LIMITS, type Usage } from '@pacemate/shared';

type Counter = Usage['chat'];

const remaining = (c: Counter) => Math.max(0, c.limit - c.used);

/** AI 대화 이용량(F10-R07). AI 코치와 마이페이지가 같은 문구를 쓴다(AC-F10-08). */
export const chatUsageLabel = (c: Counter): string => (c.pool === 'trial' ? `체험 대화 ${remaining(c)}회 남음` : `이번 달 ${c.used}/${c.limit}`);

/** 차감되는 제안 아래의 AI 일정 변경 이용량(UI_UX §7.2 규칙 5). */
export const rescheduleUsageLabel = (c: Counter): string =>
  c.pool === 'trial' ? `체험 일정 변경 ${remaining(c)}회 남음` : `AI 일정 변경 ${c.used}/${c.limit}회 사용`;

/** 마지막 체험 대화를 쓴 응답 아래의 한 줄 안내(UI_UX §7.3). 숫자는 한도 설정값에서 가져온다. */
export const TRIAL_EXHAUSTED_MESSAGE = `체험 대화를 모두 썼어요. 이제부터는 매달 ${PLAN_LIMITS.free.chat}회를 쓸 수 있어요.`;

/** 이번 응답으로 체험 대화를 다 썼는지. 이용량의 `pool`이 체험분에서 월 한도로 바뀐 것을 본다. */
export const trialJustExhausted = (before: Usage | undefined, after: Usage): boolean => before?.chat.pool === 'trial' && after.chat.pool === 'month';
