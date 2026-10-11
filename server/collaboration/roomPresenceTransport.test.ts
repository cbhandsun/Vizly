// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoomPresenceTransport } from './roomPresenceTransport.js';
import type { DistributedPresencePeer, RoomPresenceFrame } from './distributedPresence.js';
const source = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const remote = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const generation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const peer = (clientId = 1): DistributedPresencePeer => ({ clientId, userId: 'synthetic-user', state: { cursor: { x: 1, y: 2 } } });
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); });
const fixture = () => {
  let time = 0; let local = [peer()]; let queue = Promise.resolve();
  const publish = vi.fn(async (_frame: RoomPresenceFrame) => undefined); const accept = vi.fn(async () => undefined);
  const failed = vi.fn(); const publicationFailed = vi.fn(); const assertActive = vi.fn();
  const readLocal = vi.fn(async () => local);
  const transport = createRoomPresenceTransport({ source, generation, publish, accept, failed, publicationFailed, assertActive,
    readLocal, now: () => time, serialize: operation => { const result = queue.then(operation); queue = result.catch(() => undefined); return result; } });
  cleanup.push(() => transport.close());
  const settle = async () => { await Promise.resolve(); await queue; await Promise.resolve(); };
  return { transport, publish, accept, failed, publicationFailed, assertActive, readLocal, settle,
    setLocal: (next: DistributedPresencePeer[]) => { local = next; }, setTime: (next: number) => { time = next; } };
};
describe('distributed presence publication and expiry lifecycle', () => {
  it('publishes bounded frames, coalesces bursts, and announces departure', async () => {
    const f = fixture(); f.setLocal(Array.from({ length: 65 }, (_, index) => peer(index)));
    const first = f.transport.refresh(); expect(f.transport.refresh()).toBe(first); await first;
    expect(f.publish.mock.calls.map(([frame]) => frame.peers.length)).toEqual([32, 32, 1]);
    expect(f.publish.mock.calls.map(([frame]) => frame.sequence)).toEqual([1, 2, 3]);
    f.publish.mockClear(); f.setLocal([]); await f.transport.refresh();
    expect(f.publish.mock.calls.flatMap(([frame]) => frame.peers).every(peer => peer.state === null)).toBe(true);
  });
  it('expires missed departures and retains replay floors', async () => {
    vi.useFakeTimers(); const f = fixture(); f.transport.start(); await f.transport.refresh();
    const frame = { source: remote, generation, sequence: 1, peers: [peer()] };
    f.transport.receive(frame); await f.settle(); expect(f.accept).toHaveBeenCalledTimes(1);
    f.setTime(20_000); await vi.advanceTimersByTimeAsync(5000); await f.settle();
    expect(f.accept).toHaveBeenLastCalledWith(expect.objectContaining({ removed: [expect.objectContaining({ source: remote })] }));
    f.accept.mockClear(); f.transport.receive(frame); await f.settle(); expect(f.accept).not.toHaveBeenCalled();
  });
  it('drops over-capacity receive work and can accept a later fresh frame', async () => {
    const f = fixture(); for (let sequence = 1; sequence <= 32; sequence++) f.transport.receive({ source: remote, generation, sequence, peers: [peer()] });
    await f.settle(); expect(f.accept).toHaveBeenCalledTimes(16);
    f.transport.receive({ source: remote, generation, sequence: 33, peers: [peer()] }); await f.settle(); expect(f.accept).toHaveBeenCalledTimes(17);
  });
  it('rejects echo/other-generation/malformed input and stale queued arrival timestamps', async () => {
    const f = fixture();
    for (const input of [null, { source, generation, sequence: 1, peers: [peer()] }, { source: remote, generation: source, sequence: 1, peers: [peer()] }]) f.transport.receive(input);
    f.transport.receive({ source: remote, generation, sequence: 1, peers: [peer()] }); f.setTime(20_000);
    await f.settle(); expect(f.accept).not.toHaveBeenCalled();
  });
  it('reports failed acceptance through the room fence and sanitizes publication failure', async () => {
    const f = fixture(); f.accept.mockRejectedValueOnce(new Error('Do not reveal synthetic contents'));
    f.transport.receive({ source: remote, generation, sequence: 1, peers: [peer()] }); await f.settle(); expect(f.failed).toHaveBeenCalledTimes(1);
    f.publish.mockRejectedValueOnce(new Error('Do not reveal synthetic secret'));
    await expect(f.transport.refresh()).rejects.toThrow(/^Presence publication unavailable$/);
  });
  it('returns a final tombstone receipt and completes local disposal even when notification fails', async () => {
    const f = fixture(); await f.transport.refresh(); f.publish.mockRejectedValueOnce(new Error('Synthetic transport disconnected'));
    const closing = f.transport.close(); expect(f.transport.close()).toBe(closing);
    await expect(closing).resolves.toEqual({ tombstonesDelivered: false }); expect(f.publicationFailed).toHaveBeenCalledTimes(1);
    f.accept.mockClear(); f.transport.receive({ source: remote, generation, sequence: 1, peers: [peer()] }); await f.settle(); expect(f.accept).not.toHaveBeenCalled();
  });
  it('rejects oversized and duplicate local snapshots before publication', async () => {
    const f = fixture(); f.setLocal(Array.from({ length: 129 }, (_, index) => peer(index)));
    await expect(f.transport.refresh()).rejects.toThrow('unavailable'); expect(f.publish).not.toHaveBeenCalled();
    f.setLocal([peer(), peer()]); await expect(f.transport.refresh()).rejects.toThrow('unavailable'); expect(f.publish).not.toHaveBeenCalled();
  });
  it('limits publication starts to five per second and cancels a delayed start on close', async () => {
    vi.useFakeTimers(); const f = fixture(); await f.transport.refresh();
    const delayed = f.transport.refresh(); await Promise.resolve();
    expect(f.publish).toHaveBeenCalledTimes(1); f.setTime(200); await vi.advanceTimersByTimeAsync(200); await delayed;
    expect(f.publish).toHaveBeenCalledTimes(2);
    const cancelled = f.transport.refresh(); await Promise.resolve(); const closing = f.transport.close();
    await Promise.all([cancelled, closing]); expect(f.publish).toHaveBeenCalledTimes(3);
    expect(f.publish.mock.calls[2][0].peers.every(peer => peer.state === null)).toBe(true);
  });
});
