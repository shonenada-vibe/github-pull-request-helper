import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Lints TypeScript sources. Svelte files are type-checked via `svelte-check`.
export default tseslint.config(
  {
    ignores: ['.wxt/**', '.output/**', 'node_modules/**', '**/*.svelte'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
