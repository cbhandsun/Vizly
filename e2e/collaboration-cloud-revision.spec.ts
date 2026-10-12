import { expect, test, type WebSocketRoute } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { publishCollaborationElement, readCollaborationElement } from '../server/collaboration/documentModel';
import { CLOUD_REVISION_MESSAGE, writeAcceptedCloudRevision } from '../server/collaboration/cloudRevisionProtocol';
const readNodeData = (doc: Y.Doc) => {
  const data = readCollaborationElement(doc.getMap('flowchart-nodes').get('order-import'))?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
};

test('accepted cloud revision follows the live canvas and survives designer bridge updates', async ({ page }) => {
  const id = 'wms-process-flow-v1';
  const oldRevision = '2026-10-08T20:00:00.123456Z', revision = '2026-10-08T20:00:00.123457Z';
  const doc = new Y.Doc();
  let socket: WebSocketRoute | undefined;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, route => {
    socket = route;
    let granted = false;
    route.onMessage(input => {
      if (typeof input === 'string') throw new Error('Unexpected text frame');
      const decoder = decoding.createDecoder(input);
      if (decoding.readVarUint(decoder) !== 0) return;
      if (!granted) {
        granted = true;
        const claim = encoding.createEncoder(); encoding.writeVarUint(claim, 4); encoding.writeVarString(claim, 'editor:fields-v1');
        route.send(Buffer.from(encoding.toUint8Array(claim)));
      }
      const reply = encoding.createEncoder(); encoding.writeVarUint(reply, 0);
      sync.readSyncMessage(decoder, reply, doc, null);
      if (encoding.length(reply) > 1) route.send(Buffer.from(encoding.toUint8Array(reply)));
    });
  });
  try {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
    const node = page.locator('.react-flow__node[data-id="order-import"]');
    await expect(node).toBeVisible();
    await expect.poll(() => readNodeData(doc)?.label).toBe('订单导入/创建');
    await page.evaluate(({ id, oldRevision }) => {
      const state = window as Window & { __flowDataBridge?: Record<string, { id?: string; metadata?: Record<string, unknown> }> };
      const bridge = state.__flowDataBridge?.[id];
      if (!bridge) throw new Error('Designer not registered');
      // Simulate a loaded cloud identity; presets intentionally have a new save id.
      bridge.id = id;
      bridge.metadata = { ...bridge.metadata, cloud: { provider: 'supabase', id, revision: oldRevision } };
    }, { id, oldRevision });
    const sendRevision = (value: string) => {
      if (!socket) throw new Error('Transport missing');
      const frame = encoding.createEncoder(); encoding.writeVarUint(frame, CLOUD_REVISION_MESSAGE); writeAcceptedCloudRevision(frame, value, doc);
      socket.send(Buffer.from(encoding.toUint8Array(frame)));
    };
    const map = doc.getMap('flowchart-nodes');
    const previous = readCollaborationElement(map.get('order-import'));
    const previousData = readNodeData(doc);
    if (!previous || !previousData || !socket) throw new Error('Initial room missing');
    const before = Y.encodeStateVector(doc);
    // This preset uses CustomNode, whose editor updates both display fields.
    const updatedData = { ...previousData, label: 'Accepted cloud revision canvas', description: 'Accepted cloud revision canvas' };
    publishCollaborationElement(map, 'order-import', { ...previous, data: updatedData }, previous);
    const update = encoding.createEncoder(); encoding.writeVarUint(update, 0); sync.writeUpdate(update, Y.encodeStateAsUpdate(doc, before));
    socket.send(Buffer.from(encoding.toUint8Array(update))); sendRevision(revision);
    const readRevision = () => page.evaluate(id => {
      const state = window as Window & { __flowDataBridge?: Record<string, { metadata?: { cloud?: { revision?: string } } }> };
      return state.__flowDataBridge?.[id]?.metadata?.cloud?.revision;
    }, id);
    await expect(node).toContainText('Accepted cloud revision canvas');
    await expect.poll(readRevision).toBe(revision);
    await page.getByRole('button', { name: '适应屏幕', exact: true }).click();
    await expect(node).toBeInViewport();
    await node.getByText('Accepted cloud revision canvas', { exact: true }).dblclick();
    const editor = node.getByRole('textbox', { name: 'Edit Node Text', exact: true });
    await editor.fill('Local edit after accepted cloud'); await editor.press('Enter');
    await expect(node).toContainText('Local edit after accepted cloud');
    await expect.poll(() => readNodeData(doc)?.label).toBe('Local edit after accepted cloud');
    await expect.poll(() => page.evaluate(id => {
      const state = window as Window & { __flowDataBridge?: Record<string, { nodes?: unknown[] }> };
      const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
      const node = state.__flowDataBridge?.[id]?.nodes?.find(value => record(value) && value.id === 'order-import');
      return record(node) && record(node.data) ? node.data.label : undefined;
    }, id)).toBe('Local edit after accepted cloud');
    expect(await readRevision()).toBe(revision);
    sendRevision(oldRevision);
    await expect(node).toContainText('Local edit after accepted cloud');
    expect(await readRevision()).toBe(revision); expect(errors).toEqual([]);
  } finally { doc.destroy(); }
});
