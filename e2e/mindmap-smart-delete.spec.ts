import { expect, test, type Page } from '@playwright/test';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { persistedAutoSaveNodeCount } from './helpers/localDiagramDatabase';

type Graph = { nodes: Node[]; edges: Edge[] };
type Bridge = { isCanvasReady(): boolean; getCanvasSnapshot(): Graph; replaceCanvasSnapshot(graph: Graph): void };
const diagramId = 'wms-process-flow-v1';
const readGraph = (page: Page) => page.evaluate(id => {
  const graph = (window as unknown as { __flowDataBridge: Record<string, Bridge> }).__flowDataBridge[id].getCanvasSnapshot();
  return { nodes: graph.nodes.map(n => ({ id: n.id, label: n.data.label })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: graph.edges.map(e => ({ id: e.id, source: e.source, target: e.target })).sort((a, b) => a.id.localeCompare(b.id)) };
}, diagramId);

for (const batch of [false, true]) {
  test(`mind-map toolbar ${batch ? 'batch' : 'single'} deletion grafts children and survives undo/save/reload`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/#/?diagram=wms-process-flow-v1');
    const ready = () => page.evaluate(id => (window as unknown as { __flowDataBridge?: Record<string, Bridge> })
      .__flowDataBridge?.[id]?.isCanvasReady?.(), diagramId);
    await expect.poll(ready).toBe(true);
    await page.evaluate(id => {
      const bridge = (window as unknown as { __flowDataBridge: Record<string, Bridge> }).__flowDataBridge[id];
      bridge.replaceCanvasSnapshot({ nodes: ['root', 'a', 'b', 'child'].map((name, depth) => ({
        id: `smart-${name}`, type: 'mindmap', position: { x: 80 + depth * 230, y: 180 },
        data: { label: `Smart ${name}`, depth, ...(depth === 0 ? { direction: 'R' } : {}) },
      })), edges: [['root', 'a'], ['a', 'b'], ['b', 'child']].map(([source, target]) => ({
        id: `smart-${source}-${target}`, source: `smart-${source}`, target: `smart-${target}`,
      })) });
    }, diagramId);
    const injectedIds = ['smart-root', 'smart-a', 'smart-b', 'smart-child'];
    await expect(page.locator('.react-flow__node[data-id^="smart-"]')).toHaveCount(injectedIds.length);
    // Bridge hydration precedes ReactFlow committing and measuring replacement nodes.
    // Queue the fit only against the current, initialized graph.
    await expect.poll(() => page.evaluate(ids => {
      const instance = (window as Window & { reactFlowInstance?: ReactFlowInstance }).reactFlowInstance;
      if (!instance?.viewportInitialized || instance.getNodes().length !== ids.length) return false;
      return ids.every(id => {
        const node = instance.getInternalNode(id);
        const width = node?.measured?.width ?? 0;
        const height = node?.measured?.height ?? 0;
        return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
      });
    }, injectedIds)).toBe(true);
    await page.evaluate(async () => {
      await (window as unknown as { reactFlowInstance: { fitView(options: { padding: number }): Promise<unknown> } })
        .reactFlowInstance.fitView({ padding: 0.3 });
    });
    const a = page.locator('.react-flow__node[data-id="smart-a"]');
    const b = page.locator('.react-flow__node[data-id="smart-b"]');
    await a.click();
    if (batch) await b.click({ modifiers: ['Shift'] });
    await expect(a).toHaveClass(/selected/);
    if (batch) await expect(b).toHaveClass(/selected/);
    const before = await readGraph(page);
    const deleteButtons = page.getByRole('button', { name: '删除节点 (Del)', exact: true });
    // Each selected legacy node renders a toolbar for the shared selection.
    await expect(deleteButtons).toHaveCount(batch ? 2 : 1);
    await deleteButtons.first().click();
    await expect(a).toHaveCount(0);
    if (batch) await expect(b).toHaveCount(0);
    await expect.poll(async () => (await readGraph(page)).edges.some(e =>
      e.source === 'smart-root' && e.target === (batch ? 'smart-child' : 'smart-b'))).toBe(true);
    const after = await readGraph(page);
    expect(after.nodes).toHaveLength(batch ? 2 : 3);
    expect(after.edges).toHaveLength(batch ? 1 : 2);
    for (const edge of after.edges) {
      expect(after.nodes.some(n => n.id === edge.source)).toBe(true);
      expect(after.nodes.some(n => n.id === edge.target)).toBe(true);
    }
    await page.getByRole('button', { name: '撤销 (Ctrl+Z)', exact: true }).click();
    await expect.poll(() => readGraph(page)).toEqual(before);
    await page.getByRole('button', { name: '重做 (Ctrl+Y)', exact: true }).click();
    await expect.poll(() => readGraph(page)).toEqual(after);
    await expect.poll(() => persistedAutoSaveNodeCount(page, diagramId)).toBe(batch ? 2 : 3);
    await page.reload();
    await expect.poll(ready).toBe(true);
    await expect.poll(() => readGraph(page)).toEqual(after);
    await expect(page.locator('.react-flow__node[data-id="smart-child"]')).toBeVisible();
    expect(errors).toEqual([]);
    await testInfo.attach('mindmap-smart-delete', { body: await page.screenshot(), contentType: 'image/png' });
  });
}
