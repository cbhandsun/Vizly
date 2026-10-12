import { expect, test } from '@playwright/test';

test('opens a persisted nonempty flowchart without requiring a canvas autosave', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/manage');
  await expect(page.getByRole('button', { name: '新建流程图', exact: true })).toBeVisible();
  const id = 'audit-registered-flowchart';
  await page.evaluate(async diagramId => {
    const request = indexedDB.open('VizlyLocalDB', 2);
    request.onupgradeneeded = () => {
      const versionStore = request.result.createObjectStore('diagram_versions', { keyPath: 'id' });
      versionStore.createIndex('diagramId', 'diagramId', { unique: false });
      versionStore.createIndex('createdAt', 'createdAt', { unique: false });
      request.result.createObjectStore('local_diagrams', { keyPath: 'id' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction('local_diagrams', 'readwrite');
      transaction.objectStore('local_diagrams').put({
        id: diagramId, name: 'AUDIT persisted flowchart', type: 'flowchart', version: '1.0.0',
        nodes: [{ id: 'saved-node', type: 'custom', domain: '业务域', domainClass: 'core', description: '<b>矩形</b>', data: {}, metadata: { shape: 'rectangle', width: 80, height: 56, canvasPosition: { x: 200, y: 160 } } }],
        edges: [], groups: [],
        layout: { type: 'custom', direction: 'LR', padding: { top: 20, right: 20, bottom: 20, left: 20 }, spacing: { horizontal: 50, vertical: 50 } },
        theme: { name: 'manual', displayName: 'Manual', domains: {}, isCustom: true },
        metadata: { title: 'AUDIT persisted flowchart' },
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { db.close(); }
    localStorage.removeItem(`flowchart-autosave-v2-${diagramId}`);
  }, id);
  await page.goto(`/#/?diagram=${id}`);
  await expect(page.getByRole('button', { name: '重命名流程图', exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '创建你的第一个流程', exact: true })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});
