import { expect, test, type WebSocketRoute } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';

// Real browser/Core/host with deterministic transport, no real cloud identities.
test('first connection conflict keeps the initial canvas and exposes recovery without a sync grant', async ({ page }) => {
  let connections = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, route => {
    connections++;
    let reported = false;
    route.onMessage(() => {
      if (reported) return;
      reported = true;
      const problem = encoding.createEncoder(); encoding.writeVarUint(problem, 5); encoding.writeVarString(problem, 'cloud-conflict');
      route.send(Buffer.from(encoding.toUint8Array(problem)));
      void route.close({ code: 1008, reason: 'Collaboration paused' });
    });
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
  await expect(page.getByText('云端与当前编辑存在冲突，协作同步已暂停', { exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="order-import"]')).toContainText('订单导入/创建');
  await page.getByRole('button', { name: '另存本地副本…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '另存为至 本地...', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^取\s*消$/ }).click();
  expect(connections).toBe(1); expect(errors).toEqual([]);
});

test('collaboration conflict retains edits and saves a local copy before reconnect', async ({ page }, testInfo) => {
  let socket: WebSocketRoute | undefined;
  let connections = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, route => {
    socket = route; connections++;
    let initialized = false;
    route.onMessage(() => {
      if (initialized) return;
      initialized = true;
      const claim = encoding.createEncoder(); encoding.writeVarUint(claim, 4); encoding.writeVarString(claim, 'editor:fields-v1');
      route.send(Buffer.from(encoding.toUint8Array(claim)));
      const doc = new Y.Doc();
      const initial = encoding.createEncoder(); encoding.writeVarUint(initial, 0); sync.writeSyncStep2(initial, doc);
      route.send(Buffer.from(encoding.toUint8Array(initial))); doc.destroy();
    });
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
  await expect(page.getByRole('button', { name: '打开协作详情：已连接协作服务', exact: true })).toBeVisible();
  const node = page.locator('.react-flow__node[data-id="order-import"]');
  await node.dblclick();
  const editor = node.getByRole('textbox', { name: 'Edit Node Text', exact: true });
  await editor.fill('Recovery retained edit'); await editor.press('Enter');
  await expect(node).toContainText('Recovery retained edit');
  if (!socket) throw new Error('Transport not connected');
  const problem = encoding.createEncoder(); encoding.writeVarUint(problem, 5); encoding.writeVarString(problem, 'cloud-conflict');
  socket.send(Buffer.from(encoding.toUint8Array(problem)));
  const title = page.getByText('云端与当前编辑存在冲突，协作同步已暂停', { exact: true });
  await expect(title).toBeVisible();
  expect(await title.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top !== null && (element === top || element.contains(top));
  })).toBe(true);
  await expect(node).toContainText('Recovery retained edit');
  const screenshot = testInfo.outputPath('recovery-banner.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('recovery-banner', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: '重新连接', exact: true }).click();
  await expect(page.getByText('重新连接会加载协作版本，可能替换当前画布。请先另存本地副本，保留尚未同步的修改。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保留当前画布', exact: true }).click();
  expect(connections).toBe(1);
  await page.getByRole('button', { name: '另存本地副本…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '另存为至 本地...', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: '图表名称', exact: true }).fill('协作恢复副本');
  await dialog.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(dialog).toHaveCount(0);
  const retained = await page.evaluate(() => {
    const raw = localStorage.getItem('diagram-custom-presets');
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const copy: unknown = (value as Record<string, unknown>)['协作恢复副本'];
    return Boolean(copy && typeof copy === 'object' && JSON.stringify(copy).includes('Recovery retained edit'));
  });
  expect(retained).toBe(true);
  await expect(node).toContainText('Recovery retained edit');
  expect(connections).toBe(1); expect(errors).toEqual([]);
});
