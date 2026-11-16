// 문서에 (초기값)으로 적힌 수치 중 앱과 서버가 함께 쓰는 것을 여기에 둔다.
// 그 밖의 상수는 그 값을 쓰는 작업에서 이 파일에 추가한다.

/** 서비스의 기준 시간대. 훈련 날짜와 "오늘"은 모두 이 시간대로 계산한다(PRD §1.5, DI-09). */
export const TIME_ZONE = 'Asia/Seoul';

/** 요금제별 월 이용 한도(PRD §8.1, D-08). */
export const PLAN_LIMITS = {
  free: { chat: 10, reschedule: 2 },
  pro: { chat: 100, reschedule: 30 },
} as const;

/** 채팅 메시지 최대 길이(F04-R09). */
export const CHAT_MESSAGE_MAX_LENGTH = 500;

/** 운동 기록 입력 범위(F07-R03). 페이스가 범위를 벗어나면 저장 전에 확인을 요청한다. */
export const WORKOUT_LIMITS = {
  distanceKm: { min: 0.1, max: 100 },
  durationSec: { min: 60, max: 43200 },
  paceSecPerKm: { min: 120, max: 1200 },
  memoMaxLength: 500,
} as const;

/** 프로필 입력 범위(API_SPEC §3.2). */
export const PROFILE_LIMITS = {
  recentWeeklyKm: { min: 0, max: 100 },
  weeklyRunCount: { min: 2, max: 5 },
} as const;

/** 훈련 목록을 한 번에 조회할 수 있는 최대 일수(API_SPEC §3.3). */
export const SESSION_QUERY_MAX_DAYS = 62;

/** 예정 운동 알림을 받을 수 있는 시각(API_SPEC §3.8, F09-R06). */
export const REMINDER_HOUR = { min: 8, max: 20 } as const;

/** 목록 조회 개수(API_SPEC §1). */
export const LIST_PAGE = { defaultLimit: 30, maxLimit: 100 } as const;

/** 사용자별 분당 요청 수 제한(API_SPEC §1). */
export const RATE_LIMIT_PER_MINUTE = { default: 60, chat: 10 } as const;
