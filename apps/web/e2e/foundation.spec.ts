import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
for (const theme of ['dark', 'light']) {
  test(theme + ' shell, 119 states, geometry, fonts, contrast and screenshot', async ({ page }) => {
    const failures: string[] = [];
    page.on('pageerror', (err) => failures.push(err.message));
    await page.goto('/dev/design-system?theme=' + theme);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('[data-specimen]')).toHaveCount(119);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const source = JSON.parse(await readFile('packages/design-tokens/source/figma.json', 'utf8'));
    const states = JSON.parse(
      await readFile('packages/design-tokens/source/components.json', 'utf8'),
    );
    const actualButtons = await page.locator('[data-specimen] .ds-button').evaluateAll((buttons) =>
      buttons.map((button) => ({
        id: button.getAttribute('data-figma'),
        background: getComputedStyle(button).backgroundColor,
        foreground: getComputedStyle(button).color,
      })),
    );
    for (const actual of actualButtons) {
      const state = states.find((s: unknown[]) => s[0] === actual.id);
      const variable = source.variables.find((v: { id: string }) => v.id === state[9]);
      if (!variable) continue;
      const color = variable.valuesByMode[theme === 'dark' ? '2:2' : '13:1'];
      const expected =
        'rgb(' +
        [color.r, color.g, color.b].map((n: number) => Math.round(n * 255)).join(', ') +
        ')';
      expect(actual.background, actual.id ?? 'button').toBe(expected);
    }
    const sidebar = await page.locator('.sidebar').boundingBox();
    expect(sidebar?.width).toBe(220);
    const topbar = await page.locator('.topbar').boundingBox();
    expect(topbar?.height).toBe(56);
    expect(topbar?.x).toBe(220);
    const primary = page.locator('[data-figma="2:4800"]');
    expect((await primary.boundingBox())?.height).toBe(36);
    expect((await primary.boundingBox())?.width).toBe(164);
    for (const id of ['2:4823', '2:4856', '2:4844', '2:4846', '2:4867', '2:4868', '2:4873']) {
      const reference = states.find((s: unknown[]) => s[0] === id);
      const bounds = await page
        .locator('[data-figma="' + id + '"]')
        .first()
        .boundingBox();
      expect(bounds?.width, id + ' width').toBeCloseTo(reference[3], 1);
      expect(bounds?.height, id + ' height').toBeCloseTo(reference[4], 1);
    }
    expect(
      await page
        .locator('[data-figma="2:4844"]')
        .evaluate((el) => getComputedStyle(el).borderLeftWidth),
    ).toBe('2px');
    expect(
      await page
        .locator('[data-figma="2:4846"]')
        .first()
        .evaluate((el) => getComputedStyle(el).borderBottomWidth),
    ).toBe('2px');
    const mono = await page
      .locator('.type-metric')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(mono).toContain('IBM Plex Mono');
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    await mkdir('docs/evidence/phase-1', { recursive: true });
    await writeFile(
      'docs/evidence/phase-1/axe-' + theme + '.json',
      JSON.stringify({ theme, violations: audit.violations }, null, 2),
    );
    expect(
      audit.violations.map((v) => ({ id: v.id, details: v.nodes.map((n) => n.failureSummary) })),
    ).toEqual([]);
    await page.screenshot({ path: 'docs/evidence/phase-1/gallery-' + theme + '-1440.png' });
    await page.screenshot({
      path: 'docs/evidence/phase-1/gallery-' + theme + '-full.png',
      fullPage: true,
    });
    await page.goto('/dashboard?theme=' + theme);
    await expect(page.getByRole('status')).toContainText('not available');
    await page.screenshot({ path: 'docs/evidence/phase-1/shell-' + theme + '-1440.png' });
    expect(failures).toEqual([]);
  });
}
test('keyboard, forms, navigation and derived mobile layout', async ({ page }) => {
  await page.goto('/dev/design-system?theme=dark');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('textbox', { name: 'Default field', exact: true }).fill('Reviewed specimen');
  await expect(page.getByRole('textbox', { name: 'Default field', exact: true })).toHaveValue(
    'Reviewed specimen',
  );
  const checkbox = page.locator('[data-specimen="2:4832"]').getByRole('checkbox');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  const switcher = page.locator('[data-specimen="2:4839"]').getByRole('switch');
  await switcher.check();
  await expect(switcher).toBeChecked();
  await page.getByRole('button', { name: 'Switch to light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // URL wins over local preference.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard?theme=light');
  await page.getByRole('button', { name: 'Navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Mobile primary' })
    .getByRole('link', { name: 'News', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'News', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/evidence/phase-1/mobile-light.png' });
});
