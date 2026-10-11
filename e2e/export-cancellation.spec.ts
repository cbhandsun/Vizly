import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const format of ['gif', 'png'] as const) {
  test(`${format.toUpperCase()} cancellation restores focus, viewport and subsequent downloads`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
    await expect(page.locator('.react-flow__node[data-id="order-import"]')).toContainText('订单导入/创建');
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const instance = (window as unknown as {
        reactFlowInstance?: { setViewport: (value: { x: number; y: number; zoom: number }) => Promise<boolean> };
      }).reactFlowInstance;
      if (!instance) throw new Error('Actual canvas viewport API missing');
      await instance.setViewport({ x: -800, y: 120, zoom: 0.85 });
    });
    const viewport = page.locator('.react-flow__viewport');
    const transform = await viewport.getAttribute('style');
    const nodes = await page.locator('.react-flow__node').count();
    let downloads = 0;
    page.on('download', () => { downloads += 1; });
    const trigger = page.getByRole('button', { name: '导出', exact: true });
    await trigger.click();
    await page.locator('#diagram-export-actions-menu').getByText(format === 'gif' ? 'GIF 动图' : 'PNG 格式', { exact: true }).click();
    // The accessible name changes while cancelling; track the same dialog throughout.
    const progress = page.locator('[role="dialog"][aria-labelledby="diagram-export-progress-title"]');
    await expect(progress).toHaveAccessibleName(`正在导出 ${format.toUpperCase()}...`);
    const cancel = progress.getByRole('button', { name: '取消导出', exact: true });
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    if (format === 'gif') await cancel.click();
    else await page.keyboard.press('Escape');
    await expect(progress).toBeHidden({ timeout: 5_000 });
    await expect(trigger).toBeEnabled();
    await expect(trigger).toBeFocused();
    await expect(viewport).toHaveAttribute('style', transform ?? '');
    await expect(page.locator('.react-flow__node')).toHaveCount(nodes);
    await expect(page.getByRole('button', { name: '适应屏幕', exact: true })).toBeVisible();
    await trigger.click();
    const pending = page.waitForEvent('download');
    await page.locator('#diagram-export-actions-menu').getByText('Markdown 文档 (.md)', { exact: true }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(/\.md$/);
    const path = await download.path();
    if (!path) throw new Error('Post-cancellation Markdown download has no completed file');
    expect(await readFile(path, 'utf8')).toContain('| order-import | 订单导入/创建 |');
    expect(downloads).toBe(1);
  });
}
