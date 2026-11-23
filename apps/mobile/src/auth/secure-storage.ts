import * as SecureStore from 'expo-secure-store';

// 보안 저장소는 값 하나가 2KB를 넘으면 저장하지 못할 수 있어, 로그인 세션을 나눠 담는다
const CHUNK_SIZE = 1800;

const countKey = (key: string) => `${key}.count`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const count = raw === null ? 0 : Number(raw);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

async function removeChunks(key: string, count: number): Promise<void> {
  await SecureStore.deleteItemAsync(countKey(key));
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
}

/** 인증 SDK가 세션을 기기의 보안 저장소에 두게 하는 저장소(F01-R03, F01-R04). */
export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key);
    if (count === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // 일부가 없으면 깨진 세션이다. 반쪽 값을 돌려주지 않고 로그인부터 다시 하게 한다
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await removeChunks(key, await readCount(key));
    const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    // 개수를 마지막에 적어, 저장이 중간에 끊기면 읽을 때 없는 값으로 본다
    await SecureStore.setItemAsync(countKey(key), String(count));
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(key, await readCount(key));
  },
};
