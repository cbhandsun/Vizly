// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createAtomicRoomCommitter, parseAtomicRoomSnapshot, type AtomicRoomSnapshot, type AtomicRoomStore } from './atomicRoomCommit.js';
import { publishCollaborationElement } from './documentModel.js';
import { decodeRoomRecord, encodeRoomCheckpoint } from './roomCheckpoint.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const state = (nodeId?: string) => {
  const doc = new Y.Doc();
  try {
    if (nodeId) publishCollaborationElement(doc.getMap('flowchart-nodes'), nodeId, { id: nodeId, position: { x: 0, y: 0 }, data: { label: nodeId } });
    return Y.encodeStateAsUpdate(doc);
  } finally { doc.destroy(); }
};
const memoryStore = (initial: AtomicRoomSnapshot | null = null) => {
  let current = initial;
  const store: AtomicRoomStore = {
    read: vi.fn(async () => current ? { ...current, record: Uint8Array.from(current.record) } : null),
    compareExchange: vi.fn(async (_id, nextGeneration, version, record) => {
      if (current ? current.generation !== nextGeneration || current.version !== version : version !== null) return false;
      current = { generation: nextGeneration, version: String(BigInt(current?.version ?? '0') + 1n), record: Uint8Array.from(record) };
      return true;
    }),
  };
  return { store, current: () => current };
};
const nodes = (bytes: Uint8Array) => {
  const doc = new Y.Doc();
  try { Y.applyUpdate(doc, bytes); return [...doc.getMap('flowchart-nodes').keys()].sort(); }
  finally { doc.destroy(); }
};
describe('bounded atomic room commits', () => {
  it('initializes an absent room and returns the committed state', async () => {
    const fixture = memoryStore();
    const accepted = await createAtomicRoomCommitter(fixture.store).commit(id, generation, state('first'));
    expect(nodes(accepted)).toEqual(['first']); expect(fixture.current()?.version).toBe('1');
  });
  it('merges two concurrent instance writes after one loses compare-exchange', async () => {
    const fixture = memoryStore({ generation, version: '1', record: state('base') });
    const first = createAtomicRoomCommitter(fixture.store); const second = createAtomicRoomCommitter(fixture.store);
    await Promise.all([first.commit(id, generation, state('first')), second.commit(id, generation, state('second'))]);
    const stored = fixture.current();
    if (!stored) throw new Error('Missing test record');
    expect(nodes(decodeRoomRecord(stored.record).state)).toEqual(['base', 'first', 'second']);
    expect(stored.version).toBe('3');
    expect(fixture.store.compareExchange).toHaveBeenCalledTimes(3);
  });
  it('preserves the checkpoint base and cloud revision during a concurrent save', async () => {
    const base = state('base'); const revision = '2026-10-09T01:00:00Z';
    const fixture = memoryStore({ generation, version: '1', record: encodeRoomCheckpoint({ revision, base, state: base }) });
    await createAtomicRoomCommitter(fixture.store).commit(id, generation, state('new'));
    const record = fixture.current(); if (!record) throw new Error('Missing test record');
    expect(decodeRoomRecord(record.record).checkpoint).toEqual({ revision, base });
    expect(nodes(decodeRoomRecord(record.record).state)).toEqual(['base', 'new']);
  });
  it('refuses a generation changed by recovery after a compare-exchange conflict', async () => {
    const read = vi.fn().mockResolvedValueOnce({ generation, version: '1', record: state() })
      .mockResolvedValue({ generation: id, version: '2', record: state() });
    const compareExchange = vi.fn(async () => false);
    await expect(createAtomicRoomCommitter({ read, compareExchange }).commit(id, generation, state('old'))).rejects.toThrow('generation');
    expect(compareExchange).toHaveBeenCalledTimes(1);
  });
  it('bounds contention and propagates unavailable storage without overwriting', async () => {
    const read = vi.fn(async () => null); const compareExchange = vi.fn(async () => false);
    await expect(createAtomicRoomCommitter({ read, compareExchange }).commit(id, generation, state())).rejects.toThrow('budget');
    expect(compareExchange).toHaveBeenCalledTimes(8);
    read.mockRejectedValueOnce(new Error('Synthetic storage unavailable'));
    await expect(createAtomicRoomCommitter({ read, compareExchange }).commit(id, generation, state())).rejects.toThrow('unavailable');
    expect(compareExchange).toHaveBeenCalledTimes(8);
  });
  it.each([null, {}, { generation, version: '01', record: state() }, { generation, version: '9223372036854775807', record: state() },
    { generation, version: '1', record: Uint8Array.from([255]) }])('rejects invalid snapshots %#', input => {
    expect(() => parseAtomicRoomSnapshot(input)).toThrow();
  });
  it('rejects invalid identity and submitted bytes before touching storage', async () => {
    const fixture = memoryStore(); const committer = createAtomicRoomCommitter(fixture.store);
    await expect(committer.commit('../room', generation, state())).rejects.toThrow();
    await expect(committer.commit(id, generation, Uint8Array.from([255]))).rejects.toThrow();
    expect(fixture.store.read).not.toHaveBeenCalled();
  });
});
