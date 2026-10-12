import { expect, test } from '@playwright/test';
import { persistedDiagramCount } from './helpers/localDiagramDatabase';

test('creation waits for durable commit and recovers after a real IndexedDB transaction abort', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'zh');
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const request = key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
      if (this.name === 'local_diagrams' && localStorage.getItem('audit_abort_next_diagram_write') === '1') {
        localStorage.removeItem('audit_abort_next_diagram_write');
        const transaction = this.transaction;
        // Exercise the gap between request success and transaction commit.
        request.addEventListener('success', () => transaction.abort(), { once: true });
      }
      return request;
    };
  });
  await page.goto('/#/manage');
  const create = page.locator('.create-btn-main');
  await expect(create).toBeEnabled();
  const initialCount = await persistedDiagramCount(page);
  await page.evaluate(() => localStorage.setItem('audit_abort_next_diagram_write', '1'));
  await create.click();
  await expect(page.getByText('Failed to create diagram.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/manage$/);
  await expect(create).toBeEnabled();
  expect(await persistedDiagramCount(page)).toBe(initialCount);
  await page.reload();
  await expect(create).toBeEnabled();
  expect(await persistedDiagramCount(page)).toBe(initialCount);
  let releaseEditor = () => {};
  let editorRequestHeld = false;
  const editorGate = new Promise<void>(resolve => { releaseEditor = resolve; });
  await page.route(/\/assets\/DiagramViewerRoute-[^/]+\.js$/, async route => {
    editorRequestHeld = true;
    await editorGate;
    await route.continue();
  });
  try {
    await create.click();
    await expect(page).toHaveURL(/diagram=/);
    expect(await persistedDiagramCount(page)).toBe(initialCount + 1);
    await expect.poll(() => editorRequestHeld).toBe(true);
    await page.goto('/#/manage');
    await expect(create).toBeEnabled();
    expect(await persistedDiagramCount(page)).toBe(initialCount + 1);
  } finally {
    releaseEditor();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
