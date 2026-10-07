import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
// Persisted observations now age. Existing fresh-state regressions must perform
// a real authorized refresh, rather than assuming GET regenerates a fresh quote.
export async function refreshFixtureData(page: Page) {
  if (process.env['FOLIO_E2E_JOBS'] !== '1') return;
  await page.evaluate(() => {
    history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const control = page.getByRole('complementary', { name: 'Market refresh' });
  await control.getByRole('button').click();
  await expect(control).toContainText('Refresh completed.', { timeout: 15000 });
}
