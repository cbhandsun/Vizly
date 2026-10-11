// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrivateRoomNoticeBus, type PrivateRoomChannel, type PrivateRoomRealtime } from './privateRoomNoticeBus.js';
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const notice = { source: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', generation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', version: '1' };
const buses: Array<ReturnType<typeof createPrivateRoomNoticeBus>> = [];
afterEach(async () => { for (const bus of buses.splice(0)) await bus.stop(); vi.useRealTimers(); });
const fixture = (initial = 'SUBSCRIBED') => {
  let status: (value: string) => void = () => { throw new Error('Missing status observer'); };
  let receive: (value: unknown) => void = () => { throw new Error('Missing message observer'); };
  let receivePresence: (value: unknown) => void = () => { throw new Error('Missing presence observer'); };
  const channel: PrivateRoomChannel = { receive: vi.fn(callback => { receive = callback; }),
    subscribe: vi.fn(callback => { status = callback; if (initial) status(initial); }),
    send: vi.fn(async () => true), close: vi.fn(async () => true),
    receivePresence: vi.fn(callback => { receivePresence = callback; }), sendPresence: vi.fn(async () => true) };
  const client: PrivateRoomRealtime = { channel: vi.fn(() => channel), disconnect: vi.fn() };
  const bus = createPrivateRoomNoticeBus(client); buses.push(bus);
  const accepted = vi.fn(); const catchUp = vi.fn();
  return { bus, client, channel, accepted, catchUp, status: (value: string) => status(value), receive: (value: unknown) => receive(value),
    receivePresence: (value: unknown) => receivePresence(value), subscribe: () => bus.subscribe(roomId, accepted, catchUp) };
};
describe('private backend room notification lifecycle', () => {
  it('shares one private topic and the publication budget for document and presence events', async () => {
    const f = fixture(); const accepted = vi.fn();
    const subscription = await f.bus.subscribe(roomId, f.accepted, f.catchUp, accepted);
    const frame = { source: notice.source, generation: notice.generation, sequence: 1,
      peers: [{ clientId: 1, userId: 'synthetic-user', state: { cursor: { x: 1, y: 2 } } }] };
    f.receivePresence(frame); f.receivePresence({ ...frame, token: 'forbidden' });
    expect(accepted).toHaveBeenCalledExactlyOnceWith(frame); expect(f.client.channel).toHaveBeenCalledTimes(1);
    await subscription.publishPresence?.(frame); expect(f.channel.sendPresence).toHaveBeenCalledExactlyOnceWith(frame);
    let finish: (value: boolean) => void = () => { throw new Error('Missing receipt'); };
    const sending = new Promise<boolean>(resolve => { finish = resolve; });
    f.channel.send = vi.fn(async () => sending);
    const pending = Array.from({ length: 16 }, () => subscription.publish(notice));
    await expect(subscription.publishPresence?.(frame)).rejects.toThrow('unavailable');
    await Promise.resolve(); finish(true);
    await Promise.all(pending);
  });
  it('rejects presence admission on a transport that lacks the required event handlers', async () => {
    const f = fixture(); delete f.channel.receivePresence; delete f.channel.sendPresence;
    await expect(f.bus.subscribe(roomId, f.accepted, f.catchUp, vi.fn())).rejects.toThrow('unavailable');
    expect(f.channel.close).toHaveBeenCalledTimes(1);
  });
  it('uses one normalized backend-only topic and validates both message directions', async () => {
    const f = fixture(); const subscription = await f.subscribe();
    expect(f.client.channel).toHaveBeenCalledWith(`vizly-backend:v1:${roomId}`);
    f.receive(notice); f.receive({ ...notice, content: 'not allowed' }); f.receive(null);
    expect(f.accepted).toHaveBeenCalledExactlyOnceWith(notice);
    await subscription.publish(notice); expect(f.channel.send).toHaveBeenCalledExactlyOnceWith(notice);
    await subscription.close(); f.receive(notice); expect(f.accepted).toHaveBeenCalledTimes(1);
  });
  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])('closes and sanitizes failed initial status %s', async status => {
    const f = fixture(status); await expect(f.subscribe()).rejects.toThrow(/^Private room notification unavailable$/);
    expect(f.channel.close).toHaveBeenCalledTimes(1);
  });
  it('keeps publication unavailable until rejoin then triggers durable catch-up', async () => {
    const f = fixture(); const subscription = await f.subscribe(); f.status('CHANNEL_ERROR'); f.receive(notice);
    await expect(subscription.publish(notice)).rejects.toThrow('unavailable'); expect(f.accepted).not.toHaveBeenCalled();
    f.status('SUBSCRIBED'); expect(f.catchUp).toHaveBeenCalledTimes(1); await subscription.publish(notice);
  });
  it('rejects duplicate, invalid and over-capacity subscriptions before opening an extra channel', async () => {
    const f = fixture(); await f.subscribe(); await expect(f.subscribe()).rejects.toThrow('unavailable');
    await expect(f.bus.subscribe('../../invalid', f.accepted, f.catchUp)).rejects.toThrow('unavailable');
    for (let index = 1; index < 64; index++) await f.bus.subscribe(`${index.toString(16).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, f.accepted, f.catchUp);
    await expect(f.bus.subscribe('ffffffff-aaaa-4aaa-8aaa-aaaaaaaaaaaa', f.accepted, f.catchUp)).rejects.toThrow('unavailable');
    expect(f.client.channel).toHaveBeenCalledTimes(64);
  });
  it('times out pending admission, unsubscribes, and allows a retry', async () => {
    vi.useFakeTimers(); const f = fixture(''); const pending = expect(f.subscribe()).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(8000); await pending; expect(f.channel.close).toHaveBeenCalledTimes(1);
    const retry = f.subscribe(); f.status('SUBSCRIBED'); await retry;
  });
  it('cancels and waits for pending admission during shutdown', async () => {
    const f = fixture(''); const admission = expect(f.subscribe()).rejects.toThrow('unavailable');
    const stop = f.bus.stop(); await Promise.all([admission, stop]); f.status('SUBSCRIBED');
    expect(f.catchUp).not.toHaveBeenCalled(); expect(f.channel.close).toHaveBeenCalledTimes(1); expect(f.client.disconnect).toHaveBeenCalledTimes(1);
  });
  it('bounds in-flight publication and waits for their completion during close', async () => {
    const f = fixture(); const subscription = await f.subscribe();
    let finish: (result: boolean) => void = () => { throw new Error('Missing send resolver'); };
    const sending = new Promise<boolean>(resolve => { finish = resolve; }); f.channel.send = vi.fn(async () => sending);
    const operations = Array.from({ length: 16 }, () => expect(subscription.publish(notice)).rejects.toThrow('unavailable'));
    await expect(subscription.publish(notice)).rejects.toThrow('unavailable');
    let disposed = false; const closing = subscription.close().then(() => { disposed = true; });
    await Promise.resolve(); expect(disposed).toBe(false); finish(true); await Promise.all([...operations, closing]);
    expect(f.channel.send).toHaveBeenCalledTimes(16);
  });
  it('times out publication without losing ownership of the channel', async () => {
    vi.useFakeTimers(); const f = fixture(); const subscription = await f.subscribe(); f.channel.send = vi.fn(() => new Promise<boolean>(() => undefined));
    const sending = expect(subscription.publish(notice)).rejects.toThrow('unavailable'); await vi.advanceTimersByTimeAsync(8000); await sending;
    expect(f.channel.close).not.toHaveBeenCalled();
  });
  it('rejects failed send receipts and sanitized transport exceptions', async () => {
    const f = fixture(); const subscription = await f.subscribe(); f.channel.send = vi.fn(async () => false);
    await expect(subscription.publish(notice)).rejects.toThrow(/^Private room notification unavailable$/);
    f.channel.send = vi.fn(async () => { throw new Error('Synthetic credential must not escape'); });
    await expect(subscription.publish(notice)).rejects.toThrow(/^Private room notification unavailable$/);
  });
  it('propagates close failure after attempting all cleanup and disconnects exactly once', async () => {
    const f = fixture(); await f.subscribe(); f.channel.close = vi.fn(async () => false);
    await expect(f.bus.stop()).rejects.toThrow(/^Private room notification disposal failed$/);
    expect(f.client.disconnect).toHaveBeenCalledTimes(1); buses.splice(0);
  });
});
