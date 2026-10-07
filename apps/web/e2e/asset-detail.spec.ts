import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { refreshFixtureData } from './helpers/refresh-fixtures';
test.use({ baseURL: 'http://127.0.0.1:5190' });
test.skip(process.env['FOLIO_E2E_FIXTURE'] !== '1', 'Explicit local fixture stack required');
const evidence = process.env['FOLIO_ASSET_EVIDENCE_DIR'] ?? '.local/priority-4/visual';
const audits: unknown[] = [];
async function register(page: Page, request: APIRequestContext) {
  const email = 'asset-' + Date.now() + '@example.test',
    password = 'A long isolated preview passphrase!';
  await page.goto('/auth/register?theme=dark');
  await page.getByLabel('Name', { exact: true }).fill('Asset Detail Reviewer');
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
async function route(page: Page, path: string) {
  await page.evaluate((value) => {
    history.pushState({}, '', value);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function book(
  page: Page,
  id: string,
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'SPLIT',
  values: Record<string, string>,
) {
  await route(page, '/transactions/new?instrument=' + encodeURIComponent(id));
  await expect(page.getByLabel('Canonical instrument')).toBeEnabled();
  await page.getByLabel('Canonical instrument').selectOption(id);
  await page.getByLabel('Transaction type').selectOption(type);
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T15:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-05');
  for (const [label, value] of Object.entries(values))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review transaction', exact: true }),
  ).toBeFocused();
  const booked = page.waitForResponse(
    (r) => r.url().endsWith('/ledger') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  const response = await booked;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/transactions$/);
  return (await response.json()).record;
}
async function asset(page: Page, id: string) {
  const data = page.waitForResponse(
    (r) =>
      r.url().includes('/instruments/' + encodeURIComponent(id) + '/detail?') &&
      r.request().method() === 'GET',
  );
  await route(page, '/holdings/' + encodeURIComponent(id));
  const response = await data;
  expect(response.status()).toBe(200);
  const value = await response.json();
  await expect(
    page.getByRole('heading', { name: value.instrument.name, exact: true }),
  ).toBeFocused();
  const rows = page
    .getByRole('table', { name: 'Remaining FIFO lots', exact: true })
    .locator('tbody tr[data-asset-lot]');
  await expect(rows).toHaveCount(value.lots.items.length);
  if (value.lots.items.length)
    await expect(rows.first().locator('td').nth(1)).toHaveText(value.lots.items[0].quantity);
  // The 22-state review deliberately generates rapid navigation traffic.
  // Keep the real read cap intact and let its window reset before exhausting it.
  if (Number(response.headers()['ratelimit-remaining'] ?? '60') <= 20)
    await page.waitForTimeout(61000);
  return value;
}
async function theme(page: Page, value: 'dark' | 'light', id = 'TCS:NSE') {
  await route(page, '/settings');
  await page.getByLabel('Interface theme').selectOption(value);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Preferences saved.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  await route(page, '/holdings/' + encodeURIComponent(id));
  await expect(page.getByRole('table', { name: 'Remaining FIFO lots', exact: true })).toBeVisible();
}
test('fresh real owned asset: FIFO acquisitions/consumption/splits/dividend/void, scoped activity, coverage, keyboard and derived responsive views', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  await register(page, request);
  const observations: unknown[] = [],
    requests: string[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'GET' && r.url().includes('/instruments/'))
      requests.push(new URL(r.url()).pathname);
  });
  const quantities = (quantity: string, price: string, fees = '0', currency = 'INR') => ({
    Quantity: quantity,
    ['Native price · ' + currency]: price,
    'Native fees / withholding': fees,
  });
  const first = await book(page, 'TCS:NSE', 'BUY', quantities('10', '100', '10'));
  await refreshFixtureData(page);
  requests.length = 0;
  let value = await asset(page, 'TCS:NSE');
  observations.push(value);
  expect(value).toMatchObject({
    position: { quantity: '10', localCost: '1010' },
    lots: { total: 1 },
    valuation: { complete: true, status: 'fresh' },
  });
  await capture(page, 'one-lot-complete-dark-1440');
  const source = page.getByText('Original BUY provenance', { exact: true }).first();
  await source.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Open BUY ' + first.id)).toBeVisible();
  await capture(page, 'buy-provenance-keyboard-dark-1440');
  expect(requests.filter((u) => u.endsWith('/detail'))).toHaveLength(1);
  expect(requests.filter((u) => u.endsWith('/history'))).toHaveLength(1);
  const second = await book(page, 'TCS:NSE', 'BUY', quantities('5', '200', '5'));
  requests.length = 0;
  value = await asset(page, 'TCS:NSE');
  observations.push(value);
  expect(value).toMatchObject({
    position: { quantity: '15', localCost: '2015' },
    lots: { total: 2 },
  });
  expect(requests.filter((u) => u.endsWith('/detail'))).toHaveLength(1);
  expect(requests.filter((u) => u.endsWith('/history')).length).toBeLessThanOrEqual(1);
  await capture(page, 'multiple-lots-dark-1440');
  const sale = await book(page, 'TCS:NSE', 'SELL', quantities('12', '250', '2'));
  value = await asset(page, 'TCS:NSE');
  observations.push(value);
  expect(value).toMatchObject({
    position: { quantity: '3', localCost: '603', realizedBase: '1586' },
    lots: { items: [{ transactionId: second.id, quantity: '3', localCost: '603' }] },
  });
  await capture(page, 'partial-fifo-dark-1440');
  await book(page, 'TCS:NSE', 'SPLIT', {
    'Split numerator · new units': '2',
    'Split denominator · old units': '1',
  });
  value = await asset(page, 'TCS:NSE');
  observations.push(value);
  expect(value).toMatchObject({
    position: { quantity: '6', localCost: '603', averageCost: '100.5' },
    lots: { items: [{ quantity: '6', acquisition: { quantity: '5', price: '200' } }] },
  });
  await capture(page, 'split-adjusted-dark-1440');
  await book(page, 'TCS:NSE', 'DIVIDEND', {
    'Gross native dividend': '30',
    'Native fees / withholding': '2',
  });
  value = await asset(page, 'TCS:NSE');
  observations.push(value);
  expect(value.position.dividendBase).toBe('28');
  expect(value.activity.items.map((r: { record: { type: string } }) => r.record.type)).toEqual([
    'DIVIDEND',
    'SPLIT',
    'SELL',
    'BUY',
    'BUY',
  ]);
  await capture(page, 'dividend-mixed-activity-dark-1440');
  await theme(page, 'light');
  await capture(page, 'mixed-activity-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'split-dividend-light-390');
  const nav = page.getByRole('button', { name: 'Navigation', exact: true });
  await nav.focus();
  await page.keyboard.press('Enter');
  await expect(nav).toHaveAttribute('aria-expanded', 'true');
  await capture(page, 'navigation-open-light-390');
  await page.keyboard.press('Escape');
  await expect(nav).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture(page, 'split-dividend-light-768');
  await page.setViewportSize({ width: 1440, height: 1024 });
  await route(page, '/holdings');
  value = await asset(page, 'SOL:CRYPTO');
  observations.push(value);
  expect(value.position).toBeNull();
  expect(value.activity.total).toBe(0);
  await expect(page.getByText(/No owned position/)).toBeVisible();
  await capture(page, 'no-owned-position-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'no-owned-position-light-390');
  await page.setViewportSize({ width: 1440, height: 1024 });
  await book(page, 'AAPL:US', 'BUY', quantities('2', '100', '5', 'USD'));
  value = await asset(page, 'AAPL:US');
  observations.push(value);
  expect(value).toMatchObject({
    position: { quantity: '2', localCost: '205', baseCost: '17015' },
    lots: {
      items: [{ baseCost: '17015', acquisition: { fx: { rate: '83', source: 'local-fixture' } } }],
    },
  });
  await page.getByText('Original BUY provenance', { exact: true }).first().click();
  await capture(page, 'foreign-cost-provenance-light-1440');
  await book(page, 'ETH:CRYPTO', 'BUY', quantities('1', '100', '0', 'USD'));
  value = await asset(page, 'ETH:CRYPTO');
  observations.push(value);
  expect(value.valuation.status).toBe('stale');
  expect(value.holding.quote.status).toBe('stale');
  await capture(page, 'stale-valuation-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'stale-valuation-light-390');
  await page.setViewportSize({ width: 1440, height: 1024 });
  await book(page, 'RELIANCE:BSE', 'BUY', quantities('1', '100'));
  value = await asset(page, 'RELIANCE:BSE');
  observations.push(value);
  expect(value.holding.baseValue).toBeNull();
  expect(value.holding.quote).toBeNull();
  expect(value.holding.weight).toBeNull();
  await capture(page, 'missing-valuation-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'missing-valuation-light-390');
  await page.setViewportSize({ width: 1440, height: 1024 });
  await route(page, '/holdings');
  value = await asset(page, 'TCS:NSE');
  observations.push(value);
  expect(value.valuation).toMatchObject({
    complete: false,
    status: 'partial',
    coverage: { valued: 3, total: 4 },
  });
  expect(value.holding.weight).toBeNull();
  await capture(page, 'partial-coverage-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'partial-coverage-light-390');
  await route(page, '/transactions?record=' + sale.id);
  await page.getByRole('button', { name: 'Void', exact: true }).click();
  await page
    .getByLabel('Void reason')
    .fill('Explicit local review correction · original sale retained');
  await page.getByRole('button', { name: 'Confirm void', exact: true }).click();
  await expect(
    page.getByText('Voided · Explicit local review correction · original sale retained', {
      exact: true,
    }),
  ).toBeVisible();
  // The existing UI void flow invalidates owned domain queries.
  await route(page, '/holdings');
  value = await asset(page, 'TCS:NSE');
  observations.push(value);
  expect(value.position).toMatchObject({
    quantity: '30',
    localCost: '2015',
    realizedBase: '0',
    dividendBase: '28',
  });
  expect(
    value.activity.items.find((r: { record: { id: string } }) => r.record.id === sale.id),
  ).toMatchObject({
    nativeCashFlow: '2998',
    void: { reason: 'Explicit local review correction · original sale retained' },
  });
  await capture(page, 'void-effect-light-390');
  await page.setViewportSize({ width: 1440, height: 1024 });
  await theme(page, 'dark');
  await capture(page, 'void-effect-dark-1440');
  await route(page, '/holdings/UNKNOWN%3ANSE');
  await expect(page.getByText('This resource is unavailable.', { exact: true })).toBeVisible();
  await capture(page, 'unknown-instrument-dark-1440');
  await writeFile(
    evidence + '/financial-results.json',
    JSON.stringify(
      {
        observations,
        originalSaleRetained: true,
        noPerLotRequests: true,
        readOnlyAssetRetrieval: true,
      },
      null,
      2,
    ),
  );
});
