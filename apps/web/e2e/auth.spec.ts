import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const password = 'A long browser test passphrase!';
const evidenceDir = process.env['FOLIO_E2E_EVIDENCE_DIR'] ?? 'docs/evidence/phase-2';
async function mailLink(request: APIRequestContext, email: string, purpose: 'verify' | 'reset') {
  let url = '';
  await expect
    .poll(async () => {
      const result = await request.get('http://127.0.0.1:8025/api/v2/messages?limit=100');
      const data = (await result.json()) as {
        items: {
          To: { Mailbox: string; Domain: string }[];
          Content: { Body: string; Headers: Record<string, string[]> };
        }[];
      };
      const message = data.items.find(
        (item) =>
          item.To.some((to) => to.Mailbox + '@' + to.Domain === email) &&
          item.Content.Headers['Subject']?.[0]?.startsWith(
            purpose === 'verify' ? 'Verify' : 'Reset',
          ),
      );
      const text = message?.Content.Body.replace(/=\r?\n/g, '').replace(/=3D/g, '=') ?? '';
      url =
        text.match(
          /http[^\s]+\/auth\/(?:verify-email|reset-password)#token=[A-Za-z0-9_-]{43}/,
        )?.[0] ?? '';
      return !!url;
    })
    .toBe(true);
  // Visit through the test's canonical host, preserving path and fragment.
  const link = new URL(url);
  return link.pathname + link.hash;
}
async function signIn(page: Page, email: string, pw = password) {
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function register(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Name', { exact: true }).fill('Browser Reviewer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toContainText('If this address');
}
test('real MailHog registration, verification, persistence, preferences, export and confirmed deletion', async ({
  page,
  request,
  context,
}) => {
  const email = 'phase2-' + Date.now() + '@example.test';
  await register(page, email);
  await page.goto(await mailLink(request, email, 'verify'));
  await expect(page).not.toHaveURL(/token=/);
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await signIn(page, email);
  await expect(page.getByRole('status')).toContainText('not available');
  const cookies = await context.cookies();
  const refresh = cookies.find((c) => c.name === 'folio_refresh');
  expect(refresh?.httpOnly).toBe(true);
  expect(refresh?.sameSite).toBe('Strict');
  expect(
    await page.evaluate(() =>
      [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) =>
        /token|auth|session/i.test(k),
      ),
    ),
  ).toEqual([]);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect
    .poll(async () =>
      context.cookies().then((c) => c.find((v) => v.name === 'folio_refresh')?.value),
    )
    .not.toBe(refresh?.value);
  await page
    .getByRole('navigation', { name: 'Settings', exact: true })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Actual saved name');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.getByLabel('Timezone', { exact: true }).fill('Europe/London');
  await page.getByLabel('Interface theme').selectOption('light');
  await page.getByLabel('Number format').selectOption('international');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Preferences saved');
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Actual saved name');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const format of ['JSON', 'CSV']) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export ' + format }).click();
    const downloaded = await waiting;
    expect(downloaded.suggestedFilename()).toBe('folio-account.' + format.toLowerCase());
    expect(await downloaded.failure()).toBeNull();
  }
  await mkdir(evidenceDir, { recursive: true });
  await page.goto('/settings?theme=light');
  await page.getByLabel('Name', { exact: true }).waitFor();
  await page.screenshot({ path: evidenceDir + '/settings-light-1440.png' });
  await page.goto('/settings?theme=dark');
  await page.getByLabel('Name', { exact: true }).waitFor();
  await page.screenshot({ path: evidenceDir + '/settings-dark-1440.png' });
  expect(
    await page.locator('.settings-title').evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('24px');
  expect(
    await page
      .locator('.settings-section h2')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('17px');
  expect((await page.getByRole('button', { name: 'Edit profile' }).boundingBox())?.height).toBe(29);
  expect(
    await page.locator('.settings-avatar').evaluate((el) => getComputedStyle(el).borderTopWidth),
  ).toBe('1px');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings?theme=light');
  await page.getByLabel('Name', { exact: true }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const identity = page.locator('.settings-profile-header > div');
  expect((await identity.boundingBox())?.width).toBeGreaterThan(200);
  expect(
    await page.locator('.settings-profile-name').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const avatar = await page.locator('.settings-avatar').boundingBox();
  const edit = await page.getByRole('button', { name: 'Edit profile' }).boundingBox();
  expect(edit!.y).toBeGreaterThan(avatar!.y + avatar!.height);
  expect(edit!.height).toBe(36);
  expect((await page.locator('.settings-profile').boundingBox())?.height).toBeLessThan(260);
  await page.screenshot({ path: evidenceDir + '/settings-mobile-light-390.png' });
  await page.setViewportSize({ width: 1440, height: 1024 });
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Enter your current password to delete your account.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Type DELETE exactly to confirm account deletion.' }),
  ).toBeVisible();
  await page.getByLabel('Confirm password').fill(password);
  await page.getByLabel('Type DELETE').fill('DELETE');
  await page.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to sign in');
});
test('reset and password change revoke sessions; logout restores the protected-route boundary', async ({
  page,
  request,
}) => {
  const email = 'phase2-reset-' + Date.now() + '@example.test';
  await register(page, email);
  await page.goto(await mailLink(request, email, 'verify'));
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await signIn(page, email);
  await page.goto('/auth/forgot-password');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If this address');
  await page.goto(await mailLink(request, email, 'reset'));
  await page.getByLabel('Password', { exact: true }).fill(password + ' Reset');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('status')).toContainText('Password reset');
  await signIn(page, email, password + ' Reset');
  await page.goto('/settings');
  await page.getByLabel('Current password', { exact: true }).fill(password + ' Reset');
  await page.getByLabel('New password', { exact: true }).fill(password + ' Changed');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await signIn(page, email, password + ' Changed');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/auth\/login$/);
});
test('Figma auth geometry, theme/mobile derivations and real error states are accessible', async ({
  page,
}) => {
  await mkdir(evidenceDir, { recursive: true });
  const evidence: unknown[] = [];
  for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto('/auth/login?theme=' + theme);
    await page.evaluate(() => document.fonts.ready);
    const box = await page.locator('.auth-card').boundingBox();
    expect(box?.x).toBe(470);
    expect(box?.y).toBe(132);
    expect(box?.width).toBe(500);
    expect(box?.height).toBeGreaterThanOrEqual(700);
    expect((await page.locator('.auth-submit').boundingBox())?.height).toBe(34);
    for (const field of await page.locator('.form-field[data-presentation="auth"]').all()) {
      expect((await field.boundingBox())?.height).toBe(68);
    }
    expect(await page.locator('.auth-title').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      '26px',
    );
    await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    evidence.push({ theme, box, violations: audit.violations });
    await page.screenshot({ path: evidenceDir + '/login-' + theme + '-1440.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/auth/register?theme=light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({
    path: evidenceDir + '/register-mobile-light-390.png',
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.goto('/auth/verify-email');
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByRole('alert')).toContainText('Check the submitted fields');
  await page.goto('/auth/session-expired');
  await expect(page.getByRole('heading', { name: 'Your session has expired' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.route('**/api/v1/auth/login', (route) => route.abort());
  await page.getByLabel('Email address').fill('offline@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to reach Folio');
  await writeFile(evidenceDir + '/browser-design.json', JSON.stringify(evidence, null, 2));
});
