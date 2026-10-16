import { expect, test } from '@playwright/test';

for (const width of [390, 768, 1440]) {
  test.describe(`sidebar close / ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, isMobile: width <= 768, hasTouch: width <= 768 });
    test('keeps the close target usable after creating an empty page', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
      await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
      await page.getByRole('button', { name: '新建页面', exact: true }).click();
      if (width < 768) await page.getByRole('button', { name: '添加组件', exact: true }).click();
      const drawer = page.locator('.side-drawer');
      await expect(drawer).toBeVisible();
      const close = drawer.getByRole('button', { name: '关闭', exact: true });
      await expect.poll(() => close.evaluate(button => {
        const bounds = button.getBoundingClientRect();
        const drawerBounds = button.closest('.side-drawer')?.getBoundingClientRect();
        return { largeEnough: bounds.width >= 44 && bounds.height >= 44,
          inside: !!drawerBounds && bounds.left >= drawerBounds.left && bounds.right <= drawerBounds.right };
      })).toEqual({ largeEnough: true, inside: true });
      await close.click();
      await expect(drawer).not.toBeVisible();
      await page.getByRole('button', { name: '重命名页面 页面 2', exact: true }).click();
      await expect(page.getByRole('textbox', { name: '重命名页面 页面 2', exact: true })).toBeFocused();
      await expect(drawer).not.toBeVisible();
    });
  });
}
