// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type { RoomCommitNotice, RoomNoticeBus } from './distributedRoomSync.js';
import { probeCloudServices, type CloudServiceProbeDependencies } from './cloudServiceProbe.js';

afterEach(() => vi.useRealTimers());
const fixture = () => {
  let receive: (input: unknown) => void = () => undefined;
  const stop = vi.fn<() => Promise<void>>().mockResolvedValue();
  const send = vi.fn<(notice: RoomCommitNotice) => Promise<void>>().mockImplementation(async notice => { receive(notice); });
  const subscribe = vi.fn<RoomNoticeBus['subscribe']>().mockImplementation(async (_id, callback) => {
      receive = callback; return { publish: send, close: async () => undefined };
    });
  const readMissingRoom = vi.fn<CloudServiceProbeDependencies['readMissingRoom']>().mockResolvedValue(null);
  const sender = { subscribe: async () => ({ publish: send, close: async () => undefined }), stop };
  const receiver = { subscribe, stop };
  const dependencies: CloudServiceProbeDependencies = { readMissingRoom, createBuses: () => [sender, receiver] };
  return { dependencies, stop, send, subscribe, readMissingRoom, deliver: (input: unknown) => receive(input) };
};

it('accepts an empty-room RPC read and exact private metadata delivery, then disposes both independent clients', async () => {
  const f = fixture();
  expect(await probeCloudServices(f.dependencies)).toEqual({ status: 'passed', stage: 'complete',
    atomicReadAuthorized: true, privateNoticeDelivered: true, disposalSucceeded: true, actualAccountFlowVerified: false });
  expect(f.readMissingRoom).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(f.stop).toHaveBeenCalledTimes(2);
});
it.each([{}, [], 'unexpected', false])('rejects a nonempty or malformed RPC receipt without opening notifications: %j', async value => {
  const f = fixture(); f.readMissingRoom.mockResolvedValue(value);
  expect(await probeCloudServices(f.dependencies)).toMatchObject({ status: 'failed', stage: 'atomic-read', atomicReadAuthorized: false });
  expect(f.subscribe).not.toHaveBeenCalled();
});
it('returns bounded failure metadata without disclosing transport errors', async () => {
  const f = fixture(); f.readMissingRoom.mockRejectedValue(new Error('token=secret user-content'));
  expect(JSON.stringify(await probeCloudServices(f.dependencies))).not.toMatch(/secret|user-content|token=/);
});
it('disposes both clients if subscription fails', async () => {
  const f = fixture(); f.subscribe.mockRejectedValue(new Error('unavailable'));
  expect(await probeCloudServices(f.dependencies)).toMatchObject({ status: 'failed', stage: 'subscribe', disposalSucceeded: true });
  expect(f.stop).toHaveBeenCalledTimes(2);
});
it('does not consume notification delivery time while sequential clients are joining', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const buses = f.dependencies.createBuses();
  const delayed = (bus: typeof buses[number]) => ({ ...bus,
    subscribe: async (...args: Parameters<RoomNoticeBus['subscribe']>) => {
      await new Promise<void>(resolve => setTimeout(resolve, 5000));
      return bus.subscribe(...args);
    },
  });
  f.dependencies.createBuses = () => [delayed(buses[0]), delayed(buses[1])];
  const result = probeCloudServices(f.dependencies);
  await vi.advanceTimersByTimeAsync(9999);
  expect(f.send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatchObject({ status: 'passed', privateNoticeDelivered: true, disposalSucceeded: true });
  expect(vi.getTimerCount()).toBe(0);
});
it('still enforces the unchanged delivery budget after slow subscriptions', async () => {
  vi.useFakeTimers();
  const f = fixture(); const originalSubscribe = f.subscribe.getMockImplementation();
  if (!originalSubscribe) throw new Error('Missing subscription fixture');
  f.subscribe.mockImplementation(async (...args) => {
    await new Promise<void>(resolve => setTimeout(resolve, 5000));
    return originalSubscribe(...args);
  });
  f.send.mockResolvedValue();
  let settled = false;
  const result = probeCloudServices(f.dependencies).then(receipt => { settled = true; return receipt; });
  await vi.advanceTimersByTimeAsync(12999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatchObject({ status: 'failed', stage: 'delivery', privateNoticeDelivered: false, disposalSucceeded: true });
  expect(vi.getTimerCount()).toBe(0);
});
it('does not accept stale, extra-field, empty or oversized unrelated notices', async () => {
  vi.useFakeTimers();
  const f = fixture(); f.send.mockImplementation(async notice => {
    for (const input of [null, {}, [], { ...notice, version: '0' }, { ...notice, token: 'secret' }, 'x'.repeat(100_000)]) f.deliver(input);
  });
  const result = probeCloudServices(f.dependencies);
  await vi.advanceTimersByTimeAsync(8000);
  expect(await result).toMatchObject({ status: 'failed', stage: 'delivery', privateNoticeDelivered: false, disposalSucceeded: true });
  expect(vi.getTimerCount()).toBe(0);
});
it('fails publication and retains its cleanup result', async () => {
  const f = fixture(); f.send.mockRejectedValue(new Error('unavailable'));
  expect(await probeCloudServices(f.dependencies)).toMatchObject({ status: 'failed', stage: 'publish', disposalSucceeded: true });
});
it('does not report success when notification disposal fails', async () => {
  const f = fixture(); f.stop.mockRejectedValue(new Error('disposal token=secret'));
  expect(await probeCloudServices(f.dependencies)).toMatchObject({ status: 'failed', stage: 'dispose', privateNoticeDelivered: true, disposalSucceeded: false });
});
