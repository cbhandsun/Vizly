import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { formatCollaborationAccess, publishCollaborationElement, readCollaborationElement } from '../server/collaboration/documentModel';

const id = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const revision = '2026-10-08T20:00:00.123456Z';
const sha256 = 'a'.repeat(64);
const recoveryURL = `http://127.0.0.1:5432/recovery/vizly-room-${id}`;

const readDiagrams = (page: Page) => page.evaluate(async () => {
  const open = indexedDB.open('VizlyLocalDB');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(new Error('Database open failed'));
  });
  try {
    const tx = db.transaction('local_diagrams', 'readonly');
    const request = tx.objectStore('local_diagrams').getAll();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(new Error('Database read failed'));
    });
    return request.result as Array<{ id: string; name: string; metadata?: { cloud?: unknown }; nodes: unknown[] }>;
  } finally { db.close(); }
});

const prepare = async (page: Page, failure: 'none' | 'copy' | 'receipt') => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid',
    app_metadata: { tier: 'free', provider: 'email' }, user_metadata: {}, created_at: revision };
  // Signed-in UI fixture only. No signing key, real identity or live Auth call.
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', exp: expires })}.synthetic`,
    refresh_token: 'synthetic-refresh-not-a-credential', token_type: 'bearer', expires_in: 3600, expires_at: expires, user };
  await page.route('https://recovery-fixture.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/user') ? user : []) });
  });
  await page.addInitScript(session => {
    localStorage.setItem('i18nextLng', 'zh');
    localStorage.setItem('sb-recovery-fixture-auth-token', JSON.stringify(session));
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
      if (this.name === 'local_diagrams' && localStorage.getItem('fixture_abort_copy') === '1') {
        localStorage.removeItem('fixture_abort_copy');
        const tx = this.transaction;
        request.addEventListener('success', () => tx.abort(), { once: true });
      }
      return request;
    };
  }, session);
  let connections = 0; let inspections = 0; let recoveries = 0;
  const remote = new Y.Doc();
  publishCollaborationElement(remote.getMap('flowchart-nodes'), 'recovery-node', {
    id: 'recovery-node', type: 'flowchart', position: { x: 100, y: 100 },
    data: { label: 'Accepted cloud canvas', description: 'Accepted cloud canvas', shape: 'rectangle' },
  });
  await page.routeWebSocket(new RegExp(`/vizly-room-${id}(?:\\?|$)`), route => {
    connections++; let first = true;
    route.onMessage(input => {
      if (connections === 1) {
        if (!first) return; first = false;
        const frame = encoding.createEncoder(); encoding.writeVarUint(frame, 5); encoding.writeVarString(frame, 'cloud-conflict');
        route.send(Buffer.from(encoding.toUint8Array(frame)));
        void route.close({ code: 1008, reason: 'Collaboration paused' }); return;
      }
      if (typeof input === 'string') throw new Error('Unexpected text frame');
      const decoder = decoding.createDecoder(input);
      if (decoding.readVarUint(decoder) !== 0) return;
      if (first) {
        first = false;
        const claim = encoding.createEncoder(); encoding.writeVarUint(claim, 4); encoding.writeVarString(claim, formatCollaborationAccess('editor'));
        route.send(Buffer.from(encoding.toUint8Array(claim)));
      }
      const reply = encoding.createEncoder(); encoding.writeVarUint(reply, 0);
      sync.readSyncMessage(decoder, reply, remote, null);
      if (encoding.length(reply) > 1) route.send(Buffer.from(encoding.toUint8Array(reply)));
    });
  });
  await page.route(recoveryURL, async route => {
    const request = route.request();
    expect(request.url()).toBe(recoveryURL);
    expect(request.headers().authorization).toBe(`Bearer ${session.access_token}`);
    expect(request.headers().cookie).toBeUndefined();
    if (request.method() === 'GET') {
      inspections++;
      await route.fulfill({ json: { sha256, bytes: 128, revision } }); return;
    }
    expect(request.method()).toBe('POST'); recoveries++;
    expect(request.postDataJSON()).toEqual({ sha256, revision });
    const copies = (await readDiagrams(page)).filter(value => value.id !== id);
    expect(copies).toHaveLength(1);
    expect(copies[0].metadata?.cloud).toBeUndefined();
    expect(JSON.stringify(copies[0].nodes)).toContain('Local retained canvas');
    expect(connections).toBe(1);
    await route.fulfill({ json: { backupId: failure === 'receipt' ? 'invalid-backup' : `${id}.${sha256}.yjs`, previousSha256: sha256, revision } });
  });
  await page.goto('/#/manage');
  await expect.poll(() => page.evaluate(() => window.__currentUserId)).toBe(userId);
  await page.evaluate(async ({ id, revision }) => {
    const request = indexedDB.open('VizlyLocalDB', 2);
    request.onupgradeneeded = () => {
      const versions = request.result.createObjectStore('diagram_versions', { keyPath: 'id' });
      versions.createIndex('diagramId', 'diagramId'); versions.createIndex('createdAt', 'createdAt');
      request.result.createObjectStore('local_diagrams', { keyPath: 'id' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Seed open failed'));
    });
    try {
      const tx = db.transaction('local_diagrams', 'readwrite');
      tx.objectStore('local_diagrams').put({ id, name: 'Recovery fixture', type: 'flowchart', version: '1.0',
        metadata: { title: 'Recovery fixture', cloud: { provider: 'supabase', id, title: 'Recovery fixture', revision } },
        nodes: [{ id: 'recovery-node', type: 'custom', domain: '业务域', domainClass: 'core', description: 'Initial fixture canvas',
          data: { label: 'Initial fixture canvas' }, metadata: { shape: 'rectangle', width: 180, height: 60, canvasPosition: { x: 100, y: 100 } } }],
        edges: [], groups: [], theme: { name: 'manual', displayName: 'Manual', domains: {} },
        layout: { type: 'custom', direction: 'LR', padding: { horizontal: 20, vertical: 20 }, spacing: { horizontal: 50, vertical: 50 } },
      });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(new Error('Seed commit failed')); });
    } finally { db.close(); }
    // This draft predates joining the room. A conflict socket never grants edit
    // access, so retained edits must already exist when recovery is offered.
    localStorage.setItem(`flowchart-autosave-v2-${id}`, JSON.stringify({
      version: '1.0', diagramId: id, timestamp: Date.now(),
      nodes: [{ id: 'recovery-node', type: 'flowchart', position: { x: 100, y: 100 },
        data: { label: 'Local retained canvas', description: 'Local retained canvas', shape: 'rectangle' } }],
      edges: [], metadata: { _vizlyDesignerDocumentIdentity: {
        scopeId: id, id, name: 'Recovery fixture',
        metadata: { title: 'Recovery fixture', cloud: { provider: 'supabase', id, title: 'Recovery fixture', revision } },
      } },
    }));
  }, { id, revision });
  await page.goto(`/#/?diagram=${id}&room=vizly-room-${id}`);
  await expect(page.getByText('云端与当前编辑存在冲突，协作同步已暂停', { exact: true })).toBeVisible();
  const node = page.locator('.react-flow__node[data-id="recovery-node"]');
  await expect(node).toContainText('Local retained canvas');
  await expect(page.getByText('画布已锁定 · 仅可查看', { exact: true })).toBeVisible();
  await node.dblclick();
  await expect(node.getByRole('textbox')).toHaveCount(0);
  expect(JSON.stringify((await readDiagrams(page)).find(value => value.id === id)?.nodes))
    .toContain('Initial fixture canvas');
  return { errors, remote, state: () => ({ connections, inspections, recoveries }) };
};

