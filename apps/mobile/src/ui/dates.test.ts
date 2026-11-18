import { addDays, formatDday, formatDuration, formatKm, formatPace, formatShortDate, mondayOf, monthGridDates } from './dates';

test('주는 월요일에 시작한다', () => {
  expect(mondayOf('2026-11-17')).toBe('2026-11-16');
  expect(mondayOf('2026-11-22')).toBe('2026-11-16');
  expect(mondayOf('2026-11-16')).toBe('2026-11-16');
});

test('날짜 계산은 달과 해를 넘긴다', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
});

test('표기는 UI_UX §9.3을 따른다', () => {
  expect(formatKm(5)).toBe('5km');
  expect(formatKm(12.5)).toBe('12.5km');
  expect(formatShortDate('2026-11-19')).toBe('목 11/19');
  expect(formatDday(42)).toBe('D-42');
  expect(formatDday(0)).toBe('D-DAY');
  expect(formatDuration(1930)).toBe('32분 10초');
  expect(formatDuration(3900)).toBe('1시간 5분');
  expect(formatPace(384)).toBe('6\'24"/km');
});

test('달력 칸은 1일이 든 주의 월요일부터 말일이 든 주의 일요일까지다', () => {
  const dates = monthGridDates('2026-11-18');
  expect(dates[0]).toBe('2026-10-26');
  expect(dates[dates.length - 1]).toBe('2026-12-06');
  expect(dates.length % 7).toBe(0);
});
