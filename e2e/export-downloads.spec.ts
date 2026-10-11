import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  await expect(page.locator('.react-flow__node[data-id="order-import"]')).toContainText('订单导入/创建');
});

test('Markdown download preserves displayed standard node names, descriptions and domains', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.locator('#diagram-export-actions-menu').getByText('Markdown 文档 (.md)', { exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const path = await download.path();
  if (!path) throw new Error('Markdown download has no completed file');
  const document = await readFile(path, 'utf8');
  await testInfo.attach('downloaded-markdown', { body: document, contentType: 'text/markdown' });
  expect(document).toContain('| order-import | 订单导入/创建 | be-scm |');
  expect(document).toContain('OMS/ERP/API/手工');
  expect(document).not.toMatch(/<script|<img|<b>|<br/i);
  await expect(page.getByRole('button', { name: '导出', exact: true })).toBeEnabled();
});

test('PNG download contains a real raster and restores canvas viewport and controls', async ({ page }, testInfo) => {
  const viewport = page.locator('.react-flow__viewport');
  // Set a deliberate reading view after the initial auto-fit, as in the viewport recovery fixture.
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const instance = (window as unknown as {
      reactFlowInstance?: { setViewport: (value: { x: number; y: number; zoom: number }) => Promise<boolean> };
    }).reactFlowInstance;
    if (!instance) throw new Error('Actual canvas viewport API missing');
    await instance.setViewport({ x: -800, y: 120, zoom: 0.85 });
  });
  await expect(viewport).toHaveAttribute('style', /scale\(0\.85\)/);
  const transform = await viewport.getAttribute('style');
  const nodesBefore = await page.locator('.react-flow__node').count();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.locator('#diagram-export-actions-menu').getByText('PNG 格式', { exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const path = await download.path();
  if (!path) throw new Error('PNG download has no completed file');
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
  await testInfo.attach('downloaded-png', { body: bytes, contentType: 'image/png' });
  await expect(viewport).toHaveAttribute('style', transform ?? '');
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBefore);
  await expect(page.getByRole('button', { name: '导出', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '适应屏幕', exact: true })).toBeVisible();
});

test('Markdown download uses edited canvas text instead of the registered template', async ({ page }, testInfo) => {
  const node = page.locator('.react-flow__node[data-id="order-import"]');
  await node.dblclick();
  const editor = node.getByRole('textbox', { name: 'Edit Node Text', exact: true });
  await editor.fill('订单编辑回归');
  await editor.press('Tab');
  await expect(node).toContainText('订单编辑回归');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.locator('#diagram-export-actions-menu').getByText('Markdown 文档 (.md)', { exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  if (!path) throw new Error('Edited Markdown download has no completed file');
  const document = await readFile(path, 'utf8');
  await testInfo.attach('edited-canvas-markdown', { body: document, contentType: 'text/markdown' });
  expect(document).toContain('| order-import | 订单编辑回归 |');
  expect(document).not.toContain('订单导入/创建');
});
