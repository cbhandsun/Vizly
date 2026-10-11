import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function verifyStorageContrast(page: Page, testInfo: TestInfo, stage: string, includeErrors = false) {
  const facts = await page.locator('.storage-config-card').evaluate((card, withErrors) => {
    const luminance = (color: string): number => {
      const values = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!values || values.length !== 3) throw new Error('Unsupported computed color');
      const channels = values.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const background = luminance(getComputedStyle(card).backgroundColor);
    const contrast = (selector: string) => [...card.querySelectorAll(selector)].map(element => {
      const foreground = luminance(getComputedStyle(element).color);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      labels: contrast('.ant-form-item-label label'),
      errors: withErrors ? contrast('.ant-form-item-explain-error') : [],
    };
  }, includeErrors);
  await testInfo.attach(`${stage} computed contrast`, { body: JSON.stringify(facts), contentType: 'application/json' });
  await testInfo.attach(`${stage} screenshot`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(facts.overflow).toBe(false);
  expect(facts.labels.length).toBeGreaterThan(0);
  for (const ratio of facts.labels) expect(ratio).toBeGreaterThanOrEqual(4.5);
  if (includeErrors) {
    expect(facts.errors.length).toBeGreaterThan(0);
    for (const ratio of facts.errors) expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
}

for (const mode of ['light', 'dark']) {
  for (const width of [1280, 390]) {
    test(`storage settings remain readable and recoverable: ${mode} / ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(({ theme }) => {
        localStorage.setItem('config_theme.currentId', JSON.stringify(theme));
        localStorage.setItem('i18nextLng', 'zh');
      }, { theme: mode });
      await page.goto('/#/storage-config');
      await expect(page.locator('[data-smoke-ready="storage-config"]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await verifyStorageContrast(page, testInfo, 'normal');
      await page.getByRole('button', { name: '保存配置', exact: true }).click();
      await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible();
      await expect(page.locator('#endpoint')).toBeFocused();
      await verifyStorageContrast(page, testInfo, 'validation error', true);
      await page.reload();
      await expect(page.locator('[data-smoke-ready="storage-config"]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await expect(page.locator('#endpoint')).toHaveValue('');
      await expect(page.locator('.ant-form-item-explain-error')).toHaveCount(0);
      await verifyStorageContrast(page, testInfo, 'after refresh');
      await page.getByRole('button', { name: '保存配置', exact: true }).click();
      await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible();
      await expect(page.locator('#endpoint')).toBeFocused();
      await verifyStorageContrast(page, testInfo, 'validation error after refresh', true);
    });
  }
}

test('Chinese unknown route offers keyboard focused workspace recovery', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/audit-unknown-route');
  await expect(page.locator('#app-route-not-found-title')).toHaveText('页面不存在');
  const recovery = page.locator('.app-route-error__button--primary');
  await expect(recovery).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/manage$/);
});
