// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createAtomicCheckpointPersistence } from './atomicCheckpointPersistence.js';
import { createRoomCoordinator } from './roomCoordinator.js';
import { encodeRoomCheckpoint, decodeRoomRecord, type RoomCheckpoint } from './roomCheckpoint.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import { CloudRoomConflictError } from './cloudRoomReconciliation.js';
import type { AtomicRoomSnapshot, AtomicRoomStore } from './atomicRoomCommit.js';
import type { DistributedRoomLease } from './distributedRoomLease.js';
import { acceptPersistedRoomState } from './acceptedRoomState.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const first = '2026-10-09T00:00:00Z'; const next = '2026-10-09T00:00:01Z';
const value = (label: string, x: number) => ({ id: 'a', position: { x, y: 0 }, data: { label } });
const graph = (label = 'a', x = 10, initial?: Uint8Array) => {
  const doc = new Y.Doc();
  try {
    if (initial) Y.applyUpdate(doc, initial);
    const nodes = doc.getMap('flowchart-nodes');
    publishCollaborationElement(nodes, 'a', value(label, x), readCollaborationElement(nodes.get('a')) ?? undefined);
    return Y.encodeStateAsUpdate(doc);
  } finally { doc.destroy(); }
};
const cloud = (label = 'a', x = 10, revision = first): RoomCheckpoint => { const state = graph(label, x); return { revision, base: state, state }; };
const read = (state: Uint8Array) => { const doc = new Y.Doc(); try { Y.applyUpdate(doc, state); return readCollaborationElement(doc.getMap('flowchart-nodes').get('a')); } finally { doc.destroy(); } };
const fixture = (initial: RoomCheckpoint | null = null) => {
  const controller = new AbortController();
  const lease: DistributedRoomLease = { leaseId: id, generation, signal: controller.signal,
    assertActive: () => { if (controller.signal.aborted) throw new Error('Synthetic lease lost'); }, close: async () => undefined };
  let snapshot: AtomicRoomSnapshot | null = initial ? { generation, version: '1', record: encodeRoomCheckpoint(initial) } : null;
  const store: AtomicRoomStore = {
    read: vi.fn(async () => snapshot ? { ...snapshot, record: Uint8Array.from(snapshot.record) } : null),
    compareExchange: vi.fn(async (_id, g, version, record) => {
      if (snapshot ? snapshot.generation !== g || snapshot.version !== version : version !== null) return false;
      snapshot = { generation: g, version: String(BigInt(snapshot?.version ?? '0') + 1n), record: Uint8Array.from(record) }; return true;
    }),
  };
  return { lease, controller, store, current: () => snapshot,
    replace: (record: AtomicRoomSnapshot) => { snapshot = record; }, persistence: createAtomicCheckpointPersistence(id, lease, store) };
};
describe('lease-bound atomic checkpoint persistence', () => {
  it('initializes through the actual coordinator and persists subsequent room edits', async () => {
    const runtime = fixture(); const checkpoint = cloud();
    const coordinate = createRoomCoordinator(runtime.persistence, async () => checkpoint);
    const initial = await coordinate({ diagramId: id, userId: generation, token: 'synthetic' });
    expect(read(initial)).toEqual(value('a', 10));
    const updated = graph('a', 20, initial);
    expect(read(await runtime.persistence.save(id, updated) ?? updated)).toEqual(value('a', 20));
    expect((await runtime.persistence.loadRecord(id))?.checkpoint?.revision).toBe(first);
  });
  it('recomputes cloud coordination after CAS conflict and retains remote dragging', async () => {
    const initial = cloud(); const runtime = fixture(initial); const exchange = runtime.store.compareExchange;
    let raced = false;
    runtime.store.compareExchange = vi.fn<AtomicRoomStore['compareExchange']>(async (...args) => {
      if (!raced) {
        raced = true;
        runtime.replace({ generation, version: '2', record: encodeRoomCheckpoint({ ...initial, state: graph('a', 20, initial.state) }) });
        return false;
      }
      return exchange(...args);
    });
    const accepted = await createRoomCoordinator(runtime.persistence, async () => cloud('b', 10, next))({ diagramId: id, userId: generation, token: 'synthetic' });
    expect(read(accepted)).toEqual(value('b', 20));
    expect(runtime.store.compareExchange).toHaveBeenCalledTimes(2);
    expect(acceptPersistedRoomState(initial.state, accepted)).toBeInstanceOf(Uint8Array);
  });
  it('merges a checkpoint proposal with independently accepted remote fields', async () => {
    const original = cloud(); const runtime = fixture({ ...original, state: graph('a', 20, original.state) });
    const proposed = cloud('b', 10, next);
    const accepted = await runtime.persistence.saveCheckpoint(id, proposed);
    if (!accepted) throw new Error('Missing committed checkpoint receipt');
    expect(read(accepted)).toEqual(value('b', 20));
    expect(acceptPersistedRoomState(proposed.state, accepted)).toBeInstanceOf(Uint8Array);
    expect((await runtime.persistence.loadRecord(id))?.checkpoint?.revision).toBe(next);
  });
  it('rejects overlapping proposal and remote changes without saving', async () => {
    const original = cloud(); const runtime = fixture({ ...original, state: graph('a', 20, original.state) });
    const proposed = cloud('b', 10, next); proposed.state = graph('b', 15, proposed.base);
    await expect(runtime.persistence.saveCheckpoint(id, proposed)).rejects.toBeInstanceOf(CloudRoomConflictError);
    expect(runtime.store.compareExchange).not.toHaveBeenCalled();
  });
  it('preserves a remote deletion when a checkpoint proposal carries an independent cloud history', async () => {
    const original = cloud(); const doc = new Y.Doc();
    let deleted: Uint8Array;
    try { Y.applyUpdate(doc, original.state); doc.getMap('flowchart-nodes').delete('a'); deleted = Y.encodeStateAsUpdate(doc); }
    finally { doc.destroy(); }
    const runtime = fixture({ ...original, state: deleted });
    const accepted = await runtime.persistence.saveCheckpoint(id, cloud('a', 10, next));
    if (!accepted) throw new Error('Missing committed deletion receipt');
    expect(read(accepted)).toBeNull();
    expect(acceptPersistedRoomState(deleted, accepted)).toBeInstanceOf(Uint8Array);
  });
  it('coordinates against latest storage instead of replacing it with an older accepted live snapshot', async () => {
    const original = cloud(); const runtime = fixture({ ...original, state: graph('a', 20, original.state) });
    const accepted = await runtime.persistence.coordinateCheckpoint?.(id, cloud('b', 10, next), original.state);
    if (!accepted) throw new Error('Missing coordinated receipt');
    expect(read(accepted)).toEqual(value('b', 20));
  });
  it('rejects stale revisions and unpersisted live history without overwriting', async () => {
    const original = cloud('b', 10, next); const runtime = fixture(original);
    await expect(createRoomCoordinator(runtime.persistence, async () => cloud())({ diagramId: id, userId: generation, token: 'synthetic' })).rejects.toBeInstanceOf(CloudRoomConflictError);
    const uncommitted = graph('pending', 10, original.state);
    await expect(runtime.persistence.coordinateCheckpoint?.(id, original, uncommitted)).rejects.toThrow();
    expect(runtime.store.compareExchange).not.toHaveBeenCalled();
  });
  it('rejects an invalid cloud checkpoint, foreign identity and lost generation', async () => {
    const original = cloud(); const runtime = fixture(original);
    await expect(runtime.persistence.coordinateCheckpoint?.(id, { ...original, state: graph('forged') })).rejects.toThrow();
    await expect(runtime.persistence.loadRecord(generation)).rejects.toThrow('identity');
    runtime.replace({ generation: id, version: '2', record: encodeRoomCheckpoint(original) });
    await expect(runtime.persistence.load(id)).rejects.toThrow('generation');
    expect(runtime.store.compareExchange).not.toHaveBeenCalled();
  });
  it('clones the cloud input before awaits and refuses a late response after lease loss', async () => {
    const runtime = fixture(); const checkpoint = cloud();
    runtime.store.read = vi.fn(async () => { checkpoint.base.fill(255); return null; });
    const accepted = await createRoomCoordinator(runtime.persistence, async () => checkpoint)({ diagramId: id, userId: generation, token: 'synthetic' });
    expect(read(accepted)).toEqual(value('a', 10));
    runtime.store.read = vi.fn(async () => { runtime.controller.abort(); return runtime.current(); });
    await expect(runtime.persistence.loadRecord(id)).rejects.toThrow('lease');
  });
  it('bounds repeated contention and propagates storage failures', async () => {
    const runtime = fixture(); runtime.store.compareExchange = vi.fn(async () => false);
    await expect(runtime.persistence.saveCheckpoint(id, cloud())).rejects.toThrow('budget');
    expect(runtime.store.compareExchange).toHaveBeenCalledTimes(8);
    runtime.store.read = vi.fn(async () => { throw new Error('Synthetic unavailable'); });
    await expect(runtime.persistence.loadRecord(id)).rejects.toThrow('unavailable');
  });
  it('loads the exact committed checkpoint record', async () => {
    const original = cloud(); const runtime = fixture(original); const stored = runtime.current();
    if (!stored) throw new Error('Missing test checkpoint');
    expect(await runtime.persistence.loadRecord(id)).toEqual(decodeRoomRecord(stored.record));
  });
});
