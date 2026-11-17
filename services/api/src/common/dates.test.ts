import { expect, test } from 'vitest';
import { addDays, daysBetween, mondayOf, toDateString, toDbDate } from './dates.js';

test('날짜 문자열과 DB 날짜를 서로 바꾼다', () => {
  expect(toDateString(toDbDate('2026-11-17'))).toBe('2026-11-17');
});

test('날짜를 더하고 차이를 센다', () => {
  expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  expect(daysBetween('2026-11-17', '2026-11-22')).toBe(5);
});

test('주는 월요일에 시작한다', () => {
  expect(mondayOf('2026-11-16')).toBe('2026-11-16');
  expect(mondayOf('2026-11-22')).toBe('2026-11-16');
  expect(mondayOf('2026-11-23')).toBe('2026-11-23');
});
