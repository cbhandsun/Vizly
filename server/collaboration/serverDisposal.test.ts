// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as decoding from 'lib0/decoding';
import { COLLABORATION_RESUME_PROTOCOL, COORDINATION_STATUS_MESSAGE } from './coordinationStatus.js';
import { createCollaborationServer } from './server.js';
import type { DistributedRoomLease } from './distributedRoomLease.js';
import type { RoomSynchronization } from './distributedRoomSync.js';
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin = 'http://localhost:5417';
describe('collaboration shutdown failure receipts', () => {
  it('exports the HTTP server and can dispose a function instance without binding a listener', async () => {
    const server = createCollaborationServer({ authorize: async () => null,
      persistence: { load: async () => null, save: async () => undefined }, origins: new Set([origin]) });
    expect(server.http.listening).toBe(false); await expect(server.stop()).resolves.toBeUndefined();
    expect(server.stop()).toBe(server.stop());
  });
  it.each(['lease', 'subscription'])('finishes socket/HTTP cleanup but rejects a failed %s disposal', async failing => {
    const controller = new AbortController();
    const lease: DistributedRoomLease = { leaseId: roomId, generation, signal: controller.signal,
      assertActive: () => { if (controller.signal.aborted) throw new Error('Synthetic expired lease'); },
      close: vi.fn(async () => { controller.abort(); if (failing === 'lease') throw new Error('Synthetic credential must not escape'); }) };
    const synchronization: RoomSynchronization = { assertActive: () => undefined, notifyCommitted: async () => undefined,
      close: vi.fn(async () => { if (failing === 'subscription') throw new Error('Synthetic credential must not escape'); }) };
    const server = createCollaborationServer({ authorize: async () => ({ userId: 'synthetic-editor', role: 'editor' }),
      persistence: { load: async () => null, save: async () => undefined }, acquireRoomLease: async () => lease,
      openRoomSynchronization: async () => synchronization, origins: new Set([origin]) });
    const { url, port } = await server.listen();
    const socket = new WebSocket(`${url}/vizly-room-${roomId}?token=synthetic`, { origin });
    let reentrant: Promise<void> | undefined;
    controller.signal.addEventListener('abort', () => { reentrant = server.stop(); });
    try {
      await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
      const stopped = server.stop();
      await expect(stopped).rejects.toThrow(/^Collaboration service disposal failed$/);
      expect(reentrant).toBe(stopped); expect(server.stop()).toBe(stopped);
      expect(lease.close).toHaveBeenCalledTimes(1); expect(synchronization.close).toHaveBeenCalledTimes(1);
      await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
    } finally { socket.terminate(); await server.stop().catch(() => undefined); }
  });
});

it('keeps planned socket retirement alive until the room lease has been released', async () => {
  let releaseLease!: () => void;
  const closeLease = vi.fn(() => new Promise<void>(resolve => { releaseLease = resolve; }));
  const tasks: Promise<void>[] = [];
  const server = createCollaborationServer({
    authorize: async () => ({ userId: 'synthetic-editor', role: 'editor' }),
    persistence: { load: async () => null, save: async () => undefined },
    acquireRoomLease: async () => ({ leaseId: roomId, generation, signal: new AbortController().signal,
      assertActive() {}, close: closeLease }),
    origins: new Set([origin]), socketLifetimeMs: 100, waitForBackground: task => tasks.push(task),
  });
  const { url } = await server.listen();
  const socket = new WebSocket(`${url}/vizly-room-${roomId}?token=synthetic`, COLLABORATION_RESUME_PROTOCOL, { origin });
  try {
    const closeCode = await new Promise<number>((resolve, reject) => {
      socket.once('close', resolve);
      socket.once('error', reject);
    });
    expect(closeCode).toBe(1012);
    await vi.waitFor(() => expect(closeLease).toHaveBeenCalledTimes(1));
    expect(tasks).toHaveLength(1);
    let completed = false;
    void tasks[0].then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    releaseLease();
    await tasks[0];
    expect(completed).toBe(true);
  } finally {
    releaseLease?.();
    socket.terminate();
    await server.stop();
  }
});

it('pauses a legacy peer on lost lease and lets a current peer reconnect', async () => {
  const lease = new AbortController();
  const server = createCollaborationServer({
    authorize: async () => ({ userId: 'synthetic-editor', role: 'editor' }),
    persistence: { load: async () => null, save: async () => undefined },
    acquireRoomLease: async () => ({ leaseId: roomId, generation, signal: lease.signal,
      assertActive() { lease.signal.throwIfAborted(); }, async close() {} }),
    origins: new Set([origin]),
  });
  const { url } = await server.listen();
  const room = `${url}/vizly-room-${roomId}?token=synthetic`;
  const old = new WebSocket(room, { origin });
  const current = new WebSocket(room, COLLABORATION_RESUME_PROTOCOL, { origin });
  const inspect = (socket: WebSocket) => {
    const control: string[] = [];
    socket.on('message', data => {
      if (!Buffer.isBuffer(data)) return;
      const decoder = decoding.createDecoder(data);
      if (decoding.readVarUint(decoder) === COORDINATION_STATUS_MESSAGE) control.push(decoding.readVarString(decoder));
    });
    const opened = new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const closed = new Promise<number>(resolve => socket.once('close', resolve));
    return { control, opened, closed };
  };
  const legacy = inspect(old);
  const modern = inspect(current);
  try {
    await Promise.all([legacy.opened, modern.opened]);
    lease.abort();
    expect(await Promise.all([legacy.closed, modern.closed])).toEqual([1013, 1013]);
    expect(legacy.control).toEqual(['cloud-unavailable']);
    expect(modern.control).toEqual([]);
  } finally {
    old.terminate();
    current.terminate();
    await server.stop();
  }
});
