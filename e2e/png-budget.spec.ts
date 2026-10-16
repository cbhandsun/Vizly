import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const scenario of ['ordinary', 'wms'] as const) {
  test(`${scenario} PNG download stays within pixel budget and restores the reading view`, async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    if (scenario === 'wms') {
      await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
      await expect(page.locator('.react-flow__node[data-id="order-import"]')).toContainText('订单导入/创建');
    } else {
      await page.goto('/#/manage');
      await page.getByRole('button', { name: '新建流程图', exact: true }).click();
      await page.getByRole('button', { name: '选择第一个图形', exact: true }).click();
      await page.getByRole('dialog', { name: '基础形状', exact: true }).getByRole('button', { name: '矩形', exact: true }).click();
      await expect(page.locator('.react-flow__node')).toHaveCount(1);
    }
    const viewport = page.locator('.react-flow__viewport');
    // Apply a deliberate view only after initial fit settles, matching the existing export fixture.
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const instance = (window as unknown as { reactFlowInstance?: { setViewport: (value: { x: number; y: number; zoom: number }) => Promise<boolean> } }).reactFlowInstance;
      if (!instance) throw new Error('Canvas viewport API unavailable');
      await instance.setViewport({ x: -200, y: 90, zoom: 0.85 });
    });
    await expect(viewport).toHaveAttribute('style', /scale\(0\.85\)/);
    const before = await viewport.getAttribute('style');
    const nodes = await page.locator('.react-flow__node').count();
    await page.getByRole('button', { name: '导出', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.locator('#diagram-export-actions-menu').getByText('PNG 格式', { exact: true }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const path = await download.path();
    if (!path) throw new Error('PNG download did not complete');
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(12_000);
    expect(height).toBeLessThanOrEqual(12_000);
    expect(width * height).toBeLessThanOrEqual(36_000_000);
    await testInfo.attach('png-dimensions', { body: JSON.stringify({ width, height, pixels: width * height, bytes: bytes.length }), contentType: 'application/json' });
    await testInfo.attach('downloaded-png', { body: bytes, contentType: 'image/png' });
    await expect(viewport).toHaveAttribute('style', before ?? '');
    await expect(page.locator('.react-flow__node')).toHaveCount(nodes);
    await expect(page.getByRole('button', { name: '导出', exact: true })).toBeEnabled();
  });
}
