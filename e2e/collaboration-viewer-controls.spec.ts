import { expect, test, type WebSocketRoute } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';

// Real browser/Core/host rendering with a deterministic protocol fixture.
// This verifies UI role handling, not Supabase authentication or two real accounts.
test('server viewer role disables editing and follows promotion and downgrade', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let socket: WebSocketRoute | undefined;
  const sendRole = (role: 'viewer' | 'editor') => {
    if (!socket) throw new Error('Collaboration transport has not connected');
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 4);
    encoding.writeVarString(encoder, role);
    socket.send(Buffer.from(encoding.toUint8Array(encoder)));
  };
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, route => {
    socket = route;
    let initialized = false;
    route.onMessage(() => {
      if (initialized) return;
      initialized = true;
      sendRole('viewer');
      const doc = new Y.Doc();
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      sync.writeSyncStep2(encoder, doc);
      route.send(Buffer.from(encoding.toUint8Array(encoder)));
      doc.destroy();
    });
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
  await expect(page.getByRole('button', { name: '打开协作详情：已连接协作服务', exact: true })).toBeVisible();
  const node = page.locator('.react-flow__node[data-id="order-import"]');
  await expect(node).toContainText('订单导入/创建');
  await node.dblclick();
  await expect(node.getByRole('textbox', { name: 'Edit Node Text', exact: true })).toHaveCount(0);
  sendRole('editor');
  await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toBeVisible();
  await node.dblclick();
  const editor = node.getByRole('textbox', { name: 'Edit Node Text', exact: true });
  await expect(editor).toBeVisible();
  sendRole('viewer');
  await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await node.dblclick();
  await expect(editor).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
