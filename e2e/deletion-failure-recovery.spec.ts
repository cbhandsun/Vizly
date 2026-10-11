import { expect, test } from '@playwright/test';
import { persistedDiagramCount } from './helpers/localDiagramDatabase';

test('aborted deletion preserves the document and allows retry in the same confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'zh');
    const originalDelete = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange) {
      const request = originalDelete.call(this, key);
      if (this.name === 'local_diagrams' && localStorage.getItem('audit_abort_next_diagram_delete') === '1') {
        localStorage.removeItem('audit_abort_next_diagram_delete');
        const transaction = this.transaction;
        request.addEventListener('success', () => transaction.abort(), { once: true });
      }
      return request;
    };
  });
  await page.goto('/#/manage');
  await page.locator('.create-btn-main').click();
  await expect(page.locator('.page-tabs')).toBeVisible();
  await page.goto('/#/manage');
  const card = page.locator('.diagram-card').filter({ has: page.getByText('未命名流程图', { exact: true }) });
  await expect(card).toBeVisible();
  const countBefore = await persistedDiagramCount(page);
  expect(countBefore).toBeGreaterThan(0);
  await page.evaluate(() => localStorage.setItem('audit_abort_next_diagram_delete', '1'));
  await card.getByRole('button', { name: '未命名流程图 的更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: '删除', exact: true });
  await confirm.click();
  await expect(page.getByText('图表删除失败，请稍后重试。', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(confirm).toBeEnabled();
  await expect(card).toBeVisible();
  expect(await persistedDiagramCount(page)).toBe(countBefore);
  // A separate reload verifies durable state while preserving the original retry dialog.
  const reopened = await page.context().newPage();
  try {
    await reopened.goto('/#/manage');
    await reopened.reload();
    await expect(reopened.locator('.diagram-card').filter({ has: reopened.getByText('未命名流程图', { exact: true }) })).toBeVisible();
    expect(await persistedDiagramCount(reopened)).toBe(countBefore);
  } finally { await reopened.close(); }
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  await expect(card).toHaveCount(0);
  expect(await persistedDiagramCount(page)).toBe(countBefore - 1);
  await page.reload();
  await expect(page.locator('.workspace-main')).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(await persistedDiagramCount(page)).toBe(countBefore - 1);
});
