import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
test.use({ baseURL: 'http://127.0.0.1:5190' });
test.skip(process.env['FOLIO_E2E_JOBS'] !== '1', 'Explicit local jobs/fixture stack required');
const evidence = process.env['FOLIO_JOBS_EVIDENCE_DIR'] ?? '.local/priority-5/visual';
const audits: unknown[] = [];
async function route(page: Page, path: string) {
  await page.evaluate((value) => {
    history.pushState({}, '', value);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function register(page: Page, request: APIRequestContext, origin = 'http://127.0.0.1:5190') {
  const email = 'refresh-' + Date.now() + '@example.test',
    password = 'Local refresh verification passphrase!';
  await page.goto(origin + '/auth/register?theme=dark');
  await page.getByLabel('Name', { exact: true }).fill('Refresh Reviewer');
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
      const m = data.items.find(
        (m: { To: { Mailbox: string; Domain: string }[]; Content: { Body: string } }) =>
          m.To.some((t) => t.Mailbox + '@' + t.Domain === email),
      );
      const raw = m?.Content.Body.replace(/=\r?\n/g, '').replace(/=3D/g, '=') ?? '';
      link = raw.match(/http[^\s]+\/auth\/verify-email#token=[A-Za-z0-9_-]{43}/)?.[0] ?? '';
      return !!link;
    })
    .toBe(true);
  const u = new URL(link);
  await page.goto(origin + u.pathname + u.hash);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await page.goto(origin + '/auth/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const login = page.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const session = await (await login).json();
  await page.getByRole('button', { name: 'Create portfolio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record transaction', exact: true })).toBeVisible();
  const data = await (
    await page.request.get(origin + '/api/v1/portfolios', {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    })
  ).json();
  return { id: data.portfolios[0].id as string, token: session.accessToken as string };
}
async function book(page: Page, id: string, currency: string) {
  await route(page, '/transactions/new?instrument=' + encodeURIComponent(id));
  await page.getByLabel('Canonical instrument').selectOption(id);
  await page.getByLabel('Transaction type').selectOption('BUY');
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T15:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-05');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Native price · ' + currency, { exact: true }).fill('100');
  await page.getByLabel('Native fees / withholding', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review transaction', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
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
async function worker(action: 'stop' | 'start') {
  const docker =
    process.platform === 'win32'
      ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
      : 'docker';
  await promisify(execFile)(docker, [
    'compose',
    '-f',
    'docker-compose.yml',
    '-f',
    'docker-compose.demo.yml',
    '-f',
    'docker-compose.fixture.yml',
    '-f',
    'docker-compose.jobs.yml',
    '--profile',
    'fixture',
    action,
    'fixture-worker',
  ]);
}
async function theme(page: Page, value: 'dark' | 'light') {
  await route(page, '/settings');
  await page.getByLabel('Interface theme').selectOption(value);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Preferences saved.');
  await route(page, '/dashboard');
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
}
test('real owned refresh: durable worker queue, bounded UI, recovery, freshness/coverage and derived visual states', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const a = await register(page, request),
    headers = { Authorization: 'Bearer ' + a.token };
  await book(page, 'TCS:NSE', 'INR');
  await route(page, '/dashboard');
  const control = page.getByRole('complementary', { name: 'Market refresh' }),
    button = control.getByRole('button');
  await expect(button).toBeEnabled();
  await capture(page, 'fresh-dark-1440');
  const snapshot = async () =>
    JSON.stringify(
      await (
        await page.request.get('/api/v1/portfolios/' + a.id + '/ledger?page=1&pageSize=100', {
          headers,
        })
      ).json(),
    );
  const before = await snapshot();
  const runs: unknown[] = [];
  try {
    await worker('stop');
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(control).toContainText('Refresh queued.');
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await capture(page, 'pending-dark-1440');
    await worker('start');
    await expect(control).toContainText('Refresh completed.', { timeout: 15000 });
    await expect(button).toBeEnabled();
    await capture(page, 'success-dark-1440');
    const result = await (
      await page.request.get('/api/v1/portfolios/' + a.id + '/refresh', { headers })
    ).json();
    runs.push(result);
    expect(result.latest.state).toBe('completed');
    expect(await snapshot()).toBe(before);
    await theme(page, 'light');
    await capture(page, 'success-light-1440');
    await page.route('**/api/v1/portfolios/*/refresh', async (r) =>
      r.request().method() === 'POST' ? r.abort('failed') : r.continue(),
    );
    await button.click();
    await expect(control).toContainText('Unable to reach Folio.');
    await expect(button).toHaveText('Retry refresh');
    await capture(page, 'unavailable-light-1440');
    await page.unroute('**/api/v1/portfolios/*/refresh');
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(control).toContainText('Refresh completed.');
    await capture(page, 'explicit-retry-light-1440');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, 'fresh-light-mobile-390');
    await worker('stop');
    await button.click();
    await expect(control).toContainText('Refresh queued.');
    await capture(page, 'pending-light-mobile-390');
    await worker('start');
    await expect(control).toContainText('Refresh completed.', { timeout: 15000 });
    await capture(page, 'success-light-mobile-390');
    const navigation = page.getByRole('button', { name: 'Navigation', exact: true });
    await navigation.focus();
    await page.keyboard.press('Enter');
    await expect(navigation).toHaveAttribute('aria-expanded', 'true');
    const navGeometry = await page.evaluate(() => {
      const menu = document.querySelector('#mobile-nav')!,
        bar = document.querySelector('.topbar') ?? document.querySelector('header')!,
        context = document.querySelector('.portfolio-context')!;
      return {
        barHeight: bar.getBoundingClientRect().height,
        menuTop: menu.getBoundingClientRect().top,
        position: getComputedStyle(menu).position,
        overflow: getComputedStyle(menu).overflowY,
        context: getComputedStyle(context).display,
        dialogs: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length,
      };
    });
    expect(navGeometry).toMatchObject({
      barHeight: 56,
      menuTop: 56,
      position: 'static',
      context: 'none',
      dialogs: 0,
    });
    expect(['auto', 'scroll']).not.toContain(navGeometry.overflow);
    await expect(
      page.locator('#mobile-nav').getByRole('link', { name: 'Dashboard', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await capture(page, 'navigation-open-light-mobile-390');
    await page.keyboard.press('Escape');
    await expect(navigation).toHaveAttribute('aria-expanded', 'false');
    await navigation.click();
    await page.getByRole('link', { name: 'Holdings', exact: true }).click();
    await expect(navigation).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeEnabled();
    await capture(page, 'holdings-refresh-light-mobile-390');
    await page.route('**/api/v1/portfolios/*/refresh', async (r) =>
      r.request().method() === 'POST' ? r.abort('failed') : r.continue(),
    );
    await button.click();
    await expect(button).toHaveText('Retry refresh');
    await capture(page, 'unavailable-light-mobile-390');
    await page.unroute('**/api/v1/portfolios/*/refresh');
    await button.click();
    await expect(control).toContainText('Refresh completed.');
    await capture(page, 'retry-light-mobile-390');
    await page.setViewportSize({ width: 1440, height: 1024 });
    await theme(page, 'dark');
    await book(page, 'ETH:CRYPTO', 'USD');
    await route(page, '/dashboard');
    await button.click();
    await expect(control).toContainText('Refresh completed with missing or stale inputs.');
    await expect(control).toContainText('stale 1');
    await capture(page, 'stale-dark-1440');
    await book(page, 'RELIANCE:BSE', 'INR');
    await route(page, '/dashboard');
    await button.click();
    await expect(control).toContainText('missing 1');
    await capture(page, 'partial-dark-1440');
    await theme(page, 'light');
    await capture(page, 'partial-light-1440');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, 'partial-light-mobile-390');
    await route(page, '/holdings/RELIANCE%3ABSE');
    await expect(
      page.getByRole('heading', { name: 'Reliance Industries Limited', exact: true }),
    ).toBeVisible();
    await capture(page, 'missing-quote-light-mobile-390');
    await page.setViewportSize({ width: 768, height: 1024 });
    await route(page, '/dashboard');
    await capture(page, 'partial-light-tablet-768');
    runs.push(
      await (await page.request.get('/api/v1/portfolios/' + a.id + '/refresh', { headers })).json(),
    );
    await writeFile(
      evidence + '/job-results.json',
      JSON.stringify(
        { runs, ledgerUnchangedByInitialRefresh: true, normalProviderEntitlementClaimed: false },
        null,
        2,
      ),
    );
  } finally {
    await worker('start');
  }
});
test('normal account refresh remains unavailable without permitted providers and never receives fixture observations', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await register(page, request, 'http://127.0.0.1:5173');
  await book(page, 'TCS:NSE', 'INR');
  await route(page, '/dashboard');
  const control = page.getByRole('complementary', { name: 'Market refresh' });
  await control.getByRole('button').click();
  await expect(control).toContainText('No permitted quote was returned.');
  await expect(control).toContainText('accepted 0/1');
  await expect(page.getByText('Local writable fixture v1', { exact: false })).toHaveCount(0);
  await capture(page, 'provider-unavailable-normal-dark-1440');
  await control.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(control).toContainText('No permitted quote was returned.');
  await theme(page, 'light');
  await capture(page, 'provider-unavailable-normal-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'provider-unavailable-normal-light-mobile-390');
});
