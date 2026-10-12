import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { publishCollaborationElement, readCollaborationElement } from '../server/collaboration/documentModel';

// Real browser, SDK and host; deterministic transport and local history.
// This does not establish acceptance of real Supabase identities.
test('historical preview remains local and cannot overwrite autosave while peer edits continue', async ({ page }) => {
  const id = '33333333-3333-4333-8333-333333333333';
  const live = { id: 'live-node', type: 'flowchart', position: { x: 100, y: 100 }, data: { label: 'Current live', description: 'Current live', shape: 'rectangle' } };
  const historical = { ...live, data: { ...live.data, label: 'Historical preview', description: 'Historical preview' } };
  const doc = new Y.Doc();
  const nodes = doc.getMap<unknown>('flowchart-nodes');
  publishCollaborationElement(nodes, live.id, live);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let sendPeer: (() => void) | undefined;
  await page.routeWebSocket(/\/vizly-room-33333333-3333-4333-8333-333333333333(?:\?|$)/, socket => {
    let initialized = false;
    const sendDocument = () => {
      const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 0); sync.writeSyncStep2(encoder, doc);
      socket.send(Buffer.from(encoding.toUint8Array(encoder)));
    };
    sendPeer = () => {
      publishCollaborationElement(nodes, live.id, { ...live, data: { ...live.data, label: 'Latest peer edit', description: 'Latest peer edit' } });
      sendDocument();
    };
    socket.onMessage(message => {
      const bytes = typeof message === 'string' ? Buffer.from(message) : message;
      const decoder = decoding.createDecoder(bytes);
      if (decoding.readVarUint(decoder) === 0) {
        const reply = encoding.createEncoder();
        sync.readSyncMessage(decoder, reply, doc, 'browser');
      }
      if (initialized) return;
      initialized = true;
      const claim = encoding.createEncoder(); encoding.writeVarUint(claim, 4); encoding.writeVarString(claim, 'editor:fields-v1');
      socket.send(Buffer.from(encoding.toUint8Array(claim))); sendDocument();
    });
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/manage');
  await expect(page.getByRole('button', { name: '新建流程图', exact: true })).toBeVisible();
  await page.evaluate(async ({ id, historical }) => {
    const request = indexedDB.open('VizlyLocalDB', 2);
    request.onupgradeneeded = () => {
      const versions = request.result.createObjectStore('diagram_versions', { keyPath: 'id' });
      versions.createIndex('diagramId', 'diagramId'); versions.createIndex('createdAt', 'createdAt');
      request.result.createObjectStore('local_diagrams', { keyPath: 'id' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction(['diagram_versions', 'local_diagrams'], 'readwrite');
      tx.objectStore('diagram_versions').put({ id: 'preview-history', diagramId: id, createdAt: Date.now(), message: 'Historical fixture', authorId: 'local', snapshotData: { nodes: [historical], edges: [] } });
      tx.objectStore('local_diagrams').put({
        id, name: 'Preview persistence browser', type: 'flowchart', version: '1.0', metadata: { title: 'Preview persistence browser' },
        nodes: [{ id: 'live-node', type: 'custom', domain: '业务域', domainClass: 'core', description: 'Current live', data: {}, metadata: { shape: 'rectangle', width: 100, height: 60, canvasPosition: { x: 100, y: 100 } } }],
        edges: [], groups: [], theme: { name: 'manual', displayName: 'Manual', domains: {} },
        layout: { type: 'custom', direction: 'LR', padding: { horizontal: 20, vertical: 20 }, spacing: { horizontal: 50, vertical: 50 } },
      });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    } finally { db.close(); }
  }, { id, historical });
  const readSaved = () => page.evaluate(id => {
    const raw = localStorage.getItem(`flowchart-autosave-v2-${id}`);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || !('nodes' in value) || !Array.isArray(value.nodes)) return [];
    return value.nodes.map(node => node.data?.label);
  }, id);
  try {
    await page.goto(`/#/?diagram=${id}&room=vizly-room-${id}`);
    const node = page.locator('.react-flow__node[data-id="live-node"]');
    await expect(node).toContainText('Current live');
    await expect.poll(readSaved).toEqual(['Current live']);
    await page.getByRole('button', { name: '文档操作', exact: true }).click();
    await page.getByRole('menuitem', { name: /版本快照/ }).click();
    await page.getByRole('button', { name: '预览版本：Historical fixture', exact: true }).click();
    await expect(node).toContainText('Historical preview');
    expect(readCollaborationElement(nodes.get(live.id))).toMatchObject({ data: { label: 'Current live' } });
    if (!sendPeer) throw new Error('Collaboration transport not initialized');
    sendPeer();
    await expect(page.getByRole('button', { name: '退出预览', exact: true })).toBeVisible();
    // Exercise the actual 3s debounce and the independent beforeunload path.
    await page.waitForTimeout(3500);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    await expect(node).toContainText('Historical preview');
    expect(await readSaved()).toEqual(['Current live']);
    expect(readCollaborationElement(nodes.get(live.id))).toMatchObject({ data: { label: 'Latest peer edit' } });
    await page.getByRole('button', { name: '退出预览', exact: true }).click();
    await expect(node).toContainText('Latest peer edit');
    await expect.poll(readSaved).toEqual(['Latest peer edit']);
    expect(pageErrors).toEqual([]);
  } finally { doc.destroy(); }
});
