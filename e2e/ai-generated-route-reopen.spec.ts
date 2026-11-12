import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

for (const scenario of [
  { file: 'ai-generated-label-reopen.json', node: 'candidate-review', label: '候选审核（发布验证）' },
  { file: 'ai-generated-multiline-reopen.json', node: 'release-review', label: '审核（泳道和路由验收通过）' },
]) {
  const fixture = JSON.parse(readFileSync(
    new URL(`./fixtures/${scenario.file}`, import.meta.url), 'utf8',
  )) as Record<string, unknown> & { id: string };

  test(`saved AI label expansion stays connected after reopening: ${scenario.file}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en');
      (window as unknown as Record<string, unknown>).__vizlyDisplayRoutingDiagnosticsEnabled = true;
    });
    await page.goto('/#/manage');
    await expect(page.getByRole('button', { name: 'New flowchart', exact: true })).toBeVisible();
    await page.evaluate(async document => {
      const request = indexedDB.open('VizlyLocalDB');
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
        const transaction = db.transaction('local_diagrams', 'readwrite');
        transaction.objectStore('local_diagrams').put(document);
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally { db.close(); }
    }, fixture);
    await page.goto(`/#/?diagram=${fixture.id}`);
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      await expect(page.locator(`.react-flow__node[data-id="${scenario.node}"]`))
        .toContainText(scenario.label);
      await expect.poll(() => page.evaluate(() => {
        const routing = (window as unknown as Record<string, Record<string, unknown>>)
          .__vizlyBaseReactFlowDisplayRouting;
        return { stage: routing?.stage, authority: routing?.renderAuthorityStatus,
          edges: document.querySelectorAll('.react-flow__edge').length };
      })).toEqual({ stage: 'final-applied', authority: 'accepted', edges: 2 });
      await expect(page.getByText('当前位置暂时无法生成合规连线', { exact: false })).toHaveCount(0);
    }
  });

}
