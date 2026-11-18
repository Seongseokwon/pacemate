// 날짜는 `YYYY-MM-DD` 문자열로 다룬다(ARCHITECTURE §13). 계산할 때만 기기 시간대의 자정으로 바꿨다가 되돌리므로 시간대와 무관하다.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (value: number) => String(value).padStart(2, '0');

export const toDate = (date: string): Date => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};
export const toDateString = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 화면에 '오늘'을 표시하고 처음 고를 날짜를 정할 때만 쓴다. 훈련 상태 같은 판단은 서버가 한다(ARCHITECTURE §13). */
export const deviceToday = (): string => toDateString(new Date());

export const addDays = (date: string, days: number): string => {
  const value = toDate(date);
  value.setDate(value.getDate() + days);
  return toDateString(value);
};

/** 그 날짜가 속한 주의 월요일. 주는 월요일에 시작한다(PRD §1.5). */
export const mondayOf = (date: string): string => addDays(date, -((toDate(date).getDay() + 6) % 7));

export const weekdayOf = (date: string): string => WEEKDAYS[toDate(date).getDay()] ?? '';
export const dayOfMonth = (date: string): number => toDate(date).getDate();
export const monthOf = (date: string): { year: number; month: number } => ({ year: toDate(date).getFullYear(), month: toDate(date).getMonth() + 1 });

/** "11월 19일 (목)"(§9.3) */
export const formatDate = (date: string): string => {
  const value = toDate(date);
  return `${value.getMonth() + 1}월 ${value.getDate()}일 (${weekdayOf(date)})`;
};

/** "목 11/19"(§9.3) */
export const formatShortDate = (date: string): string => {
  const value = toDate(date);
  return `${weekdayOf(date)} ${value.getMonth() + 1}/${value.getDate()}`;
};

/** 소수 한 자리까지, 0이면 생략한다: 5km, 12.5km(§9.3) */
export const formatKm = (km: number): string => `${Math.round(km * 10) / 10}km`;

/** D-42, 당일은 D-DAY(§9.3) */
export const formatDday = (days: number): string => (days === 0 ? 'D-DAY' : `D-${days}`);

/** 달력의 칸: 그 달의 1일이 든 주의 월요일부터 말일이 든 주의 일요일까지 */
export function monthGridDates(anyDateInMonth: string): string[] {
  const { year, month } = monthOf(anyDateInMonth);
  const first = toDateString(new Date(year, month - 1, 1));
  const last = toDateString(new Date(year, month, 0));
  const dates: string[] = [];
  for (let date = mondayOf(first); date <= addDays(mondayOf(last), 6); date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** 그 달의 1일 */
export const firstOfMonth = (date: string, offset = 0): string => {
  const { year, month } = monthOf(date);
  return toDateString(new Date(year, month - 1 + offset, 1));
};

/** "11월 19일" */
export const formatMonthDay = (date: string): string => `${monthOf(date).month}월 ${dayOfMonth(date)}일`;

/** 1시간 미만은 "32분 10초", 이상은 "1시간 5분"(§9.3) */
export const formatDuration = (sec: number): string => {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  const seconds = sec % 60;
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
};

/** 6'24"/km(§9.3) */
export const formatPace = (secPerKm: number): string => `${Math.floor(secPerKm / 60)}'${String(secPerKm % 60).padStart(2, '0')}"/km`;
