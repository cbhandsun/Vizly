import { expect, test, type WebSocketRoute } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';

// Protocol fixture checks geometry and keyboard access, not cloud identity.
for (const width of [1440, 1024, 768, 390]) {
  test(`collaboration status does not overlap toolbar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let socket: WebSocketRoute | undefined;
    const sendRole = (role: 'viewer' | 'editor') => {
      if (!socket) throw new Error('Transport not connected');
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
      sendRole('editor');
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
    const status = page.getByRole('button', { name: '打开协作详情：已连接协作服务', exact: true });
    await expect(status).toBeVisible();
    for (const role of ['editor', 'viewer'] as const) {
      sendRole(role);
      const node = page.locator('.react-flow__node[data-id="order-import"]');
      if (role === 'editor') await expect(node).toHaveClass(/\bdraggable\b/);
      else await expect(node).not.toHaveClass(/\bdraggable\b/);
      await expect.poll(async () => page.evaluate(() => {
        const presence = document.querySelector('.designer-top-presence')?.getBoundingClientRect();
        const toolbarRects = [...document.querySelectorAll('[data-designer-top-toolbar-center] > div > div')].map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
        if (!presence) return { noOverlap: false, inViewport: false, hit: false };
        const intersects = toolbarRects.some(rect => presence.left < rect.right && presence.right > rect.left && presence.top < rect.bottom && presence.bottom > rect.top);
        const button = document.querySelector('.designer-top-presence button');
        return { noOverlap: !intersects, inViewport: presence.left >= 0 && presence.right <= innerWidth && presence.width > 0, hit: !!button && button.contains(document.elementFromPoint(presence.left + presence.width / 2, presence.top + presence.height / 2)) };
      })).toEqual({ noOverlap: true, inViewport: true, hit: true });
    }
    await expect(page.locator('#vizly-plugin-right-island-portal .designer-top-presence')).toHaveCount(1);
    await status.evaluate(element => element.focus());
    await expect(status).toBeFocused();
    await status.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: `../presence-layout-${width}.png` });
  });
}




