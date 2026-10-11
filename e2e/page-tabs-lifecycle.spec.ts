import { expect, test } from '@playwright/test';

for (const width of [390, 768, 1440]) {
  test.describe(`page lifecycle / ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width <= 768, isMobile: width <= 768 });

    test('contains controls and preserves rename and recovery focus', async ({ page }, testInfo) => {
      await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
      await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
      const bar = page.locator('.page-tabs');
      await expect(bar).toBeVisible();
      if (width === 390) {
        // Initialization can replace the canvas between visibility and geometry
        // reads. Wait for a measurable bar while retaining the height limit.
        await expect.poll(async () => {
          const bounds = await bar.boundingBox();
          return bounds !== null && bounds.height > 0 && bounds.height <= 60;
        }).toBe(true);
      }
      await page.getByRole('button', { name: '新建页面', exact: true }).click();
      const drawer = page.locator('.side-drawer');
      if (await drawer.isVisible()) {
        await drawer.getByRole('button', { name: '关闭', exact: true }).click();
        await expect(drawer).not.toBeVisible();
      }
      await page.getByRole('button', { name: '重命名页面 页面 2', exact: true }).click();
      const input = page.getByRole('textbox', { name: '重命名页面 页面 2', exact: true });
      await input.fill('页面 1');
      await input.press('Enter');
      await expect(page.locator('.page-tabs__rename-error')).toHaveText('页面名称不能重复');
      await expect(input).toBeFocused();
      await input.press('Escape');
      await expect(page.getByRole('tab', { name: '页面 2', exact: true })).toBeFocused();
      await page.getByRole('button', { name: '删除页面 页面 2', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: '删 除', exact: true }).click();
      await page.getByRole('button', { name: '恢复页面“页面 2”', exact: true }).click();
      await expect(page.getByRole('tab', { name: '页面 2', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '重命名页面 页面 2', exact: true }).click();
      const longName = '长页面名称验证标签滚动与完整无障碍名称';
      await input.fill(longName);
      await input.press('Enter');
      await expect(page.getByRole('tab', { name: longName, exact: true })).toBeFocused();

      await expect.poll(async () => bar.evaluate(container => {
        const bounds = container.getBoundingClientRect();
        const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]
          .filter(button => !button.closest('.page-tabs__status'));
        return buttons.every(button => {
          const rect = button.getBoundingClientRect();
          return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
        });
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      if (width <= 768) {
        const controls = await bar.locator('.page-tabs__actions button, .page-tabs__add').evaluateAll(buttons =>
          buttons.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
        expect(controls.length).toBeGreaterThan(0);
        for (const control of controls) {
          expect(control.width).toBeGreaterThanOrEqual(44);
          expect(control.height).toBeGreaterThanOrEqual(44);
        }
      }
      await testInfo.attach('page tabs', { body: await page.screenshot(), contentType: 'image/png' });
    });
  });
}
