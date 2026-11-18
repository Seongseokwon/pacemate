import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const TESTS = ['**/*.test.ts', '**/*.test.tsx'];

/** 허용한 패키지와 상대 경로 밖의 import를 막는다. */
const onlyImports = (allowed, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ regex: `^(?!(${allowed.join('|')})(/|$)|\\.{1,2}/)`, message }] }],
});

const NO_CLOCK = '시스템 시각을 읽지 않는다. 오늘 날짜는 인자로 받는다(ARCHITECTURE §6).';
const NO_COLOR = '색상 값을 직접 쓰지 않는다. `apps/mobile/src/ui/tokens.ts`의 토큰을 쓴다(UI_UX §3).';
const COLOR = '/^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|hsl)a?\\()/i';
const NO_EMOJI = '화면 문구에 이모지를 쓰지 않는다. 필요한 곳에는 선 아이콘을 쓴다(UI_UX §1.3, §9.1).';
const EMOJI = '/\\p{Extended_Pictographic}/u';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.expo/**', '**/src/generated/**', 'apps/mobile/ios/**', 'apps/mobile/android/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  { files: ['apps/mobile/src/**'], ...reactHooks.configs.flat.recommended },

  // 아래는 구조 규칙이다(ARCHITECTURE §4, AGENTS.md "반드시 지킬 구조 규칙"). 규칙마다 `eslint.config.test.ts`에 사례가 있다.
  {
    files: ['packages/shared/src/**'],
    ignores: TESTS,
    rules: onlyImports(['zod'], 'shared는 zod에만 의존한다(ARCHITECTURE §4).'),
  },
  {
    files: ['packages/training-engine/src/**'],
    ignores: TESTS,
    rules: {
      ...onlyImports(['@pacemate/shared'], 'Training Engine은 순수 로직이다. shared에만 의존한다(ARCHITECTURE §4, §6).'),
      'no-restricted-globals': ['error', 'process', 'fetch'],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: NO_CLOCK },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: NO_CLOCK },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: '같은 입력에는 같은 결과가 나와야 한다(TE-R09).',
        },
      ],
    },
  },
  {
    files: ['services/api/src/**'],
    ignores: ['services/api/src/proposal/**', ...TESTS],
    rules: {
      // shortcut: Prisma 호출만 잡는다(관계를 통한 중첩 쓰기와 직접 쓴 SQL은 못 잡는다), 그런 코드는 검토에서 본다
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.property.name='plannedSession'][callee.property.name=/^(update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$/]",
          message: '훈련을 수정하는 코드는 proposal 모듈의 승인 처리에만 둔다(PRD DI-01).',
        },
      ],
    },
  },
  {
    files: ['apps/mobile/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@pacemate/(training-engine|api)(/|$)',
              message: '앱은 shared에만 의존한다. 계획 계산은 서버에서 한다(ARCHITECTURE §4).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/src/**'],
    ignores: ['apps/mobile/src/ui/tokens.ts', 'apps/mobile/src/ui/tokens.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${COLOR}]`, message: NO_COLOR },
        { selector: `TemplateElement[value.raw=${COLOR}]`, message: NO_COLOR },
        { selector: `Literal[value=${EMOJI}]`, message: NO_EMOJI },
        { selector: `TemplateElement[value.raw=${EMOJI}]`, message: NO_EMOJI },
        { selector: `JSXText[value=${EMOJI}]`, message: NO_EMOJI },
      ],
    },
  },
);
