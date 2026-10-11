// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';
import { BoundedRealtimeSocket } from './boundedRealtimeSocket.js';
const notice = { source: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', generation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', version: '1' };
it.each([
  { event: 'committed', payload: notice },
  { event: 'presence', payload: { source: notice.source, generation: notice.generation, sequence: 1,
    peers: [{ clientId: 42, userId: 'synthetic-user', state: { cursor: { x: 1, y: 2 } } }] } },
])('exchanges actual Supabase SDK private $event join/binary broadcast/ack over bounded loopback transport', async ({ event: broadcastEvent, payload: broadcastPayload }) => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  let joinConfig: unknown; let sentNotice: unknown;
  const protocolErrors: string[] = [];
  const client = createClient(`http://127.0.0.1:${address.port}`, 'sb_secret_SYNTHETIC_ONLY', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: BoundedRealtimeSocket, timeout: 1000, logger: () => undefined },
  });
  server.on('connection', socket => {
    socket.on('message', (raw, binary) => {
      try {
        const buffer = raw instanceof ArrayBuffer ? Buffer.from(raw) : Array.isArray(raw) ? Buffer.concat(raw) : raw;
        if (!binary) {
          const packet: unknown = JSON.parse(buffer.toString('utf8'));
          if (!Array.isArray(packet) || packet.length !== 5) throw new Error('Invalid JSON packet');
          const [joinRef, ref, topic, event, payload] = packet;
          if (event === 'phx_join') {
            if (!payload || typeof payload !== 'object' || !('config' in payload)) throw new Error('Missing join config');
            joinConfig = payload.config;
            socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }]));
          } else if (event === 'heartbeat' || event === 'phx_leave') {
            socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
          }
        } else {
          if (buffer.length < 7 || buffer[0] !== 3 || buffer[6] !== 1) throw new Error('Invalid JSON broadcast packet');
          const lengths = [...buffer.subarray(1, 6)]; const fields: string[] = []; let offset = 7;
          for (const length of lengths) { if (offset + length > buffer.length) throw new Error('Invalid binary header'); fields.push(buffer.subarray(offset, offset + length).toString('utf8')); offset += length; }
          const [joinRef, ref, topic, event] = fields;
          sentNotice = JSON.parse(buffer.subarray(offset).toString('utf8'));
          socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
          socket.send(JSON.stringify([null, null, topic, 'broadcast', { event, payload: sentNotice, type: 'broadcast' }]));
        }
      } catch { protocolErrors.push('Synthetic protocol mismatch'); socket.close(1008); }
    });
  });
  const channel = client.channel('vizly-backend:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
    config: { private: true, broadcast: { ack: true, self: false }, presence: { enabled: false } },
  });
  const received = vi.fn(); channel.on('broadcast', { event: broadcastEvent }, received);
  try {
    await new Promise<void>((resolve, reject) => channel.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve(); else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Synthetic join failed'));
    }));
    expect(joinConfig).toEqual(expect.objectContaining({ private: true, broadcast: { ack: true, self: false }, presence: expect.objectContaining({ enabled: false }) }));
    expect(await channel.send({ type: 'broadcast', event: broadcastEvent, payload: broadcastPayload }, { timeout: 1000 })).toBe('ok');
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0][0]).toEqual(expect.objectContaining({ payload: broadcastPayload }));
    expect(sentNotice).toEqual(broadcastPayload); expect(protocolErrors).toEqual([]);
    expect(await client.removeChannel(channel)).toBe('ok');
  } finally {
    client.realtime.disconnect(); for (const socket of server.clients) socket.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
