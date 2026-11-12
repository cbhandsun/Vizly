import { expect, test, type Page } from '@playwright/test';
type Bridge = { nodes: { id: string }[]; importData(data: unknown): Promise<void> };
const ids = (page: Page) => page.evaluate(() => (window as unknown as { __flowDataBridge: Record<string, Bridge> })
  .__flowDataBridge['mindmap-unified'].nodes.map(n => n.id).sort());

test('MindElixir branch deletion confirms descendants, supports cancel/undo/redo, and persists', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/?diagram=mindmap-unified');
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __flowDataBridge?: Record<string, Bridge> })
    .__flowDataBridge?.['mindmap-unified']?.importData)).toBe('function');
  await expect(page.locator('me-tpc[data-nodeid="meroot"]')).toBeVisible();
  await expect.poll(() => ids(page)).toEqual(['root']);
  await page.evaluate(async () => {
    await (window as unknown as { __flowDataBridge: Record<string, Bridge> }).__flowDataBridge['mindmap-unified'].importData({
      _version: 'mindmap-v2', direction: 1,
      nodeData: { id: 'root', topic: 'Delete contract', root: true, children: [
        { id: 'branch', topic: 'Parent branch', children: [{ id: 'child', topic: 'Child topic' }] },
        { id: 'sibling', topic: 'Keep sibling' },
      ] },
    });
  });
  await expect.poll(() => ids(page)).toEqual(['branch', 'child', 'root', 'sibling']);
  await page.getByRole('button', { name: '适应视口', exact: true }).click();
  const branch = page.locator('me-tpc[data-nodeid="mebranch"]');
  await expect(branch).toBeVisible();
  const before = await ids(page);
  expect(before).toEqual(['branch', 'child', 'root', 'sibling']);
  await branch.click();
  await page.getByRole('button', { name: '删除节点 (Del)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1 个后代节点');
  await dialog.getByRole('button', { name: /^取\s*消$/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(await ids(page)).toEqual(before);
  await branch.click();
  await page.getByRole('button', { name: '删除节点 (Del)', exact: true }).click();
  await dialog.getByRole('button', { name: '删除节点', exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(['root', 'sibling']);
  await expect(branch).toHaveCount(0);
  await page.getByRole('button', { name: '撤销 (Ctrl+Z)', exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(before);
  await page.getByRole('button', { name: '重做 (Ctrl+Y)', exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(['root', 'sibling']);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('flowchart-autosave-v2-mindmap-unified');
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return saved.nodes?.find((n: { id: string }) => n.id === '__mindmap_meta__')?.data?.mindmapV2?.nodeData?.children?.map((n: { id: string }) => n.id);
  })).toEqual(['sibling']);
  await page.reload();
  await expect(page.locator('me-tpc[data-nodeid="mesibling"]')).toBeVisible();
  await expect.poll(() => ids(page)).toEqual(['root', 'sibling']);
  expect(errors).toEqual([]);
  await testInfo.attach('mindmap-v2-delete', { body: await page.screenshot(), contentType: 'image/png' });
});
