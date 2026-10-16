import { expect, test } from '@playwright/test';

test('desktop overview retains all four cleared label associations after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.name));
  await page.goto('/#/?diagram=wms-process-flow-v1');
  await page.locator('.react-flow__node[data-id="allocation"]').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
      await page.locator('.react-flow__node[data-id="allocation"]').waitFor({ state: 'attached' });
    }
    await page.getByRole('button', { name: /^适应(?:\s|\(|$)/ }).click();
    const label = page.locator('[data-edge-id="e-allocation-task"][data-edge-label-placement]');
    await expect(label).toBeVisible();
    await expect(label).toHaveAttribute('data-edge-label-placement', 'placed');
    await expect(label).not.toHaveAttribute('data-edge-label-conflicts');
    await expect(page.locator('[data-edge-id][data-edge-label-placement]')).toHaveCount(44);
    await expect(page.locator('[data-edge-id][data-edge-label-placement="unresolved"]')).toHaveCount(0);
    for (const id of ['e-allocation-task', 'e-packing-exec', 'e-sorting-exec', 'e-wcs']) {
      await expect(page.locator(`[data-edge-id="${id}"][data-edge-label-placement]`)).toHaveAttribute('data-edge-label-placement', 'placed');
      await expect(page.locator(`[data-edge-label-leader="${id}"]`)).toHaveAttribute('data-edge-label-placement', 'placed');
    }
  }
  expect(pageErrors).toEqual([]);
});
