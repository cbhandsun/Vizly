// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
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
