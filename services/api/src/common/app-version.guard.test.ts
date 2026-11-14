import { expect, test } from 'vitest';
import { compareVersions } from './app-version.guard.js';

test('버전을 숫자로 비교한다', () => {
  expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
  expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
  // 문자열로 비교하면 '1.10.0' < '1.9.0'이 되어 틀린다
  expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
});
