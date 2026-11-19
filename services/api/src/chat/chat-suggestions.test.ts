import { expect, test } from 'vitest';
import { suggestionsFor } from './chat-suggestions.js';

const codes = (situation: Parameters<typeof suggestionsFor>[0]) => suggestionsFor(situation).suggestions.map((s) => s.code);

test('오늘 훈련과 미완료 훈련 유무로 고정 목록에서 고른다 (F04-R05)', () => {
  expect(codes({ hasPlan: true, hasTodaySession: true, hasMissed: true })).toEqual(['TODAY_SESSION', 'TODAY_TIRED', 'MISSED_ADJUST']);
  expect(codes({ hasPlan: true, hasTodaySession: false, hasMissed: true })).toEqual(['MISSED_ADJUST', 'THIS_WEEK', 'LOG_WORKOUT']);
  expect(codes({ hasPlan: true, hasTodaySession: false, hasMissed: false })).toEqual(['THIS_WEEK', 'LOG_WORKOUT', 'LAST_WEEK_REVIEW']);
  expect(codes({ hasPlan: false, hasTodaySession: false, hasMissed: false })).toEqual(['NO_PLAN_START', 'LOG_WORKOUT']);
});

test('추천 문구는 놓친 훈련을 몰아서 채우라고 하지 않는다 (AI-11)', () => {
  const texts = suggestionsFor({ hasPlan: true, hasTodaySession: false, hasMissed: true }).suggestions.map((s) => s.text);
  expect(texts.join(' ')).not.toMatch(/채워|몰아/);
});
