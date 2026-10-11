// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { BoundedRealtimeSocket } from './boundedRealtimeSocket.js';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0)) await dispose(); });
const pair = async () => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (typeof address === 'string' || !address) throw new Error('Missing test address');
  const connection = new Promise<WebSocket>(resolve => server.once('connection', resolve));
  const socket = new BoundedRealtimeSocket(`ws://127.0.0.1:${address.port}`);
  await new Promise<void>(resolve => { socket.onopen = () => resolve(); });
  const peer = await connection;
  cleanup.push(async () => { socket.close(); for (const client of server.clients) client.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { socket, peer };
};
describe('bounded realtime native/DOM transport bridge', () => {
  it('delivers DOM callbacks and listeners for bounded text and binary frames', async () => {
    const { socket, peer } = await pair(); const messages: unknown[] = []; const listener = vi.fn();
    socket.onmessage = event => { expect(event).toBeInstanceOf(MessageEvent); messages.push(event.data); };
    socket.addEventListener('message', listener);
    peer.send('metadata'); peer.send(Uint8Array.from([1, 2, 3]));
    await vi.waitFor(() => expect(messages).toHaveLength(2));
    expect(messages[0]).toBe('metadata'); expect(messages[1]).toEqual(Uint8Array.from([1, 2, 3]).buffer);
    socket.removeEventListener('message', listener); peer.send('after-removal');
    await vi.waitFor(() => expect(messages).toHaveLength(3)); expect(listener).toHaveBeenCalledTimes(2);
    const sent = new Promise<string>(resolve => peer.once('message', data => resolve(data.toString())));
    socket.send('outbound'); expect(await sent).toBe('outbound');
    expect(socket.readyState).toBe(socket.OPEN); expect(socket.binaryType).toBe('arraybuffer');
  });
  it('rejects oversized inbound frames before delivering a message and suppresses raw errors', async () => {
    const { socket, peer } = await pair(); socket.onmessage = vi.fn(); socket.onerror = vi.fn();
    const closed = new Promise<number>(resolve => peer.once('close', code => resolve(code)));
    peer.send('x'.repeat(16 * 1024 + 1)); expect(await closed).toBe(1009);
    expect(socket.onmessage).not.toHaveBeenCalled(); expect(socket.onerror).toHaveBeenCalledWith(expect.any(Event));
  });
  it('checks outbound UTF-8 byte limits and unsupported encodings', async () => {
    const { socket } = await pair();
    expect(() => socket.send('汉'.repeat(6000))).toThrow('budget exceeded');
    expect(() => socket.send(new Uint8Array(16 * 1024 + 1))).toThrow('budget exceeded');
    expect(() => socket.send(new Blob(['unsupported']))).toThrow('encoding');
    expect(() => { socket.binaryType = 'blob'; }).toThrow('encoding');
  });
  it('closes instead of leaking an SDK parser exception through EventTarget', async () => {
    const { socket, peer } = await pair(); socket.onmessage = () => { throw new Error('Synthetic sensitive parser input'); };
    const closed = new Promise<number>(resolve => peer.once('close', code => resolve(code)));
    peer.send('invalid metadata'); expect(await closed).toBe(1008);
  });
});
