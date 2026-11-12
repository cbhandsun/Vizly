import { expect, test, type Page } from '@playwright/test';
import type { Edge, Node } from '@xyflow/react';
import { persistedAutoSaveNodeCount } from './helpers/localDiagramDatabase';

const diagramId = 'wms-process-flow-v1';
type Graph = { nodes: Node[]; edges: Edge[] };
type Bridge = { isCanvasReady(): boolean; getCanvasSnapshot(): Graph; replaceCanvasSnapshot(graph: Graph): void };
const readGraph = (page: Page) => page.evaluate(id => {
  const bridge = (window as unknown as { __flowDataBridge: Record<string, Bridge> }).__flowDataBridge[id];
  const graph = bridge.getCanvasSnapshot();
  return { nodes: graph.nodes.map(node => ({ id: node.id, parentId: node.parentId ?? null, position: node.position })),
    edges: graph.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target })) };
}, diagramId);

for (const operation of ['delete', 'ungroup', 'cut'] as const) {
  test(`installed SDK ${operation} preserves child position through undo/redo`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    if (operation === 'cut') await page.addInitScript(() => {
      // Keep the OS clipboard untouched; exercise the actual UI cut transaction
      // with only the external clipboard transport replaced.
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => { sessionStorage.setItem('hierarchy-test-clipboard', text); },
      } });
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/#/?diagram=wms-process-flow-v1');
    await expect.poll(() => page.evaluate(id => (window as unknown as { __flowDataBridge?: Record<string, Bridge> })
      .__flowDataBridge?.[id]?.isCanvasReady(), diagramId)).toBe(true);
    await page.evaluate(async id => {
      const host = window as unknown as { __flowDataBridge: Record<string, Bridge>;
        reactFlowInstance: { setViewport(value: { x: number; y: number; zoom: number }): Promise<unknown> } };
      host.__flowDataBridge[id].replaceCanvasSnapshot({ nodes: [
        { id: 'hierarchy-parent', type: 'titleGroup', position: { x: 80, y: 80 },
          style: { width: 400, height: 300 }, data: { label: 'Hierarchy parent', width: 400, height: 300 } },
        { id: 'hierarchy-child', type: 'flowchart', parentId: 'hierarchy-parent', extent: 'parent',
          position: { x: 40, y: 80 }, data: { label: 'Hierarchy child' } },
        { id: 'hierarchy-other', type: 'flowchart', position: { x: 600, y: 180 }, data: { label: 'Other' } },
      ], edges: [
        { id: 'hierarchy-removed', source: 'hierarchy-parent', target: 'hierarchy-other' },
        { id: 'hierarchy-kept', source: 'hierarchy-child', target: 'hierarchy-other' },
      ] });
      await host.reactFlowInstance.setViewport({ x: 100, y: 60, zoom: 1 });
    }, diagramId);
    const parent = page.locator('.react-flow__node[data-id="hierarchy-parent"]');
    await expect(parent).toBeVisible();
    await parent.click({ position: { x: 20, y: 15 } });
    await expect(parent).toHaveClass(/selected/);
    const before = await readGraph(page);
    const child = page.locator('.react-flow__node[data-id="hierarchy-child"]');
    const beforeBox = await child.boundingBox(); expect(beforeBox).not.toBeNull();
    await page.keyboard.press(operation === 'delete' ? 'Delete' : operation === 'cut' ? 'ControlOrMeta+x' : 'ControlOrMeta+Shift+g');
    await expect(parent).toHaveCount(0);
    await expect.poll(async () => (await readGraph(page)).nodes.find(node => node.id === 'hierarchy-child')?.parentId).toBeNull();
    const after = await readGraph(page);
    expect(after.edges.map(edge => edge.id)).toEqual(['hierarchy-kept']);
    expect(after.nodes.find(node => node.id === 'hierarchy-child')?.position).toEqual({ x: 120, y: 160 });
    await expect.poll(async () => {
      const box = await child.boundingBox();
      return box ? Math.max(Math.abs(box.x - beforeBox!.x), Math.abs(box.y - beforeBox!.y)) : Infinity;
    }).toBeLessThan(1);
    await page.getByRole('button', { name: '撤销 (Ctrl+Z)', exact: true }).click();
    await expect.poll(() => readGraph(page)).toEqual(before);
    await page.getByRole('button', { name: '重做 (Ctrl+Y)', exact: true }).click();
    await expect.poll(() => readGraph(page)).toEqual(after);
    if (operation === 'cut') expect(await page.evaluate(() => sessionStorage.getItem('hierarchy-test-clipboard'))).toContain('hierarchy-parent');
    await expect.poll(() => persistedAutoSaveNodeCount(page, diagramId)).toBe(2);
    await page.reload();
    await expect.poll(() => page.evaluate(id => (window as unknown as { __flowDataBridge?: Record<string, Bridge> })
      .__flowDataBridge?.[id]?.isCanvasReady(), diagramId)).toBe(true);
    await expect.poll(() => readGraph(page)).toEqual(after);
    await expect(child).toBeVisible();
    await expect(page.locator('.react-flow__edge[data-id="hierarchy-kept"]')).toBeVisible();
    expect(errors).toEqual([]);
    await testInfo.attach(`hierarchy-${operation}`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}
