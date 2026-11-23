import * as SecureStore from 'expo-secure-store';
import { chunkedSecureStorage } from './secure-storage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    store,
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

const store = (SecureStore as unknown as { store: Map<string, string> }).store;

beforeEach(() => store.clear());

describe('로그인 세션 저장소 (F01-R03, F01-R04)', () => {
  test('보안 저장소 한 칸보다 긴 세션을 나눠 담고 그대로 읽는다', async () => {
    const session = 'x'.repeat(4000);
    await chunkedSecureStorage.setItem('pacemate.auth', session);

    expect(await chunkedSecureStorage.getItem('pacemate.auth')).toBe(session);
    for (const value of store.values()) expect(value.length).toBeLessThanOrEqual(2048);
  });

  test('짧은 값으로 바꾸면 남은 조각을 지운다', async () => {
    await chunkedSecureStorage.setItem('pacemate.auth', 'x'.repeat(4000));
    await chunkedSecureStorage.setItem('pacemate.auth', 'short');

    expect(await chunkedSecureStorage.getItem('pacemate.auth')).toBe('short');
    expect([...store.keys()].sort()).toEqual(['pacemate.auth.0', 'pacemate.auth.count']);
  });

  test('지우면 아무것도 남지 않는다', async () => {
    await chunkedSecureStorage.setItem('pacemate.auth', 'x'.repeat(4000));
    await chunkedSecureStorage.removeItem('pacemate.auth');

    expect(await chunkedSecureStorage.getItem('pacemate.auth')).toBeNull();
    expect(store.size).toBe(0);
  });

  test('조각이 빠진 세션은 없는 것으로 본다', async () => {
    await chunkedSecureStorage.setItem('pacemate.auth', 'x'.repeat(4000));
    store.delete('pacemate.auth.1');

    expect(await chunkedSecureStorage.getItem('pacemate.auth')).toBeNull();
  });
});
