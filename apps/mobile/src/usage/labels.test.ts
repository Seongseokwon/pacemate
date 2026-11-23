import type { Usage } from '@pacemate/shared';
import { chatUsageLabel, rescheduleUsageLabel, TRIAL_EXHAUSTED_MESSAGE, trialJustExhausted } from './labels';

const usage = (chat: Usage['chat'], reschedule: Usage['reschedule'] = { used: 0, limit: 1, pool: 'month' }): Usage => ({ tier: 'free', chat, reschedule, resetsOn: '2026-12-01' });

describe('이용량 문구 (F10-R07, AC-F10-08)', () => {
  test('체험분을 쓰는 동안에는 남은 횟수를, 다 쓰면 사용/한도를 보여 준다', () => {
    expect(chatUsageLabel({ used: 3, limit: 30, pool: 'trial' })).toBe('체험 대화 27회 남음');
    expect(chatUsageLabel({ used: 3, limit: 5, pool: 'month' })).toBe('이번 달 3/5');
  });

  test('일정 변경도 같은 기준으로 보여 준다', () => {
    expect(rescheduleUsageLabel({ used: 1, limit: 3, pool: 'trial' })).toBe('체험 일정 변경 2회 남음');
    expect(rescheduleUsageLabel({ used: 1, limit: 1, pool: 'month' })).toBe('AI 일정 변경 1/1회 사용');
  });

  test('체험분에서 월 한도로 바뀐 응답에서만 다 썼다고 본다', () => {
    const trial = usage({ used: 29, limit: 30, pool: 'trial' });
    const month = usage({ used: 0, limit: 5, pool: 'month' });
    expect(trialJustExhausted(trial, month)).toBe(true);
    expect(trialJustExhausted(trial, usage({ used: 30, limit: 30, pool: 'trial' }))).toBe(false);
    expect(trialJustExhausted(month, month)).toBe(false);
    expect(trialJustExhausted(undefined, month)).toBe(false);
  });

  test('안내 문구의 횟수는 무료 월 한도다', () => {
    expect(TRIAL_EXHAUSTED_MESSAGE).toBe('체험 대화를 모두 썼어요. 이제부터는 매달 5회를 쓸 수 있어요.');
  });
});
