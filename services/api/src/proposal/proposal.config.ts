// proposal 모듈만 쓰는 (초기값) 수치. 근거는 PRD F02-R09, DECISIONS.md 2026-11-18 "목표 변경의 최근 주간 거리".

/** 목표 변경에서 최근 주간 거리를 구하는 기간. 이번 주 월요일 전의 온전한 주를 센다 */
export const GOAL_CHANGE_RECENT_WEEKS = 3;

/** 위 기간 중 기록이 있는 주가 이보다 적으면 주간 거리를 다시 묻는다(RECENT_DISTANCE_REQUIRED) */
export const GOAL_CHANGE_MIN_WEEKS_WITH_RECORDS = 2;

/** 제안은 만든 날의 자정에 만료된다(DI-05). 서비스 시간대(Asia/Seoul)의 UTC 차이다. 한국은 일광 절약 시간이 없다 */
export const SERVICE_UTC_OFFSET = '+09:00';
