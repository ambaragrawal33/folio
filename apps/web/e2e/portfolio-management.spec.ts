import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
test.use({ baseURL: 'http://127.0.0.1:5190' });
test.setTimeout(180000);
test.skip(
  process.env['FOLIO_E2E_FIXTURE'] !== '1',
  'Explicit isolated local fixture stack required',
);
const origin = 'http://127.0.0.1:5190',
  password = 'Local portfolio management verification passphrase!';
const evidence = process.env['FOLIO_MANAGEMENT_EVIDENCE_DIR'] ?? '.local/priority-6/visual',
  audits: unknown[] = [];
async function route(page: Page, path: string) {
  await page.evaluate((v) => {
    history.pushState({}, '', v);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  return (await (await response).json()).accessToken as string;
}
async function register(page: Page, request: APIRequestContext) {
  const email = 'management-' + Date.now() + '@example.test';
  await page.goto('/auth/register?theme=dark');
  await page.getByLabel('Name', { exact: true }).fill('Portfolio Reviewer');
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
      return Boolean(link);
    })
    .toBe(true);
  const u = new URL(link);
  await page.goto(u.pathname + u.hash);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  const token = await login(page, email);
  await page.getByRole('button', { name: 'Create portfolio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record transaction', exact: true })).toBeVisible();
  const p = (
    await (
      await page.request.get(origin + '/api/v1/portfolios', {
        headers: { Authorization: 'Bearer ' + token },
      })
    ).json()
  ).portfolios[0];
  return { email, token, p };
}
async function settings(page: Page) {
  await route(page, '/settings#portfolio-defaults');
  await expect(page.getByLabel('Default portfolio name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save portfolio name' })).toBeEnabled();
}
async function theme(page: Page, value: 'dark' | 'light') {
  await route(page, '/settings');
  await page.getByLabel('Interface theme').selectOption(value);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
}
async function capture(page: Page, name: string, focus = true) {
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  if (focus)
    await page.locator('#portfolio-defaults').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    height: innerHeight,
    document: document.documentElement.scrollWidth,
    scrollY,
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
  await page.screenshot({ path: evidence + '/' + name + '-viewport.png' });
  await page.screenshot({ path: evidence + '/' + name + '.png', fullPage: true });
}
async function restartAPI() {
  await promisify(execFile)(
    process.platform === 'win32'
      ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
      : 'docker',
    [
      'compose',
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.fixture.yml',
      '--profile',
      'fixture',
      'restart',
      'fixture-api',
    ],
  );
}
test('fresh verified account: rename/validation/restart persistence, safe failure/retry, empty deletion/replacement and populated block', async ({
  page,
  request,
}) => {
  const { email, p } = await register(page, request);
  await settings(page);
  await capture(page, 'default-dark-1440');
  await page.getByLabel('Default portfolio name').fill('Long-term investments');
  await capture(page, 'rename-edit-dark-1440');
  await page.getByLabel('Default portfolio name').fill('<script>');
  await page.getByRole('button', { name: 'Save portfolio name' }).click();
  await expect(page.getByLabel('Default portfolio name')).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'Use letters' })).toBeVisible();
  await capture(page, 'rename-validation-dark-1440');
  await page.getByLabel('Default portfolio name').fill('Long-term investments');
  await page.getByRole('button', { name: 'Save portfolio name' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Portfolio name saved.' })).toBeVisible();
  await capture(page, 'rename-success-dark-1440');
  await page.reload();
  await expect(page.getByLabel('Default portfolio name')).toHaveValue('Long-term investments');
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await login(page, email);
  await settings(page);
  await expect(page.getByLabel('Default portfolio name')).toHaveValue('Long-term investments');
  await restartAPI();
  await expect
    .poll(
      async () => {
        try {
          return (await request.get(origin + '/api/ready')).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  await page.reload();
  // Isolated fixture defaults regenerate development signing keys on API restart.
  // Re-authenticate explicitly; verify durable account/portfolio data, not session continuity.
  await login(page, email);
  await expect(page.getByRole('button', { name: 'Record transaction', exact: true })).toBeVisible();
  await settings(page);
  await expect(page.getByLabel('Default portfolio name')).toHaveValue('Long-term investments');
  await page.route('**/api/v1/portfolios/' + p.id, (r) =>
    r.request().method() === 'PATCH' ? r.abort('failed') : r.continue(),
  );
  await page.getByLabel('Default portfolio name').fill('Recovery label');
  await page.getByRole('button', { name: 'Save portfolio name' }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to reach Folio');
  await capture(page, 'rename-unavailable-dark-1440');
  await page.unroute('**/api/v1/portfolios/' + p.id);
  await page.getByRole('button', { name: 'Save portfolio name' }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Portfolio name saved.' })).toBeVisible();
  await capture(page, 'rename-recovered-dark-1440');
  await page.getByRole('button', { name: 'Delete portfolio', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Confirm empty portfolio deletion' }),
  ).toBeFocused();
  await capture(page, 'delete-confirm-dark-1440');
  await page.getByRole('button', { name: 'Confirm deletion' }).click();
  await expect(page.getByRole('alert')).toContainText('Type DELETE exactly');
  await capture(page, 'delete-validation-dark-1440');
  await page.getByRole('button', { name: 'Cancel portfolio deletion' }).click();
  await theme(page, 'light');
  await settings(page);
  await capture(page, 'default-light-1440');
  await page.getByRole('button', { name: 'Delete portfolio', exact: true }).click();
  await capture(page, 'delete-confirm-light-1440');
  await page.getByRole('button', { name: 'Cancel portfolio deletion' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'default-light-mobile-390');
  await page.getByLabel('Default portfolio name').fill('Mobile investments');
  await capture(page, 'rename-edit-light-mobile-390');
  await page.getByLabel('Default portfolio name').fill('<unsafe>');
  await page.getByRole('button', { name: 'Save portfolio name' }).press('Enter');
  await expect(page.getByLabel('Default portfolio name')).toBeFocused();
  await capture(page, 'rename-validation-light-mobile-390');
  await page.getByLabel('Default portfolio name').fill('Mobile investments');
  await page.getByRole('button', { name: 'Save portfolio name' }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Portfolio name saved.' })).toBeVisible();
  await capture(page, 'rename-success-light-mobile-390');
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Navigation', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await capture(page, 'navigation-open-light-mobile-390', false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Navigation', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.getByRole('button', { name: 'Delete portfolio', exact: true }).click();
  await capture(page, 'delete-confirm-light-mobile-390');
  await page.getByLabel('Type DELETE to confirm portfolio deletion').fill('DELETE');
  await page.getByRole('button', { name: 'Confirm deletion' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Create your first portfolio' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Empty portfolio deleted.' }),
  ).toBeFocused();
  await capture(page, 'deleted-first-flow-light-mobile-390', false);
  await page.getByRole('button', { name: 'Create portfolio', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Record transaction', exact: true })).toBeVisible();
  await route(page, '/transactions/new?instrument=TCS%3ANSE');
  await page.getByLabel('Canonical instrument').selectOption('TCS:NSE');
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T15:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-05');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Native price · INR', { exact: true }).fill('100');
  await page.getByLabel('Native fees / withholding').fill('1');
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review transaction', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await settings(page);
  await expect(page.getByRole('button', { name: 'Delete portfolio', exact: true })).toBeDisabled();
  await expect(
    page.getByText(
      /This portfolio has transaction history or economic state and cannot be deleted/,
    ),
  ).toBeVisible();
  await capture(page, 'populated-block-light-mobile-390');
  await page.setViewportSize({ width: 1440, height: 1024 });
  await capture(page, 'populated-block-light-1440');
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture(page, 'populated-block-light-tablet-768');
  await page.setViewportSize({ width: 1440, height: 1024 });
  await theme(page, 'dark');
  await settings(page);
  await capture(page, 'populated-block-dark-1440');
  const session = await page.request.post(origin + '/api/v1/auth/login', {
    headers: { Origin: origin, 'X-Folio-CSRF': '1' },
    data: { email, password },
  });
  const token = (await session.json()).accessToken;
  const h = { Authorization: 'Bearer ' + token, Origin: origin, 'X-Folio-CSRF': '1' };
  const replacement = (
    await (await page.request.get(origin + '/api/v1/portfolios', { headers: h })).json()
  ).portfolios[0];
  expect(replacement.id).not.toBe(p.id);
  const before = await (
    await page.request.get(origin + '/api/v1/portfolios/' + replacement.id + '/ledger', {
      headers: h,
    })
  ).json();
  const blocked = await page.request.delete(origin + '/api/v1/portfolios/' + replacement.id, {
    headers: { ...h, 'Idempotency-Key': crypto.randomUUID() },
    data: { confirmation: 'DELETE', expectedVersion: replacement.managementVersion },
  });
  expect(blocked.status()).toBe(409);
  expect(blocked.headers()['cache-control']).toBe('no-store');
  expect(
    await (
      await page.request.get(origin + '/api/v1/portfolios/' + replacement.id + '/ledger', {
        headers: h,
      })
    ).json(),
  ).toEqual(before);
  expect(before.items).toHaveLength(1);
  expect(before.items[0].record.quantity).toBe('2');
  expect(
    (
      await page.request.get(origin + '/api/v1/portfolios/' + p.id + '/management', { headers: h })
    ).status(),
  ).toBe(404);
  await writeFile(
    evidence + '/journey-results.json',
    JSON.stringify(
      {
        apiRestartPersistence: true,
        logoutLoginPersistence: true,
        emptyDeletion: true,
        replacementDistinct: true,
        populatedDeletionStatus: blocked.status(),
        ledgerUnchanged: true,
        deletedResourceStatus: 404,
      },
      null,
      2,
    ),
  );
});
test('committed deletion with lost response: original-key retry returns receipt and never removes a replacement', async ({
  page,
  request,
}) => {
  const { p, token } = await register(page, request);
  await settings(page);
  const keys: string[] = [];
  let responseLost = false;
  await page.route('**/api/v1/portfolios/' + p.id, async (r) => {
    if (r.request().method() !== 'DELETE') {
      await r.continue();
      return;
    }
    keys.push(r.request().headers()['idempotency-key'] ?? '');
    if (!responseLost) {
      const actual = await r.fetch();
      expect(actual.status()).toBe(200);
      responseLost = true;
      await r.abort('failed');
    } else await r.continue();
  });
  await page.getByRole('button', { name: 'Delete portfolio', exact: true }).click();
  await page.getByLabel('Type DELETE to confirm portfolio deletion').fill('DELETE');
  await page.getByRole('button', { name: 'Confirm deletion' }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to reach Folio');
  await capture(page, 'delete-uncertain-dark-1440');
  const h = { Authorization: 'Bearer ' + token, Origin: origin, 'X-Folio-CSRF': '1' };
  expect(
    (await (await page.request.get(origin + '/api/v1/portfolios', { headers: h })).json())
      .portfolios,
  ).toEqual([]);
  const replacement = await (
    await page.request.post(origin + '/api/v1/portfolios/default', { headers: h, data: {} })
  ).json();
  expect(replacement.id).not.toBe(p.id);
  const retry = page.waitForResponse(
    (r) => r.url().endsWith('/portfolios/' + p.id) && r.request().method() === 'DELETE',
  );
  await page.getByRole('button', { name: 'Retry deletion' }).press('Enter');
  expect((await (await retry).json()).duplicate).toBe(true);
  await page.unroute('**/api/v1/portfolios/' + p.id);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Record transaction', exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(
    (await (await page.request.get(origin + '/api/v1/portfolios', { headers: h })).json())
      .portfolios[0].id,
  ).toBe(replacement.id);
  await settings(page);
  await capture(page, 'replacement-safe-after-retry-dark-1440');
});
test('stale Settings after an owned out-of-band deletion recover to the existing first-portfolio flow', async ({
  page,
  request,
}) => {
  const { p, token } = await register(page, request);
  await settings(page);
  const deleted = await page.request.delete(origin + '/api/v1/portfolios/' + p.id, {
    headers: {
      Authorization: 'Bearer ' + token,
      Origin: origin,
      'X-Folio-CSRF': '1',
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { confirmation: 'DELETE', expectedVersion: 0 },
  });
  expect(deleted.status()).toBe(200);
  await page.getByLabel('Default portfolio name').fill('Stale edit');
  await page.getByRole('button', { name: 'Save portfolio name' }).click();
  await expect(page.getByRole('alert')).toContainText('This resource is unavailable.');
  await capture(page, 'stale-deleted-resource-dark-1440');
  await page.getByRole('button', { name: 'Reload portfolio details' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Create your first portfolio' })).toBeVisible();
  await expect(page.getByText('Empty portfolio deleted.', { exact: false })).toHaveCount(0);
  await capture(page, 'stale-first-flow-dark-1440', false);
});
