import { expect, test } from 'vitest';
import { scrubEvent } from './monitoring.js';

test('오류에 포함된 요청과 대화 내용을 제거하고 스택 위치만 남긴다', () => {
  const event = { type: undefined, request: { data: '비밀 대화' }, message: '비밀 대화', extra: { memo: '비밀 메모' }, breadcrumbs: [{ message: '비밀 대화' }], exception: { values: [{ type: 'Error', value: '비밀 대화', stacktrace: { frames: [{ filename: 'app.js', lineno: 12, vars: { memo: '비밀 메모' } }] } }] } };
  const result = scrubEvent(event);
  expect(JSON.stringify(result)).not.toContain('비밀');
  expect(result.exception?.values?.[0]?.stacktrace?.frames?.[0]).toMatchObject({ filename: 'app.js', lineno: 12 });
});
