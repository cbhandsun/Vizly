import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { formatCollaborationAccess, publishCollaborationElement } from '../server/collaboration/documentModel';

const id = '33333333-3333-4333-8333-333333333333';

for (const role of ['viewer', 'editor'] as const) {
  test(`existing cloud recovery does not require a subscription and preserves ${role} authorization`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const doc = new Y.Doc();
    doc.transact(() => publishCollaborationElement(doc.getMap('flowchart-nodes'), 'durable-node', {
      id: 'durable-node', type: 'flowchart', position: { x: 100, y: 100 },
      data: { label: 'Durable cloud collaboration', shape: 'rectangle' },
    }));
    let connections = 0;
    await page.routeWebSocket(new RegExp(`/vizly-room-${id}(?:\\?|$)`), socket => {
      connections++;
      let sent = false;
      socket.onMessage(() => {
        if (sent) return;
        sent = true;
        const access = encoding.createEncoder();
        encoding.writeVarUint(access, 4);
        encoding.writeVarString(access, formatCollaborationAccess(role));
        socket.send(Buffer.from(encoding.toUint8Array(access)));
        const initial = encoding.createEncoder();
        encoding.writeVarUint(initial, 0);
        sync.writeSyncStep2(initial, doc);
        socket.send(Buffer.from(encoding.toUint8Array(initial)));
      });
    });
    try {
      await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
      await page.goto('/#/manage');
      await expect(page.getByRole('button', { name: 'New flowchart', exact: true })).toBeVisible();
      await page.evaluate(async id => {
        const request = indexedDB.open('VizlyLocalDB', 2);
        request.onupgradeneeded = () => {
          const versions = request.result.createObjectStore('diagram_versions', { keyPath: 'id' });
          versions.createIndex('diagramId', 'diagramId');
          versions.createIndex('createdAt', 'createdAt');
          request.result.createObjectStore('local_diagrams', { keyPath: 'id' });
        };
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const tx = db.transaction('local_diagrams', 'readwrite');
          tx.objectStore('local_diagrams').put({ id, name: 'Free cloud recovery', type: 'flowchart', version: '1.0',
            metadata: { cloud: { provider: 'supabase', id, title: 'Free cloud recovery' } },
            nodes: [], edges: [], groups: [], theme: { name: 'manual', displayName: 'Manual', domains: {} },
            layout: { type: 'custom', direction: 'LR', padding: { horizontal: 20, vertical: 20 }, spacing: { horizontal: 50, vertical: 50 } },
          });
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
        } finally { db.close(); }
      }, id);
      // No account, subscription or explicit room URL: server role is a protocol fixture.
      await page.goto(`/#/?diagram=${id}`);
      await expect(page.locator('.react-flow__node[data-id="durable-node"]')).toContainText('Durable cloud collaboration');
      await expect(page.getByText('Canvas locked · View only', { exact: true })).toHaveCount(role === 'viewer' ? 1 : 0);
      await page.reload();
      await expect(page.locator('.react-flow__node[data-id="durable-node"]')).toContainText('Durable cloud collaboration');
      // Observe past delayed type detection and identity polling: restoration
      // must not pass immediately before a redundant canvas remount/reconnect.
      await page.waitForTimeout(1000);
      await expect(page.locator('.react-flow__node[data-id="durable-node"]')).toContainText('Durable cloud collaboration');
      await expect(page.getByText('Canvas locked · View only', { exact: true })).toHaveCount(role === 'viewer' ? 1 : 0);
      expect(connections).toBe(2);
      expect(errors).toEqual([]);
    } finally { doc.destroy(); }
  });
}
