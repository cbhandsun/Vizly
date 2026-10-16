import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { formatCollaborationAccess, publishCollaborationElement } from '../server/collaboration/documentModel';

test('nested remote fields update the visible label and position under the current protocol', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const doc = new Y.Doc();
  const baseline = {
    id: 'remote-fields', type: 'flowchart', position: { x: 100, y: 100 },
    data: { label: 'Initial shared fields', description: 'Initial shared fields', shape: 'rectangle' },
  };
  doc.transact(() => publishCollaborationElement(doc.getMap('flowchart-nodes'), baseline.id, baseline));
  let sendUpdate: ((bytes: Uint8Array) => void) | undefined;
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, socket => {
    let sent = false;
    socket.onMessage(() => {
      if (sent) return;
      sent = true;
      const access = encoding.createEncoder();
      encoding.writeVarUint(access, 4);
      encoding.writeVarString(access, formatCollaborationAccess('viewer'));
      socket.send(Buffer.from(encoding.toUint8Array(access)));
      const initial = encoding.createEncoder();
      encoding.writeVarUint(initial, 0); sync.writeSyncStep2(initial, doc);
      socket.send(Buffer.from(encoding.toUint8Array(initial)));
      sendUpdate = bytes => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0); sync.writeUpdate(encoder, bytes);
        socket.send(Buffer.from(encoding.toUint8Array(encoder)));
      };
    });
  });
  try {
    await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
    const visibleNode = page.locator('.react-flow__node[data-id="remote-fields"]');
    await expect(visibleNode).toContainText('Initial shared fields');
    if (!sendUpdate) throw new Error('Current protocol fixture did not synchronize');
    const before = Y.encodeStateVector(doc);
    doc.transact(() => publishCollaborationElement(doc.getMap('flowchart-nodes'), baseline.id, {
      ...baseline, position: { x: 160, y: 140 },
      data: { ...baseline.data, label: 'Merged shared fields', description: 'Merged shared fields' },
    }, baseline));
    sendUpdate(Y.encodeStateAsUpdate(doc, before));
    await expect(visibleNode).toContainText('Merged shared fields');
    await expect(visibleNode).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 160, 140)');
    await expect(page.locator('.react-flow__node[data-id="order-import"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { doc.destroy(); }
});

for (const role of ['viewer', 'editor'] as const) test(`initial remote canvas survives template initialization for ${role}`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, socket => {
    let sent = false;
    socket.onMessage(() => {
      if (sent) return;
      sent = true;
      const access = encoding.createEncoder();
      encoding.writeVarUint(access, 4); encoding.writeVarString(access, role);
      socket.send(Buffer.from(encoding.toUint8Array(access)));
      const doc = new Y.Doc();
      doc.getMap('flowchart-nodes').set('remote-initial', {
        id: 'remote-initial', type: 'flowchart', position: { x: 100, y: 100 },
        data: { label: 'Remote initial document', description: 'Remote initial document', shape: 'rectangle' },
      });
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0); sync.writeSyncStep2(encoder, doc);
      socket.send(Buffer.from(encoding.toUint8Array(encoder))); doc.destroy();
    });
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  const assertRemote = async () => {
    await expect(page.locator('.react-flow__node[data-id="remote-initial"]')).toContainText('Remote initial document');
    await expect(page.locator('.react-flow__node[data-id="order-import"]')).toHaveCount(0);
  };
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
  await assertRemote();
  await page.reload();
  await assertRemote();
  expect(errors).toEqual([]);
});

test('a room for another diagram does not connect or replace the selected canvas', async ({ page }) => {
  let attempts = 0;
  await page.routeWebSocket(/\/vizly-room-other-diagram(?:\?|$)/, () => { attempts += 1; });
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-other-diagram');
  await expect(page.locator('.react-flow__node[data-id="order-import"]')).toBeVisible();
  expect(attempts).toBe(0);
});
