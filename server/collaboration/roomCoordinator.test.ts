// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createActiveRoomCoordinator, createRoomCoordinator } from './roomCoordinator.js';
import type { CheckpointPersistence } from './persistence.js';
import { decodeRoomRecord, encodeRoomCheckpoint, type RoomCheckpoint } from './roomCheckpoint.js';
import { CloudRoomConflictError } from './cloudRoomReconciliation.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
const identity = { diagramId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', token: 'synthetic' };
const firstRevision = '2026-10-08T20:00:00.123456Z';
const nextRevision = '2026-10-08T20:00:00.123457Z';
const documents: Y.Doc[] = [];
afterEach(() => { for (const doc of documents.splice(0)) doc.destroy(); });
const node = (label = 'a', x = 10) => ({ id: 'a', position: { x, y: 20 }, data: { label } });
const bytes = (nodes: unknown[] = [node()]) => {
  const doc = new Y.Doc(); documents.push(doc);
  for (const value of nodes) {
    const parsed = readCollaborationElement(value);
    if (!parsed || typeof parsed.id !== 'string' || !publishCollaborationElement(doc.getMap('flowchart-nodes'), parsed.id, parsed)) throw new Error('Invalid fixture');
  }
  return Y.encodeStateAsUpdate(doc);
};
const checkpoint = (nodes: unknown[] = [node()], revision = firstRevision): RoomCheckpoint => {
  const state = bytes(nodes); return { revision, base: state, state };
};
const read = (state: Uint8Array) => {
  const doc = new Y.Doc(); documents.push(doc); Y.applyUpdate(doc, state);
  return readCollaborationElement(doc.getMap('flowchart-nodes').get('a'));
};
const fixture = (initial?: Uint8Array) => {
  let record = initial;
  const saveCheckpoint = vi.fn(async (_id: string, value: RoomCheckpoint) => { record = encodeRoomCheckpoint(value); });
  const persistence: CheckpointPersistence = {
    loadRecord: async () => record ? decodeRoomRecord(record) : null,
    load: async () => record ? decodeRoomRecord(record).state : null,
    save: async (_id, state) => { record = state; }, saveCheckpoint,
  };
  return { persistence, saveCheckpoint, stored: () => record };
};
describe('authenticated cold-room cloud coordinator', () => {
  it('returns committed remote edits from a checkpoint receipt in the fallback path', async () => {
    const source = checkpoint(); const runtime = fixture();
    runtime.persistence.saveCheckpoint = async (_id, value) => {
      const doc = new Y.Doc(); documents.push(doc); Y.applyUpdate(doc, value.state);
      publishCollaborationElement(doc.getMap('flowchart-nodes'), 'remote', { id: 'remote', position: { x: 0, y: 0 }, data: { label: 'remote' } });
      return Y.encodeStateAsUpdate(doc);
    };
    const accepted = await createRoomCoordinator(runtime.persistence, async () => source)(identity);
    const doc = new Y.Doc(); documents.push(doc); Y.applyUpdate(doc, accepted);
    expect([...doc.getMap('flowchart-nodes').keys()].sort()).toEqual(['a', 'remote']);
  });
  it('skips full graph reads and checkpoint writes while active revision is unchanged', async () => {
    const original = checkpoint();
    const store = fixture(encodeRoomCheckpoint(original));
    const source = vi.fn(async () => original);
    const coordinate = createRoomCoordinator(store.persistence, source);
    expect(await createActiveRoomCoordinator(store.persistence, async () => firstRevision, coordinate)(identity, bytes())).toBeNull();
    expect(source).not.toHaveBeenCalled(); expect(store.saveCheckpoint).not.toHaveBeenCalled();
  });
  it('uses the queue-captured live state when a newer active revision requires merge', async () => {
    const store = fixture(encodeRoomCheckpoint(checkpoint()));
    const coordinate = createRoomCoordinator(store.persistence, async () => checkpoint([node('Cloud')], nextRevision));
    const accepted = await createActiveRoomCoordinator(store.persistence, async () => nextRevision, coordinate)(identity, bytes([node('a', 99)]));
    expect(read(accepted!)).toEqual(node('Cloud', 99));
  });
  it('preserves storage when active version authorization or revision validation fails', async () => {
    for (const revision of ['bad', '2026-10-08T20:00:00.123455Z']) {
      const initial = encodeRoomCheckpoint(checkpoint());
      const store = fixture(initial);
      const source = vi.fn(async () => checkpoint());
      await expect(createActiveRoomCoordinator(store.persistence, async () => revision, createRoomCoordinator(store.persistence, source))(identity, bytes())).rejects.toThrow();
      expect(source).not.toHaveBeenCalled(); expect(store.stored()).toEqual(initial);
    }
    const store = fixture(encodeRoomCheckpoint(checkpoint()));
    await expect(createActiveRoomCoordinator(store.persistence, async () => { throw new Error('Synthetic access denied'); }, createRoomCoordinator(store.persistence, async () => checkpoint()))(identity, bytes())).rejects.toThrow('access denied');
    expect(store.saveCheckpoint).not.toHaveBeenCalled();
  });
  it('refuses active monitoring without a known persisted cloud baseline', async () => {
    const store = fixture(bytes());
    const revision = vi.fn(async () => nextRevision);
    await expect(createActiveRoomCoordinator(store.persistence, revision, createRoomCoordinator(store.persistence, async () => checkpoint()))(identity, bytes())).rejects.toThrow(CloudRoomConflictError);
    expect(revision).not.toHaveBeenCalled();
  });
  it('initializes an atomic exact-revision checkpoint before returning initial sync state', async () => {
    const store = fixture();
    const cloud = checkpoint();
    const source = vi.fn(async () => cloud);
    const loaded = await createRoomCoordinator(store.persistence, source)(identity);
    expect(source).toHaveBeenCalledWith(identity);
    expect(read(loaded)).toEqual(node());
    expect(decodeRoomRecord(store.stored()!).checkpoint).toEqual({ revision: firstRevision, base: cloud.base });
  });
  it('merges newer cloud label with unsaved collaborative drag and advances the base', async () => {
    const original = checkpoint();
    const store = fixture(encodeRoomCheckpoint({ ...original, state: bytes([node('a', 99)]) }));
    const cloud = checkpoint([node('Cloud')], nextRevision);
    const loaded = await createRoomCoordinator(store.persistence, async () => cloud)(identity);
    expect(read(loaded)).toEqual(node('Cloud', 99));
    expect(decodeRoomRecord(store.stored()!).checkpoint).toEqual({ revision: nextRevision, base: cloud.base });
  });
  it('preserves unsaved edits when exact cloud revision and baseline are unchanged', async () => {
    const original = checkpoint();
    const store = fixture(encodeRoomCheckpoint({ ...original, state: bytes([node('Live')]) }));
    expect(read(await createRoomCoordinator(store.persistence, async () => original)(identity))).toEqual(node('Live'));
  });
  it('safely establishes a baseline for equal legacy graphs while retaining CRDT history', async () => {
    const legacy = bytes();
    const store = fixture(legacy);
    const loaded = await createRoomCoordinator(store.persistence, async () => checkpoint())(identity);
    expect(loaded).toEqual(legacy);
    expect(decodeRoomRecord(store.stored()!).checkpoint?.revision).toBe(firstRevision);
  });
  it('marks an equal legacy empty graph authoritative before admitting stale clients', async () => {
    const store = fixture(new Uint8Array([0, 0]));
    const accepted = await createRoomCoordinator(store.persistence, async () => checkpoint([]))(identity);
    const doc = new Y.Doc(); documents.push(doc); Y.applyUpdate(doc, accepted);
    expect(doc.getMap('flowchart-nodes').size).toBe(0);
    expect(Y.decodeStateVector(Y.encodeStateVector(doc)).size).toBeGreaterThan(0);
  });
  it('rejects differing legacy content without inferring a base or altering either version', async () => {
    const legacy = bytes([node('Unsaved')]);
    const store = fixture(legacy);
    await expect(createRoomCoordinator(store.persistence, async () => checkpoint())(identity)).rejects.toThrow(CloudRoomConflictError);
    expect(store.stored()).toEqual(legacy);
    expect(store.saveCheckpoint).not.toHaveBeenCalled();
  });
  it.each(['same-field', 'older-revision', 'same-revision-different-content'])('preserves accepted storage on %s conflict', async kind => {
    const original = checkpoint();
    const initial = encodeRoomCheckpoint({ ...original, state: bytes([node('Live')]) });
    const store = fixture(initial);
    const cloud = checkpoint([node('Cloud')], kind === 'same-field' ? nextRevision
      : kind === 'older-revision' ? '2026-10-08T20:00:00.123455Z' : firstRevision);
    await expect(createRoomCoordinator(store.persistence, async () => cloud)(identity)).rejects.toThrow(CloudRoomConflictError);
    expect(store.stored()).toEqual(initial);
    expect(store.saveCheckpoint).not.toHaveBeenCalled();
  });
  it('does not admit synchronization if atomic persistence fails', async () => {
    const store = fixture();
    store.saveCheckpoint.mockRejectedValueOnce(new Error('Synthetic disk failure'));
    await expect(createRoomCoordinator(store.persistence, async () => checkpoint())(identity)).rejects.toThrow('disk failure');
    expect(store.stored()).toBeUndefined();
  });
  it('preserves persisted edits if cloud access fails', async () => {
    const initial = bytes([node('Unsaved')]);
    const store = fixture(initial);
    await expect(createRoomCoordinator(store.persistence, async () => { throw new Error('Synthetic access failure'); })(identity)).rejects.toThrow('access failure');
    expect(store.stored()).toEqual(initial);
    expect(store.saveCheckpoint).not.toHaveBeenCalled();
  });
  it('rejects an inconsistent cloud checkpoint before persistence', async () => {
    const store = fixture();
    const cloud = checkpoint(); cloud.state = bytes([node('Other')]);
    await expect(createRoomCoordinator(store.persistence, async () => cloud)(identity)).rejects.toThrow('Invalid cloud checkpoint');
    expect(store.saveCheckpoint).not.toHaveBeenCalled();
  });
});
