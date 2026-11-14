import { TIME_ZONE } from './index.js';
import { expect, test } from 'vitest';

test('TIME_ZONE은 런타임이 아는 시간대다', () => {
  expect(() => new Intl.DateTimeFormat('ko-KR', { timeZone: TIME_ZONE })).not.toThrow();
});
