import { expect, test, type Page } from '@playwright/test';

const hasEditorStyles = (page: Page) => page.evaluate(() => [...document.styleSheets].some(sheet =>
  [...sheet.cssRules].some(rule => rule.cssText.includes('.side-drawer-backdrop'))));

for (const route of ['manage', 'storage-config']) {
  test(`cold ${route} does not load editor-only styles`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto(`/#/${route}`);
    await expect(page.locator(route === 'manage' ? '.workspace-main' : '[data-smoke-ready="storage-config"]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await hasEditorStyles(page)).toBe(false);
  });
}

test('workspace to canvas navigation loads editor styles before showing canvas controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.name));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/manage');
  await expect(page.locator('.workspace-main')).toBeVisible();
  expect(await hasEditorStyles(page)).toBe(false);
  await page.evaluate(() => { window.location.hash = '/?diagram=wms-process-flow-v1'; });
  await expect(page.locator('.page-tabs')).toBeVisible();
  expect(await hasEditorStyles(page)).toBe(true);
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await expect(page.locator('.side-drawer')).toBeVisible();
  expect(await page.locator('.side-drawer').evaluate(drawer => getComputedStyle(drawer).position)).toBe('absolute');
  expect(errors).toEqual([]);
});
