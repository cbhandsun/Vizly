// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createSupabaseRoomRuntime } from './supabaseRoomRuntime.js';
import type { RoomNoticeBus, RoomNoticeSubscription } from './distributedRoomSync.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fixture = () => {
  const subscription: RoomNoticeSubscription = { publish: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
  const notices: RoomNoticeBus & { stop: () => Promise<void> } = { subscribe: vi.fn(async () => subscription), stop: vi.fn(async () => undefined) };
  let stored: { generation: string; version: string; record: string } | null = null;
  const requested: string[] = [];
  const transport: typeof fetch = vi.fn(async input => {
    const url = new URL(input instanceof Request ? input.url : input.toString()); const name = url.pathname.split('/').at(-1) ?? '';
    requested.push(name);
    if (name === 'vizly_claim_room_lease') return Response.json({ generation, expiresAt: new Date(Date.now() + 30_000).toISOString() });
    if (name === 'vizly_read_atomic_room') return Response.json(stored);
    if (name === 'vizly_release_room_lease') return Response.json(true);
    throw new Error('Unexpected synthetic RPC');
  });
  const runtime = createSupabaseRoomRuntime('https://example.supabase.co', 'sb_secret_SYNTHETIC_ONLY', transport, notices);
  return { runtime, notices, subscription, requested, set: (record: string) => { stored = { generation, version: '1', record }; } };
};
describe('Supabase admitted storage/notification runtime composition', () => {
  it('reads admitted RPC storage, accepts it and publishes durable version metadata', async () => {
    const f = fixture(); const lease = await f.runtime.acquireRoomLease(id);
    const doc = new Y.Doc(); const record = Y.encodeStateAsUpdate(doc); doc.destroy(); f.set(Buffer.from(record).toString('base64'));
    const accept = vi.fn(async () => undefined); const unavailable = vi.fn();
    const synchronization = await f.runtime.openRoomSynchronization({ roomId: id, generation: lease.generation, accept, unavailable });
    try {
      expect(accept).toHaveBeenCalledWith(expect.objectContaining({ generation, version: '1', record }));
      await synchronization.notifyCommitted(); expect(f.subscription.publish).toHaveBeenCalledWith(expect.objectContaining({ generation, version: '1' }));
      expect(unavailable).not.toHaveBeenCalled();
    } finally { await synchronization.close(); await lease.close(); await f.runtime.stop(); }
  });
  it('fences new admissions immediately and disposes stores/transport exactly once', async () => {
    const f = fixture(); await f.runtime.acquireRoomLease(id); const stopped = f.runtime.stop();
    await expect(f.runtime.acquireRoomLease('cccccccc-cccc-4ccc-8ccc-cccccccccccc')).rejects.toThrow('stopped');
    expect(f.runtime.stop()).toBe(stopped); await stopped;
    expect(f.requested.filter(name => name === 'vizly_claim_room_lease')).toHaveLength(1);
    expect(f.requested.filter(name => name === 'vizly_release_room_lease')).toHaveLength(1); expect(f.notices.stop).toHaveBeenCalledTimes(1);
  });
  it('preserves failed transport cleanup and shares the stop receipt on synchronous reentry', async () => {
    const f = fixture(); let reentered: Promise<void> | undefined;
    f.notices.stop = vi.fn(() => { reentered = f.runtime.stop(); throw new Error('Synthetic credential must not escape'); });
    const stopped = f.runtime.stop(); await expect(stopped).rejects.toThrow(/^Supabase room runtime disposal failed$/);
    expect(reentered).toBe(stopped); expect(f.notices.stop).toHaveBeenCalledTimes(1);
    await expect(f.runtime.acquireRoomLease(id)).rejects.toThrow('stopped');
  });
});
