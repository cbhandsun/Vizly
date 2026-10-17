import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { formatCollaborationAccess, publishCollaborationElement } from '../server/collaboration/documentModel';

const id = '55555555-5555-4555-8555-555555555555';
const userId = '66666666-6666-4666-8666-666666666666';
const nodeLabel = 'Identity fixture node';

const prepare = async (page: Page, provider: 'local' | 's3') => {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'identity-fixture@example.invalid',
    app_metadata: { tier: 'pro', provider: 'email' }, user_metadata: {}, created_at: '2026-10-09T00:00:00Z' };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  // Isolated UI identity fixture: no real credential, signing key or live Auth call.
  const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', exp: expires })}.synthetic`,
    refresh_token: 'synthetic-refresh-not-a-credential', token_type: 'bearer', expires_in: 3600, expires_at: expires, user };
  await page.route('https://recovery-fixture.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/user') ? user : []) });
  });
  await page.addInitScript(session => {
    localStorage.setItem('i18nextLng', 'zh');
    localStorage.setItem('sb-recovery-fixture-auth-token', JSON.stringify(session));
  }, session);
  await page.goto('/#/manage');
  await expect.poll(() => page.evaluate(() => window.__currentUserId)).toBe(userId);
  await page.evaluate(async ({ id, provider, nodeLabel }) => {
    const request = indexedDB.open('VizlyLocalDB', 2);
    request.onupgradeneeded = () => {
      const versions = request.result.createObjectStore('diagram_versions', { keyPath: 'id' });
      versions.createIndex('diagramId', 'diagramId'); versions.createIndex('createdAt', 'createdAt');
      request.result.createObjectStore('local_diagrams', { keyPath: 'id' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Identity fixture database unavailable'));
    });
    try {
      const tx = db.transaction('local_diagrams', 'readwrite');
      tx.objectStore('local_diagrams').put({ id, name: 'Identity demand fixture', type: 'flowchart', version: '1.0',
        metadata: { title: 'Identity demand fixture', ...(provider === 's3' ? { cloud: { provider, id } } : {}) },
        nodes: [{ id: 'identity-demand-node', type: 'custom', domainId: 'default', label: nodeLabel,
          position: { x: 100, y: 100 }, metadata: { canvasNodeType: 'flowchart', shape: 'rectangle' } }], edges: [], domains: [] });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(new Error('Identity fixture write aborted'));
        tx.onerror = () => reject(new Error('Identity fixture write failed'));
      });
    } finally { db.close(); }
  }, { id, provider, nodeLabel });
};

for (const provider of ['local', 's3'] as const) test(`${provider} document does not auto-connect for a cloud-enabled account`, async ({ page }) => {
  let connections = 0;
  await page.routeWebSocket(new RegExp(`/vizly-room-${id}(?:\\?|$)`), () => { connections += 1; });
  await prepare(page, provider);
  await page.goto(`/#/?diagram=${id}`);
  await expect(page.locator('.react-flow__node[data-id="identity-demand-node"]')).toContainText(nodeLabel);
  await expect.poll(() => page.evaluate(() => window.__currentUserId)).toBe(userId);
  await expect(page.locator('.presence-header-container')).toHaveCount(0);
  expect(connections).toBe(0);
});

test('late Supabase identity starts collaboration and removing it closes the connection', async ({ page }) => {
  let connections = 0; let closed = 0;
  const remote = new Y.Doc();
  publishCollaborationElement(remote.getMap('flowchart-nodes'), 'identity-demand-node', {
    id: 'identity-demand-node', type: 'flowchart', position: { x: 100, y: 100 },
    data: { label: nodeLabel, description: nodeLabel, shape: 'rectangle' },
  });
  await page.routeWebSocket(new RegExp(`/vizly-room-${id}(?:\\?|$)`), route => {
    connections += 1; let first = true;
    route.onClose(() => { closed += 1; });
    route.onMessage(input => {
      if (typeof input === 'string') throw new Error('Unexpected collaboration text frame');
      const decoder = decoding.createDecoder(input);
      if (decoding.readVarUint(decoder) !== 0) return;
      if (first) {
        first = false;
        const claim = encoding.createEncoder(); encoding.writeVarUint(claim, 4);
        encoding.writeVarString(claim, formatCollaborationAccess('editor'));
        route.send(Buffer.from(encoding.toUint8Array(claim)));
      }
      const reply = encoding.createEncoder(); encoding.writeVarUint(reply, 0);
      sync.readSyncMessage(decoder, reply, remote, null);
      if (encoding.length(reply) > 1) route.send(Buffer.from(encoding.toUint8Array(reply)));
    });
  });
  try {
    await prepare(page, 'local');
    await page.goto(`/#/?diagram=${id}`);
    const node = page.locator('.react-flow__node[data-id="identity-demand-node"]');
    await expect(node).toContainText(nodeLabel);
    await expect(page.locator('.presence-header-container')).toHaveCount(0);
    expect(connections).toBe(0);
    await page.evaluate(id => {
      const bridge = window.__flowDataBridge?.[id];
      if (!bridge) throw new Error('Ready identity fixture bridge unavailable');
      bridge.metadata = { ...bridge.metadata, cloud: { provider: 'supabase', id } };
      // Match save and bridge producers, which notify after identity changes.
      window.dispatchEvent(new Event('vizly:flow-data-bridge-identity'));
    }, id);
    await expect.poll(() => connections).toBe(1);
    await expect(page.locator('.presence-header-container')).toContainText('已连接');
    await expect(node).toContainText(nodeLabel);
    await page.evaluate(id => {
      const bridge = window.__flowDataBridge?.[id];
      if (!bridge) throw new Error('Accepted identity fixture bridge unavailable');
      const metadata = { ...bridge.metadata }; delete metadata.cloud; bridge.metadata = metadata;
      window.dispatchEvent(new Event('vizly:flow-data-bridge-identity'));
    }, id);
    await expect.poll(() => closed).toBe(1);
    await expect(page.locator('.presence-header-container')).toHaveCount(0);
    await expect(node).toContainText(nodeLabel);
    expect(connections).toBe(1);
  } finally { remote.destroy(); }
});
