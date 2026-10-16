import { expect, test } from '@playwright/test';

test('viewport controls wait for the actual canvas while preset loading is delayed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  let releasePreset: (() => void) | undefined;
  let requested = false;
  const released = new Promise<void>(resolve => { releasePreset = resolve; });
  await page.route(/\/assets\/WmsProcessFlowStandardData-[^/]+\.json/, async route => {
    requested = true;
    await released;
    await route.continue();
  });
  try {
    await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    const fit = page.getByRole('button', { name: '适应屏幕', exact: true });
    const top = page.getByRole('button', { name: '回到顶部', exact: true });
    await expect(fit).toBeVisible();
    expect(await fit.isEnabled()).toBe(false);
    expect(await top.isEnabled()).toBe(false);
    releasePreset?.();
    await expect(fit).toBeEnabled();
    await expect(top).toBeEnabled();
    await fit.click();
    await expect(page.locator('.react-flow__node[data-id="order-import"]')).toBeInViewport();
  } finally {
    releasePreset?.();
  }
});
