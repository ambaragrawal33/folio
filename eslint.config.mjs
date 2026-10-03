import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.pnpm-store/**',
      'playwright-report/**',
      'test-results/**',
      'packages/design-tokens/generated/**',
      '.local/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['@folio/shared/openapi', 'express', 'mongoose', 'ioredis', 'pino'],
          patterns: ['**/api/**', '@folio/api', '**/shared/src/**'],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/web/**', '@folio/web', '@folio/design-tokens', '**/shared/src/**'] },
      ],
    },
  },
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['**/apps/**', '@folio/api', '@folio/web'] }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
