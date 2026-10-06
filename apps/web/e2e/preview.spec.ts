import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ baseURL: 'http://127.0.0.1:5190' });
test.skip(process.env['FOLIO_E2E_FIXTURE'] !== '1', 'Explicit local fixture stack required');
const evidence = process.env['FOLIO_PREVIEW_EVIDENCE_DIR'] ?? '.local/priority-3/visual';
const audits: unknown[] = [];
async function register(page: Page, request: APIRequestContext) {
  const email = 'preview-' + Date.now() + '@example.test',
    password = 'A long isolated preview passphrase!';
  await page.goto('/auth/register?theme=dark');
  await page.getByLabel('Name', { exact: true }).fill('Transaction Review Reviewer');
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
async function enter(page: Page, instrument = 'AAPL:US', fees = '0') {
  await expect(page.getByLabel('Canonical instrument')).toBeEnabled();
  await page.getByLabel('Canonical instrument').selectOption(instrument);
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T15:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-05');
  await page.getByLabel('Quantity', { exact: true }).fill('10');
  await page.getByLabel(/^Native price ·/).fill('100');
  await page.getByLabel('Native fees / withholding', { exact: true }).fill(fees);
}
async function review(page: Page) {
  const result = page.waitForResponse(
    (r) => r.url().endsWith('/ledger/preview') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  const response = await result;
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Review transaction', exact: true }),
  ).toBeFocused();
  return response.json();
}
async function override(page: Page) {
  await page.getByLabel('Explicit historical FX override').check();
  await page.getByLabel('Historical FX · INR per native unit').fill('84.1234567890123456789');
  await page.getByLabel('Actual FX rate date').fill('2026-01-02');
  await page
    .getByLabel('FX source / provenance reference')
    .fill('Explicit local test statement · manual historical override');
}
async function formTheme(page: Page, theme: 'dark' | 'light') {
  const navigate = async (path: string) => {
    await page.evaluate((value) => {
      history.pushState({}, '', value);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  };
  // Exercise real preference controls and SPA navigation; avoid needless page
  // reloads competing with the unchanged shared-IP refresh security limiter.
  await navigate('/settings');
  await page.getByLabel('Interface theme').selectOption(theme);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Preferences saved.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await navigate('/transactions/new');
}
test('real server preview: exact FX/effects, no booking, override, missing/error, expiry and concurrent-ledger revalidation across themes/mobile', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const session = await register(page, request);
  const headers = {
    Authorization: 'Bearer ' + session.token,
    Origin: 'http://127.0.0.1:5190',
    'X-Folio-CSRF': '1',
  };
  const base = '/api/v1/portfolios/' + session.portfolioId;
  const ledgerCount = async () =>
    (await (await page.request.get(base + '/ledger', { headers })).json()).total;
  const results: unknown[] = [];
  const retain = (value: { receipt: string; [key: string]: unknown }) => {
    const { receipt, ...safe } = value;
    void receipt;
    results.push(safe);
  };
  await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
  await enter(page, 'TCS:NSE', '10');
  const native = await review(page);
  retain(native);
  expect(native).toMatchObject({
    fxMode: 'identity',
    fx: { rate: '1', source: 'identity' },
    effects: {
      nativeCashFlow: '-1010',
      baseCashFlow: '-1010',
      after: { quantity: '10', baseCost: '1010' },
    },
  });
  expect(await ledgerCount()).toBe(0);
  await capture(page, 'inr-review-dark-1440');
  await page.getByRole('button', { name: 'Back to entry' }).click();
  await enter(page);
  const automatic = await review(page);
  retain(automatic);
  expect(automatic).toMatchObject({
    fxMode: 'automatic',
    fx: { rate: '83', rateDate: '2026-01-05', source: 'local-fixture' },
    effects: { baseCashFlow: '-83000', baseCostChange: '83000' },
  });
  await expect(page.getByText('83 INR per USD · 2026-01-05')).toBeVisible();
  await capture(page, 'automatic-fx-dark-1440');
  await page.getByRole('button', { name: 'Back to entry' }).click();
  await override(page);
  const manual = await review(page);
  retain(manual);
  expect(manual).toMatchObject({
    fxMode: 'override',
    fx: { rate: '84.1234567890123456789', source: 'manual', rateDate: '2026-01-02' },
    effects: { baseCashFlow: '-84123.4567890123456789' },
  });
  await capture(page, 'manual-fx-dark-1440');
  await formTheme(page, 'light');
  await enter(page);
  await override(page);
  const light = await review(page);
  retain(light);
  await capture(page, 'manual-fx-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'manual-fx-light-390');
  await page.getByText('Exact decimal calculation values', { exact: true }).click();
  await expect(page.getByText('-84123.4567890123456789', { exact: true })).toBeVisible();
  await capture(page, 'exact-decimals-light-390');
  await page.getByText('Exact decimal calculation values', { exact: true }).click();
  // Advance only the browser clock; real server expiry is independently tested in integration.
  await page.clock.setFixedTime(new Date(Date.parse(light.expiresAt) + 1));
  await expect(page.getByRole('alert')).toContainText('expired');
  await expect(page.getByRole('button', { name: 'Confirm record', exact: true })).toBeDisabled();
  await capture(page, 'expired-review-light-390');
  await page.clock.setFixedTime(new Date());
  const revalidated = page.waitForResponse((r) => r.url().endsWith('/ledger/preview'));
  await page.getByRole('button', { name: 'Revalidate transaction' }).focus();
  await page.keyboard.press('Enter');
  expect((await revalidated).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Confirm record', exact: true })).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: 'Review transaction', exact: true }),
  ).toBeFocused();
  expect(await ledgerCount()).toBe(0);
  await capture(page, 'revalidated-review-light-390');
  await page.getByRole('button', { name: 'Back to entry' }).click();
  await page.getByLabel('Explicit historical FX override').uncheck();
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-06T15:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-06');
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Historical reference FX is unavailable');
  await expect(page.getByRole('button', { name: 'Confirm record', exact: true })).toHaveCount(0);
  await capture(page, 'missing-fx-light-390');
  await page.getByLabel('Quantity', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'plain decimal' })).toBeVisible();
  await capture(page, 'entry-validation-light-390');
  expect(await ledgerCount()).toBe(0);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await formTheme(page, 'dark');
  await enter(page);
  await page.getByLabel('Transaction type').selectOption('DIVIDEND');
  await page.getByLabel('Gross native dividend').fill('1');
  await page.getByLabel('Native fees / withholding').fill('2');
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cannot exceed gross dividend');
  await capture(page, 'financial-validation-dark-1440');
  await page.getByLabel('Transaction type').selectOption('BUY');
  await enter(page);
  await review(page);
  const concurrentInput = {
    instrumentId: 'TCS:NSE',
    type: 'BUY',
    quantity: '1',
    price: '100',
    fees: '0',
    effectiveAt: '2026-01-05T15:00:00.000Z',
    tradingDate: '2026-01-05',
  };
  const externalPreview = await page.request.post(base + '/ledger/preview', {
    headers,
    data: concurrentInput,
  });
  expect(externalPreview.status()).toBe(200);
  const external = await externalPreview.json();
  const booked = await page.request.post(base + '/ledger', {
    headers: {
      ...headers,
      'Idempotency-Key': 'concurrent-review-change',
      'Transaction-Preview': external.receipt,
    },
    data: concurrentInput,
  });
  expect(booked.status()).toBe(200);
  expect(await ledgerCount()).toBe(1);
  const rejected = page.waitForResponse(
    (r) => r.url().endsWith('/ledger') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  expect((await rejected).status()).toBe(409);
  await expect(page.getByRole('button', { name: 'Revalidate transaction' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm record', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Review transaction', exact: true }),
  ).toBeFocused();
  expect(await ledgerCount()).toBe(1);
  await capture(page, 'changed-review-dark-1440');
  await page.getByRole('button', { name: 'Revalidate transaction' }).click();
  await expect(page.getByRole('button', { name: 'Confirm record', exact: true })).toBeEnabled();
  expect(await ledgerCount()).toBe(1);
  await capture(page, 'fresh-review-after-change-dark-1440');
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  expect(await ledgerCount()).toBe(2);
  const value = await (await page.request.get(base + '/valuation', { headers })).json();
  expect(value).toMatchObject({
    totalValue: '96870',
    totalBaseCost: '83100',
    unrealizedBase: '13770',
  });
  await formTheme(page, 'light');
  await enter(page);
  await review(page);
  await capture(page, 'automatic-fx-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'automatic-fx-light-390');
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture(page, 'automatic-fx-light-768');
  await writeFile(
    evidence + '/financial-results.json',
    JSON.stringify(
      {
        previews: results,
        finalLedgerCount: 2,
        finalValuation: value,
        previewNeverBooked: true,
        rejectedConfirmationNeverBooked: true,
      },
      null,
      2,
    ),
  );
});
test('uncertain booking response retries the original idempotency key and never books twice', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const session = await register(page, request);
  await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
  await enter(page, 'TCS:NSE', '10');
  await review(page);
  let originalKey = '';
  await page.route('**/api/v1/portfolios/*/ledger', async (route) => {
    originalKey = route.request().headers()['idempotency-key']!;
    const result = await route.fetch();
    expect(result.status()).toBe(200);
    // Real server booking succeeds; simulate losing only its response.
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry confirmation', exact: true })).toBeVisible();
  await capture(page, 'uncertain-confirmation-dark-1440');
  await page.unroute('**/api/v1/portfolios/*/ledger');
  const retry = page.waitForResponse(
    (r) => r.url().endsWith('/ledger') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Retry confirmation', exact: true }).click();
  const response = await retry;
  expect(response.request().headers()['idempotency-key']).toBe(originalKey);
  expect((await response.json()).duplicate).toBe(true);
  await expect(page).toHaveURL(/\/transactions$/);
  const ledger = await (
    await page.request.get('/api/v1/portfolios/' + session.portfolioId + '/ledger', {
      headers: { Authorization: 'Bearer ' + session.token },
    })
  ).json();
  expect(ledger.total).toBe(1);
});
