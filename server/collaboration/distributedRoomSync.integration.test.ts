// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { createDistributedRoomSync, type RoomNoticeBus, type RoomCommitNotice } from './distributedRoomSync.js';
import { createDistributedRoomRegistry, type DistributedRecoveryStore } from './distributedRoomRegistry.js';
import type { AtomicRoomSnapshot, AtomicRoomStore } from './atomicRoomCommit.js';
import { createCollaborationServer } from './server.js';
import { createRoomCoordinator } from './roomCoordinator.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import { createCollaborationAwareness } from '../../src/components/diagrams/collaboration/collaborationAwareness.js';
import { createCollaborationSocket } from '../../src/components/diagrams/collaboration/collaborationSocket.js';
import type { RoomPresenceFrame } from './distributedPresence.js';
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sources = ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
const origin = 'http://localhost:5417';
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });
const fixture = async () => {
  const listeners = new Set<(input: unknown) => void>(); const resume = new Set<() => void>();
  const presenceListeners = new Set<(input: unknown) => void>(); const presenceFrames: RoomPresenceFrame[] = [];
  const permissions = new Map(['first-editor', 'second-editor', 'viewer'].map(token => [token,
    { userId: token, role: token === 'viewer' ? 'viewer' as const : 'editor' as const }]));
  let deliver = true; let current: AtomicRoomSnapshot | null = null;
  const notices: RoomCommitNotice[] = [];
  const bus: RoomNoticeBus = { async subscribe(_id, receive, catchUp, receivePresence) {
    listeners.add(receive); resume.add(catchUp);
    if (receivePresence) presenceListeners.add(receivePresence);
    return { async publish(notice) { notices.push(notice); if (deliver) for (const listen of listeners) listen(notice); },
      async publishPresence(frame) { presenceFrames.push(frame); if (deliver) for (const listen of presenceListeners) listen(frame); },
      async close() { listeners.delete(receive); resume.delete(catchUp); if (receivePresence) presenceListeners.delete(receivePresence); } };
  } };
  const control: DistributedRecoveryStore = {
    claim: async () => ({ generation, expiresAt: new Date(Date.now() + 30_000).toISOString() }),
    renew: async () => true, release: async () => true, inspectRecovery: async () => null,
    recoverCheckpoint: async () => { throw new Error('Unused synthetic recovery'); },
  };
  const store: AtomicRoomStore = {
    read: vi.fn(async () => current),
    compareExchange: vi.fn(async (_id, admitted, version, record) => {
      if (current ? current.generation !== admitted || current.version !== version : version !== null) return false;
      current = { generation: admitted, version: String(BigInt(current?.version ?? '0') + 1n), record: Uint8Array.from(record) }; return true;
    }),
  };
  const cloudDoc = new Y.Doc(); const cloudState = Y.encodeStateAsUpdate(cloudDoc); cloudDoc.destroy();
  const endpoints: string[] = [];
  for (const source of sources) {
    const registry = createDistributedRoomRegistry(control, () => store);
    const synchronize = createDistributedRoomSync({ source, bus, read: registry.readAdmittedSnapshot, catchUpMs: 1000 });
    const coordinate = createRoomCoordinator(registry.persistence, async () => ({ revision: '2026-10-09T00:00:00Z', base: cloudState, state: cloudState }));
    const server = createCollaborationServer({ authorize: async token => permissions.get(token) ?? null,
      persistence: registry.persistence, acquireRoomLease: registry.acquireRoomLease, loadInitialRoom: coordinate,
      openRoomSynchronization: synchronize, origins: new Set([origin]), recheckMs: 40,
      readAcceptedRoomRevision: async id => (await registry.persistence.loadRecord(id))?.checkpoint?.revision });
    endpoints.push((await server.listen()).url);
    cleanup.push(async () => { await server.stop(); await registry.stop(); });
  }
  const peer = async (index: number, token: string, clientId?: number) => {
    const doc = new Y.Doc();
    if (clientId !== undefined) doc.clientID = clientId;
    class TestSocket extends WebSocket { constructor(address: string) { super(address, { origin }); } }
    const provider = new WebsocketProvider(endpoints[index], `vizly-room-${roomId}`, doc, { params: { token }, disableBc: true,
      awareness: createCollaborationAwareness(doc), WebSocketPolyfill: createCollaborationSocket(TestSocket as unknown as typeof globalThis.WebSocket) });
    for (const kind of [4, 5, 6]) provider.messageHandlers[kind] = () => undefined;
    cleanup.push(() => { provider.destroy(); doc.destroy(); });
    await vi.waitFor(() => expect(provider.synced).toBe(true), { timeout: 5000, interval: 10 });
    return { doc, provider, nodes: doc.getMap<unknown>('flowchart-nodes') };
  };
  return { peer, store, notices, listeners, resume, presenceFrames, presenceListeners, permissions,
    pause: () => { deliver = false; }, reconnect: () => { deliver = true; for (const callback of resume) callback(); },
    recoverGeneration: () => { if (!current) throw new Error('Missing test snapshot'); current = { ...current, generation: sources[0] }; } };
};
const element = (id: string) => ({ id, position: { x: 10, y: 20 }, data: { label: id } });
describe('document propagation between two actual WebSocket server instances', () => {
  it('propagates independent server-owned presence even when browser client IDs collide', async () => {
    const f = await fixture(); const first = await f.peer(0, 'first-editor', 0xffffffff); const second = await f.peer(1, 'second-editor', 0xffffffff);
    first.provider.awareness.setLocalState({ user: { name: 'forged' }, cursor: { x: 11, y: 22 } });
    second.provider.awareness.setLocalState({ user: { name: 'forged' }, cursor: { x: 33, y: 44 } });
    await vi.waitFor(() => {
      expect([...first.provider.awareness.getStates().values()]).toContainEqual({ user: { name: 'User second-e', color: '#0ea5e9' }, cursor: { x: 33, y: 44 } });
      expect([...second.provider.awareness.getStates().values()]).toContainEqual({ user: { name: 'User first-ed', color: '#0ea5e9' }, cursor: { x: 11, y: 22 } });
    });
    expect(first.provider.awareness.getLocalState()?.cursor).toEqual({ x: 11, y: 22 });
    expect(second.provider.awareness.getLocalState()?.cursor).toEqual({ x: 33, y: 44 });
    expect([...first.provider.awareness.getStates().keys()].some(id => id > 0xffffffff)).toBe(true);
    expect(f.presenceFrames.some(frame => frame.peers.some(peer => peer.userId === 'first-editor'))).toBe(true);
  });
  it('removes remote presence on disconnect and rejects delayed pre-disconnect frames', async () => {
    const f = await fixture(); const first = await f.peer(0, 'first-editor'); const viewer = await f.peer(1, 'viewer');
    first.provider.awareness.setLocalState({ cursor: { x: 55, y: 66 } });
    const hasRemote = () => [...viewer.provider.awareness.getStates().values()].some(state => state.user?.name === 'User first-ed');
    await vi.waitFor(() => expect(hasRemote()).toBe(true));
    const old = f.presenceFrames.findLast(frame => frame.peers.some(peer => peer.userId === 'first-editor' && peer.state !== null));
    expect(old).toBeDefined(); first.provider.disconnect();
    await vi.waitFor(() => expect(hasRemote()).toBe(false));
    for (const receive of f.presenceListeners) receive(old);
    await new Promise(resolve => setTimeout(resolve, 40)); expect(hasRemote()).toBe(false);
  });
  it('refreshes missed cursors after transport reconnect and removes revoked identities', async () => {
    const f = await fixture(); const first = await f.peer(0, 'first-editor'); const viewer = await f.peer(1, 'viewer');
    first.provider.awareness.setLocalState({ cursor: { x: 1, y: 2 } });
    const remote = () => [...viewer.provider.awareness.getStates().values()].find(state => state.user?.name === 'User first-ed');
    await vi.waitFor(() => expect(remote()?.cursor).toEqual({ x: 1, y: 2 })); f.pause();
    first.provider.awareness.setLocalState({ cursor: { x: 88, y: 99 } });
    await vi.waitFor(() => expect(f.presenceFrames.some(frame => frame.peers.some(peer => peer.state?.cursor?.x === 88))).toBe(true));
    expect(remote()?.cursor).toEqual({ x: 1, y: 2 }); f.reconnect();
    await vi.waitFor(() => expect(remote()?.cursor).toEqual({ x: 88, y: 99 }));
    const onClose = () => { first.provider.off('connection-close', onClose); first.provider.disconnect(); };
    first.provider.on('connection-close', onClose); f.permissions.delete('first-editor');
    await vi.waitFor(() => { expect(first.provider.wsconnected).toBe(false); expect(remote()).toBeUndefined(); });
  });
  it('converges concurrent independent edits, propagates deletion and bounds echoes', async () => {
    const f = await fixture(); const first = await f.peer(0, 'first-editor'); const second = await f.peer(1, 'second-editor');
    publishCollaborationElement(first.nodes, 'one', element('one')); publishCollaborationElement(second.nodes, 'two', element('two'));
    await vi.waitFor(() => { expect(readCollaborationElement(first.nodes.get('two'))).toEqual(element('two')); expect(readCollaborationElement(second.nodes.get('one'))).toEqual(element('one')); });
    first.nodes.delete('one'); await vi.waitFor(() => expect(second.nodes.has('one')).toBe(false));
    await vi.waitFor(() => expect(f.notices.length).toBeGreaterThanOrEqual(3));
    expect(f.notices.length).toBeLessThanOrEqual(5);
    expect(f.notices.every(notice => Object.keys(notice).sort().join(',') === 'generation,source,version')).toBe(true);
  });
  it('catches a missed commit after bus reconnect without a local user edit', async () => {
    const f = await fixture(); const editor = await f.peer(0, 'first-editor'); const viewer = await f.peer(1, 'viewer'); f.pause();
    publishCollaborationElement(editor.nodes, 'missed', element('missed'));
    await vi.waitFor(() => expect(f.notices).toHaveLength(1)); expect(viewer.nodes.has('missed')).toBe(false);
    f.reconnect(); await vi.waitFor(() => expect(readCollaborationElement(viewer.nodes.get('missed'))).toEqual(element('missed')));
  });
  it('periodically catches dropped notifications and reloads durable state on client reconnect', async () => {
    const f = await fixture(); const editor = await f.peer(0, 'first-editor'); const observer = await f.peer(1, 'second-editor'); f.pause();
    publishCollaborationElement(editor.nodes, 'poll', element('poll'));
    await vi.waitFor(() => expect(readCollaborationElement(observer.nodes.get('poll'))).toEqual(element('poll')), { timeout: 3000 });
    observer.provider.disconnect();
    publishCollaborationElement(editor.nodes, 'offline', element('offline'));
    await vi.waitFor(() => expect(f.notices.length).toBeGreaterThanOrEqual(2)); observer.provider.connect();
    await vi.waitFor(() => expect(readCollaborationElement(observer.nodes.get('offline'))).toEqual(element('offline')), { timeout: 5000 });
  });
  it('closes peers on authoritative generation change and refuses to merge old history', async () => {
    const f = await fixture(); const first = await f.peer(0, 'first-editor'); const second = await f.peer(1, 'second-editor');
    const disconnected = [first, second].map(client => new Promise<void>(resolve => {
      const onClose = () => { client.provider.off('connection-close', onClose); client.provider.disconnect(); resolve(); };
      client.provider.on('connection-close', onClose);
    }));
    f.recoverGeneration(); f.reconnect(); await Promise.all(disconnected);
    expect(first.provider.wsconnected).toBe(false); expect(second.provider.wsconnected).toBe(false);
  });
});
