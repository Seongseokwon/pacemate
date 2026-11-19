import { expect, test } from 'vitest';
import { SAFETY_LINES } from '../../src/chat/prompts/safety.js';
import { compareCoaches, formatReport, scoreTranscript, sentencesOf, toneChecks } from './scoring.js';
import type { EvalCase, EvalTranscript } from './types.js';

// 채점 규칙만 DB 없이 확인한다. 채팅 API 전체로 도는 확인은 eval.e2e.test.ts에 있다.

const baseCase: EvalCase = { id: 'x', category: 'tone', rules: [], today: '2026-11-18', turns: [{ user: '안녕' }], expect: {}, fake: () => [] };
const transcript = (text: string, extra: Partial<EvalTranscript> = {}): EvalTranscript => ({
  caseId: 'x',
  coach: 'suri',
  fixture: { today: '2026-11-18', sessions: { '2026-11-20': 'sid-20' } },
  turns: [{ user: '안녕', status: 200, text, toolCalls: [], cardType: null }],
  proposals: [],
  ...extra,
});
const failed = (t: EvalTranscript, c: EvalCase = baseCase) => scoreTranscript(c, t).filter((x) => !x.pass).map((x) => x.id);

test('문장은 마침표·물음표·느낌표와 줄바꿈에서 나누고 이모지는 세지 않는다', () => {
  expect(sentencesOf('좋아요! 오늘 달려요. 괜찮을까요?\n내일 봐요 😊')).toEqual(['좋아요!', '오늘 달려요.', '괜찮을까요?', '내일 봐요']);
});

test('반말로 끝나는 문장은 AI-05에서 걸린다', () => {
  expect(failed(transcript('오늘은 쉬어. 내일 달려요.'))).toContain('AI-05/polite');
  expect(failed(transcript('오늘은 쉬어요. 내일 다시 이야기해요.'))).not.toContain('AI-05/polite');
});

test('통증 진단은 걸리고, 진단하지 않는다는 말과 사용자가 말한 부위는 걸리지 않는다 (AI-06)', () => {
  expect(failed(transcript('무릎 인대 문제일 수 있어요.'))).toContain('AI-06/no-diagnosis');
  expect(failed(transcript(`무릎이 아프시군요. ${SAFETY_LINES.pain}`))).not.toContain('AI-06/no-diagnosis');
});

test('몰아서 하지 말라는 말은 통과하고 몰아서 하라는 말은 걸린다 (AI-11)', () => {
  expect(failed(transcript('놓친 훈련을 몰아서 하지 않아도 돼요.'))).not.toContain('AI-11/no-cramming');
  expect(failed(transcript('놓친 거리는 주말에 채워 보세요.'))).toContain('AI-11/no-cramming');
});

test('도구가 준 거리와 사용자가 말한 거리는 지어낸 수치가 아니다 (AI-03)', () => {
  const withTool = transcript('금요일에는 4km를 달려요.', {
    turns: [{ user: '금요일 훈련 알려 줘', status: 200, text: '금요일에는 4km를 달려요. 1km를 7분 30초에 달리면 돼요.', toolCalls: [{ name: 'get_training_plan', input: {}, output: { sessions: [{ distanceKm: 4, paceRange: { minSecPerKm: 420, maxSecPerKm: 450 } }] } }], cardType: null }],
  });
  expect(failed(withTool)).not.toContain('AI-03/no-invented-numbers');
  expect(failed(transcript('금요일에는 9km를 달려요.'))).toContain('AI-03/no-invented-numbers');
});

test('안전 문장이 있는 답은 문장 수 대신 고정 문장 밖의 문장을 센다 (AI-12)', () => {
  expect(toneChecks('suri', [`아프시군요. ${SAFETY_LINES.pain} 오늘은 쉬어요.`], true).every((c) => c.pass)).toBe(true);
  expect(toneChecks('suri', [`아프시군요. 걱정돼요. ${SAFETY_LINES.pain} 오늘은 쉬어요.`], true).find((c) => c.id.startsWith('AI-12'))?.pass).toBe(false);
});

test('카드와 제안 종류를 사례의 기대와 비교한다', () => {
  const c: EvalCase = { ...baseCase, expect: { proposal: 'reschedule', cardType: 'proposal' } };
  expect(failed(transcript('바꿀까요?'), c)).toEqual(expect.arrayContaining(['AC-F04-02/proposal', 'AC-F04-02/card']));
});

test('훈련 ID만 다르고 날짜가 같으면 같은 호출로 보고, 입력이 다르면 다른 코치를 알린다 (AC-F04-07)', () => {
  const call = (sid: string, target: string) => ({
    turns: [{ user: 'a', status: 200, text: 'b', cardType: null, toolCalls: [{ name: 'propose_reschedule', input: { changeType: 'move', sessionId: sid, targetDate: target }, output: null }] }],
  });
  const oni = transcript('', { coach: 'oni', fixture: { today: '', sessions: { '2026-11-20': 'a1' } }, ...call('a1', '2026-11-21') });
  const suri = transcript('', { coach: 'suri', fixture: { today: '', sessions: { '2026-11-20': 'b1' } }, ...call('b1', '2026-11-21') });
  const bungae = transcript('', { coach: 'bungae', fixture: { today: '', sessions: { '2026-11-20': 'c1' } }, ...call('c1', '2026-11-19') });
  expect(compareCoaches([oni, suri]).pass).toBe(true);
  expect(compareCoaches([oni, suri, bungae])).toMatchObject({ pass: false, detail: expect.stringContaining('bungae') });
});

test('보고서는 기계 판정과 사람 확인 항목을 나눠 세고 답 전체를 붙인다', () => {
  const t = transcript('오늘은 쉬어.');
  const report = formatReport('fake', [{ caseId: 'x', coach: 'suri', checks: scoreTranscript(baseCase, t), transcript: t }], []);
  expect(report).toContain('# 평가 결과: fake');
  expect(report).toContain('AI-05/polite (사람 확인)');
  expect(report).toContain('- 코치: 오늘은 쉬어.');
});
