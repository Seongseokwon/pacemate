// 날짜는 시간대가 없는 `YYYY-MM-DD`로 다룬다(ARCHITECTURE §13). DB의 date 컬럼은 UTC 자정의 Date로 오간다.

const DAY_MS = 86_400_000;

export const toDbDate = (date: string): Date => new Date(`${date}T00:00:00Z`);
export const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

export const addDays = (date: string, days: number): string => toDateString(new Date(toDbDate(date).getTime() + days * DAY_MS));
export const daysBetween = (from: string, to: string): number => (toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS;

/** 그 날짜가 속한 주의 월요일. 주는 월요일에 시작한다(PRD §1.5). */
export const mondayOf = (date: string): string => addDays(date, -((toDbDate(date).getUTCDay() + 6) % 7));
