import { ESLint } from 'eslint';
import { beforeAll, expect, test } from 'vitest';

const eslint = new ESLint();

// 설정을 처음 읽는 데 걸리는 시간을 첫 테스트의 제한 시간에서 뺀다
beforeAll(() => eslint.lintText('', { filePath: 'x.ts' }), 60_000);

/** 그 경로에 그 코드가 있을 때 걸리는 규칙 */
const violations = async (filePath: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId);
};

test.each([
  ['shared는 zod 밖의 패키지를 가져오지 못한다', 'packages/shared/src/x.ts', "import { x } from '@nestjs/common'; export { x };"],
  ['Engine은 shared 밖의 패키지를 가져오지 못한다', 'packages/training-engine/src/x.ts', "import { PrismaClient } from '@prisma/client'; export { PrismaClient };"],
  ['Engine은 파일을 읽지 못한다', 'packages/training-engine/src/x.ts', "import { readFileSync } from 'node:fs'; export { readFileSync };"],
  ['앱은 Training Engine을 가져오지 못한다', 'apps/mobile/src/app/x.tsx', "import type { PlanState } from '@pacemate/training-engine'; export type { PlanState };"],
])('%s (ARCHITECTURE §4)', async (_name, filePath, code) => {
  expect(await violations(filePath, code)).toEqual(['no-restricted-imports']);
});

test.each([
  ['new Date()', 'export const now = new Date();', 'no-restricted-syntax'],
  ['Date.now()', 'export const now = Date.now();', 'no-restricted-syntax'],
  ['Math.random()', 'export const pick = Math.random();', 'no-restricted-syntax'],
  ['process', 'export const zone = process.env.TZ;', 'no-restricted-globals'],
])('Engine은 %s를 쓰지 못한다 (ARCHITECTURE §6, TE-R09)', async (_name, code, rule) => {
  expect(await violations('packages/training-engine/src/x.ts', code)).toEqual([rule]);
});

test('Engine은 shared와 상대 경로를 가져오고, 받은 날짜로 계산할 수 있다', async () => {
  const code = `
    import type { SessionType } from '@pacemate/shared';
    import { a } from './a.js';
    export const next = (date: string): [string, SessionType, unknown] =>
      [new Date(Date.parse(date + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10), 'easy', a];
  `;
  expect(await violations('packages/training-engine/src/x.ts', code)).toEqual([]);
});

test('훈련을 수정하는 코드는 proposal 모듈에만 둘 수 있다 (DI-01)', async () => {
  const code = "export const skip = (tx: any, id: string) => tx.plannedSession.update({ where: { id }, data: { isSkipped: true } });";
  const allowAny = '/* eslint-disable @typescript-eslint/no-explicit-any */\n';
  expect(await violations('services/api/src/workout/x.ts', allowAny + code)).toEqual(['no-restricted-syntax']);
  expect(await violations('services/api/src/proposal/approve.ts', allowAny + code)).toEqual([]);
  // 최초 계획 저장과 조회는 다른 모듈도 한다
  const create = "export const save = (tx: any) => [tx.plannedSession.createMany({ data: [] }), tx.plannedSession.findMany()];";
  expect(await violations('services/api/src/plan/x.ts', allowAny + create)).toEqual([]);
});

test.each([
  ["'#FF0000'"],
  ["'#fff'"],
  ["'#00000080'"],
  ["'rgba(0, 0, 0, 0.5)'"],
  ['`hsl(0 0% 0%)`'],
])('화면 코드에 색상 값 %s를 쓰지 못한다 (UI_UX §3)', async (color) => {
  const code = `export const style = { color: ${color} };`;
  expect(await violations('apps/mobile/src/app/x.tsx', code)).toEqual(['no-restricted-syntax']);
  expect(await violations('apps/mobile/src/ui/x.tsx', code)).toEqual(['no-restricted-syntax']);
  expect(await violations('apps/mobile/src/ui/tokens.ts', code)).toEqual([]);
});

test('색상이 아닌 글자는 막지 않는다', async () => {
  const code = "export const labels = ['#1 러너', '5km 완주', 'D-42'];";
  expect(await violations('apps/mobile/src/app/x.tsx', code)).toEqual([]);
});

test.each([
  ["export const title = '오늘도 화이팅 🏃';"],
  ['export const line = `완료했어요 ✅`;'],
  ['export const Label = () => <Text>좋아요 👍</Text>;'],
])('화면 코드에 이모지를 쓰지 못한다: %s (UI_UX §9.1)', async (code) => {
  expect(await violations('apps/mobile/src/app/x.tsx', code)).toEqual(['no-restricted-syntax']);
});

test('이모지가 없는 문구와 기호는 막지 않는다', async () => {
  const code = "export const labels = ['5km · 편하게', '6\\'24\"/km', '토 11/21 → 목 11/19'];";
  expect(await violations('apps/mobile/src/app/x.tsx', code)).toEqual([]);
});

test('앱 코드는 훅을 조건문 안에서 부르지 못한다', async () => {
  const code = `
    import { useState } from 'react';
    export function Counter({ on }: { on: boolean }) {
      if (on) useState(0);
      return null;
    }
  `;
  expect(await violations('apps/mobile/src/ui/x.tsx', code)).toEqual(['react-hooks/rules-of-hooks']);
});
