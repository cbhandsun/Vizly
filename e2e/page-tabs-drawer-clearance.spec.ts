import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 768, height: 900 }, hasTouch: true, isMobile: true });

test('page rename remains reachable beside the open nonmodal shape drawer at 768px', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  const drawer = page.locator('.side-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).not.toHaveAttribute('aria-modal', 'true');
  await expect.poll(async () => {
    const drawerBounds = await drawer.boundingBox();
    const tabsBounds = await page.locator('.page-tabs').boundingBox();
    return Boolean(drawerBounds && tabsBounds && tabsBounds.x >= drawerBounds.x + drawerBounds.width);
  }).toBe(true);
  await page.getByRole('button', { name: '重命名页面 页面 2', exact: true }).click();
  const input = page.getByRole('textbox', { name: '重命名页面 页面 2', exact: true });
  await expect(input).toBeFocused();
  await input.fill('侧栏打开时重命名');
  await input.press('Enter');
  await expect(page.getByRole('tab', { name: '侧栏打开时重命名', exact: true })).toBeFocused();
  await expect(drawer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
