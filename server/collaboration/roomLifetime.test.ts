// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRoomLifetime } from './roomLifetime.js';

describe('room lifetime reservations', () => {
  it('releases capacity across more than 64 distinct sequential diagrams', async () => {
    const dispose = vi.fn(async (_room: object) => undefined);
    const rooms = createRoomLifetime(64, dispose);
    for (let id = 0; id < 130; id++) {
      const lease = await rooms.acquire(String(id), async () => ({ id }));
      await lease.release();
      await lease.release();
    }
    expect(dispose).toHaveBeenCalledTimes(130);
    await rooms.stop();
  });
  it('shares loading and retains the room until every upgrade reservation releases', async () => {
    const dispose = vi.fn(async (_room: object) => undefined);
    const rooms = createRoomLifetime(1, dispose);
    const load = vi.fn(async () => ({}));
    const [first, second] = await Promise.all([rooms.acquire('a', load), rooms.acquire('a', load)]);
    expect(first.value).toBe(second.value);
    expect(load).toHaveBeenCalledTimes(1);
    await first.release();
    expect(dispose).not.toHaveBeenCalled();
    await expect(rooms.acquire('b', load)).rejects.toThrow('capacity');
    await second.release();
    const third = await rooms.acquire('b', load);
    await third.release();
    await rooms.stop();
  });
  it('waits for durable queue disposal before reconnecting to the same room', async () => {
    let finish: () => void = () => { throw new Error('Not initialized'); };
    const drain = new Promise<void>(resolve => { finish = resolve; });
    const rooms = createRoomLifetime(1, async () => drain);
    const load = vi.fn(async () => ({}));
    const lease = await rooms.acquire('a', load);
    const releasing = lease.release();
    const reconnecting = rooms.acquire('a', load);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    finish();
    await releasing;
    const next = await reconnecting;
    expect(load).toHaveBeenCalledTimes(2);
    await next.release();
    await rooms.stop();
  });
  it('recovers capacity after concurrent loader failures', async () => {
    const dispose = vi.fn(async (_room: object) => undefined);
    const rooms = createRoomLifetime(1, dispose);
    const failed = async () => { throw new Error('Synthetic failure'); };
    const results = await Promise.allSettled([rooms.acquire('a', failed), rooms.acquire('a', failed)]);
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    const lease = await rooms.acquire('b', async () => ({}));
    await lease.release();
    expect(dispose).toHaveBeenCalledTimes(1);
    await rooms.stop();
  });
  it('stops once, drains loading rooms and refuses subsequent acquisitions', async () => {
    const dispose = vi.fn(async (_room: object) => undefined);
    const rooms = createRoomLifetime(1, dispose);
    const lease = await rooms.acquire('a', async () => ({}));
    await Promise.all([rooms.stop(), rooms.stop()]);
    await lease.release();
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(rooms.acquire('a', async () => ({}))).rejects.toThrow('stopped');
  });
  it('rejects invalid capacities and surfaces disposal failure', async () => {
    for (const invalid of [0, -1, NaN, Infinity, 1.5]) expect(() => createRoomLifetime(invalid, async () => undefined)).toThrow();
    const rooms = createRoomLifetime(1, async () => { throw new Error('Synthetic disposal failure'); });
    const lease = await rooms.acquire('a', async () => ({}));
    await expect(lease.release()).rejects.toThrow('disposal failure');
    const next = await rooms.acquire('b', async () => ({}));
    await expect(next.release()).rejects.toThrow();
    await rooms.stop();
  });
  it('drains a pending successful loader during shutdown without returning a destroyed room', async () => {
    let finish: (value: object) => void = () => { throw new Error('Not initialized'); };
    const loading = new Promise<object>(resolve => { finish = resolve; });
    const dispose = vi.fn(async (_room: object) => undefined);
    const rooms = createRoomLifetime(1, dispose);
    const acquisition = rooms.acquire('a', () => loading);
    const rejected = expect(acquisition).rejects.toThrow('stopped');
    const stopping = rooms.stop();
    finish({});
    await rejected;
    await stopping;
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
