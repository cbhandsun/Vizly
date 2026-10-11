// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createDistributedRoomRegistry, type DistributedRecoveryStore } from './distributedRoomRegistry.js';
import type { DistributedLeaseReceipt } from './distributedRoomLease.js';
import type { AtomicRoomSnapshot, AtomicRoomStore } from './atomicRoomCommit.js';
import { RecoveryRecordChangedError, type RecoveryReceipt } from './roomRecoveryStore.js';
import { createCollaborationServer } from './server.js';
import { createRoomCoordinator } from './roomCoordinator.js';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';
import { createCollaborationSocket } from '../../src/components/diagrams/collaboration/collaborationSocket.js';
import { createCollaborationAwareness } from '../../src/components/diagrams/collaboration/collaborationAwareness.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sha = 'a'.repeat(64);
const checkpoint = () => { const doc = new Y.Doc(); try { const state = Y.encodeStateAsUpdate(doc); return { revision: '2026-10-09T00:00:00Z', base: state, state }; } finally { doc.destroy(); } };
const receipt = () => ({ generation, expiresAt: new Date(Date.now() + 30_000).toISOString() });
const registries: Array<ReturnType<typeof createDistributedRoomRegistry>> = [];
afterEach(async () => { for (const registry of registries.splice(0)) await registry.stop(); });
const fixture = (capacity = 64) => {
  const control: DistributedRecoveryStore = {
    claim: vi.fn(async () => receipt()), renew: vi.fn(async () => true), release: vi.fn(async () => true),
    inspectRecovery: vi.fn(async () => ({ sha256: sha, bytes: 2 })),
    recoverCheckpoint: vi.fn(async (room, _lease, _generation, digest, candidate) => ({ backupId: `${room}.${String(digest)}.yjs`, previousSha256: String(digest), revision: candidate.revision })),
  };
  const records = new Map<string, AtomicRoomSnapshot>();
  const store: AtomicRoomStore = {
    read: vi.fn(async room => records.get(room) ?? null),
    compareExchange: vi.fn(async (room, g, version, record) => {
      const current = records.get(room);
      if (current ? current.generation !== g || current.version !== version : version !== null) return false;
      records.set(room, { generation: g, version: String(BigInt(current?.version ?? '0') + 1n), record: Uint8Array.from(record) }); return true;
    }),
  };
  const createStore = vi.fn(() => store);
  const registry = createDistributedRoomRegistry(control, createStore, capacity); registries.push(registry);
  return { registry, control, store, createStore };
};
describe('distributed room storage registry', () => {
  it('reads synchronization metadata only under the current admitted lease', async () => {
    const { registry, store } = fixture();
    await expect(registry.readAdmittedSnapshot(id)).rejects.toThrow('unavailable');
    expect(store.read).not.toHaveBeenCalled();
    const lease = await registry.acquireRoomLease(id); await registry.persistence.save(id, checkpoint().state);
    const snapshot = await registry.readAdmittedSnapshot(id);
    expect(snapshot).toEqual(expect.objectContaining({ generation, version: '1' }));
    await lease.close(); await expect(registry.readAdmittedSnapshot(id)).rejects.toThrow('unavailable');
  });
  it('rejects a synchronization read that completes after its admitted lease closes', async () => {
    const { registry, store } = fixture(); const lease = await registry.acquireRoomLease(id);
    let finish: (snapshot: AtomicRoomSnapshot | null) => void = () => { throw new Error('Missing resolver'); };
    store.read = vi.fn(() => new Promise<AtomicRoomSnapshot | null>(resolve => { finish = resolve; }));
    const pending = expect(registry.readAdmittedSnapshot(id)).rejects.toThrow();
    await lease.close(); finish({ generation, version: '1', record: checkpoint().state }); await pending;
  });
  it('rejects synchronization metadata for a replaced generation', async () => {
    const { registry, store } = fixture(); await registry.acquireRoomLease(id);
    store.read = vi.fn(async () => ({ generation: other, version: '1', record: checkpoint().state }));
    await expect(registry.readAdmittedSnapshot(id)).rejects.toThrow('generation changed');
  });
  it('binds storage to admission, coordinates a checkpoint and clears the room on close', async () => {
    const { registry, control, createStore } = fixture();
    const lease = await registry.acquireRoomLease(id);
    expect(createStore).toHaveBeenCalledWith(expect.objectContaining({ generation, leaseId: lease.leaseId }));
    const candidate = checkpoint();
    await registry.persistence.coordinateCheckpoint?.(id, candidate);
    expect((await registry.persistence.loadRecord(id))?.checkpoint?.revision).toBe(candidate.revision);
    await Promise.all([lease.close(), lease.close()]);
    expect(control.release).toHaveBeenCalledTimes(1);
    await expect(registry.persistence.load(id)).rejects.toThrow('unavailable');
  });
  it('rejects duplicate local admission and enforces capacity before creating another lease', async () => {
    const { registry, control } = fixture(1);
    await registry.acquireRoomLease(id);
    await expect(registry.acquireRoomLease(id)).rejects.toThrow('unavailable');
    await expect(registry.acquireRoomLease(other)).rejects.toThrow('unavailable');
    expect(control.claim).toHaveBeenCalledTimes(1);
  });
  it('does not let a failed store constructor leak the acquired lease', async () => {
    const { registry, control, createStore } = fixture(); createStore.mockImplementationOnce(() => { throw new Error('Synthetic store setup failure'); });
    await expect(registry.acquireRoomLease(id)).rejects.toThrow('setup failure');
    expect(control.release).toHaveBeenCalledTimes(1);
    const lease = await registry.acquireRoomLease(id); await lease.close();
  });
  it('waits for a pending admission and releases it before completing shutdown', async () => {
    const { registry, control } = fixture();
    let finish: (row: DistributedLeaseReceipt) => void = () => { throw new Error('Missing test resolver'); };
    control.claim = vi.fn(() => new Promise<DistributedLeaseReceipt>(resolve => { finish = resolve; }));
    const admission = expect(registry.acquireRoomLease(id)).rejects.toThrow('stopped');
    const stopped = registry.stop(); finish(receipt()); await Promise.all([admission, stopped]);
    expect(control.release).toHaveBeenCalledTimes(1);
    await expect(registry.acquireRoomLease(other)).rejects.toThrow('stopped');
  });
  it('cleans up if a store constructor starts shutdown before room registration', async () => {
    const { registry, control, createStore, store } = fixture();
    createStore.mockImplementationOnce(() => { void registry.stop(); return store; });
    await expect(registry.acquireRoomLease(id)).rejects.toThrow('stopped');
    await registry.stop(); expect(control.release).toHaveBeenCalledTimes(1);
  });
  it('keeps shutdown idempotent when an abort observer re-enters stop synchronously', async () => {
    const { registry, control } = fixture(); const lease = await registry.acquireRoomLease(id);
    let reentered: Promise<void> | undefined;
    lease.signal.addEventListener('abort', () => { reentered = registry.stop(); });
    const shutdown = registry.stop(); await shutdown;
    expect(reentered).toBe(shutdown); expect(control.release).toHaveBeenCalledTimes(1);
  });
  it('rejects recovery while a local editing room is admitted, then claims an exclusive lease', async () => {
    const { registry, control } = fixture(); const lease = await registry.acquireRoomLease(id);
    await expect(registry.persistence.recoverCheckpoint(id, sha, checkpoint())).rejects.toBeInstanceOf(RecoveryRecordChangedError);
    expect(control.recoverCheckpoint).not.toHaveBeenCalled(); await lease.close();
    const recovered = await registry.persistence.recoverCheckpoint(id, sha, checkpoint());
    expect(recovered.previousSha256).toBe(sha);
    expect(control.claim).toHaveBeenLastCalledWith(id, expect.any(String), expect.any(String), 'recovery');
    expect(control.release).toHaveBeenCalledTimes(2);
  });
  it('maps remote busy recovery to conflict without calling replacement', async () => {
    const { registry, control } = fixture(); control.claim = vi.fn(async () => null);
    await expect(registry.persistence.recoverCheckpoint(id, sha, checkpoint())).rejects.toBeInstanceOf(RecoveryRecordChangedError);
    expect(control.recoverCheckpoint).not.toHaveBeenCalled();
  });
  it('keeps an exclusive recovery reserved during replacement and releases it after failure', async () => {
    const { registry, control } = fixture();
    let fail: (cause: Error) => void = () => { throw new Error('Missing test resolver'); };
    control.recoverCheckpoint = vi.fn(() => new Promise<RecoveryReceipt>((_resolve, reject) => { fail = reject; }));
    const recovery = expect(registry.persistence.recoverCheckpoint(id, sha, checkpoint())).rejects.toThrow('replacement failure');
    await vi.waitFor(() => expect(control.recoverCheckpoint).toHaveBeenCalledTimes(1));
    await expect(registry.acquireRoomLease(id)).rejects.toThrow('unavailable');
    fail(new Error('Synthetic replacement failure')); await recovery;
    expect(control.release).toHaveBeenCalledTimes(1);
    const lease = await registry.acquireRoomLease(id); await lease.close();
  });
  it('copies replacement inputs before asynchronous admission', async () => {
    const { registry, control } = fixture(); const source = checkpoint();
    control.claim = vi.fn(async () => { source.base.fill(255); return receipt(); });
    await registry.persistence.recoverCheckpoint(id, sha, source);
    const stored = vi.mocked(control.recoverCheckpoint).mock.calls[0][4];
    expect(stored.base).toEqual(Uint8Array.from([0, 0]));
  });
  it('waits for a conflicting recovery during shutdown without hiding the request failure', async () => {
    const { registry, control } = fixture();
    let fail: (cause: Error) => void = () => { throw new Error('Missing test resolver'); };
    control.recoverCheckpoint = vi.fn(() => new Promise<RecoveryReceipt>((_resolve, reject) => { fail = reject; }));
    const request = expect(registry.persistence.recoverCheckpoint(id, sha, checkpoint())).rejects.toBeInstanceOf(RecoveryRecordChangedError);
    await vi.waitFor(() => expect(control.recoverCheckpoint).toHaveBeenCalled());
    const shutdown = registry.stop(); fail(new RecoveryRecordChangedError());
    await Promise.all([request, shutdown]); expect(control.release).toHaveBeenCalledTimes(1);
  });
  it('assembles admitted atomic storage and cloud coordination behind actual WebSocket peers', async () => {
    const { registry, control } = fixture(); const origin = 'http://localhost:5417';
    const coordinate = createRoomCoordinator(registry.persistence, async () => checkpoint());
    const server = createCollaborationServer({ authorize: async () => ({ userId: generation, role: 'editor' }),
      persistence: registry.persistence, acquireRoomLease: registry.acquireRoomLease, loadInitialRoom: coordinate,
      origins: new Set([origin]), readAcceptedRoomRevision: async room => (await registry.persistence.loadRecord(room))?.checkpoint?.revision });
    const peers: Array<{ doc: Y.Doc; provider: WebsocketProvider }> = [];
    try {
      const { url } = await server.listen();
      class TestSocket extends WebSocket { constructor(address: string) { super(address, { origin }); } }
      for (let index = 0; index < 2; index++) {
        const doc = new Y.Doc();
        const provider = new WebsocketProvider(url, `vizly-room-${id}`, doc, { params: { token: 'synthetic' }, disableBc: true,
          awareness: createCollaborationAwareness(doc), WebSocketPolyfill: createCollaborationSocket(TestSocket as unknown as typeof globalThis.WebSocket) });
        for (const kind of [4, 5, 6]) provider.messageHandlers[kind] = () => undefined;
        peers.push({ doc, provider });
        await vi.waitFor(() => expect(provider.synced).toBe(true), { timeout: 5000 });
      }
      const node = { id: 'shared', position: { x: 10, y: 20 }, data: { label: 'shared' } };
      publishCollaborationElement(peers[0].doc.getMap('flowchart-nodes'), node.id, node);
      await vi.waitFor(() => expect(readCollaborationElement(peers[1].doc.getMap('flowchart-nodes').get(node.id))).toEqual(node));
      const persisted = await registry.persistence.load(id); if (!persisted) throw new Error('Missing persisted peer edit');
      const doc = new Y.Doc();
      try { Y.applyUpdate(doc, persisted); expect(readCollaborationElement(doc.getMap('flowchart-nodes').get(node.id))).toEqual(node); }
      finally { doc.destroy(); }
      expect(control.claim).toHaveBeenCalledTimes(1);
    } finally {
      for (const peer of peers) { peer.provider.destroy(); peer.doc.destroy(); }
      await server.stop();
    }
    expect(control.release).toHaveBeenCalledTimes(1);
  });
  it('reports disposal failure and rejects further operations', async () => {
    const { registry, control } = fixture(); await registry.acquireRoomLease(id);
    control.release = vi.fn(async () => { throw new Error('Synthetic release failure'); });
    await expect(registry.stop()).rejects.toThrow('disposal failed');
    await expect(registry.persistence.inspectRecovery(id)).rejects.toThrow('stopped');
    registries.splice(registries.indexOf(registry), 1);
  });
  it('reports one failed release during re-entrant shutdown without an orphan rejection', async () => {
    const { registry, control } = fixture(); const lease = await registry.acquireRoomLease(id);
    control.release = vi.fn(async () => { throw new Error('Synthetic release failure'); });
    let reentered: Promise<void> | undefined;
    lease.signal.addEventListener('abort', () => { reentered = registry.stop(); });
    const shutdown = registry.stop();
    await expect(shutdown).rejects.toThrow('disposal failed');
    expect(reentered).toBe(shutdown); expect(control.release).toHaveBeenCalledTimes(1);
    registries.splice(registries.indexOf(registry), 1);
  });
  it('rejects invalid identifiers, confirmations and extreme capacity without external work', async () => {
    const { registry, control } = fixture();
    await expect(registry.acquireRoomLease('../room')).rejects.toThrow('identity');
    await expect(registry.persistence.recoverCheckpoint(id, 'bad', checkpoint())).rejects.toThrow('confirmation');
    expect(control.claim).not.toHaveBeenCalled();
    expect(() => createDistributedRoomRegistry(control, () => fixture().store, 65)).toThrow('capacity');
  });
});
