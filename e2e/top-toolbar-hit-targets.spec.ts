import { expect, test } from '@playwright/test';

for (const width of [768, 1024, 1280, 1440]) {
  test(`top toolbar controls remain reachable / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/?diagram=wms-process-flow-v1');
    await expect(page.locator('#vizly-plugin-center-island-portal button').first()).toBeVisible();
    const header = page.locator('[data-designer-top-toolbar="true"]');
    await expect.poll(() => header.evaluate(root => [...root.querySelectorAll<HTMLButtonElement>('button')]
      .filter(button => !button.disabled && button.getBoundingClientRect().width > 0)
      .filter(button => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return !hit || !button.contains(hit) || rect.left < 0 || rect.right > innerWidth;
      })
      .map(button => button.getAttribute('aria-label') ?? button.title))).toEqual([]);
    const layout = page.locator('#vizly-plugin-center-island-portal button[aria-haspopup="menu"]').first();
    await layout.click();
    await expect(layout).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(layout).toHaveAttribute('aria-expanded', 'false');
    await testInfo.attach('top toolbar', { body: await page.screenshot(), contentType: 'image/png' });
  });
}

for (const width of [768, 1024, 1440]) {
  test(`touch toolbar controls remain usable / ${width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.goto(`${testInfo.project.use.baseURL}/#/?diagram=wms-process-flow-v1`);
      const header = page.locator('[data-designer-top-toolbar="true"]');
      await expect(page.locator('#vizly-plugin-center-island-portal button').first()).toBeVisible();
      await expect.poll(() => header.evaluate(root => [...root.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button, a')]
        .filter(control => !control.matches(':disabled') && control.getBoundingClientRect().width > 0)
        .filter(control => {
          const rect = control.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return rect.width < 44 || rect.height < 44 || !hit || !control.contains(hit)
            || rect.left < 0 || rect.right > innerWidth;
        }).map(control => control.getAttribute('aria-label') ?? control.title ?? control.textContent))).toEqual([]);
      const layout = page.locator('#vizly-plugin-center-island-portal button[aria-haspopup="menu"]').first();
      await layout.tap();
      await expect(layout).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(layout).toHaveAttribute('aria-expanded', 'false');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await testInfo.attach('touch toolbar', { body: await page.screenshot(), contentType: 'image/png' });
    } finally {
      await context.close();
    }
  });
}
