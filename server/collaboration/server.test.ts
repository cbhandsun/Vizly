// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { createCollaborationServer, type CollaborationServerOptions } from './server.js';
import type { DistributedRoomLease } from './distributedRoomLease.js';
import type { DiagramPermission } from './authorization.js';
import type { RoomPersistence } from './persistence.js';
import { createCollaborationAwareness } from '../../src/components/diagrams/collaboration/collaborationAwareness.js';
import { createCollaborationSocket } from '../../src/components/diagrams/collaboration/collaborationSocket.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';

const diagram = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherDiagram = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin = 'http://localhost:5417';
const node = (id: string) => ({ id, position: { x: 10, y: 20 }, data: { label: id } });
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });

const setup = async (overrides: Partial<RoomPersistence> = {}, authorizationDelayMs = 0,
  acquireRoomLease?: CollaborationServerOptions['acquireRoomLease']) => {
  const permissions = new Map<string, DiagramPermission>([
    ['owner-test', { userId: 'owner-verified', role: 'editor' }],
    ['editor-test', { userId: 'editor-verified', role: 'editor' }],
    ['viewer-test', { userId: 'viewer-verified', role: 'viewer' }],
  ]);
  const stored = new Map<string, Uint8Array>();
  const persistence: RoomPersistence = {
    load: async id => stored.get(id) ?? null,
    save: async (id, bytes) => { stored.set(id, Uint8Array.from(bytes)); },
    ...overrides,
  };
  const authorize = vi.fn(async (token: string, id: string) => {
    if (authorizationDelayMs) await new Promise(resolve => setTimeout(resolve, authorizationDelayMs));
    return id === diagram || id === otherDiagram ? permissions.get(token) ?? null : null;
  });
  const log = vi.fn();
  const server = createCollaborationServer({ authorize, persistence, acquireRoomLease, origins: new Set([origin]), recheckMs: 40, log });
  const address = await server.listen();
  cleanup.push(() => server.stop());
  return { ...address, server, permissions, stored, authorize, log };
};
const peer = async (url: string, token: string, id = diagram) => {
  const doc = new Y.Doc();
  class TestSocket extends WebSocket {
    constructor(address: string) { super(address, { origin }); }
  }
  const provider = new WebsocketProvider(url, `vizly-room-${id}`, doc, {
    params: { token }, disableBc: true, awareness: createCollaborationAwareness(doc), WebSocketPolyfill: createCollaborationSocket(TestSocket as unknown as typeof globalThis.WebSocket),
  });
  provider.messageHandlers[4] = () => undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    provider.destroy(); doc.destroy();
  };
  cleanup.push(dispose);
  await vi.waitFor(() => expect(provider.synced).toBe(true), { timeout: 5000, interval: 10 });
  return { doc, provider, dispose, nodes: doc.getMap<unknown>('flowchart-nodes'), edges: doc.getMap<unknown>('flowchart-edges') };
};
const raw = async (url: string, token: string, rawOrigin = origin, id = diagram) => {
  const socket = new WebSocket(`${url}/vizly-room-${id}?token=${token}`, { origin: rawOrigin });
  cleanup.push(() => socket.terminate());
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return socket;
};
const sendDoc = (socket: WebSocket, doc: Y.Doc) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  sync.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
  socket.send(encoding.toUint8Array(encoder));
};
const setPeerElement = (client: Awaited<ReturnType<typeof peer>>, kind: 'nodes' | 'edges', id: string, value: unknown) => {
  const elements = client[kind];
  const previous = readCollaborationElement(elements.get(id)) ?? undefined;
  client.doc.transact(() => {
    if (!publishCollaborationElement(elements, id, value, previous)) throw new Error('Invalid synthetic element');
  });
};

