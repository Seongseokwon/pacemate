import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiErrorSchema, ERROR_STATUS } from './errors';

test('오류 코드와 HTTP 상태가 API_SPEC §1.1의 표와 같다', () => {
  const doc = readFileSync(resolve(__dirname, '../../../docs/API_SPEC.md'), 'utf8');
  const section = doc.slice(doc.indexOf('### 1.1 오류 응답'), doc.indexOf('## 2. 공통 객체'));
  const documented = Object.fromEntries(
    [...section.matchAll(/^\| (\d{3}) \| `([A-Z_]+)` \|/gm)].map((m) => [m[2], Number(m[1])]),
  );

  expect(Object.keys(documented).length).toBeGreaterThan(0);
  expect(ERROR_STATUS).toEqual(documented);
});

test('오류 응답은 정해진 코드만 받는다', () => {
  expect(apiErrorSchema.safeParse({ code: 'PROPOSAL_EXPIRED', message: '제안이 만료되었어요.' }).success).toBe(true);
  expect(apiErrorSchema.safeParse({ code: 'UNKNOWN', message: '?' }).success).toBe(false);
});
