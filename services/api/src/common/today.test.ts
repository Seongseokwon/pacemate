import { expect, test } from 'vitest';
import { today } from './today.js';

test('오늘은 Asia/Seoul 기준이다: UTC 15시에 날짜가 바뀐다 (ARCHITECTURE §13, DI-09)', () => {
  expect(today(new Date('2026-11-14T14:59:59Z'))).toBe('2026-11-14');
  expect(today(new Date('2026-11-14T15:00:00Z'))).toBe('2026-11-15');
});

test('연도가 바뀌는 날도 YYYY-MM-DD로 쓴다', () => {
  expect(today(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  expect(today(new Date('2027-03-04T20:00:00Z'))).toBe('2027-03-05');
});
