import { TIME_ZONE } from '@pacemate/shared';

// en-CA 형식이 `YYYY-MM-DD`다
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * 서비스 기준 시간대(`Asia/Seoul`)의 오늘 날짜. "오늘"은 이 함수로만 계산한다(ARCHITECTURE §13).
 * 앱이 보낸 날짜를 오늘로 믿지 않는다.
 */
export function today(now: Date = new Date()): string {
  return formatter.format(now);
}
