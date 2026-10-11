// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createDistributedRoomSync, parseRoomCommitNotice, type RoomNoticeBus, type RoomNoticeSubscription, type RoomSynchronization, type RoomSyncAdmission } from './distributedRoomSync.js';
import type { AtomicRoomSnapshot } from './atomicRoomCommit.js';
import { publishCollaborationElement } from './documentModel.js';
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const source = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const remote = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const handles: RoomSynchronization[] = [];
afterEach(async () => { for (const handle of handles.splice(0)) await handle.close(); vi.useRealTimers(); });
const state = () => {
  const doc = new Y.Doc();
  try { publishCollaborationElement(doc.getMap('flowchart-nodes'), 'one', { id: 'one', position: { x: 0, y: 0 }, data: { label: 'one' } }); return Y.encodeStateAsUpdate(doc); }
  finally { doc.destroy(); }
};
const fixture = () => {
  let snapshot: AtomicRoomSnapshot | null = { generation, version: '1', record: state() };
  let receive: (input: unknown) => void = () => { throw new Error('Missing test subscription'); };
  let catchUp: () => void = () => { throw new Error('Missing test subscription'); };
  const subscription: RoomNoticeSubscription = { publish: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
  const bus: RoomNoticeBus = { subscribe: vi.fn(async (_id, receiver, resume) => { receive = receiver; catchUp = resume; return subscription; }) };
  const read = vi.fn(async () => snapshot);
  const accept = vi.fn(async (_snapshot: AtomicRoomSnapshot) => undefined); const unavailable = vi.fn();
  const open = createDistributedRoomSync({ source, bus, read, catchUpMs: 1000 });
  return { read, accept, unavailable, bus, subscription,
    set: (next: AtomicRoomSnapshot | null) => { snapshot = next; }, get: () => snapshot,
    notice: (input: unknown = { source: remote, generation, version: '2' }) => receive(input), reconnect: () => catchUp(),
    async start(serialize?: RoomSyncAdmission['serialize']) { const handle = await open({ roomId, generation, accept, unavailable, serialize }); handles.push(handle); return handle; },
  };
};
describe('distributed commit notifications and catch-up', () => {
  it.each([null, undefined, [], {}, { source, generation, version: '0' }, { source: 'token', generation, version: '1' },
    { source, generation, version: '9223372036854775807' }, { source, generation, version: '1', state: 'content' }])('rejects malformed or content-bearing notice %#', input => {
    expect(parseRoomCommitNotice(input)).toBeNull();
  });
  it('normalizes metadata and accepts versions beyond Number precision', () => {
    expect(parseRoomCommitNotice({ source: source.toUpperCase(), generation: generation.toUpperCase(), version: '9007199254740993' }))
      .toEqual({ source, generation, version: '9007199254740993' });
  });
  it('subscribes before initial read and publishes only durable metadata', async () => {
    const f = fixture(); const handle = await f.start();
    expect(vi.mocked(f.bus.subscribe).mock.invocationCallOrder[0]).toBeLessThan(f.read.mock.invocationCallOrder[0]);
    await handle.notifyCommitted();
    expect(f.subscription.publish).toHaveBeenCalledWith({ source, generation, version: '1' });
    expect(f.accept).toHaveBeenCalledTimes(1);
  });
  it('ignores invalid, echoed and already-applied notifications', async () => {
    const f = fixture(); await f.start();
    f.notice({ source, generation, version: '2' }); f.notice({ source: remote, generation, version: '1' }); f.notice({ token: 'private' });
    await Promise.resolve(); expect(f.read).toHaveBeenCalledTimes(1);
  });
  it('coalesces a burst of remote notifications into a bounded read', async () => {
    const f = fixture(); await f.start(); const previous = f.get(); if (!previous) throw new Error('Missing fixture');
    f.set({ ...previous, version: '2' });
    for (let index = 0; index < 1000; index++) f.notice();
    await vi.waitFor(() => expect(f.accept).toHaveBeenCalledTimes(2));
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it('serializes the durable read itself behind local commits, preventing stale acceptance races', async () => {
    const f = fixture(); let queue = Promise.resolve();
    const serialize = vi.fn((operation: () => Promise<void>) => { const result = queue.then(operation); queue = result.catch(() => undefined); return result; });
    await f.start(serialize);
    let finish: () => void = () => { throw new Error('Missing resolver'); };
    const localCommit = new Promise<void>(resolve => { finish = resolve; });
    queue = queue.then(() => localCommit);
    f.notice(); await vi.waitFor(() => expect(serialize).toHaveBeenCalledTimes(2));
    expect(f.read).toHaveBeenCalledTimes(1);
    const previous = f.get(); if (!previous) throw new Error('Missing fixture'); f.set({ ...previous, version: '2' }); finish();
    await vi.waitFor(() => expect(f.accept).toHaveBeenCalledTimes(2)); expect(f.read).toHaveBeenCalledTimes(2);
  });
  it('catches missed messages after reconnect and periodic refresh', async () => {
    vi.useFakeTimers(); const f = fixture(); await f.start(); const previous = f.get(); if (!previous) throw new Error('Missing fixture');
    f.set({ ...previous, version: '2' }); f.reconnect();
    await vi.waitFor(() => expect(f.accept).toHaveBeenCalledTimes(2));
    f.set({ ...previous, version: '3' }); await vi.advanceTimersByTimeAsync(1000);
    expect(f.accept).toHaveBeenCalledTimes(3);
  });
  it('fetches authoritative state when a notice claims a different generation', async () => {
    const f = fixture(); await f.start(); f.notice({ source: remote, generation: remote, version: '1' });
    await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(2));
    expect(f.unavailable).not.toHaveBeenCalled();
  });
  it.each(['generation', 'regression', 'replacement', 'missing', 'invalid', 'omission'])('fences authoritative %s failure', async kind => {
    const f = fixture(); await f.start(); const previous = f.get(); if (!previous) throw new Error('Missing fixture');
    if (kind === 'generation') f.set({ ...previous, generation: remote });
    if (kind === 'regression') { f.set({ ...previous, version: '2' }); await handles[0].notifyCommitted(); f.set(previous); }
    if (kind === 'replacement') f.set({ ...previous, record: state() });
    if (kind === 'missing') f.set(null);
    if (kind === 'invalid') f.set({ ...previous, version: '2', record: new Uint8Array([255]) });
    if (kind === 'omission') { const empty = new Y.Doc(); try { f.set({ ...previous, version: '2', record: Y.encodeStateAsUpdate(empty) }); } finally { empty.destroy(); } }
    f.reconnect(); await vi.waitFor(() => expect(f.unavailable).toHaveBeenCalledTimes(1));
    f.reconnect(); await expect(handles[0].notifyCommitted()).rejects.toThrow('unavailable');
    expect(f.unavailable).toHaveBeenCalledTimes(1);
  });
  it('does not fail an accepted room when publication fails and later catch-up remains available', async () => {
    const f = fixture(); const handle = await f.start(); vi.mocked(f.subscription.publish).mockRejectedValueOnce(new Error('Synthetic transport error'));
    await expect(handle.notifyCommitted()).rejects.toThrow('transport');
    expect(f.unavailable).not.toHaveBeenCalled(); await handle.notifyCommitted();
  });
  it('closes failed initial subscriptions and reports read/accept failures without raw errors', async () => {
    const f = fixture(); f.read.mockRejectedValueOnce(new Error('Synthetic secret content'));
    await expect(f.start()).rejects.toThrow(/^Room synchronization unavailable$/);
    expect(f.subscription.close).toHaveBeenCalledTimes(1); expect(f.unavailable).toHaveBeenCalledTimes(1);
  });
  it('closes when acceptance rejects without advancing accepted version', async () => {
    const f = fixture(); f.accept.mockRejectedValueOnce(new Error('Synthetic acceptance failure'));
    await expect(f.start()).rejects.toThrow('unavailable'); expect(f.subscription.close).toHaveBeenCalledTimes(1);
  });
  it('ignores a late read after shutdown and unsubscribes exactly once', async () => {
    const f = fixture(); const handle = await f.start();
    let finish: (snapshot: AtomicRoomSnapshot | null) => void = () => { throw new Error('Missing resolver'); };
    f.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.notice(); await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(2));
    const stopped = handle.close(); finish(f.get()); await stopped; await handle.close();
    expect(f.accept).toHaveBeenCalledTimes(1); expect(f.subscription.close).toHaveBeenCalledTimes(1);
    f.reconnect(); f.notice(); expect(f.read).toHaveBeenCalledTimes(2);
  });
  it('propagates subscription disposal failure', async () => {
    const f = fixture(); const handle = await f.start(); vi.mocked(f.subscription.close).mockRejectedValueOnce(new Error('Synthetic close failure'));
    await expect(handle.close()).rejects.toThrow('disposal failed'); handles.splice(0);
  });
  it.each([0, 999, 30001, Infinity])('rejects catch-up interval %s before subscription', catchUpMs => {
    const f = fixture(); expect(() => createDistributedRoomSync({ source, bus: f.bus, read: f.read, catchUpMs })).toThrow('configuration');
    expect(f.bus.subscribe).not.toHaveBeenCalled();
  });
});
