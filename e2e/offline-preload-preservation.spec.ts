import { expect, test, type Page } from '@playwright/test';
const openHistory = async (page: Page) => {
  await page.getByRole('button', { name: '文档操作', exact: true }).click();
  await page.getByRole('menuitem', { name: /版本历史/ }).click();
  return page.locator('.version-history-drawer');
};
test('offline background chunk failure preserves the editor and local version snapshot', async ({ page, context }) => {
  const width = 1440;
  let releaseOffline: () => void = () => undefined;
  const offlineReady = new Promise<void>(resolve => { releaseOffline = resolve; });
  await page.route(/\/assets\/DataRegistry-[A-Za-z0-9_-]+\.js$/u, async route => {
    await offlineReady;
    await route.abort('internetdisconnected');
  });
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  let panel = await openHistory(page);
  await expect(panel.getByText('暂无版本快照', { exact: true })).toBeVisible();
  const failedWarmup = page.waitForEvent('requestfailed', request => /\/assets\/DataRegistry-[A-Za-z0-9_-]+\.js$/u.test(new URL(request.url()).pathname));
  await context.setOffline(true);
  releaseOffline();
  await failedWarmup;
  await expect(panel).toBeVisible();
  await panel.getByRole('textbox').fill('Offline status fixture');
  await panel.locator('.version-history-save').click();
  const row = panel.locator('.version-history-list-item').filter({ hasText: 'Offline status fixture' });
  await expect(row.getByText('仅本机保存，尚未同步', { exact: true })).toBeVisible();
  await expect(row.getByText('已保存到云端', { exact: true })).toHaveCount(0);
  await context.setOffline(false);
  await page.reload();
  panel = await openHistory(page);
  const restored = panel.locator('.version-history-list-item').filter({ hasText: 'Offline status fixture' });
  await expect(restored.getByText('仅本机保存，尚未同步', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await restored.getByRole('button', { name: '导出本地副本', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('No exported snapshot');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const snapshot = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(snapshot.nodes.length).toBeGreaterThan(0);
  expect(Array.isArray(snapshot.edges)).toBe(true);
  await restored.getByRole('button', { name: '重试云同步', exact: true }).click();
  await expect(restored.getByText('仅本机保存，尚未同步', { exact: true })).toBeVisible();
  await expect(restored.getByText('请先配置所选存储服务。', { exact: true })).toBeVisible();
  for (const button of await restored.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
});
