import { expect, test } from '@playwright/test';
import type { Edge, Node } from '@xyflow/react';

type Graph = { nodes: Node[]; edges: Edge[] };
type Bridge = {
  isCanvasReady(): boolean;
  getCanvasSnapshot(): Graph;
  mutateCanvasSnapshot(mutation: (current: Graph) => Graph): void;
};

test('installed SDK commits consecutive mutations from current state and supports immediate undo', async ({ page }) => {
  const id = 'wms-process-flow-v1';
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  await expect.poll(() => page.evaluate(id => {
    const host = window as unknown as { __flowDataBridge?: Record<string, Bridge> };
    return host.__flowDataBridge?.[id]?.isCanvasReady();
  }, id)).toBe(true);
  const result = await page.evaluate(async id => {
    const host = window as unknown as { __flowDataBridge?: Record<string, Bridge> };
    const bridge = host.__flowDataBridge![id];
    const original = bridge.getCanvasSnapshot().nodes.map(node => node.id);
    const add = (name: string) => bridge.mutateCanvasSnapshot(current => ({
      nodes: [...current.nodes, { id: name, type: 'flowchart', position: { x: 0, y: 0 }, data: { label: name } }],
      edges: current.edges,
    }));
    const pending = Promise.resolve().then(() => add('atomic-api-a'));
    add('atomic-ui');
    await pending;
    add('atomic-api-b');
    const after = bridge.getCanvasSnapshot().nodes.map(node => node.id);
    try { bridge.mutateCanvasSnapshot(() => { throw new Error('rejected-command'); }); } catch { /* expected */ }
    return { original, after, unchanged: bridge.getCanvasSnapshot().nodes.map(node => node.id) };
  }, id);
  expect(result.after).toEqual([...result.original, 'atomic-ui', 'atomic-api-a', 'atomic-api-b']);
  expect(result.unchanged).toEqual(result.after);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => page.evaluate(id => {
    const host = window as unknown as { __flowDataBridge?: Record<string, Bridge> };
    return host.__flowDataBridge![id].getCanvasSnapshot().nodes.map(node => node.id);
  }, id)).toEqual([...result.original, 'atomic-ui', 'atomic-api-a']);
});
