import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const bundle = await build({ entryPoints: ['src/services/IndexedDBStorage.ts'], bundle: true, write: false, format: 'iife', globalName: 'VersionDB', platform: 'browser' });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
 const page = await browser.newPage();
 await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
 await page.goto('http://localhost/outbox-check');
 await page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('VizlyLocalDB', 2);
  open.onupgradeneeded = () => {
   const store = open.result.createObjectStore('diagram_versions', { keyPath: 'id' });
   store.createIndex('diagramId', 'diagramId'); store.createIndex('createdAt', 'createdAt');
   open.result.createObjectStore('local_diagrams', { keyPath: 'id' }).add({ id: 'retained' });
  };
  open.onsuccess = () => { open.result.close(); resolve(); }; open.onerror = () => reject(open.error);
 }));
 await page.addScriptTag({ content: bundle.outputFiles[0].text });
 const result = await page.evaluate(async () => {
  const db = new VersionDB.LocalDB();
  const state = { location: 'local', syncStatus: 'pending', ownerId: 'owner-a', provider: 'supabase', localCreated: true };
  const snapshot = { nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: {} }], edges: [] };
  const first = await db.saveVersionWithOutbox('diagram-a', snapshot, 'saved', state);
  const raw = await new Promise((resolve, reject) => { const r = indexedDB.open('VizlyLocalDB', 3); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const all = store => new Promise((resolve, reject) => { const tx = raw.transaction(store); const r = tx.objectStore(store).getAll(); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error); });
  const tasks = await all('version_outbox');
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) { if (this.name === 'version_outbox') throw new DOMException('Injected quota failure', 'QuotaExceededError'); return original.apply(this, args); };
  let rejected = false;
  try { await db.saveVersionWithOutbox('diagram-failure', snapshot, 'fail', state); } catch { rejected = true; } finally { IDBObjectStore.prototype.add = original; }
  const failed = await db.listVersions('diagram-failure');
  await new Promise((resolve, reject) => { const tx = raw.transaction('version_outbox', 'readwrite'); for (let i = 1; i < 511; i++) tx.objectStore('version_outbox').add({ ...tasks[0], operationId: `seed-${i}` }); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
  const concurrent = await Promise.all([1, 2].map(i => db.saveVersionWithOutbox(`capacity-${i}`, snapshot, 'capacity', state)));
  const count = (await all('version_outbox')).length;
  const preserved = await Promise.all(concurrent.map(item => db.loadVersion(item.version.diagramId, item.version.id)));
  const invalid = [];
  for (const patch of [{ ownerId: null }, { provider: 's3' }, { syncStatus: 'legacy' }, { localCreated: false }]) {
   try { await db.saveVersionWithOutbox('invalid', snapshot, 'invalid', { ...state, ...patch }); invalid.push(false); } catch { invalid.push(true); }
  }
  const retained = await db.loadDiagram('retained'); raw.close();
  return { first, tasks, rejected, failed, concurrent, count, preserved, invalid, retained };
 });
 assert.equal(result.first.version.storage.automaticSync, 'queued');
 assert.equal(result.concurrent.find(item => !item.queued).version.storage.automaticSync, 'capacity');
 assert.equal(result.first.queued, true); assert.equal(result.tasks.length, 1);
 assert.equal(result.tasks[0].operationId, result.first.version.id); assert.equal(result.tasks[0].ownerId, 'owner-a');
 assert.match(result.tasks[0].payloadHash, /^[a-f0-9]{64}$/);
 assert.equal(result.rejected, true); assert.deepEqual(result.failed, []); assert.equal(result.count, 512);
 assert.equal(result.concurrent.filter(item => item.queued).length, 1); assert.ok(result.preserved.every(Boolean)); assert.ok(result.invalid.every(Boolean));
 assert.deepEqual(result.retained, { id: 'retained' });
 const completion = await page.evaluate(async id => {
  const db = new VersionDB.LocalDB();
  const task = (await db.listVersionOutbox('owner-a')).find(item => item.operationId === id);
  const local = await db.loadVersion('diagram-a', id);
  const remote = { ...local, authorId: 'owner-a' };
  let mismatchRejected = false;
  try { await db.completeVersionOutbox(task, { ...remote, message: 'wrong' }); } catch { mismatchRejected = true; }
  await db.updateVersionOutboxFailure(task, { ...task, attempts: 1, nextAttemptAt: 5000, failure: 'network' });
  await db.updateVersionOutboxFailure(task, { ...task, attempts: 2, nextAttemptAt: 9000, failure: 'unknown' });
  const afterFailure = (await db.listVersionOutbox('owner-a')).find(item => item.operationId === id);
  const originalDelete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function (...args) { if (this.name === 'version_outbox') throw new Error('Injected completion failure'); return originalDelete.apply(this, args); };
  let rollback = false;
  try { await db.completeVersionOutbox(task, remote); } catch { rollback = true; } finally { IDBObjectStore.prototype.delete = originalDelete; }
  const afterAbort = await db.loadVersion('diagram-a', id);
  const taskAfterAbort = (await db.listVersionOutbox('owner-a')).some(item => item.operationId === id);
  await db.completeVersionOutbox(task, remote);
  await db.completeVersionOutbox(task, remote);
  return { attempts: afterFailure.attempts, failure: afterFailure.failure, mismatchRejected, rollback, afterAbort: afterAbort.storage.syncStatus, taskAfterAbort,
   synced: (await db.loadVersion('diagram-a', id)).storage.syncStatus,
   remaining: (await db.listVersionOutbox('owner-a')).some(item => item.operationId === id),
   otherOwner: await db.listVersionOutbox('owner-b') };
 }, result.first.version.id);
 assert.deepEqual(completion, { attempts: 1, failure: 'network', mismatchRejected: true, rollback: true, afterAbort: 'pending', taskAfterAbort: true,
  synced: 'synced', remaining: false, otherOwner: [] });
 await page.reload(); await page.addScriptTag({ content: bundle.outputFiles[0].text });
 assert.equal(await page.evaluate(async id => Boolean(await new VersionDB.LocalDB().loadVersion('diagram-a', id)), result.first.version.id), true);
 console.log(JSON.stringify({ status: 'passed', scenarios: ['v2-upgrade', 'atomic-write', 'abort-rolls-back-both', 'concurrent-capacity', 'capacity-preserves-snapshot', 'reject-ineligible-owners', 'reload-persistence', 'owner-scoped-queue', 'reject-mismatched-receipt', 'completion-atomic-rollback', 'completion-idempotent-retains-snapshot', 'stale-failure-cannot-overwrite-newer-retry'] }));
} finally { await browser.close(); }
