import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`user navigates to a group and retains its focus / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/#/?diagram=wms-process-flow-v1');
    await expect(page.locator('.react-flow__node-titleGroup').first()).toBeAttached();
    if (width === 390) {
      await page.getByRole('button', { name: '图层', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: '导航', exact: true }).click();
    } else {
      await page.getByRole('button', { name: '导航', exact: true }).click();
    }
    const drawer = page.locator('.side-drawer');
    const tree = drawer.getByRole('tree', { name: '导航', exact: true });
    await expect(tree).toBeVisible();
    const groupEntry = tree.getByRole('treeitem').first().locator('.ant-tree-node-content-wrapper');
    await groupEntry.click();
    const focused = page.locator('.react-flow__node-titleGroup.selected');
    await expect(focused).toHaveCount(1);
    const groupId = await focused.getAttribute('data-id');
    expect(groupId).toBeTruthy();
    await drawer.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect.poll(() => focused.evaluate(element => {
      const node = element.getBoundingClientRect();
      const canvas = document.querySelector('.react-flow')?.getBoundingClientRect();
      if (!canvas) throw new Error('Canvas missing');
      return Math.max(Math.abs(node.x + node.width / 2 - canvas.x - canvas.width / 2),
        Math.abs(node.y + node.height / 2 - canvas.y - canvas.height / 2));
    })).toBeLessThan(2);
    // Centering can become accurate before the final animation frame. Capture
    // the retained viewport only after the transform has stopped changing.
    await expect.poll(() => page.locator('.react-flow__viewport').evaluate(async element => {
      const transform = getComputedStyle(element).transform;
      for (let frame = 0; frame < 3; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (getComputedStyle(element).transform !== transform) return false;
      }
      return true;
    })).toBe(true);
    const viewport = await page.locator('.react-flow__viewport').evaluate(element => getComputedStyle(element).transform);
    await page.waitForTimeout(1000);
    expect(await page.locator('.react-flow__viewport').evaluate(element => getComputedStyle(element).transform)).toBe(viewport);
    expect(await focused.getAttribute('data-id')).toBe(groupId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await testInfo.attach(`group focused ${width}px`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}
