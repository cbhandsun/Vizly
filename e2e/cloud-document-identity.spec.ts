import { expect, test } from '@playwright/test';

for (const provider of ['supabase', 's3'] as const) {
 for (const autosave of ['none', 'legacy', 'bound'] as const) {
  test(`${provider} cloud source survives ${autosave} canvas initialization and reload`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/#/manage');
    await expect(page.getByRole('button', { name: '新建流程图', exact: true })).toBeVisible();
    const id = '22222222-2222-4222-8222-222222222222';
    const revision = provider === 's3' ? '"opaque-etag-16"' : '2026-10-08T14:00:00.123456+00:00';
    await page.evaluate(async ({ id, autosave, provider, revision }) => {
      const cloud = { provider, id, title: 'Identity regression cloud', revision };
      const metadata = { title: 'Identity regression cloud', cloud };
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
          id, name: 'Identity regression cloud', type: 'flowchart', version: '1.0', metadata,
          nodes: [{ id: 'identity-node', type: 'custom', domain: '业务域', domainClass: 'core', description: 'Cloud node', data: {}, metadata: { shape: 'rectangle', width: 100, height: 60, canvasPosition: { x: 100, y: 100 } } }],
          edges: [], groups: [], theme: { name: 'manual', displayName: 'Manual', domains: {} },
          layout: { type: 'custom', direction: 'LR', padding: { horizontal: 20, vertical: 20 }, spacing: { horizontal: 50, vertical: 50 } },
        });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          tx.onerror = () => reject(tx.error);
        });
      } finally { db.close(); }
      if (autosave !== 'none') localStorage.setItem(`flowchart-autosave-v2-${id}`, JSON.stringify({
        version: '1.0', diagramId: id, timestamp: Date.now(),
        nodes: [{ id: 'identity-node', type: 'flowchart', position: { x: 100, y: 100 }, data: { label: 'Unsaved local edit', description: 'Unsaved local edit', shape: 'rectangle' } }],
        edges: [], metadata: autosave === 'bound' ? { _vizlyDesignerDocumentIdentity: { scopeId: id, id, name: 'Identity regression cloud', metadata } } : undefined,
      }));
    }, { id, autosave, provider, revision });
    const readIdentity = () => page.evaluate(id => {
      const state = window as Window & { __flowDataBridge?: Record<string, { id?: string; name?: string; metadata?: { cloud?: { id?: string; provider?: string } }; isCanvasReady?: () => boolean }> };
      const bridge = state.__flowDataBridge?.[id];
      return { id: bridge?.id, name: bridge?.name, cloud: bridge?.metadata?.cloud, ready: bridge?.isCanvasReady?.() };
    }, id);
    await page.goto(`/#/?diagram=${id}`);
    await expect(page.locator('.react-flow__node[data-id="identity-node"]')).toBeVisible();
    await expect.poll(readIdentity).toMatchObject({ id, name: 'Identity regression cloud', cloud: { id, provider, revision }, ready: true });
    if (autosave !== 'none') await expect(page.locator('.react-flow__node')).toContainText('Unsaved local edit');
    // Wait for a real autosave commit before testing the refresh recovery path.
    await expect.poll(() => page.evaluate(id => {
      const raw = localStorage.getItem(`flowchart-autosave-v2-${id}`);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (!saved || typeof saved !== 'object' || !('metadata' in saved)) return false;
      const metadata = saved.metadata;
      return Boolean(metadata && typeof metadata === 'object' && '_vizlyDesignerDocumentIdentity' in metadata);
    }, id)).toBe(true);
    await page.reload();
    await expect(page.locator('.react-flow__node[data-id="identity-node"]')).toBeVisible();
    await expect.poll(readIdentity).toMatchObject({ id, name: 'Identity regression cloud', cloud: { id, provider, revision }, ready: true });
    if (autosave !== 'none') await expect(page.locator('.react-flow__node')).toContainText('Unsaved local edit');
    expect(errors).toEqual([]);
  });
 }
}
