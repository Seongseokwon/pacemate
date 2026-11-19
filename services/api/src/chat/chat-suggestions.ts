import type { ChatSuggestionsResponse } from '@pacemate/shared';

// 빠른 질문 추천(F04-R05). 고정 목록에서 상황(오늘 훈련, 이번 주 미완료 훈련)에 맞는 것을 고른다. LLM을 부르지 않는다.

export const CHAT_SUGGESTIONS = {
  TODAY_SESSION: '오늘 훈련 알려 줘',
  TODAY_TIRED: '오늘은 너무 피곤해',
  MISSED_ADJUST: '이번 주 일정 다시 맞춰 줘',
  THIS_WEEK: '이번 주 훈련 알려 줘',
  LAST_WEEK_REVIEW: '지난주 기록 분석해 줘',
  LOG_WORKOUT: '오늘 달린 기록 남길래',
  NO_PLAN_START: '러닝을 처음 시작하는데 어떻게 하면 좋을까?',
} as const;

export type ChatSuggestionCode = keyof typeof CHAT_SUGGESTIONS;

/** 앱의 칩은 3개까지 보여 준다 */
const MAX_SUGGESTIONS = 3;

export interface SuggestionSituation {
  hasPlan: boolean;
  /** 오늘 예정된(아직 하지 않은) 훈련이 있다 */
  hasTodaySession: boolean;
  /** 이번 주 미완료 훈련이 있다 */
  hasMissed: boolean;
}

export function suggestionsFor({ hasPlan, hasTodaySession, hasMissed }: SuggestionSituation): ChatSuggestionsResponse {
  const codes: ChatSuggestionCode[] = !hasPlan
    ? ['NO_PLAN_START', 'LOG_WORKOUT']
    : [
        ...(hasTodaySession ? (['TODAY_SESSION', 'TODAY_TIRED'] as const) : []),
        ...(hasMissed ? (['MISSED_ADJUST'] as const) : []),
        'THIS_WEEK',
        'LOG_WORKOUT',
        'LAST_WEEK_REVIEW',
      ];
  return { suggestions: codes.slice(0, MAX_SUGGESTIONS).map((code) => ({ code, text: CHAT_SUGGESTIONS[code] })) };
}
