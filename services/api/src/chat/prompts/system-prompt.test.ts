import { coachSchema } from '@pacemate/shared';
import { describe, expect, test } from 'vitest';
import { SAFETY_LINES } from './safety.js';
import { COMMON_INSTRUCTIONS, fixedInstructionsOf } from './system-prompt.js';

describe('시스템 지침 v1 (ARCHITECTURE §7.4)', () => {
  test('통증·응급 안내의 고정 문장을 그대로 담는다 (AI-12, D-17)', () => {
    expect(COMMON_INSTRUCTIONS).toContain(SAFETY_LINES.pain);
    expect(COMMON_INSTRUCTIONS).toContain(SAFETY_LINES.emergency);
  });

  test('되묻기는 최대 2번이고, 심한 통증에는 제안을 만들지 않는다 (AI-04, AI-06)', () => {
    expect(COMMON_INSTRUCTIONS).toContain('최대 2번');
    expect(COMMON_INSTRUCTIONS).toMatch(/통증이 심하다고 하거나 .*일정 변경 제안을 만들지 않고/);
  });

  test('세 코치의 지침은 공통 지침을 같은 앞부분으로 두고 말투만 다르다 (AI-11, F04-R11)', () => {
    const instructions = coachSchema.options.map(fixedInstructionsOf);
    for (const text of instructions) expect(text.startsWith(COMMON_INSTRUCTIONS)).toBe(true);
    expect(new Set(instructions).size).toBe(3);
  });

  test('말투 지침에는 안전 문장을 넣지 않는다. 안전 규칙은 공통 지침에만 있다', () => {
    for (const coach of coachSchema.options) {
      const tone = fixedInstructionsOf(coach).slice(COMMON_INSTRUCTIONS.length);
      expect(tone).not.toContain(SAFETY_LINES.pain);
    }
  });
});
