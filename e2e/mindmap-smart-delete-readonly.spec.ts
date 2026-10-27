import { expect, test, type WebSocketRoute } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { createCollaborationAuxiliaryNodes, expectAuxiliaryFixtureTitleClearance } from './helpers/collaborationAuxiliaryFixture';

// Real host/Core UI with a protocol fixture; does not prove Supabase identities.
test('smart delete rejects direct events after viewer downgrade', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let socket: WebSocketRoute | undefined;
  let fixtureUpdate: Uint8Array | undefined;
  const role = (value: 'editor' | 'viewer') => {
    if (!socket) throw new Error('Fixture transport not connected');
    const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 4); encoding.writeVarString(encoder, value);
    socket.send(Buffer.from(encoding.toUint8Array(encoder)));
  };
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, route => {
    socket = route;
    let initialized = false;
    route.onMessage(() => {
      if (initialized) return;
      initialized = true; role('viewer');
      const doc = new Y.Doc();
      const nodes = doc.getMap('flowchart-nodes');
      for (const node of createCollaborationAuxiliaryNodes()) nodes.set(node.id, node);
      fixtureUpdate = Y.encodeStateAsUpdate(doc);
      const initial = new Y.Doc();
      const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 0); sync.writeSyncStep2(encoder, initial);
      route.send(Buffer.from(encoding.toUint8Array(encoder))); doc.destroy(); initial.destroy();
    });
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
  const connected = page.getByRole('button', { name: '打开协作详情：已连接协作服务', exact: true });
  await expect(connected).toBeVisible();
  // Exercise a live remote update after the built-in canvas finishes loading.
  // Initial nonempty remote hydration is a separate acceptance boundary.
  await expect(page.locator('.react-flow__node[data-id="order-import"]')).toBeVisible();
  if (!socket || !fixtureUpdate) throw new Error('Remote fixture unavailable');
  const update = encoding.createEncoder(); encoding.writeVarUint(update, 0); sync.writeUpdate(update, fixtureUpdate);
  socket.send(Buffer.from(encoding.toUint8Array(update)));
  await expect(page.locator('.react-flow__node[data-id="sticky-test"]')).toBeVisible();
  await page.getByRole('button', { name: '适应屏幕', exact: true }).click();
  await expectAuxiliaryFixtureTitleClearance(page);
  role('editor');
  await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toBeVisible();
  const node = page.locator('.react-flow__node[data-id="mind-test"]');
  await node.click();
  role('viewer');
  await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toHaveCount(0);
  const unchanged = await page.evaluate(() => {
    const bridge = (window as unknown as { __flowDataBridge: Record<string, { getCanvasSnapshot(): unknown }> })
      .__flowDataBridge['wms-process-flow-v1'];
    const before = JSON.stringify(bridge.getCanvasSnapshot());
    window.dispatchEvent(new CustomEvent('mindmap:smart-delete', { detail: { nodeIds: ['mind-test'] } }));
    return JSON.stringify(bridge.getCanvasSnapshot()) === before;
  });
  expect(unchanged).toBe(true);
  await expect(node).toBeVisible();
  role('editor');
  await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toBeVisible();
  await node.click();
  await page.getByRole('button', { name: '删除节点 (Del)', exact: true }).click();
  await expect(node).toHaveCount(0);
  expect(errors).toEqual([]);
});
