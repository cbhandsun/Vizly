import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';

for (const role of ['viewer', 'editor'] as const) test(`deleted remote document stays empty after initialization for ${role}`, async ({ page }) => {
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, socket => {
    let sent = false;
    socket.onMessage(() => {
      if (sent) return;
      sent = true;
      const access = encoding.createEncoder();
      encoding.writeVarUint(access, 4); encoding.writeVarString(access, role);
      socket.send(Buffer.from(encoding.toUint8Array(access)));
      const doc = new Y.Doc();
      doc.getMap('flowchart-nodes').set('deleted', { id: 'deleted', position: { x: 0, y: 0 }, data: {} });
      doc.getMap('flowchart-nodes').delete('deleted');
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0); sync.writeSyncStep2(encoder, doc);
      socket.send(Buffer.from(encoding.toUint8Array(encoder))); doc.destroy();
    });
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
  // Wait for initialization and the remote commit, rather than asserting an
  // empty DOM before either asynchronous operation has started.
  await expect(page.getByRole('button', { name: '打开协作详情：已连接协作服务', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const entry = window.__flowDataBridge?.['wms-process-flow-v1'];
    if (entry?.isCanvasReady?.() !== true || typeof entry.getCanvasSnapshot !== 'function') return null;
    const value: unknown = entry.getCanvasSnapshot();
    if (!value || typeof value !== 'object' || !('nodes' in value) || !Array.isArray(value.nodes)) return null;
    return value.nodes.length;
  })).toBe(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
});