test('owner restore commits a separate local copy before POST and accepts the recovered canvas', async ({ page }, testInfo) => {
  const fixture = await prepare(page, 'none');
  try {
    const restore = page.getByRole('button', { name: '从云端恢复并重连', exact: true });
    await restore.click();
    const dialog = page.getByRole('dialog', { name: '保留本地副本后恢复云端版本？', exact: true });
    await dialog.getByRole('button', { name: '保留当前画布', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.state()).toEqual({ connections: 1, inspections: 0, recoveries: 0 });
    expect(await readDiagrams(page)).toHaveLength(1);
    await restore.click(); await dialog.getByRole('button', { name: '从云端恢复并重连', exact: true }).click();
    await expect(page.locator('.react-flow__node[data-id="recovery-node"]')).toContainText('Accepted cloud canvas');
    await expect(dialog).toHaveCount(0);
    expect(fixture.state()).toEqual({ connections: 2, inspections: 1, recoveries: 1 });
    const recoveredNode = page.locator('.react-flow__node[data-id="recovery-node"]');
    await expect(recoveredNode.locator('.flowchart-node-title')).toBeVisible();
    const dismissOnboarding = page.getByRole('button', { name: '不再提示', exact: true });
    if (await dismissOnboarding.isVisible()) {
      await dismissOnboarding.click();
      await expect(dismissOnboarding).toHaveCount(0);
    }
    await recoveredNode.locator('.flowchart-node-title').dblclick();
    const recoveredEditor = recoveredNode.getByRole('textbox', { name: '编辑节点文本', exact: true });
    await expect(recoveredEditor).toBeEditable();
    await recoveredEditor.fill('Recovered canvas remains editable'); await recoveredEditor.press('Enter');
    await expect(recoveredNode).toContainText('Recovered canvas remains editable');
    await expect.poll(() => {
      const data = readCollaborationElement(fixture.remote.getMap('flowchart-nodes').get('recovery-node'))?.data;
      return data && typeof data === 'object' && !Array.isArray(data) ? data.label : undefined;
    }).toBe('Recovered canvas remains editable');
    const copy = (await readDiagrams(page)).find(value => value.id !== id);
    if (!copy) throw new Error('Missing recovery copy');
    expect(copy.name).toContain(' · Recovery ');
    await page.screenshot({ path: testInfo.outputPath('owner-recovery-accepted.png') });
    await page.goto(`/#/?diagram=${copy.id}`);
    await expect(page.locator('.react-flow__node[data-id="recovery-node"]')).toContainText('Local retained canvas');
    await page.reload();
    await expect(page.locator('.react-flow__node[data-id="recovery-node"]')).toContainText('Local retained canvas');
    expect(fixture.state().connections).toBe(2); expect(fixture.errors).toEqual([]);
  } finally { fixture.remote.destroy(); }
});

for (const failure of ['copy', 'receipt'] as const) {
  test(`${failure} failure preserves the current canvas and prevents reconnect`, async ({ page }) => {
    const fixture = await prepare(page, failure);
    try {
      if (failure === 'copy') await page.evaluate(() => localStorage.setItem('fixture_abort_copy', '1'));
      await page.getByRole('button', { name: '从云端恢复并重连', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '保留本地副本后恢复云端版本？', exact: true });
      await dialog.getByRole('button', { name: '从云端恢复并重连', exact: true }).click();
      await expect(dialog.getByRole('alert')).toBeVisible();
      await expect(page.locator('.react-flow__node[data-id="recovery-node"]')).toContainText('Local retained canvas');
      expect(fixture.state()).toEqual({ connections: 1, inspections: 1, recoveries: failure === 'copy' ? 0 : 1 });
      expect(await readDiagrams(page)).toHaveLength(failure === 'copy' ? 1 : 2);
      await dialog.getByRole('button', { name: '保留当前画布', exact: true }).click();
      expect(fixture.errors).toEqual([]);
    } finally { fixture.remote.destroy(); }
  });
}
