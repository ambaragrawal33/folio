import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/shared/tests/**/*.test.ts',
      'apps/api/tests/**/*.test.ts',
      'apps/web/src/**/*.test.tsx',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/**/*.ts',
        'apps/api/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      exclude: ['apps/api/src/index.ts', 'apps/web/src/main.tsx'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 70, functions: 70, statements: 70, branches: 70 },
    },
  },
});
