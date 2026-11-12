import { expect, test } from '@playwright/test';
type Bridge = { nodes: { id: string; data: { parentId?: string } }[]; addNode(args: { label: string }): Promise<string>; importData(data: unknown): Promise<void> };
async function expectPersistedMindMap(page: import('@playwright/test').Page, expectedIds: string[], childId?: string) {
  await expect.poll(() => page.evaluate(({ expectedIds, childId }) => {
    const saved = JSON.parse(localStorage.getItem('flowchart-autosave-v2-mindmap-unified') || '{}');
    const primary = saved.nodes?.find((n: { id: string }) => n.id === '__mindmap_meta__')?.data?.mindmapV2?.nodeData;
    const activePage = saved.metadata?.multiPage?.pages?.find((p: { id: string }) => p.id === saved.metadata.multiPage.activePageId);
    const pageTree = activePage?.nodes?.find((n: { id: string }) => n.id === '__mindmap_meta__')?.data?.mindmapV2?.nodeData;
    return !!primary && JSON.stringify(primary) === JSON.stringify(pageTree)
      && JSON.stringify(primary.children?.map((n: { id: string }) => n.id)) === JSON.stringify(expectedIds)
      && (!childId || primary.children?.find((n: { id: string }) => n.id === 'branch')?.children?.some((n: { id: string }) => n.id === childId));
  }, { expectedIds, childId })).toBe(true);
}
test('context deletion selects the actual topic when another ID equals its DOM ID', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/?diagram=mindmap-unified');
  await expect(page.locator('me-tpc[data-nodeid="meroot"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __flowDataBridge: Record<string, Bridge> })
    .__flowDataBridge['mindmap-unified'].nodes.map(n => n.id))).toEqual(['root']);
  await page.evaluate(async () => {
    await (window as unknown as { __flowDataBridge: Record<string, Bridge> }).__flowDataBridge['mindmap-unified'].importData({
      _version: 'mindmap-v2', direction: 1,
      nodeData: { id: 'root', topic: 'Context identity', root: true, children: [
        { id: 'branch', topic: 'Intended topic' }, { id: 'mebranch', topic: 'Must retain this topic' },
      ] },
    });
  });
  await expect(page.locator('me-tpc[data-nodeid="mebranch"]')).toContainText('Intended topic');
  await expectPersistedMindMap(page, ['branch', 'mebranch']);
  await page.getByRole('button', { name: '适应视口', exact: true }).click();
  await page.locator('me-tpc[data-nodeid="mebranch"]').click();
  const addedId = await page.evaluate(async () => {
    const bridge = (window as unknown as { __flowDataBridge: Record<string, Bridge> }).__flowDataBridge['mindmap-unified'];
    return bridge.addNode({ label: 'Child of intended topic' });
  });
  expect(addedId).toBeTruthy();
  // Saving can replace the canvas instance. Inspect the live bridge, not a disposed one.
  await expect.poll(() => page.evaluate(id => (
    window as unknown as { __flowDataBridge: Record<string, Bridge> }
  ).__flowDataBridge['mindmap-unified']?.nodes.find(n => n.id === id)?.data.parentId, addedId)).toBe('branch');
  await expect(page.locator(`me-tpc[data-nodeid="me${addedId}"]`)).toContainText('Child of intended topic');
  // Reload only after both persisted representations acknowledge the fixture.
  // The active-page snapshot can otherwise replace the primary tree after mount.
  await expectPersistedMindMap(page, ['branch', 'mebranch'], addedId);
  await page.reload();
  await expect(page.locator(`me-tpc[data-nodeid="me${addedId}"]`)).toContainText('Child of intended topic');
  await page.getByRole('button', { name: '适应视口', exact: true }).click();
  // Confirm the restored canvas is interactive with a different topic selected.
  // The context action must use its target, never that previous selection.
  await page.locator('me-tpc[data-nodeid="memebranch"]').click();
  await expect(page.locator('me-tpc[data-nodeid="memebranch"]')).toHaveClass(/selected/);
  await page.locator('me-tpc[data-nodeid="mebranch"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /删除节点/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Intended topic');
  await page.getByRole('dialog').getByRole('button', { name: '删除节点', exact: true }).click();
  await expect(page.locator('me-tpc[data-nodeid="mebranch"]')).toHaveCount(0);
  await expect(page.locator('me-tpc[data-nodeid="memebranch"]')).toContainText('Must retain this topic');
  await expect(page.locator(`me-tpc[data-nodeid="me${addedId}"]`)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('flowchart-autosave-v2-mindmap-unified');
    const saved = raw ? JSON.parse(raw) : null;
    return saved?.nodes?.find((n: { id: string }) => n.id === '__mindmap_meta__')?.data?.mindmapV2?.nodeData?.children?.map((n: { id: string }) => n.id);
  })).toEqual(['mebranch']);
  await expectPersistedMindMap(page, ['mebranch']);
  await page.reload();
  await expect(page.locator('me-tpc[data-nodeid="memebranch"]')).toContainText('Must retain this topic');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __flowDataBridge: Record<string, Bridge> })
    .__flowDataBridge['mindmap-unified']?.nodes.map(n => n.id).sort())).toEqual(['mebranch', 'root']);
});


test('supported twelve-level mind map retains every topic after autosave and reload', async ({ page }) => {
  await page.goto('/#/?diagram=mindmap-unified');
  await expect(page.locator('me-tpc[data-nodeid="meroot"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __flowDataBridge: Record<string, Bridge> })
    .__flowDataBridge['mindmap-unified']?.nodes.map(n => n.id))).toEqual(['root']);
  await page.evaluate(async () => {
    type Topic = { id: string; topic: string; children?: Topic[] };
    let nodeData: Topic = { id: 'depth-12', topic: 'Deep authored leaf' };
    for (let depth = 11; depth >= 0; depth--) {
      nodeData = { id: depth === 0 ? 'root' : `depth-${depth}`, topic: `Authored level ${depth}`, children: [nodeData] };
    }
    await (window as unknown as { __flowDataBridge: Record<string, Bridge> }).__flowDataBridge['mindmap-unified']
      .importData({ _version: 'mindmap-v2', direction: 1, nodeData });
  });
  const expectedIds = ['root', ...Array.from({ length: 12 }, (_, i) => `depth-${i + 1}`)].sort();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __flowDataBridge: Record<string, Bridge> })
    .__flowDataBridge['mindmap-unified']?.nodes.map(n => n.id).sort())).toEqual(expectedIds);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('flowchart-autosave-v2-mindmap-unified') || '{}');
    const primary = saved.nodes?.find((n: { id: string }) => n.id === '__mindmap_meta__')?.data?.mindmapV2?.nodeData;
    const page = saved.metadata?.multiPage?.pages?.find((p: { id: string }) => p.id === saved.metadata.multiPage.activePageId);
    const pageTree = page?.nodes?.find((n: { id: string }) => n.id === '__mindmap_meta__')?.data?.mindmapV2?.nodeData;
    return !!primary && JSON.stringify(primary) === JSON.stringify(pageTree) && JSON.stringify(primary).includes('Deep authored leaf');
  })).toBe(true);
  await page.reload();
  await expect(page.locator('me-tpc[data-nodeid="medepth-12"]')).toContainText('Deep authored leaf');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __flowDataBridge: Record<string, Bridge> })
    .__flowDataBridge['mindmap-unified']?.nodes.map(n => n.id).sort())).toEqual(expectedIds);
});
