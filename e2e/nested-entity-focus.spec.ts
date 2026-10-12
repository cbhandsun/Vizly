import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`nested entity focus centers the visible node / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/?diagram=wms-process-flow-v1');
    const node = page.locator('.react-flow__node[data-id="allocation"]');
    await expect(node).toBeAttached();
    await expect.poll(() => node.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(0);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('editor:focus-entity', {
      detail: { nodeId: 'allocation', zoom: 1.2 },
    })));
    await expect.poll(() => node.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const canvas = document.querySelector('.react-flow')?.getBoundingClientRect();
      if (!canvas) throw new Error('Canvas missing');
      return Math.max(
        Math.abs(bounds.x + bounds.width / 2 - canvas.x - canvas.width / 2),
        Math.abs(bounds.y + bounds.height / 2 - canvas.y - canvas.height / 2),
      );
    })).toBeLessThan(2);
    await expect(node).toHaveClass(/selected/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await testInfo.attach('nested node focus', { body: await page.screenshot(), contentType: 'image/png' });
  });
}
