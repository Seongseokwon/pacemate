import { expect, test } from 'vitest';
import { identityHash } from './identity-hash.js';

test('DI-11 공급자와 식별자에 따른 해시는 안정적이며 비밀값과 공급자를 구분한다', () => {
  const value = identityHash('apple', 'subject', 'secret');
  expect(value).toHaveLength(64);
  expect(identityHash('apple', 'subject', 'secret')).toBe(value);
  expect(identityHash('google', 'subject', 'secret')).not.toBe(value);
  expect(identityHash('apple', 'subject', 'other')).not.toBe(value);
  expect(() => identityHash('apple', '', 'secret')).toThrow();
});
