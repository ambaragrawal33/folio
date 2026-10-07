import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ baseURL: 'http://127.0.0.1:5190' });
test.skip(process.env['FOLIO_E2E_FIXTURE'] !== '1', 'Explicit local fixture stack required');
const evidence = process.env['FOLIO_DISCOVERY_EVIDENCE_DIR'] ?? '.local/priority-2/visual';
const audits: unknown[] = [];
async function register(page: Page, request: APIRequestContext) {
  const email = 'discovery-' + Date.now() + '@example.test',
    password = 'A long isolated discovery passphrase!';
  await page.goto('/auth/register?theme=dark');
  await page.getByLabel('Name', { exact: true }).fill('Instrument Discovery Reviewer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If this address');
  let link = '';
  await expect
    .poll(async () => {
      const data = await (
        await request.get('http://127.0.0.1:8025/api/v2/messages?limit=100')
      ).json();
      const message = data.items.find(
        (m: { To: { Mailbox: string; Domain: string }[]; Content: { Body: string } }) =>
          m.To.some((to) => to.Mailbox + '@' + to.Domain === email) &&
          m.Content.Body.includes(':5190/auth/verify-email'),
      );
      const raw = message?.Content.Body.replace(/=\r?\n/g, '').replace(/=3D/g, '=') ?? '';
      link = raw.match(/http[^\s]+\/auth\/verify-email#token=[A-Za-z0-9_-]{43}/)?.[0] ?? '';
      return !!link;
    })
    .toBe(true);
  const url = new URL(link);
  await page.goto('http://127.0.0.1:5190' + url.pathname + url.hash);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const login = page.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const session = await (await login).json();
  await page.getByRole('button', { name: 'Create portfolio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record transaction', exact: true })).toBeVisible();
  const list = await (
    await page.request.get('/api/v1/portfolios', {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    })
  ).json();
  return { token: session.accessToken as string, portfolioId: list.portfolios[0].id as string };
}
async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    height: innerHeight,
    document: document.documentElement.scrollWidth,
    independentScroll: [...document.querySelectorAll('body *')]
      .filter(
        (e) =>
          ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) &&
          e.scrollHeight > e.clientHeight,
      )
      .map((e) => e.className),
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.independentScroll).toEqual([]);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  audits.push({ name, geometry, axeViolations: axe.violations });
  await writeFile(evidence + '/browser-checks.json', JSON.stringify(audits, null, 2));
  await page.screenshot({ path: evidence + '/' + name + '.png', fullPage: true });
  await page.screenshot({ path: evidence + '/' + name + '-viewport.png' });
}
async function search(page: Page, q: string) {
  await page.getByLabel('Search instruments').fill(q);
  await page.getByLabel('Search instruments').press('Enter');
  await expect(page.locator('.instrument-picker [role=status]')).not.toContainText('Searching');
}
test('fresh account discovers verified collisions/aliases, records canonical identity, preserves missing data and keyboard/mobile recovery', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const session = await register(page, request);
  await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
  const select = page.getByLabel('Canonical instrument'),
    status = page.locator('.instrument-picker [role=status]');
  await expect(status).toContainText('13 verified results');
  await expect(select).toHaveValue('');
  await capture(page, 'empty-search-dark-1440');
  await page.getByLabel('Search instruments').fill('infy');
  await expect(status).toContainText('13 verified results');
  await capture(page, 'active-search-dark-1440');
  let releaseSearch: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  await page.route('**/api/v1/instruments/search?*', async (route) => {
    await pending;
    await route.continue();
  });
  await page.getByLabel('Search instruments').press('Enter');
  await expect(status).toContainText('Searching verified catalogue');
  await expect(page.getByRole('button', { name: 'Search catalogue' })).toHaveAttribute(
    'data-state',
    'Disabled',
  );
  await capture(page, 'search-pending-dark-1440');
  releaseSearch();
  await expect(status).toContainText('2 verified results');
  await page.unroute('**/api/v1/instruments/search?*');
  await expect(select.locator('option')).toHaveText([
    'Choose instrument',
    'INFY · BSE · INR · Infosys Limited',
    'INFY · NSE · INR · Infosys Limited',
  ]);
  await capture(page, 'results-collision-dark-1440');
  await page.getByLabel('Search instruments').focus();
  await page.keyboard.press('ArrowDown');
  await expect(select).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(select).toHaveValue('INFY:NSE');
  await expect(page.getByLabel('Selected instrument')).toContainText('INFY:NSE · NSE · INR');
  await capture(page, 'selected-dark-1440');
  await page.keyboard.press('Tab');
  expect(await page.locator(':focus').getAttribute('aria-label')).not.toBe('Canonical instrument');
  await search(page, 'infy.ns');
  await expect(status).toContainText('1 verified results');
  await expect(select).toHaveValue('INFY:NSE');
  await search(page, 'not-a-verified-security');
  await expect(status).toContainText('No verified instruments');
  await expect(select).toHaveValue('INFY:NSE');
  await capture(page, 'no-results-dark-1440');
  await page.route('**/api/v1/instruments/search?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'TEST_OUTAGE', message: 'Explicit browser-only outage simulation' },
      }),
    }),
  );
  await search(page, 'INFY');
  await expect(status).toContainText('Instrument search unavailable');
  await expect(select).toHaveValue('INFY:NSE');
  await capture(page, 'search-unavailable-dark-1440');
  await page.unroute('**/api/v1/instruments/search?*');
  await page.getByRole('button', { name: 'Retry instrument search' }).click();
  await expect(status).toContainText('2 verified results');
  await expect(page.getByLabel('Discovery provider status')).toContainText(
    'Live Yahoo discovery is unavailable',
  );
  await page.goto(page.url() + '?theme=light');
  await expect(status).toContainText('13 verified results');
  await search(page, 'INFY');
  await select.selectOption('INFY:NSE');
  await capture(page, 'selected-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'selected-light-390');
  await search(page, 'unknown');
  await expect(status).toContainText('No verified instruments');
  await capture(page, 'no-results-light-390');
  await search(page, 'INFY');
  await capture(page, 'results-light-390');
  const nav = page.getByRole('button', { name: 'Navigation' });
  await nav.focus();
  await page.keyboard.press('Enter');
  await expect(nav).toHaveAttribute('aria-expanded', 'true');
  expect((await page.locator('.topbar').boundingBox())!.height).toBe(56);
  await expect(page.locator('.portfolio-context')).toBeHidden();
  await capture(page, 'navigation-open-light-390');
  await page.keyboard.press('Escape');
  await expect(nav).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture(page, 'selected-light-768');
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T15:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-05');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel(/^Native price ·/).fill('100');
  await page.getByLabel('Native fees / withholding', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review transaction', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  const headers = { Authorization: 'Bearer ' + session.token };
  const ledger = await (
    await page.request.get('/api/v1/portfolios/' + session.portfolioId + '/ledger', {
      headers,
    })
  ).json();
  expect(ledger.items).toHaveLength(1);
  expect(ledger.items[0].record.instrumentId).toBe('INFY:NSE');
  const valuation = await (
    await page.request.get('/api/v1/portfolios/' + session.portfolioId + '/valuation', { headers })
  ).json();
  expect(valuation).toMatchObject({
    complete: false,
    totalValue: null,
    totalBaseCost: '201',
    holdings: [{ instrumentId: 'INFY:NSE', quantity: '2', baseCost: '201', quote: null }],
  });
  await writeFile(
    evidence + '/financial-results.json',
    JSON.stringify({ ledger, valuation }, null, 2),
  );
  await page.goto('/holdings?theme=light');
  await expect(page.locator('.portfolio-table')).toContainText('Infosys');
  await capture(page, 'owned-holding-unavailable-light-1440');
});
