import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.expo/**', '**/src/generated/**', 'apps/mobile/ios/**', 'apps/mobile/android/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