describe('authenticated collaboration over actual loopback WebSockets', () => {
  const externalLease = () => {
    const controller = new AbortController();
    const lease: DistributedRoomLease = {
      leaseId: diagram, generation: otherDiagram, signal: controller.signal,
      assertActive: () => { if (controller.signal.aborted) throw new Error('Synthetic room lease inactive'); },
      close: vi.fn(async () => undefined),
    };
    return { lease, controller };
  };
  it('closes every peer when the shared room lease is lost and releases it on retirement', async () => {
    const { lease, controller } = externalLease();
    const acquireRoomLease = vi.fn(async () => lease);
    const runtime = await setup({}, 0, acquireRoomLease);
    const first = await peer(runtime.url, 'owner-test'); const second = await peer(runtime.url, 'editor-test');
    const disconnected = [first, second].map(client => new Promise<void>(resolve => client.provider.on('connection-close', () => resolve())));
    controller.abort(); await Promise.all(disconnected);
    first.dispose(); second.dispose(); await runtime.server.stop();
    expect(acquireRoomLease).toHaveBeenCalledTimes(1); expect(lease.close).toHaveBeenCalledTimes(1);
  });
  it('rejects admission and releases the shared lease when it expires during room loading', async () => {
    const { lease, controller } = externalLease();
    const runtime = await setup({ load: async () => { controller.abort(); return null; } }, 0, async () => lease);
    await expect(raw(runtime.url, 'owner-test')).rejects.toThrow('403');
    expect(lease.close).toHaveBeenCalledTimes(1);
  });
  it('never broadcasts a late persistence response after the room lease is lost', async () => {
    const { lease, controller } = externalLease();
    const save = vi.fn(async () => { controller.abort(); });
    const runtime = await setup({ save }, 0, async () => lease);
    const observer = await peer(runtime.url, 'viewer-test'); const sender = await raw(runtime.url, 'editor-test');
    const changed = new Y.Doc();
    try {
      publishCollaborationElement(changed.getMap('flowchart-nodes'), 'late', node('late'));
      const closed = new Promise<void>(resolve => sender.once('close', () => resolve()));
      sendDoc(sender, changed); await closed;
      expect(observer.nodes.has('late')).toBe(false); expect(save).toHaveBeenCalledTimes(1);
    } finally { changed.destroy(); }
  });
  it('broadcasts committed remote changes returned by a shared persistence store', async () => {
    const remote = new Y.Doc();
    cleanup.push(() => remote.destroy());
    publishCollaborationElement(remote.getMap('flowchart-nodes'), 'remote', node('remote'));
    const save = vi.fn(async (_id: string, submitted: Uint8Array) => {
      Y.applyUpdate(remote, submitted);
      return Y.encodeStateAsUpdate(remote);
    });
    const runtime = await setup({ save });
    const first = await peer(runtime.url, 'owner-test');
    const second = await peer(runtime.url, 'editor-test');
    setPeerElement(first, 'nodes', 'local', node('local'));
    await vi.waitFor(() => {
      for (const client of [first, second]) {
        expect(readCollaborationElement(client.nodes.get('local'))).toEqual(node('local'));
        expect(readCollaborationElement(client.nodes.get('remote'))).toEqual(node('remote'));
      }
    });
    expect(save).toHaveBeenCalled();
  });

  it('rejects a stale committed receipt before broadcasting the submitted edit', async () => {
    const empty = new Y.Doc();
    const stale = Y.encodeStateAsUpdate(empty);
    empty.destroy();
    const runtime = await setup({ save: async () => stale });
    const observer = await peer(runtime.url, 'viewer-test');
    const sender = await raw(runtime.url, 'editor-test');
    const edited = new Y.Doc();
    try {
      publishCollaborationElement(edited.getMap('flowchart-nodes'), 'uncommitted', node('uncommitted'));
      const closed = new Promise<number>(resolve => sender.once('close', code => resolve(code)));
      sendDoc(sender, edited);
      expect(await closed).toBe(1008);
      expect(observer.nodes.has('uncommitted')).toBe(false);
      expect(runtime.log).toHaveBeenCalledWith('persistence-failed');
    } finally { edited.destroy(); }
  });

  it('serves over 64 sequential diagrams and reloads a disconnected room from durable state', async () => {
    const stored = new Map<string, Uint8Array>();
    const load = vi.fn(async (id: string) => stored.get(id) ?? null);
    const server = createCollaborationServer({
      authorize: async () => ({ userId: 'verified-owner', role: 'editor' }),
      persistence: { load, save: async (id, state) => { stored.set(id, Uint8Array.from(state)); } },
      origins: new Set([origin]),
    });
    cleanup.push(() => server.stop());
    const { url } = await server.listen();
    for (let index = 0; index < 70; index++) {
      const id = `${index.toString(16).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
      const client = await peer(url, 'owner-test', id);
      if (index === 0) {
        setPeerElement(client, 'nodes', 'durable', node('durable'));
        await vi.waitFor(() => expect(stored.has(id)).toBe(true));
      }
      const disconnected = new Promise<void>(resolve => client.provider.on('connection-close', () => resolve()));
      client.provider.disconnect();
      await disconnected;
      client.dispose();
    }
    const firstId = '00000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const reopened = await peer(url, 'owner-test', firstId);
    expect(readCollaborationElement(reopened.nodes.get('durable'))).toEqual(node('durable'));
    expect(load.mock.calls.filter(([id]) => id === firstId)).toHaveLength(2);
  }, 15_000);

  it('preserves concurrent text and drag edits to one node on both clients and disk', async () => {
    const runtime = await setup();
    const first = await peer(runtime.url, 'owner-test');
    const second = await peer(runtime.url, 'editor-test');
    const baseline = node('shared');
    setPeerElement(first, 'nodes', baseline.id, baseline);
    await vi.waitFor(() => {
      expect(first.nodes.get(baseline.id)).toBeInstanceOf(Y.Map);
      expect(second.nodes.get(baseline.id)).toBeInstanceOf(Y.Map);
    });
    first.doc.transact(() => publishCollaborationElement(first.nodes, baseline.id,
      { ...baseline, data: { label: 'Edited by first' } }, baseline));
    second.doc.transact(() => publishCollaborationElement(second.nodes, baseline.id,
      { ...baseline, position: { x: 99, y: 88 } }, baseline));
    const expected = { ...baseline, data: { label: 'Edited by first' }, position: { x: 99, y: 88 } };
    await vi.waitFor(() => {
      expect(readCollaborationElement(first.nodes.get(baseline.id))).toEqual(expected);
      expect(readCollaborationElement(second.nodes.get(baseline.id))).toEqual(expected);
      expect(first.provider.wsconnected).toBe(true);
      expect(second.provider.wsconnected).toBe(true);
    }, { timeout: 5000 });
    const persisted = new Y.Doc();
    try {
      Y.applyUpdate(persisted, runtime.stored.get(diagram)!);
      expect(readCollaborationElement(persisted.getMap('flowchart-nodes').get(baseline.id))).toEqual(expected);
    } finally { persisted.destroy(); }
  });

  it('upgrades a legacy persisted room before first synchronization without changing its canvas', async () => {
    const legacy = new Y.Doc();
    legacy.getMap('flowchart-nodes').set('legacy', node('legacy'));
    const state = Y.encodeStateAsUpdate(legacy);
    legacy.destroy();
    const runtime = await setup({ load: async () => state });
    const client = await peer(runtime.url, 'owner-test');
    expect(client.nodes.get('legacy')).toBeInstanceOf(Y.Map);
    expect(readCollaborationElement(client.nodes.get('legacy'))).toEqual(node('legacy'));
    const durable = new Y.Doc();
    try {
      Y.applyUpdate(durable, runtime.stored.get(diagram)!);
      expect(durable.getMap('flowchart-nodes').get('legacy')).toBeInstanceOf(Y.Map);
      expect(readCollaborationElement(durable.getMap('flowchart-nodes').get('legacy'))).toEqual(node('legacy'));
    } finally { durable.destroy(); }
  });

  it('rejects room access if a legacy field upgrade cannot be persisted', async () => {
    const legacy = new Y.Doc();
    legacy.getMap('flowchart-nodes').set('legacy', node('legacy'));
    const state = Y.encodeStateAsUpdate(legacy);
    legacy.destroy();
    const runtime = await setup({ load: async () => state, save: async () => { throw new Error('Synthetic disk failure'); } });
    const socket = new WebSocket(`${runtime.url}/vizly-room-${diagram}?token=owner-test`, { origin });
    cleanup.push(() => socket.terminate());
    const rejected = await new Promise<boolean>(resolve => {
      socket.once('error', () => resolve(true));
      socket.once('open', () => resolve(false));
    });
    expect(rejected).toBe(true);
    expect(runtime.stored.size).toBe(0);
    expect(runtime.log).toHaveBeenCalledWith('room-load-failed');
  });

  it('keeps real sockets connected during simultaneous 60Hz document dragging and cursor updates', async () => {
    const runtime = await setup({}, 120);
    const first = await peer(runtime.url, 'owner-test');
    const second = await peer(runtime.url, 'editor-test');
    let closed = false;
    first.provider.on('connection-close', () => { closed = true; });
    second.provider.on('connection-close', () => { closed = true; });
    for (let frame = 0; frame < 600; frame++) {
      setPeerElement(first, 'nodes', 'drag', { ...node('drag'), position: { x: frame, y: -frame } });
      first.provider.awareness.setLocalStateField('cursor', { x: frame, y: -frame });
      if (frame === 100) setPeerElement(second, 'nodes', 'peer-addition', node('peer-addition'));
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    await vi.waitFor(() => {
      expect(readCollaborationElement(second.nodes.get('drag'))).toEqual({ ...node('drag'), position: { x: 599, y: -599 } });
      expect(first.nodes.has('peer-addition')).toBe(true);
      expect(second.provider.awareness.getStates().get(first.doc.clientID)?.cursor).toEqual({ x: 599, y: -599 });
    }, { timeout: 5000 });
    expect(closed).toBe(false);
    expect(first.provider.wsconnected && second.provider.wsconnected).toBe(true);
    const persisted = new Y.Doc();
    try {
      Y.applyUpdate(persisted, runtime.stored.get(diagram)!);
      expect(readCollaborationElement(persisted.getMap('flowchart-nodes').get('drag'))).toEqual(readCollaborationElement(second.nodes.get('drag')));
      expect(persisted.getMap('flowchart-nodes').has('peer-addition')).toBe(true);
    } finally { persisted.destroy(); }
  }, 30_000);
  it('coalesces queued presence under slow authorization without dropping durable edits or final cursors', async () => {
    const runtime = await setup({}, 120);
    const first = await peer(runtime.url, 'owner-test');
    const second = await peer(runtime.url, 'editor-test');
    let closed = false;
    first.provider.on('connection-close', () => { closed = true; });
    second.provider.on('connection-close', () => { closed = true; });
    for (let frame = 0; frame < 700; frame++) {
      first.provider.awareness.setLocalStateField('cursor', { x: frame, y: -frame });
      if (frame === 150) setPeerElement(first, 'nodes', 'durable-a', node('durable-a'));
      if (frame === 400) setPeerElement(first, 'nodes', 'durable-b', node('durable-b'));
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    await vi.waitFor(() => {
      expect(second.provider.awareness.getStates().get(first.doc.clientID)?.cursor).toEqual({ x: 699, y: -699 });
      expect([...second.nodes.keys()].sort()).toEqual(['durable-a', 'durable-b']);
    }, { timeout: 5000 });
    const persisted = new Y.Doc();
    try {
      Y.applyUpdate(persisted, runtime.stored.get(diagram)!);
      expect([...persisted.getMap('flowchart-nodes').keys()].sort()).toEqual(['durable-a', 'durable-b']);
      expect(closed).toBe(false);
      expect(first.provider.wsconnected && second.provider.wsconnected).toBe(true);
    } finally { persisted.destroy(); }
  }, 30_000);
  it('forwards bounded cursors and the final high-frequency pointer state without disconnecting peers', async () => {
    const runtime = await setup();
    const first = await peer(runtime.url, 'owner-test');
    const second = await peer(runtime.url, 'editor-test');
    let closeCount = 0;
    first.provider.on('connection-close', () => { closeCount++; });
    second.provider.on('connection-close', () => { closeCount++; });
    for (let frame = 0; frame < 140; frame++) {
      first.provider.awareness.setLocalStateField('cursor', { x: frame, y: -frame });
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    await vi.waitFor(() => expect(second.provider.awareness.getStates().get(first.doc.clientID)?.cursor)
      .toEqual({ x: 139, y: -139 }));
    expect(first.provider.wsconnected).toBe(true);
    expect(second.provider.wsconnected).toBe(true);
    expect(closeCount).toBe(0);
    expect(runtime.stored.size).toBe(0);
  }, 10_000);
  it('keeps both clients connected when peer presence arrives without echoing the peer identity', async () => {
    const runtime = await setup();
    const first = await peer(runtime.url, 'owner-test');
    const second = await peer(runtime.url, 'editor-test');
    first.provider.awareness.setLocalStateField('user', { name: 'First', color: '#000000' });
    second.provider.awareness.setLocalStateField('user', { name: 'Second', color: '#000000' });
    await vi.waitFor(() => {
      expect(first.provider.awareness.getStates().has(second.provider.awareness.clientID)).toBe(true);
      expect(second.provider.awareness.getStates().has(first.provider.awareness.clientID)).toBe(true);
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(first.provider.wsconnected).toBe(true);
    expect(second.provider.wsconnected).toBe(true);
  });
  it('synchronizes two different identities, concurrent nodes, labels, edges and deletion of the last node', async () => {
    const runtime = await setup();
    const first = await peer(runtime.url, 'owner-test');
    const second = await peer(runtime.url, 'editor-test');
    setPeerElement(first, 'nodes', 'a', node('a'));
    setPeerElement(second, 'nodes', 'b', node('b'));
    await vi.waitFor(() => {
      expect([...first.nodes.keys()].sort()).toEqual(['a', 'b']);
      expect([...second.nodes.keys()].sort()).toEqual(['a', 'b']);
    });
    first.doc.transact(() => {
      setPeerElement(first, 'nodes', 'a', { ...node('a'), style: { backgroundColor: '#fff' }, data: { label: 'edited' } });
      setPeerElement(first, 'edges', 'edge', { id: 'edge', source: 'a', target: 'b', label: 'shared edge' });
    });
    await vi.waitFor(() => {
      expect(readCollaborationElement(second.nodes.get('a'))).toEqual(readCollaborationElement(first.nodes.get('a')));
      expect(readCollaborationElement(second.edges.get('edge'))).toEqual(readCollaborationElement(first.edges.get('edge')));
    });
    second.doc.transact(() => { second.edges.clear(); second.nodes.clear(); });
    await vi.waitFor(() => { expect(first.nodes.size).toBe(0); expect(first.edges.size).toBe(0); });
    expect(runtime.stored.has(diagram)).toBe(true);
    expect(new Set(runtime.authorize.mock.results.map(result => result.type))).toEqual(new Set(['return']));
  });

  it('rejects unauthenticated clients and untrusted origins before upgrading', async () => {
    const runtime = await setup();
    await expect(raw(runtime.url, 'outsider-test')).rejects.toThrow('403');
    await expect(raw(runtime.url, 'owner-test', 'https://untrusted.example')).rejects.toThrow('403');
    expect(runtime.stored.size).toBe(0);
  });

  it('allows viewer synchronization but rejects direct protocol writes without persisting them', async () => {
    const runtime = await setup();
    const editor = await peer(runtime.url, 'owner-test');
    setPeerElement(editor, 'nodes', 'a', node('a'));
    await vi.waitFor(() => expect(runtime.stored.has(diagram)).toBe(true));
    const viewer = await peer(runtime.url, 'viewer-test');
    expect(viewer.nodes.has('a')).toBe(true);
    const socket = await raw(runtime.url, 'viewer-test');
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    const attacker = new Y.Doc();
    publishCollaborationElement(attacker.getMap('flowchart-nodes'), 'attack', node('attack'));
    sendDoc(socket, attacker);
    expect(await closed).toBe(1008);
    expect(editor.nodes.has('attack')).toBe(false);
    const storedDoc = new Y.Doc();
    Y.applyUpdate(storedDoc, runtime.stored.get(diagram)!);
    expect(storedDoc.getMap('flowchart-nodes').has('attack')).toBe(false);
    storedDoc.destroy(); attacker.destroy();
  });

  it('closes an existing connection after revocation and rejects reconnection', async () => {
    const runtime = await setup();
    const socket = await raw(runtime.url, 'editor-test');
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    runtime.permissions.delete('editor-test');
    expect(await closed).toBe(1008);
    await expect(raw(runtime.url, 'editor-test')).rejects.toThrow('403');
  });

  it('updates a connected editor role and rejects writes after downgrade', async () => {
    const runtime = await setup();
    const socket = await raw(runtime.url, 'editor-test');
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    runtime.permissions.set('editor-test', { userId: 'editor-verified', role: 'viewer' });
    const candidate = new Y.Doc();
    publishCollaborationElement(candidate.getMap('flowchart-nodes'), 'forbidden', node('forbidden'));
    sendDoc(socket, candidate);
    expect(await closed).toBe(1008);
    expect(runtime.stored.size).toBe(0);
    candidate.destroy();
  });

  it('restores the persisted room after a server restart and supports repeated shutdown', async () => {
    const runtime = await setup();
    const writer = await peer(runtime.url, 'owner-test');
    setPeerElement(writer, 'nodes', 'persistent', node('persistent'));
    await vi.waitFor(() => expect(runtime.stored.has(diagram)).toBe(true));
    writer.provider.disconnect();
    await runtime.server.stop();
    await runtime.server.stop();
    const restarted = createCollaborationServer({
      authorize: runtime.authorize, origins: new Set([origin]),
      persistence: { load: async id => runtime.stored.get(id) ?? null, save: async (id, state) => { runtime.stored.set(id, state); } },
    });
    const address = await restarted.listen();
    cleanup.push(() => restarted.stop());
    const reader = await peer(address.url, 'viewer-test');
    expect(reader.nodes.has('persistent')).toBe(true);
  });

  it.each([new Uint8Array([255]), new Uint8Array(2 * 1024 * 1024 + 1)])('rejects malformed or excessive binary messages without accepting document content', async payload => {
    const runtime = await setup();
    const socket = await raw(runtime.url, 'owner-test');
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    socket.send(payload);
    expect([1008, 1009]).toContain(await closed);
    expect(runtime.stored.size).toBe(0);
  });

  it('isolates document rooms and synchronizes missed edits after disconnect and reconnect', async () => {
    const runtime = await setup();
    const first = await peer(runtime.url, 'owner-test');
    const second = await peer(runtime.url, 'editor-test');
    const unrelated = await peer(runtime.url, 'owner-test', otherDiagram);
    second.provider.disconnect();
    setPeerElement(first, 'nodes', 'offline-edit', node('offline-edit'));
    await vi.waitFor(() => expect(runtime.stored.has(diagram)).toBe(true));
    second.provider.connect();
    await vi.waitFor(() => expect(second.nodes.has('offline-edit')).toBe(true));
    expect(unrelated.nodes.size).toBe(0);
  });

  it('rejects malformed and unsafe document updates atomically', async () => {
    const runtime = await setup();
    const socket = await raw(runtime.url, 'owner-test');
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    const invalid = new Y.Doc();
    invalid.getMap('flowchart-nodes').set('invalid', { id: 'invalid', position: { x: Infinity, y: 0 }, data: {} });
    sendDoc(socket, invalid);
    expect(await closed).toBe(1008);
    expect(runtime.stored.size).toBe(0);
    invalid.destroy();
  });

  it('rejects legacy whole-object runtime writes without altering the accepted room', async () => {
    const runtime = await setup();
    const reader = await peer(runtime.url, 'owner-test');
    setPeerElement(reader, 'nodes', 'accepted', node('accepted'));
    await vi.waitFor(() => expect(runtime.stored.has(diagram)).toBe(true));
    const before = Uint8Array.from(runtime.stored.get(diagram)!);
    const socket = await raw(runtime.url, 'editor-test');
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    const legacy = new Y.Doc();
    try {
      legacy.getMap('flowchart-nodes').set('old-writer', node('old-writer'));
      sendDoc(socket, legacy);
      expect(await closed).toBe(1008);
      expect(runtime.stored.get(diagram)).toEqual(before);
      expect([...reader.nodes.keys()]).toEqual(['accepted']);
      expect(reader.provider.wsconnected).toBe(true);
    } finally { legacy.destroy(); }
  });

  it('rejects malformed nested shared fields atomically', async () => {
    const runtime = await setup();
    const socket = await raw(runtime.url, 'owner-test');
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    const invalid = new Y.Doc();
    try {
      publishCollaborationElement(invalid.getMap('flowchart-nodes'), 'invalid', node('invalid'));
      const element = invalid.getMap<Y.Map<unknown>>('flowchart-nodes').get('invalid')!;
      const position = element.get('position');
      expect(position).toBeInstanceOf(Y.Map);
      if (!(position instanceof Y.Map)) throw new Error('Invalid shared fixture');
      position.set('x', Infinity);
      sendDoc(socket, invalid);
      expect(await closed).toBe(1008);
      expect(runtime.stored.size).toBe(0);
    } finally { invalid.destroy(); }
  });

  it('fails closed on persistence failure and preserves the last accepted canvas', async () => {
    const runtime = await setup({ save: async () => { throw new Error('Synthetic disk failure'); } });
    const reader = await peer(runtime.url, 'viewer-test');
    const socket = await raw(runtime.url, 'owner-test');
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    const candidate = new Y.Doc();
    publishCollaborationElement(candidate.getMap('flowchart-nodes'), 'uncommitted', node('uncommitted'));
    sendDoc(socket, candidate);
    expect(await closed).toBe(1008);
    expect(reader.nodes.size).toBe(0);
    expect(runtime.log).toHaveBeenCalledWith('persistence-failed');
    expect(runtime.log.mock.calls.flat().every(value => typeof value === 'string' && !value.includes('Synthetic disk'))).toBe(true);
    candidate.destroy();
  });

  it('fails closed if authorization throws or persisted state is invalid', async () => {
    const runtime = await setup({ load: async () => Uint8Array.from([255]) });
    await expect(raw(runtime.url, 'owner-test')).rejects.toThrow('403');
    runtime.authorize.mockRejectedValueOnce(new Error('Synthetic credential error'));
    await expect(raw(runtime.url, 'owner-test')).rejects.toThrow('403');
    expect(runtime.log).toHaveBeenCalledWith('authorization-failed');
  });
});
