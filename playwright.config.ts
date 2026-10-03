import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'apps/web/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1024 },
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'pnpm --filter @folio/web dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
