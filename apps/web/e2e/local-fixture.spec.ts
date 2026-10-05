import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ baseURL: 'http://127.0.0.1:5190' });
test.skip(process.env['FOLIO_E2E_FIXTURE'] !== '1', 'Explicit local fixture stack required');
const evidence = process.env['FOLIO_FIXTURE_EVIDENCE_DIR'] ?? '.local/priority-1/visual';
const password = 'A long isolated fixture passphrase!';
const audits: unknown[] = [];
async function verifyMail(
  request: APIRequestContext,
  email: string,
  base = 'http://127.0.0.1:5190',
) {
  let raw = '';
  await expect
    .poll(async () => {
      const data = await (
        await request.get('http://127.0.0.1:8025/api/v2/messages?limit=100')
      ).json();
      const message = data.items.find(
        (m: { To: { Mailbox: string; Domain: string }[]; Content: { Body: string } }) =>
          m.To.some((to) => to.Mailbox + '@' + to.Domain === email) &&
          m.Content.Body.includes(':' + new URL(base).port + '/auth/verify-email'),
      );
      raw = message?.Content.Body.replace(/=\r?\n/g, '').replace(/=3D/g, '=') ?? '';
      return raw.includes('/auth/verify-email#token=');
    })
    .toBe(true);
  const url = new URL(raw.match(/http[^\s]+\/auth\/verify-email#token=[A-Za-z0-9_-]{43}/)![0]);
  return base + url.pathname + url.hash;
}
async function register(page: Page, request: APIRequestContext, email: string) {
  await page.goto('/auth/register?theme=light');
  await expect(page.getByLabel('Local writable fixture mode')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Local Fixture Reviewer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If this address');
  await page.goto(await verifyMail(request, email));
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const session = await (await response).json();
  expect(session.user.localFixture).toBe(true);
  expect(session.user.demoReadonly).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Create portfolio' })).toBeVisible();
  await page.getByRole('button', { name: 'Create portfolio' }).click();
  await expect(page.getByRole('button', { name: 'Record transaction', exact: true })).toBeVisible();
  const list = await (
    await page.request.get('http://127.0.0.1:5190/api/v1/portfolios', {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    })
  ).json();
  return { token: session.accessToken as string, portfolioId: list.portfolios[0].id as string };
}
async function record(
  page: Page,
  instrument: string,
  type: string,
  fields: Record<string, string>,
) {
  await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
  await page.getByLabel('Canonical instrument').selectOption(instrument);
  await page.getByLabel('Transaction type').selectOption(type);
  await page.getByLabel('Effective date and time · UTC').fill('2026-01-05T15:00');
  await page.getByLabel('Exchange trading date').fill('2026-01-05');
  const aliases: Record<string, string> = {
    'Fees / withholding': 'Native fees / withholding',
    'Gross native income': 'Gross native dividend',
    'Split numerator': 'Split numerator · new units',
    'Split denominator': 'Split denominator · old units',
  };
  for (const [label, value] of Object.entries(fields))
    await (
      label === 'Unit price'
        ? page.getByLabel(/^Native price ·/)
        : page.getByLabel(aliases[label] ?? label, { exact: true })
    ).fill(value);
  if (instrument === 'AAPL:US') await capture(page, 'foreign-entry-dark-1440');
  await page.getByRole('button', { name: 'Review transaction', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review transaction', exact: true }),
  ).toBeFocused();
  if (instrument === 'AAPL:US') {
    await expect(
      page.getByText(/Explicit local historical FX fixture, resolved by the server/),
    ).toBeVisible();
    await capture(page, 'foreign-review-dark-1440');
  }
  await page.getByRole('button', { name: 'Confirm record', exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
}
async function value(page: Page, session: { token: string; portfolioId: string }) {
  const response = await page.request.get(
    'http://127.0.0.1:5190/api/v1/portfolios/' + session.portfolioId + '/valuation',
    { headers: { Authorization: 'Bearer ' + session.token } },
  );
  expect(response.status()).toBe(200);
  return response.json();
}
async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    height: innerHeight,
    document: document.documentElement.scrollWidth,
    independentScroll: [...document.querySelectorAll('body *')]
      .filter((e) => {
        const s = getComputedStyle(e);
        return ['auto', 'scroll'].includes(s.overflowY) && e.scrollHeight > e.clientHeight;
      })
      .map((e) => e.className),
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.independentScroll).toEqual([]);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  audits.push({ name, geometry, axeViolations: axe.violations });
  await writeFile(evidence + '/browser-checks.json', JSON.stringify(audits, null, 2));
  await page.screenshot({ path: evidence + '/' + name + '.png', fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: evidence + '/' + name + '-viewport.png' });
}
test('fresh real account: all ledger types, FIFO/FX/P&L aggregates, source-labelled states and responsive navigation', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(180000);
  await page.goto('/auth/register?theme=light');
  await expect(page.getByLabel('Local writable fixture mode')).toBeVisible();
  await capture(page, 'registration-light-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Name', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email address')).toBeFocused();
  await capture(page, 'registration-light-390');
  await page.setViewportSize({ width: 1440, height: 1024 });
  const session = await register(page, request, 'l01-complete-' + Date.now() + '@example.test');
  await record(page, 'TCS:NSE', 'BUY', {
    Quantity: '10',
    'Unit price': '100',
    'Fees / withholding': '10',
  });
  expect(await value(page, session)).toMatchObject({
    totalValue: '700',
    totalBaseCost: '1010',
    unrealizedBase: '-310',
  });
  await record(page, 'TCS:NSE', 'BUY', {
    Quantity: '5',
    'Unit price': '120',
    'Fees / withholding': '5',
  });
  await record(page, 'TCS:NSE', 'SELL', {
    Quantity: '12',
    'Unit price': '150',
    'Fees / withholding': '12',
  });
  expect(await value(page, session)).toMatchObject({
    totalValue: '210',
    totalBaseCost: '363',
    realizedBase: '536',
  });
  await record(page, 'TCS:NSE', 'DIVIDEND', {
    'Gross native income': '30',
    'Fees / withholding': '2',
  });
  await record(page, 'TCS:NSE', 'SPLIT', { 'Split numerator': '2', 'Split denominator': '1' });
  await record(page, 'AAPL:US', 'BUY', {
    Quantity: '10',
    'Unit price': '100',
    'Fees / withholding': '0',
  });
  const complete = await value(page, session);
  expect(complete).toMatchObject({
    status: 'fresh',
    complete: true,
    totalValue: '97220',
    totalBaseCost: '83363',
    unrealizedBase: '13857',
    realizedBase: '536',
    dividendBase: '28',
    movementBase: '1772',
    coverage: { valued: 2, total: 2 },
  });
  expect(
    complete.holdings.find((h: { instrumentId: string }) => h.instrumentId === 'TCS:NSE'),
  ).toMatchObject({
    quantity: '6',
    averageCost: '60.5',
    localCost: '363',
    lots: [{ quantity: '6', baseCost: '363' }],
  });
  expect(
    complete.holdings.find((h: { instrumentId: string }) => h.instrumentId === 'AAPL:US'),
  ).toMatchObject({
    baseCost: '83000',
    baseValue: '96800',
    unrealizedBase: '13800',
    priceContribution: '8300',
    fxContribution: '5500',
    fx: { rate: '88', source: 'local-fixture' },
  });
  const ledger = await (
    await page.request.get(
      'http://127.0.0.1:5190/api/v1/portfolios/' + session.portfolioId + '/ledger',
      { headers: { Authorization: 'Bearer ' + session.token } },
    )
  ).json();
  expect(
    ledger.items.find(
      (r: { record: { instrumentId: string } }) => r.record.instrumentId === 'AAPL:US',
    ).record.fx,
  ).toMatchObject({ rate: '83', rateDate: '2026-01-05', source: 'local-fixture' });
  await page.goto('/dashboard?theme=dark');
  await expect(
    page.locator('.portfolio-summary').getByText('₹97,220.00', { exact: true }),
  ).toBeVisible();
  await capture(page, 'dashboard-complete-dark-1440');
  await page.goto('/dashboard?theme=light');
  await expect(
    page.locator('.portfolio-summary').getByText('₹97,220.00', { exact: true }),
  ).toBeVisible();
  await capture(page, 'dashboard-complete-light-1440');
  await page.goto('/holdings/AAPL%3AUS?theme=light');
  await expect(
    page.getByText('Synthetic local price-history fixture; not observed market history'),
  ).toBeVisible();
  await expect(page.getByText('6.63 percentage points', { exact: true })).toBeVisible();
  await capture(page, 'asset-fixture-light-1440');
  await page.goto('/transactions');
  await record(page, 'ETH:CRYPTO', 'BUY', {
    Quantity: '0.125',
    'Unit price': '2400',
    'Fees / withholding': '1',
  });
  expect(await value(page, session)).toMatchObject({
    status: 'stale',
    complete: true,
    totalValue: '125820',
    unrealizedBase: '17474',
  });
  await page.goto('/dashboard?theme=light');
  await expect(page.getByText('Stale', { exact: true })).toBeVisible();
  await capture(page, 'dashboard-stale-light-1440');
  await page.goto('/transactions');
  await record(page, 'RELIANCE:BSE', 'BUY', {
    Quantity: '1',
    'Unit price': '100',
    'Fees / withholding': '0',
  });
  const partial = await value(page, session);
  expect(partial).toMatchObject({
    status: 'partial',
    complete: false,
    totalValue: null,
    unrealizedBase: null,
    knownValuedSubtotal: '125820',
    allocation: null,
    concentration: null,
    coverage: { valued: 3, total: 4 },
  });
  expect(partial.holdings.every((h: { weight: null }) => h.weight === null)).toBe(true);
  await page.goto('/dashboard?theme=light');
  await expect(page.getByText('Known-valued subtotal · incomplete')).toBeVisible();
  await capture(page, 'dashboard-partial-light-1440');
  await writeFile(
    evidence + '/financial-results.json',
    JSON.stringify(
      {
        complete,
        partial,
        historicalFx: ledger.items.find(
          (r: { record: { instrumentId: string } }) => r.record.instrumentId === 'AAPL:US',
        ).record.fx,
      },
      null,
      2,
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard?theme=light');
  await expect(page.getByLabel('Local writable fixture mode')).toBeVisible();
  await capture(page, 'dashboard-partial-light-390');
  const nav = page.getByRole('button', { name: 'Navigation' });
  await nav.focus();
  await page.keyboard.press('Enter');
  await expect(nav).toHaveAttribute('aria-expanded', 'true');
  const top = await page.locator('.topbar').boundingBox(),
    menu = await page.locator('#mobile-nav').boundingBox();
  expect(top!.height).toBe(56);
  expect(menu!.y).toBe(top!.y + 56);
  expect(await page.locator('#mobile-nav').evaluate((e) => getComputedStyle(e).position)).toBe(
    'static',
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile primary' })
      .getByRole('link', { name: 'Dashboard', exact: true }),
  ).toHaveClass(/selected/);
  await expect(page.locator('.portfolio-context')).toBeHidden();
  await capture(page, 'navigation-open-light-390');
  await page.keyboard.press('Escape');
  await expect(nav).toHaveAttribute('aria-expanded', 'false');
  await nav.click();
  await page
    .getByRole('navigation', { name: 'Mobile primary' })
    .getByRole('link', { name: 'Holdings', exact: true })
    .click();
  await expect(nav).toHaveAttribute('aria-expanded', 'false');
  await capture(page, 'holdings-light-390');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/dashboard?theme=light');
  await expect(page.getByLabel('Local writable fixture mode')).toBeVisible();
  await capture(page, 'dashboard-light-768');
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'folio_fixture_refresh')).toMatchObject({
    httpOnly: true,
    sameSite: 'Strict',
  });
  expect(cookies.find((c) => c.name === 'folio_refresh')).toBeUndefined();
});
test('missing-only portfolio stays unavailable, never a zero total', async ({ page, request }) => {
  const session = await register(page, request, 'l01-missing-' + Date.now() + '@example.test');
  await record(page, 'RELIANCE:BSE', 'BUY', {
    Quantity: '1',
    'Unit price': '100',
    'Fees / withholding': '0',
  });
  expect(await value(page, session)).toMatchObject({
    status: 'partial',
    complete: false,
    totalValue: null,
    knownValuedSubtotal: '0',
    unrealizedBase: null,
    coverage: { valued: 0, total: 1 },
  });
  await page.goto('/dashboard?theme=light');
  await expect(page.getByText('Known-valued subtotal · incomplete')).toBeVisible();
  await capture(page, 'dashboard-missing-light-1440');
});
test('normal and public-demo accounts/cookies cannot access or be overwritten by local fixtures', async ({
  page,
  context,
  browser,
}) => {
  const request = context.request;
  test.setTimeout(120000);
  const email = 'l01-isolation-' + Date.now() + '@example.test',
    origin = 'http://127.0.0.1:5173';
  const mutate = { Origin: origin, 'X-Folio-CSRF': '1' };
  expect((await (await request.get(origin + '/api/v1/auth/local-fixture')).json()).enabled).toBe(
    false,
  );
  expect(
    (
      await request.post(origin + '/api/v1/auth/register', {
        headers: mutate,
        data: { name: 'Normal Isolation', email, password },
      })
    ).status(),
  ).toBe(200);
  const link = new URL(await verifyMail(request, email, origin));
  expect(
    (
      await request.post(origin + '/api/v1/auth/verify-email', {
        headers: mutate,
        data: { token: new URLSearchParams(link.hash.slice(1)).get('token') },
      })
    ).status(),
  ).toBe(200);
  const normal = await (
    await request.post(origin + '/api/v1/auth/login', {
      headers: mutate,
      data: { email, password },
    })
  ).json();
  expect(normal.user.localFixture).toBeUndefined();
  const normalCookie = (await context.cookies()).find((c) => c.name === 'folio_refresh')!.value;
  const fixture = await register(page, request, email);
  expect((await context.cookies()).find((c) => c.name === 'folio_refresh')!.value).toBe(
    normalCookie,
  );
  expect(
    (await request.post(origin + '/api/v1/auth/refresh', { headers: mutate, data: {} })).status(),
  ).toBe(200);
  const normalList = await (
    await request.get(origin + '/api/v1/portfolios', {
      headers: { Authorization: 'Bearer ' + normal.accessToken },
    })
  ).json();
  expect(normalList.portfolios).toEqual([]);
  const normalHeaders = { ...mutate, Authorization: 'Bearer ' + normal.accessToken };
  const normalPortfolio = await (
    await request.post(origin + '/api/v1/portfolios/default', { headers: normalHeaders, data: {} })
  ).json();
  expect(
    (
      await request.post(origin + '/api/v1/portfolios/' + normalPortfolio.id + '/ledger', {
        headers: { ...normalHeaders, 'Idempotency-Key': 'normal-isolation-' + Date.now() },
        data: {
          instrumentId: 'TCS:NSE',
          type: 'BUY',
          quantity: '1',
          price: '100',
          fees: '0',
          effectiveAt: '2026-01-05T15:00:00.000Z',
          tradingDate: '2026-01-05',
        },
      })
    ).status(),
  ).toBe(200);
  const normalValue = await (
    await request.get(origin + '/api/v1/portfolios/' + normalPortfolio.id + '/valuation', {
      headers: normalHeaders,
    })
  ).json();
  expect(normalValue).toMatchObject({
    complete: false,
    totalValue: null,
    coverage: { valued: 0, total: 1 },
    holdings: [{ quote: null }],
  });
  expect(
    (
      await request.get(origin + '/api/v1/portfolios/' + fixture.portfolioId + '/valuation', {
        headers: { Authorization: 'Bearer ' + normal.accessToken },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(origin + '/api/v1/me', {
        headers: { Authorization: 'Bearer ' + fixture.token },
      })
    ).status(),
  ).toBe(401);
  const fixtureCount = await (
    await request.get('http://127.0.0.1:5190/api/v1/portfolios', {
      headers: { Authorization: 'Bearer ' + fixture.token },
    })
  ).json();
  expect(fixtureCount.portfolios).toHaveLength(1);
  const demoContext = await browser.newContext();
  const demoPage = await demoContext.newPage();
  const demoOrigin = 'http://127.0.0.1:5180';
  const demo = await (
    await demoContext.request.post(demoOrigin + '/api/v1/auth/demo', {
      headers: { Origin: demoOrigin, 'X-Folio-CSRF': '1' },
      data: {},
    })
  ).json();
  expect(demo.user.demoReadonly).toBe(true);
  expect(demo.user.localFixture).toBeUndefined();
  const demoCookie = (await demoContext.cookies()).find((c) => c.name === 'folio_refresh')!.value;
  await demoPage.goto('http://127.0.0.1:5190/auth/login');
  await demoPage.getByLabel('Email address').fill(email);
  await demoPage.getByLabel('Password', { exact: true }).fill(password);
  await demoPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(demoPage.getByLabel('Local writable fixture mode')).toBeVisible();
  expect((await demoContext.cookies()).find((c) => c.name === 'folio_refresh')!.value).toBe(
    demoCookie,
  );
  expect(
    (
      await demoContext.request.post(demoOrigin + '/api/v1/auth/refresh', {
        headers: { Origin: demoOrigin, 'X-Folio-CSRF': '1' },
        data: {},
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await demoContext.request.post(demoOrigin + '/api/v1/portfolios/default', {
        headers: {
          Origin: demoOrigin,
          'X-Folio-CSRF': '1',
          Authorization: 'Bearer ' + demo.accessToken,
        },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await demoContext.request.get(demoOrigin + '/api/v1/me', {
        headers: { Authorization: 'Bearer ' + fixture.token },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await demoContext.request.get('http://127.0.0.1:5190/api/v1/me', {
        headers: { Authorization: 'Bearer ' + demo.accessToken },
      })
    ).status(),
  ).toBe(401);
  await demoContext.close();
  expect(
    (
      await request.delete(origin + '/api/v1/me', {
        headers: normalHeaders,
        data: { password, confirmation: 'DELETE' },
      })
    ).status(),
  ).toBe(200);
});
