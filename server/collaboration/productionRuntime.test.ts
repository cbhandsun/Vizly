// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { createProductionCollaborationRuntime, type ProductionCollaborationDependencies } from './productionRuntime.js';
import { createDistributedRoomRegistry, type DistributedRecoveryStore } from './distributedRoomRegistry.js';
import { createDistributedRoomSync, type RoomNoticeBus } from './distributedRoomSync.js';
import type { AtomicRoomSnapshot, AtomicRoomStore } from './atomicRoomCommit.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import { createCollaborationAwareness } from '../../src/components/diagrams/collaboration/collaborationAwareness.js';
import { createCollaborationSocket } from '../../src/components/diagrams/collaboration/collaborationSocket.js';
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin = 'https://vizly.example.com';
const environment = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SYNTHETIC_ONLY',
  SUPABASE_SERVER_KEY: 'sb_secret_SYNTHETIC_ONLY', VIZLY_COLLABORATION_ORIGINS: origin };
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const fixture = () => {
  let current: AtomicRoomSnapshot | null = null;
  const control: DistributedRecoveryStore = {
    claim: async () => ({ generation, expiresAt: new Date(Date.now() + 30_000).toISOString() }),
    renew: async () => true, release: vi.fn(async () => true), inspectRecovery: async () => null,
    recoverCheckpoint: async () => { throw new Error('Unused recovery fixture'); },
  };
  const store: AtomicRoomStore = { read: async () => current,
    compareExchange: async (_id, admitted, version, record) => {
      if (current ? current.generation !== admitted || current.version !== version : version !== null) return false;
      current = { generation: admitted, version: String(BigInt(current?.version ?? '0') + 1n), record: Uint8Array.from(record) }; return true;
    },
  };
  const registry = createDistributedRoomRegistry(control, () => store);
  const bus: RoomNoticeBus = { subscribe: async () => ({ publish: async () => undefined,
    publishPresence: async () => undefined, close: async () => undefined }) };
  const cloudDoc = new Y.Doc(); const state = Y.encodeStateAsUpdate(cloudDoc); cloudDoc.destroy();
  const runtimeStop = vi.fn(() => registry.stop());
  const dependencies: ProductionCollaborationDependencies = {
    runtime: { ...registry, stop: runtimeStop, openRoomSynchronization: createDistributedRoomSync({
      source: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', bus, read: registry.readAdmittedSnapshot }) },
    authorize: async token => ['owner', 'viewer'].includes(token) ? { userId: token, role: token === 'owner' ? 'editor' : 'viewer' } : null,
    authorizeOwner: async token => token === 'owner' ? { userId: token, role: 'editor' } : null,
    readCloud: async () => ({ revision: '2026-10-09T00:00:00Z', base: state, state }),
    readRevision: async () => '2026-10-09T00:00:00Z',
  };
  const log = vi.fn(); const server = createProductionCollaborationRuntime(environment, dependencies, log);
  cleanup.push(() => server.stop());
  const peer = async (url: string, token: string) => {
    const doc = new Y.Doc();
    class TestSocket extends WebSocket { constructor(address: string) { super(address, { origin }); } }
    const provider = new WebsocketProvider(url, `vizly-room-${roomId}`, doc, { params: { token }, disableBc: true,
      awareness: createCollaborationAwareness(doc), WebSocketPolyfill: createCollaborationSocket(TestSocket as unknown as typeof globalThis.WebSocket) });
    for (const kind of [4, 5, 6]) provider.messageHandlers[kind] = () => undefined;
    cleanup.push(() => { provider.destroy(); doc.destroy(); });
    await vi.waitFor(() => expect(provider.synced).toBe(true), { timeout: 5000, interval: 10 });
    return { provider, doc, nodes: doc.getMap<unknown>('flowchart-nodes') };
  };
  return { server, dependencies, runtimeStop, control, peer, log, current: () => current };
};
describe('production HTTP server composition', () => {
  it('exports an unbound server and composes admitted persistence, authorization and recovery', async () => {
    const f = fixture(); expect(f.server.http.listening).toBe(false); const address = await f.server.listen();
    const owner = await f.peer(address.url, 'owner'); const viewer = await f.peer(address.url, 'viewer');
    const node = { id: 'one', position: { x: 10, y: 20 }, data: { label: 'one' } };
    publishCollaborationElement(owner.nodes, 'one', node);
    await vi.waitFor(() => expect(readCollaborationElement(viewer.nodes.get('one'))).toEqual(node));
    expect(f.current()?.generation).toBe(generation);
    const base = address.url.replace('ws:', 'http:');
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/recovery/vizly-room-${roomId}`, { headers: { authorization: 'Bearer viewer', origin } })).status).toBe(403);
  });
  it('rejects incomplete production configuration before composing any admission', async () => {
    const f = fixture(); const readCloud = vi.spyOn(f.dependencies, 'readCloud');
    expect(() => createProductionCollaborationRuntime({ ...environment, SUPABASE_SERVER_KEY: undefined }, f.dependencies)).toThrow(/^Invalid production collaboration configuration$/);
    expect(readCloud).not.toHaveBeenCalled(); expect(f.control.release).not.toHaveBeenCalled();
  });
  it('shares reentrant stop and retains failed store cleanup after HTTP cleanup', async () => {
    const f = fixture(); const { port } = await f.server.listen(); let reentered: Promise<void> | undefined;
    f.dependencies.runtime.stop = vi.fn(async () => {
      reentered = f.server.stop(); await f.runtimeStop(); throw new Error('Synthetic credential must not escape');
    });
    const stopped = f.server.stop(); expect(f.server.stop()).toBe(stopped);
    await expect(stopped).rejects.toThrow(/^Production collaboration disposal failed$/); expect(reentered).toBe(stopped);
    expect(f.dependencies.runtime.stop).toHaveBeenCalledTimes(1);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow(); cleanup.splice(0);
  });
});
