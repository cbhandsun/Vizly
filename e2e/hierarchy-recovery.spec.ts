import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const diagramId = 'wms-process-flow-v1';
const storageKey = `flowchart-autosave-v2-${diagramId}`;
const original = JSON.stringify({ version: '1.0', diagramId, timestamp: 1, nodes: [
  { id: 'recovery-child', type: 'flowchart', parentId: 'missing-parent', extent: 'parent',
    position: { x: 120, y: 160 }, data: { label: 'Recovered child' } },
  { id: 'recovery-other', type: 'flowchart', position: { x: 500, y: 160 }, data: { label: 'Other' } },
], edges: [{ id: 'recovery-edge', source: 'recovery-child', target: 'recovery-other' }] }, null, 2);

async function seed(page: Page, language: string, source = original, failBackup = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ language, source, storageKey, failBackup }) => {
    localStorage.setItem('i18nextLng', language);
    if (!sessionStorage.getItem('hierarchy-recovery-seeded')) {
      localStorage.setItem(storageKey, source);
      sessionStorage.setItem('hierarchy-recovery-seeded', 'true');
    }
    if (failBackup) {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('vizly-hierarchy-recovery-v1:')) throw new DOMException('Controlled quota', 'QuotaExceededError');
        return setItem.call(this, key, value);
      };
    }
  }, { language, source, storageKey, failBackup });
  await page.goto(`/#/?diagram=${diagramId}`);
}

const readSource = (page: Page) => page.evaluate(key => localStorage.getItem(key), storageKey);
const readBackups = (page: Page) => page.evaluate(() => Object.keys(localStorage)
  .filter(key => key.startsWith('vizly-hierarchy-recovery-v1:')).map(key => localStorage.getItem(key)));

for (const language of ['zh', 'en']) {
  test(`historical hierarchy recovery requires consent and survives reload (${language})`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await seed(page, language);
    const title = language === 'zh' ? '此图表需要恢复' : 'This diagram needs recovery';
    const review = page.getByRole('region', { name: title });
    await expect(review).toBeVisible();
    await expect(review.getByRole('listitem')).toContainText('recovery-child → missing-parent');
    expect(await readSource(page)).toBe(original);
    expect(await readBackups(page)).toEqual([]);
    await expect(page.locator('.react-flow__node[data-id="recovery-child"]')).toHaveCount(0);
    const downloadPromise = page.waitForEvent('download');
    await review.getByRole('button', { name: language === 'zh' ? '下载原始数据' : 'Download original data' }).click();
    const download = await downloadPromise;
    const downloaded = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(downloaded.originalSerializedSource).toBe(original);
    await review.getByRole('button', { name: language === 'zh' ? '取消' : 'Cancel', exact: true }).click();
    await expect(review).toHaveCount(0);
    expect(await readSource(page)).toBe(original);
    expect(await readBackups(page)).toEqual([]);
    await page.getByRole('button', { name: language === 'zh' ? '重试' : 'Retry', exact: true }).click();
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: language === 'zh' ? '备份并恢复' : 'Back up and recover' }).click();
    await expect(review).toHaveCount(0);
    await expect(page.locator('.react-flow__node[data-id="recovery-child"]')).toBeVisible();
    await expect(page.locator('.react-flow__edge[data-id="recovery-edge"]')).toBeVisible();
    expect((await readBackups(page)).map(value => JSON.parse(value!).originalSerializedSource)).toEqual([original]);
    await expect.poll(async () => {
      const source = await readSource(page);
      return source !== original && JSON.parse(source!).nodes.find((node: { id: string; parentId?: string }) => node.id === 'recovery-child')?.parentId === undefined;
    }).toBe(true);
    await page.reload();
    await expect(page.locator('.react-flow__node[data-id="recovery-child"]')).toBeVisible();
    await expect(page.locator('.react-flow__edge[data-id="recovery-edge"]')).toBeVisible();
    await expect(review).toHaveCount(0);
    expect(await readBackups(page)).toHaveLength(1);
    expect(errors).toEqual([]);
    await testInfo.attach(`recovery-${language}`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('backup failure keeps the original document and blocks initialization', async ({ page }) => {
  await seed(page, 'zh', original, true);
  const review = page.getByRole('region', { name: '此图表需要恢复' });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: '备份并恢复' }).click();
  await expect(review.getByRole('alert')).toContainText('无法备份原始数据');
  expect(await readSource(page)).toBe(original);
  expect(await readBackups(page)).toEqual([]);
  await expect(page.locator('.react-flow__node[data-id="recovery-child"]')).toHaveCount(0);
});

test('invalid edge is not silently discarded by the recovery path', async ({ page }) => {
  const value = JSON.parse(original);
  value.edges[0].target = 'absent';
  const source = JSON.stringify(value);
  await seed(page, 'zh', source);
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '此图表需要恢复' })).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="recovery-child"]')).toHaveCount(0);
  expect(await readSource(page)).toBe(source);
});
