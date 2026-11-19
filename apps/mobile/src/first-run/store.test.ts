import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '@/api/query-client';
import { INITIAL_STATE } from './flow';
import { advance, loadFirstRun, resetAccountFirstRun } from './store';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), canDismiss: jest.fn(() => false), dismissAll: jest.fn() } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(() => Promise.resolve()) }));

beforeEach(() => jest.clearAllMocks());
// 앱 전체가 함께 쓰는 클라이언트라 캐시 정리 타이머가 남으면 Jest 작업자가 끝나지 않는다
afterEach(() => queryClient.clear());

test('저장된 상태가 없거나 읽지 못하면 처음 실행한 기기로 본다', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
  expect(await loadFirstRun()).toEqual(INITIAL_STATE);
  queryClient.clear();
  jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('읽기 실패'));
  expect(await loadFirstRun()).toEqual(INITIAL_STATE);
});

test('화면이 끝난 일을 알리면 기기에 저장하고 시작 경로로 돌아간다 (F01-R09)', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
  await advance('introDone');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('first-run', JSON.stringify({ introSeen: true, onboardingDeferred: false, onboardingInProgress: false, afterPlan: [] }));
  expect(router.replace).toHaveBeenCalledWith('/');
});

test('이번 실행에서만 쓰는 값은 저장하지 않고, 저장된 값도 믿지 않는다 (F01-R07)', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify({ introSeen: true, onboardingStartPassed: true }));
  expect((await loadFirstRun()).onboardingStartPassed).toBe(false);
  await advance('onboardingStarted');
  expect(jest.mocked(SecureStore.setItemAsync).mock.calls[0]?.[1]).not.toContain('onboardingStartPassed');
  expect((await loadFirstRun()).onboardingStartPassed).toBe(true);
});

test('저장에 실패해도 흐름은 이어 간다', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('쓰기 실패'));
  await advance('introDone');
  expect(router.replace).toHaveBeenCalledWith('/');
  expect((await loadFirstRun()).introSeen).toBe(true);
});

test('로그아웃하면 계정에 딸린 상태만 지우고 인트로는 다시 보여 주지 않는다', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify({ introSeen: true, onboardingDeferred: true }));
  await resetAccountFirstRun();
  expect(await loadFirstRun()).toEqual({ ...INITIAL_STATE, introSeen: true });
});
