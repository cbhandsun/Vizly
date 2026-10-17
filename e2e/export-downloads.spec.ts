import { readFile, writeFile } from 'node:fs/promises';
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
  await page.getByRole('button', { name: '适应屏幕', exact: true }).click();
  await expect(node).toBeInViewport();
  await node.getByText('订单导入/创建', { exact: true }).dblclick();
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

test('GIF download produces a complete animation and restores the canvas', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const captureWarnings: string[] = [];
  page.on('console', message => {
    if (message.text().includes('批量离屏克隆方案失败')) captureWarnings.push(message.text().slice(0, 1500));
  });
  const id = '33333333-3333-4333-8333-333333333333';
  await page.evaluate(async id => {
    const request = indexedDB.open('VizlyLocalDB', 2);
    request.onupgradeneeded = () => {
      const versions = request.result.createObjectStore('diagram_versions', { keyPath: 'id' });
      versions.createIndex('diagramId', 'diagramId');
      versions.createIndex('createdAt', 'createdAt');
      request.result.createObjectStore('local_diagrams', { keyPath: 'id' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('local_diagrams', 'readwrite');
      tx.objectStore('local_diagrams').put({
        id, name: 'GIF animation regression', type: 'flowchart', version: '2.0.0', metadata: { themeId: 'light' },
        nodes: ['source', 'target'].map((nodeId, index) => ({
          id: nodeId, type: 'flowchart', label: index === 0 ? 'Start' : 'End', data: {},
          metadata: { canvasPosition: { x: index * 300, y: 0 }, width: 180, height: 80, shape: 'rectangle' },
        })),
        edges: [{ id: 'animation', source: 'source', target: 'target', animated: true,
          sourceHandle: 'right', targetHandle: 'left', style: { stroke: '#2563eb', strokeWidth: 3, strokeDasharray: '12 6' } }],
        groups: [], theme: { name: 'light', displayName: 'Light', domains: {} },
        layout: { type: 'custom', direction: 'LR', generateDomainGroups: false },
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, id);
  await page.goto(`/#/?diagram=${id}`);
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByRole('button', { name: '适应屏幕', exact: true }).click();
  const nodesBefore = await page.locator('.react-flow__node').count();
  await expect(page.locator('.react-flow__edge path').first()).toHaveAttribute('d', /[MLC].+/u);
  await page.evaluate(async id => {
    const host = window as Window & { __flowDataBridge?: Record<string, {
      animatePath?: (ids: string[], options: { loop: boolean }) => Promise<void>;
    }> };
    const bridge = host.__flowDataBridge?.[id];
    if (!bridge?.animatePath) throw new Error('Canvas animation bridge unavailable');
    await bridge.animatePath(['animation'], { loop: true });
  }, id);
  await expect(page.locator('.react-flow__edge.animated path').first()).toHaveAttribute('d', /[MLC].+/u);
  await page.evaluate(() => {
    const host = window as Window & { __gifFrameSnapshots?: string[] };
    host.__gifFrameSnapshots = [];
    const serialize = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (node: Node): string {
      const markup = serialize.call(this, node);
      if (markup.includes('foreignObject')) {
        const frames = host.__gifFrameSnapshots;
        if (frames && frames.length === 0) frames.push(markup);
        else if (frames) frames[1] = markup;
      }
      return markup;
    };
  });
  await testInfo.attach('animation-canvas', { body: await page.locator('.react-flow').first().screenshot(), contentType: 'image/png' });
  await testInfo.attach('animation-source', {
    body: await page.locator('.react-flow__edges').first().evaluate(element => element.outerHTML),
    contentType: 'image/svg+xml',
  });
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const pending = page.waitForEvent('download', { timeout: 150_000 });
  await page.locator('#diagram-export-actions-menu').getByText('GIF 动图', { exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.gif$/u);
  const path = await download.path();
  if (!path) throw new Error('GIF download has no completed file');
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/u);
  expect(bytes.readUInt16LE(6)).toBeGreaterThan(0);
  expect(bytes.readUInt16LE(8)).toBeGreaterThan(0);
  expect(bytes.at(-1)).toBe(0x3b);
  const artifact = testInfo.outputPath('export.gif');
  await writeFile(artifact, bytes);
  await testInfo.attach('downloaded-gif', { path: artifact, contentType: 'image/gif' });
  const captured = await page.evaluate(() => (window as Window & { __gifFrameSnapshots?: string[] }).__gifFrameSnapshots ?? []);
  for (const [index, markup] of captured.entries()) {
    await writeFile(testInfo.outputPath(`frame-${index}.svg`), markup);
  }
  await writeFile(testInfo.outputPath('capture-warnings.json'), JSON.stringify(captureWarnings));
  expect(captureWarnings).toEqual([]);
  expect(captured).toHaveLength(2);
  for (const markup of captured) expect(markup).toContain('data-vizly-gif-path');
  expect(captured[0]).not.toEqual(captured[1]);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBefore);
  await expect(page.getByRole('button', { name: '导出', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '适应屏幕', exact: true })).toBeVisible();
});
