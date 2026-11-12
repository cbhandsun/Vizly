import { expect, test } from '@playwright/test';

// Persisted document access must work independently of realtime role messages.
for (const isReadonly of [true, false]) test(`persisted read-only=${isReadonly} survives editor reload`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  await page.goto('/#/manage');
  await expect(page.getByRole('button', { name: 'New flowchart', exact: true })).toBeVisible();
  const id = `persisted-access-${isReadonly}`;
  await page.evaluate(async ({ diagramId, isReadonly }) => {
    const request = indexedDB.open('VizlyLocalDB');
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
        id: diagramId, isReadonly, name: 'AUDIT persisted flowchart', type: 'flowchart', version: '1.0.0',
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
  }, { diagramId: id, isReadonly });
  await page.goto(`/#/?diagram=${id}`);
  const node = page.locator('.react-flow__node[data-id="saved-node"]');
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(node).toBeVisible();
    const dismiss = page.getByText('Do not show again', { exact: true });
    if (await dismiss.count()) await dismiss.click();
    await page.getByRole('button', { name: 'Fit Screen', exact: true }).click();
    const content = node.locator('[data-vizly-export-node-content="true"]');
    let lastBox = '', stableSince = Date.now();
    await expect.poll(async () => {
      const box = await content.boundingBox();
      if (!box) return false;
      const observed = JSON.stringify(box);
      if (observed !== lastBox) { lastBox = observed; stableSince = Date.now(); }
      return Date.now() - stableSince >= 250;
    }).toBe(true);
    await content.dblclick();
    if (isReadonly) {
      await expect(node.getByRole('textbox')).toHaveCount(0);
      await page.keyboard.press('Delete');
      await expect(node).toBeVisible();
      await expect(page.getByRole('button', { name: 'Rename diagram', exact: true })).toHaveCount(0);
    } else {
      const editor = node.getByRole('textbox');
      await expect(editor).toBeVisible();
      await editor.fill('Editable owner document');
      await editor.press('Tab');
      await expect(node).toContainText('Editable owner document');
    }
  }
  expect(errors).toEqual([]);
});
