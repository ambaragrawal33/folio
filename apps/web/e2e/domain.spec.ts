import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const evidence = process.env['FOLIO_DOMAIN_EVIDENCE_DIR'] ?? 'docs/evidence/phase-3/visual';
const password = 'A long financial browser test passphrase!';
const audits: unknown[] = [];
async function route(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function verifyMail(request: APIRequestContext, email: string) {
  let link = '';
  await expect
    .poll(async () => {
      const r = await request.get('http://127.0.0.1:8025/api/v2/messages?limit=100');
      const data = (await r.json()) as {
        items: { To: { Mailbox: string; Domain: string }[]; Content: { Body: string } }[];
      };
      const m = data.items.find((m) => m.To.some((t) => t.Mailbox + '@' + t.Domain === email));
      const raw = m?.Content.Body.replace(/=\r?\n/g, '').replace(/=3D/g, '=') ?? '';
      link = raw.match(/http[^\s]+\/auth\/verify-email#token=[A-Za-z0-9_-]{43}/)?.[0] ?? '';
      return !!link;
    })
    .toBe(true);
  const url = new URL(link);
  return url.pathname + url.hash;
}
async function capture(page: Page, name: string, mobile = false) {
  await page.evaluate(() => document.fonts.ready);
  // Start full-page capture at the document origin; retain real focus and fixed-link behavior.
  await page.evaluate(() => window.scrollTo(0, 0));
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    height: innerHeight,
    theme: document.documentElement.dataset['theme'],
    document: document.documentElement.scrollWidth,
    independentScroll: [...document.querySelectorAll('main *, .workspace')]
      .filter((el) => {
        const s = getComputedStyle(el);
        return ['auto', 'scroll'].includes(s.overflowY) && el.scrollHeight > el.clientHeight;
      })
      .map((el) => el.className),
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.independentScroll).toEqual([]);
  expect(geometry.viewport).toBe(mobile ? 390 : 1440);
  expect(geometry.height).toBe(mobile ? 844 : 1024);
  expect(geometry.theme).toBe(name.includes('-dark-') ? 'dark' : 'light');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  audits.push({ name, geometry, axeViolations: axe.violations });
  await writeFile(evidence + '/browser-checks.json', JSON.stringify(audits, null, 2));
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: evidence + '/' + name + '.png', fullPage: true });
}
async function record(
  page: Page,
  type: string,
  fields: Record<string, string>,
  pendingCheck = false,
) {
  await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
  await page.getByLabel('Canonical instrument').selectOption('TCS:NSE');
  await page.getByLabel('Transaction type').selectOption(type);
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T10:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-05');
  for (const [label, value] of Object.entries(fields))
    await page.getByLabel(label, { exact: true }).fill(value);
  await capture(page, 'manual-' + type.toLowerCase() + '-dark-1440');
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review transaction' })).toBeFocused();
  let release: (() => void) | undefined;
  if (pendingCheck) {
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/portfolios/*/ledger', async (intercepted) => {
      if (intercepted.request().method() === 'POST') await wait;
      await intercepted.continue(); // Delay the real request; never fabricate an API response.
    });
  }
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  if (pendingCheck) {
    const pending = page.getByRole('button', { name: 'Recording…', exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute('data-state', 'Disabled');
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    await capture(page, 'record-pending-dark-1440');
    release!();
    await expect(page).toHaveURL(/\/transactions$/);
    await page.unrouteAll({ behavior: 'wait' });
  }
  await expect(page).toHaveURL(/\/transactions$/);
}
test('real ledger entry/review/FIFO/split/dividend/void, truthful degraded valuation, desktop/mobile accessibility', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  await mkdir(evidence, { recursive: true });
  const email = 'phase3-' + Date.now() + '@example.test';
  await page.goto('/auth/register');
  await page.getByLabel('Name', { exact: true }).fill('Financial Browser Reviewer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toContainText('If this address');
  await page.goto(await verifyMail(request, email));
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create portfolio' })).toBeVisible();
  await capture(page, 'onboarding-dark-1440');
  await page.getByRole('button', { name: 'Create portfolio' }).click();
  await expect(page.getByRole('button', { name: 'Record transaction' })).toBeVisible();
  await capture(page, 'dashboard-empty-dark-1440');
  await record(
    page,
    'BUY',
    {
      Quantity: '10',
      'Native price · INR': '100',
      'Native fees / withholding': '10',
    },
    true,
  );
  await record(page, 'BUY', {
    Quantity: '5',
    'Native price · INR': '120',
    'Native fees / withholding': '5',
  });
  await record(page, 'SELL', {
    Quantity: '12',
    'Native price · INR': '150',
    'Native fees / withholding': '12',
  });
  await record(page, 'SPLIT', {
    'Split numerator · new units': '2',
    'Split denominator · old units': '1',
  });
  await record(page, 'DIVIDEND', {
    'Gross native dividend': '30',
    'Native fees / withholding': '2',
  });
  const globalSearch = page.getByRole('searchbox', { name: 'Global search' });
  await globalSearch.fill('TCS');
  await expect(
    page.getByRole('region', { name: 'Search results' }).getByText('Your owned ledger'),
  ).toBeVisible();
  await globalSearch.press('Tab');
  await expect(page.getByRole('button', { name: 'Close search' })).toBeFocused();
  await capture(page, 'global-search-dark-1440');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Search results' })).toHaveCount(0);
  for (const theme of ['dark', 'light']) {
    // Theme controls preserve the session; repeated reloads consume the unchanged refresh IP limit.
    await route(page, '/settings');
    await page.getByLabel('Interface theme').selectOption(theme);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Preferences saved.');
    for (const route of ['dashboard', 'holdings', 'transactions', 'holdings/TCS%3ANSE']) {
      await page.evaluate(
        (path) => {
          history.pushState({}, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        },
        '/' + route + '?theme=' + theme,
      );
      await expect(page.locator('.portfolio-screen')).toBeVisible();
      await expect(
        page.locator('.portfolio-screen .ds-content').filter({ hasText: 'Loading' }),
      ).toHaveCount(0);
      if (route === 'holdings/TCS%3ANSE') {
        await expect(page.getByText('₹536.00')).toBeVisible();
        await expect(page.getByText('₹28.00')).toBeVisible();
        await expect(page.getByText('INR 60.5')).toBeVisible();
      }
      await capture(page, route.replace('/TCS%3ANSE', '-asset') + '-' + theme + '-1440');
    }
    await route(page, '/transactions/new?theme=' + theme);
    await page.getByRole('button', { name: 'Review transaction' }).click();
    await expect(page.getByRole('alert')).toContainText('plain decimal');
    await capture(page, 'entry-validation-' + theme + '-1440');
    await page.getByLabel('Canonical instrument').selectOption('AAPL:US');
    await page.getByLabel('Explicit historical FX override').check();
    await page.getByLabel('Historical FX · INR per native unit').fill('83');
    await page.getByLabel('Actual FX rate date').fill('2026-01-05');
    await page
      .getByLabel('FX source / provenance reference')
      .fill('Explicit browser-test historical FX fixture');
    await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T15:00');
    await page.getByLabel('Exchange trading date').fill('2026-01-05');
    await page.getByLabel('Quantity', { exact: true }).fill('10');
    await page.getByLabel('Native price · USD').fill('100');
    await capture(page, 'fx-override-' + theme + '-1440');
    await page.getByRole('button', { name: 'Review transaction' }).click();
    await capture(page, 'transaction-review-' + theme + '-1440');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    'dashboard',
    'holdings',
    'transactions',
    'holdings/TCS%3ANSE',
    'transactions/new',
  ]) {
    await page.evaluate(
      (path) => {
        history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      },
      '/' + route + '?theme=light',
    );
    await expect(page.locator('.portfolio-screen')).toBeVisible();
    await expect(
      page.locator('.portfolio-screen .ds-content').filter({ hasText: 'Loading' }),
    ).toHaveCount(0);
    await capture(
      page,
      route.replace('/TCS%3ANSE', '-asset').replace('/new', '-entry') + '-light-390',
      true,
    );
  }
  const nav = page.getByRole('button', { name: 'Navigation' });
  await page.getByRole('button', { name: 'Review transaction' }).click();
  await capture(page, 'entry-validation-light-390', true);
  await page.getByLabel('Transaction type').selectOption('SPLIT');
  await page.getByLabel('Split numerator · new units').fill('2');
  await page.getByLabel('Split denominator · old units').fill('1');
  await capture(page, 'manual-split-light-390', true);
  await page.getByLabel('Transaction type').selectOption('DIVIDEND');
  await page.getByLabel('Gross native dividend').fill('30');
  await page.getByLabel('Native fees / withholding').fill('2');
  await capture(page, 'manual-dividend-light-390', true);
  await page.getByLabel('Transaction type').selectOption('BUY');
  await page.getByLabel('Canonical instrument').selectOption('AAPL:US');
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T15:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-05');
  await page.getByLabel('Quantity', { exact: true }).fill('10');
  await page.getByLabel('Native price · USD').fill('100');
  await page.getByLabel('Explicit historical FX override').check();
  await page.getByLabel('Historical FX · INR per native unit').fill('83');
  await page.getByLabel('Actual FX rate date').fill('2026-01-05');
  await page
    .getByLabel('FX source / provenance reference')
    .fill('Explicit browser-test historical FX fixture');
  await capture(page, 'fx-override-light-390', true);
  await page.getByRole('button', { name: 'Review transaction' }).click();
  await expect(page.getByRole('heading', { name: 'Review transaction' })).toBeFocused();
  await capture(page, 'transaction-review-light-390', true);
  await page.getByRole('button', { name: 'Back to entry', exact: true }).click();
  await page.getByLabel('Canonical instrument').selectOption('TCS:NSE');
  await expect(page.getByLabel('Explicit historical FX override')).toHaveCount(0);
  await page.getByLabel('Transaction type').selectOption('SELL');
  await page.getByLabel('Quantity', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Review transaction' }).click();
  await expect(page.getByRole('alert')).toContainText('sell more units than held');
  await expect(page.getByRole('button', { name: 'Confirm record', exact: true })).toHaveCount(0);
  await capture(page, 'oversell-error-light-390', true);
  await nav.click();
  await expect(nav).toHaveAttribute('aria-expanded', 'true');
  await capture(page, 'navigation-open-light-390', true);
  await page.keyboard.press('Escape');
  await expect(nav).toHaveAttribute('aria-expanded', 'false');
  await nav.click();
  await page
    .getByRole('navigation', { name: 'Mobile primary' })
    .getByRole('link', { name: 'Transactions', exact: true })
    .click();
  await expect(nav).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Details · Recorded' }).first().click();
  await page.getByRole('button', { name: 'Void', exact: true }).click();
  await page.getByLabel('Void reason').fill('Browser fixture correction');
  await capture(page, 'void-confirmation-light-390', true);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await capture(page, 'void-confirmation-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Confirm void' }).click();
  await expect(page.getByText('Voided · Browser fixture correction')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1024 });
  for (const theme of ['dark', 'light']) {
    await route(page, '/settings?theme=' + theme);
    await page.getByLabel('Interface theme').selectOption(theme);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Preferences saved.');
    await expect(page.getByLabel('Portfolio base currency')).toHaveValue('INR');
    await expect(page.getByLabel('Portfolio cost basis')).toHaveValue('FIFO');
    await expect(page.getByRole('link', { name: 'Portfolio Defaults', exact: true })).toBeVisible();
    await expect(
      page.getByText('Your owned portfolios, ledger and void records are included.'),
    ).toBeVisible();
    await capture(page, 'portfolio-settings-' + theme + '-1440');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'portfolio-settings-light-390', true);
  // Erase this real test account and all of its owned domain data through the normal privacy boundary.
  await route(page, '/settings?theme=light');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByLabel('Type DELETE', { exact: true }).fill('DELETE');
  await page.getByRole('button', { name: 'Permanently delete account', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
});
test('isolated real read-only demo with labelled fixtures and no live providers', async ({
  page,
}) => {
  test.skip(process.env['FOLIO_E2E_DEMO'] !== '1', 'Requires the isolated demo Compose profile.');
  test.setTimeout(90000);
  await mkdir(evidence, { recursive: true });
  await page.goto('http://127.0.0.1:5180/auth/login?theme=dark');
  await expect(page.getByRole('button', { name: 'Explore read-only demo' })).toBeVisible();
  await capture(page, 'demo-entry-dark-1440');
  await page.goto('http://127.0.0.1:5180/auth/login?theme=light');
  await expect(page.getByRole('button', { name: 'Explore read-only demo' })).toBeVisible();
  await capture(page, 'demo-entry-light-1440');
  await page.getByRole('button', { name: 'Explore read-only demo' }).click();
  await expect(page.getByLabel('Read-only demo')).toBeVisible();
  await expect(page.getByText('₹2,15,316.00', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record transaction' })).toBeDisabled();
  for (const theme of ['dark', 'light']) {
    await page.goto('http://127.0.0.1:5180/dashboard?theme=' + theme);
    await expect(page.getByLabel('Read-only demo')).toBeVisible();
    await capture(page, 'demo-dashboard-' + theme + '-1440');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5180/holdings?theme=light');
  await expect(page.getByLabel('Read-only demo')).toBeVisible();
  await capture(page, 'demo-holdings-light-390', true);
});
