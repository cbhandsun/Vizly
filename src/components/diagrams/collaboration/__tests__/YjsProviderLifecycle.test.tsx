import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc } from 'yjs';
import * as Y from 'yjs';
import type { Edge, Node } from '@xyflow/react';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { COLLABORATION_ACCESS_MESSAGE } from '../collaborationAccessProtocol';
import { COORDINATION_STATUS_MESSAGE } from '../../../../../server/collaboration/coordinationStatus';
import { CLOUD_REVISION_MESSAGE, writeAcceptedCloudRevision } from '../../../../../server/collaboration/cloudRevisionProtocol';
import { publishCollaborationElement, readCollaborationElement } from '../../../../../server/collaboration/documentModel';

const fixture = vi.hoisted(() => ({
  providers: [] as Array<{
    doc: Doc;
    destroyed: boolean;
    on: ReturnType<typeof vi.fn>;
  }>,
  flow: { setNodes: vi.fn(), setEdges: vi.fn() },
  failConstruction: false,
}));

vi.mock('@xyflow/react', () => ({ useReactFlow: () => fixture.flow }));
vi.mock('y-websocket', () => ({
  WebsocketProvider: class {
    destroyed = false;
    messageHandlers: Array<(_encoder: unknown, decoder: decoding.Decoder, _provider: unknown, server: boolean) => void> = [];
    on = vi.fn();
    off = vi.fn();
    awareness = {
      clientID: 1,
      setLocalStateField: vi.fn(),
      getStates: () => new Map([[1, { user: { name: 'Local test user', color: '#6366f1' } }]]),
      on: vi.fn(),
      off: vi.fn(),
    };
    constructor(_url: string, _room: string, public doc: Doc) {
      fixture.providers.push(this);
      if (fixture.failConstruction) throw new Error('Test connection creation failed');
    }
    destroy() { this.destroyed = true; }
  },
}));

import { useYjsCollaboration } from '../YjsProviderHooks';

const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
const options = { roomName: 'test-room', serverUrl: 'wss://collaboration.example.com' };
const grantServerAccess = (role = 'editor', server = true) => {
  const current = fixture.providers.at(-1);
  const encoder = encoding.createEncoder();
  encoding.writeVarString(encoder, role);
  const provider = current as unknown as { messageHandlers: Array<(_encoder: unknown, decoder: decoding.Decoder, _provider: unknown, server: boolean) => void> };
  act(() => {
    provider.messageHandlers[COLLABORATION_ACCESS_MESSAGE](null, decoding.createDecoder(encoding.toUint8Array(encoder)), provider, server);
    current?.on.mock.calls.find(call => call[0] === 'sync')?.[1](true);
  });
};

describe('collaboration connection ownership', () => {
  it('accepts revision only from the current server after the matching state, and retains it on failed canvas commit', () => {
    const commit = vi.fn(() => false);
    const hook = renderHook(() => useYjsCollaboration({ ...options, onRemoteSnapshot: commit }));
    const current = fixture.providers.at(-1)!;
    const provider = current as unknown as { messageHandlers: Array<(_encoder: unknown, decoder: decoding.Decoder, _provider: unknown, server: boolean) => void> };
    const peer = new Y.Doc();
    const revision = '2026-10-08T20:00:00.123457Z';
    const signal = (server: boolean) => {
      const encoder = encoding.createEncoder(); writeAcceptedCloudRevision(encoder, revision, peer);
      act(() => provider.messageHandlers[CLOUD_REVISION_MESSAGE](null, decoding.createDecoder(encoding.toUint8Array(encoder)), provider, server));
    };
    try {
      publishCollaborationElement(peer.getMap('flowchart-nodes'), 'a', { id: 'a', position: { x: 0, y: 0 }, data: { label: 'Accepted' } });
      signal(true); expect(commit).not.toHaveBeenCalled();
      act(() => Y.applyUpdate(current.doc, Y.encodeStateAsUpdate(peer)));
      expect(commit.mock.calls.at(-1)).toHaveLength(1);
      commit.mockClear(); signal(false); expect(commit).not.toHaveBeenCalled();
      signal(true); expect(commit).toHaveBeenLastCalledWith(expect.objectContaining({ nodes: [expect.objectContaining({ id: 'a' })] }), revision);
      commit.mockReturnValue(true);
      act(() => hook.result.current.pushLocalChangesToYjs([], []));
      expect(commit).toHaveBeenLastCalledWith(expect.any(Object), revision);
      expect(readCollaborationElement(current.doc.getMap('flowchart-nodes').get('a'))?.data).toEqual({ label: 'Accepted' });
      hook.unmount(); commit.mockClear(); signal(true); expect(commit).not.toHaveBeenCalled();
    } finally { peer.destroy(); }
  });
  const signalProblem = (value = 'cloud-conflict', server = true) => {
    const provider = fixture.providers.at(-1) as unknown as {
      messageHandlers: Array<(_encoder: unknown, decoder: decoding.Decoder, _provider: unknown, server: boolean) => void>;
      shouldConnect: boolean;
    };
    const encoder = encoding.createEncoder(); encoding.writeVarString(encoder, value);
    act(() => provider.messageHandlers[COORDINATION_STATUS_MESSAGE](null, decoding.createDecoder(encoding.toUint8Array(encoder)), provider, server));
    return provider;
  };
  it('preserves current state and blocks publication/reconnect after server conflict', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    grantServerAccess();
    const node: Node = { id: 'a', position: { x: 1, y: 2 }, data: { label: 'Retain' } };
    act(() => hook.result.current.pushLocalChangesToYjs([node], []));
    const current = fixture.providers.at(-1)!;
    const provider = signalProblem();
    expect(provider.shouldConnect).toBe(false);
    expect(hook.result.current).toMatchObject({ coordinationProblem: 'cloud-conflict', isSynced: false, wsStatus: 'disconnected' });
    grantServerAccess();
    act(() => {
      current.on.mock.calls.find(call => call[0] === 'status')?.[1]({ status: 'connected' });
      hook.result.current.pushLocalChangesToYjs([{ ...node, data: { label: 'Do not publish' } }], []);
    });
    expect(readCollaborationElement(current.doc.getMap('flowchart-nodes').get('a'))?.data).toEqual({ label: 'Retain' });
    expect(hook.result.current).toMatchObject({ coordinationProblem: 'cloud-conflict', isSynced: false, wsStatus: 'disconnected' });
    hook.unmount();
  });
  it('rejects forged peer or malformed coordination statuses', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    signalProblem('cloud-conflict', false); signalProblem('unknown');
    expect(hook.result.current.coordinationProblem).toBeNull();
    hook.unmount();
  });
  it('resets a stopped connection only on explicit recovery and ignores old messages', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    const old = signalProblem('cloud-unavailable');
    const before = hook.result.current.provider;
    act(() => hook.result.current.retryCollaboration());
    expect(hook.result.current.provider).not.toBe(before);
    expect(hook.result.current.coordinationProblem).toBeNull();
    const encoder = encoding.createEncoder(); encoding.writeVarString(encoder, 'cloud-conflict');
    act(() => old.messageHandlers[COORDINATION_STATUS_MESSAGE](null, decoding.createDecoder(encoding.toUint8Array(encoder)), old, true));
    expect(hook.result.current.coordinationProblem).toBeNull();
    hook.unmount();
  });
  beforeEach(() => {
    fixture.providers = [];
    fixture.flow = { setNodes: vi.fn(), setEdges: vi.fn() };
    fixture.failConstruction = false;
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('publishes the initial local presence without waiting for a later awareness change', () => {
    const hook = renderHook(() => useYjsCollaboration(options), { wrapper });
    expect(hook.result.current.activeUsers).toEqual([
      { clientId: 1, isLocal: true, user: { name: 'Local test user', color: '#6366f1' } },
    ]);
    hook.unmount();
  });

  it('replaces a stored Guest identity with the current account and refreshes it on account change', () => {
    sessionStorage.setItem('vizly_collaborator_name', 'Guest 589');
    sessionStorage.setItem('vizly_collaborator_color', '#6366f1');
    const hook = renderHook(({ userId }) => useYjsCollaboration({ ...options, userId }), {
      initialProps: { userId: '23c11572-1234-4567-89ab-123456789abc' },
    });
    const current = fixture.providers.at(-1) as unknown as {
      destroyed: boolean; awareness: { setLocalStateField: ReturnType<typeof vi.fn> };
    };
    expect(current.awareness.setLocalStateField).toHaveBeenCalledWith('user', { name: 'User 23c11572', color: '#0ea5e9' });
    hook.rerender({ userId: 'abcdef12-1234-4567-89ab-123456789abc' });
    expect(current.destroyed).toBe(true);
    const next = fixture.providers.at(-1) as unknown as { awareness: { setLocalStateField: ReturnType<typeof vi.fn> } };
    expect(next.awareness.setLocalStateField).toHaveBeenCalledWith('user', { name: 'User abcdef12', color: '#0ea5e9' });
    hook.rerender({ userId: '' });
    const signedOut = fixture.providers.at(-1) as unknown as { awareness: { setLocalStateField: ReturnType<typeof vi.fn> } };
    expect(signedOut.awareness.setLocalStateField).toHaveBeenCalledWith('user', { name: 'Guest 589', color: '#6366f1' });
    hook.unmount();
  });

  it('keeps an authenticated display identity when browser nickname storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    const hook = renderHook(() => useYjsCollaboration({ ...options, userId: '23c11572-1234-4567-89ab-123456789abc' }));
    const current = fixture.providers.at(-1) as unknown as { awareness: { setLocalStateField: ReturnType<typeof vi.fn> } };
    expect(current.awareness.setLocalStateField).toHaveBeenCalledWith('user', { name: 'User 23c11572', color: '#0ea5e9' });
    hook.unmount();
  });

  it('keeps a live connection after StrictMode effect replay and destroys every allocation on unmount', () => {
    const hook = renderHook(() => useYjsCollaboration(options), { wrapper });
    expect(hook.result.current.provider).not.toBeNull();
    const current = fixture.providers.find(provider => (provider as unknown) === hook.result.current.provider);
    expect(current?.destroyed).toBe(false);
    expect(current?.doc.isDestroyed).toBe(false);
    hook.unmount();
    expect(fixture.providers.every(provider => provider.destroyed && provider.doc.isDestroyed)).toBe(true);
  });

  it('does not close the connection when the ReactFlow facade changes', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    const provider = hook.result.current.provider;
    fixture.flow = { setNodes: vi.fn(), setEdges: vi.fn() };
    hook.rerender();
    expect(hook.result.current.provider).toBe(provider);
    expect(fixture.providers[0].destroyed).toBe(false);
    hook.unmount();
  });

  it('publishes unchanged node references into a newly selected room', () => {
    const node: Node = { id: 'node-1', position: { x: 0, y: 0 }, data: { label: 'Test' } };
    const hook = renderHook(({ roomName }) => useYjsCollaboration({ ...options, roomName }), {
      initialProps: { roomName: 'first-room' },
    });
    grantServerAccess();
    act(() => hook.result.current.pushLocalChangesToYjs([node], []));
    hook.rerender({ roomName: 'second-room' });
    grantServerAccess();
    act(() => hook.result.current.pushLocalChangesToYjs([node], []));
    expect(readCollaborationElement(fixture.providers.at(-1)?.doc.getMap('flowchart-nodes').get(node.id))).toEqual(node);
    hook.unmount();
  });

  it('allocates no connection for disabled or invalid configuration', () => {
    const hook = renderHook(() => useYjsCollaboration({ ...options, enabled: false }));
    expect(hook.result.current.provider).toBeNull();
    hook.unmount();
    const invalid = renderHook(() => useYjsCollaboration({ ...options, serverUrl: 'javascript:alert(1)' }));
    expect(invalid.result.current.provider).toBeNull();
    expect(fixture.providers).toHaveLength(0);
    invalid.unmount();
  });

  it('does not publish the local canvas before initial sync or without server edit permission', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    const node: Node = { id: 'stale', position: { x: 0, y: 0 }, data: {} };
    act(() => hook.result.current.pushLocalChangesToYjs([node], []));
    expect(fixture.providers[0].doc.getMap('flowchart-nodes').size).toBe(0);
    grantServerAccess('viewer');
    act(() => hook.result.current.pushLocalChangesToYjs([node], []));
    expect(fixture.providers[0].doc.getMap('flowchart-nodes').size).toBe(0);
    grantServerAccess();
    act(() => hook.result.current.pushLocalChangesToYjs([node], []));
    expect(fixture.providers[0].doc.getMap('flowchart-nodes').has('stale')).toBe(true);
    grantServerAccess('viewer');
    act(() => hook.result.current.pushLocalChangesToYjs([], []));
    expect(fixture.providers[0].doc.getMap('flowchart-nodes').has('stale')).toBe(true);
    hook.unmount();
  });

  it('keeps the verified viewer role during a transport disconnect and clears it for a new room', () => {
    const hook = renderHook(({ roomName }) => useYjsCollaboration({ ...options, roomName }), {
      initialProps: { roomName: 'viewer-room' },
    });
    grantServerAccess('viewer');
    expect(hook.result.current.accessRole).toBe('viewer');
    const provider = fixture.providers[0];
    act(() => provider.on.mock.calls.find(call => call[0] === 'status')?.[1]({ status: 'disconnected' }));
    expect(hook.result.current.accessRole).toBe('viewer');
    hook.rerender({ roomName: 'other-room' });
    expect(hook.result.current.accessRole).toBeNull();
    grantServerAccess();
    expect(hook.result.current.accessRole).toBe('editor');
    hook.unmount();
  });

  it('retains a verified editor change made during reconnect in the same Yjs document', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    grantServerAccess();
    const current = fixture.providers[0];
    const node: Node = { id: 'a', position: { x: 0, y: 0 }, data: { label: 'Before' } };
    act(() => hook.result.current.pushLocalChangesToYjs([node], []));
    act(() => {
      current.on.mock.calls.find(call => call[0] === 'status')?.[1]({ status: 'disconnected' });
      current.on.mock.calls.find(call => call[0] === 'sync')?.[1](false);
      hook.result.current.pushLocalChangesToYjs([{ ...node, data: { label: 'During reconnect' } }], []);
    });
    expect(readCollaborationElement(current.doc.getMap('flowchart-nodes').get('a'))?.data).toEqual({ label: 'During reconnect' });
    grantServerAccess();
    expect(fixture.flow.setNodes).toHaveBeenLastCalledWith([expect.objectContaining({ data: { label: 'During reconnect' } })]);
    hook.unmount();
  });

  it('does not queue disconnected edits for an unverified or downgraded identity', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    const current = fixture.providers[0];
    const node: Node = { id: 'a', position: { x: 0, y: 0 }, data: {} };
    const disconnect = () => current.on.mock.calls.find(call => call[0] === 'status')?.[1]({ status: 'disconnected' });
    act(() => { disconnect(); hook.result.current.pushLocalChangesToYjs([node], []); });
    expect(current.doc.getMap('flowchart-nodes').size).toBe(0);
    grantServerAccess();
    grantServerAccess('viewer');
    act(() => { disconnect(); hook.result.current.pushLocalChangesToYjs([node], []); });
    expect(current.doc.getMap('flowchart-nodes').size).toBe(0);
    hook.unmount();
  });

  it('retains disconnected deletions and rejects invalid canvas input without changing the retained document', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    grantServerAccess();
    const current = fixture.providers[0];
    const node: Node = { id: 'a', position: { x: 0, y: 0 }, data: {} };
    act(() => hook.result.current.pushLocalChangesToYjs([node], []));
    act(() => current.on.mock.calls.find(call => call[0] === 'status')?.[1]({ status: 'disconnected' }));
    act(() => hook.result.current.pushLocalChangesToYjs([{ ...node, position: { x: Infinity, y: 0 } }], []));
    expect(readCollaborationElement(current.doc.getMap('flowchart-nodes').get('a'))).toEqual(node);
    act(() => hook.result.current.pushLocalChangesToYjs([], []));
    expect(current.doc.getMap('flowchart-nodes').size).toBe(0);
    grantServerAccess();
    expect(fixture.flow.setNodes).toHaveBeenLastCalledWith([]);
    hook.unmount();
  });

  it('ignores peer role claims and keeps malformed server permission messages read-only', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    grantServerAccess('viewer');
    grantServerAccess('editor', false);
    expect(hook.result.current.accessRole).toBe('viewer');
    grantServerAccess('administrator');
    expect(hook.result.current.accessRole).toBe('viewer');
    act(() => hook.result.current.pushLocalChangesToYjs([
      { id: 'not-authorized', position: { x: 0, y: 0 }, data: {} },
    ], []));
    expect(fixture.providers[0].doc.getMap('flowchart-nodes').size).toBe(0);
    hook.unmount();
  });

  it('preserves unseen peer additions when a local canvas snapshot is published before the remote render commits', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    grantServerAccess();
    const local: Node = { id: 'local', position: { x: 0, y: 0 }, data: {} };
    const remote: Node = { id: 'peer', position: { x: 1, y: 2 }, data: {} };
    act(() => hook.result.current.pushLocalChangesToYjs([local], []));
    const peer = new Y.Doc();
    peer.getMap<Node>('flowchart-nodes').set(remote.id, remote);
    act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
    act(() => hook.result.current.pushLocalChangesToYjs([local], []));
    expect(fixture.providers[0].doc.getMap('flowchart-nodes').has('peer')).toBe(true);
    act(() => hook.result.current.pushLocalChangesToYjs([], []));
    expect(fixture.providers[0].doc.getMap('flowchart-nodes').has('local')).toBe(false);
    expect(fixture.providers[0].doc.getMap('flowchart-nodes').has('peer')).toBe(true);
    peer.destroy(); hook.unmount();
  });

  it('resets sync and status on disable and creates a fresh connection when re-enabled', () => {
    const hook = renderHook(({ enabled }) => useYjsCollaboration({ ...options, enabled }), {
      initialProps: { enabled: true },
    });
    const first = fixture.providers[0];
    const syncListener = first.on.mock.calls.find(call => call[0] === 'sync')?.[1] as (value: boolean) => void;
    act(() => syncListener(true));
    expect(hook.result.current.isSynced).toBe(true);
    hook.rerender({ enabled: false });
    expect(hook.result.current).toMatchObject({ provider: null, isSynced: false, wsStatus: 'disconnected', activeUsers: [] });
    expect(first.destroyed && first.doc.isDestroyed).toBe(true);
    act(() => syncListener(true));
    expect(hook.result.current.isSynced).toBe(false);
    hook.rerender({ enabled: true });
    expect(hook.result.current.isSynced).toBe(false);
    expect(hook.result.current.provider).not.toBe(first);
    hook.unmount();
  });

  it('applies a real remote Yjs transaction through the current ReactFlow facade', () => {
    const hook = renderHook(() => useYjsCollaboration(options));
    const oldFlow = fixture.flow;
    fixture.flow = { setNodes: vi.fn(), setEdges: vi.fn() };
    hook.rerender();
    const remoteDoc = new Y.Doc();
    const node: Node = { id: 'remote-node', position: { x: 4, y: 8 }, data: { label: 'Remote test' } };
    remoteDoc.getMap<Node>('flowchart-nodes').set(node.id, node);
    act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(remoteDoc)));
    expect(fixture.flow.setNodes).toHaveBeenCalledWith([node]);
    expect(fixture.flow.setEdges).toHaveBeenCalledWith([]);
    expect(oldFlow.setNodes).not.toHaveBeenCalled();
    remoteDoc.destroy();
    hook.unmount();
  });

  it('retains pending remote data until the designer is ready without publishing stale local nodes', async () => {
    const handler = vi.fn<(snapshot: { nodes: Node[]; edges: Edge[] }) => boolean>().mockReturnValue(false);
    const hook = renderHook(() => useYjsCollaboration({ ...options, onRemoteSnapshot: handler }));
    const peer = new Y.Doc();
    const remote: Node = { id: 'remote', position: { x: 1, y: 2 }, data: { label: 'Remote' } };
    peer.getMap<Node>('flowchart-nodes').set(remote.id, remote);
    act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
    const stale: Node = { id: 'stale', position: { x: 0, y: 0 }, data: {} };
    await act(async () => hook.result.current.pushLocalChangesToYjs([stale], []));
    expect(fixture.providers[0].doc.getMap<Node>('flowchart-nodes').has('remote')).toBe(true);
    expect(fixture.providers[0].doc.getMap<Node>('flowchart-nodes').has('stale')).toBe(false);
    handler.mockReturnValue(true);
    await act(async () => hook.result.current.pushLocalChangesToYjs([stale], []));
    expect(handler).toHaveBeenLastCalledWith({ nodes: [remote], edges: [] });
    expect(fixture.flow.setNodes).not.toHaveBeenCalled();
    expect(fixture.providers[0].doc.getMap<Node>('flowchart-nodes').has('stale')).toBe(false);
    peer.destroy();
    hook.unmount();
  });

  it('uses the latest designer callback without reconnecting the room', () => {
    const oldHandler = vi.fn(() => true);
    const newHandler = vi.fn(() => true);
    const hook = renderHook(({ handler }) => useYjsCollaboration({ ...options, onRemoteSnapshot: handler }), {
      initialProps: { handler: oldHandler },
    });
    const provider = hook.result.current.provider;
    hook.rerender({ handler: newHandler });
    const peer = new Y.Doc();
    peer.getMap<Node>('flowchart-nodes').set('remote', { id: 'remote', position: { x: 1, y: 2 }, data: {} });
    act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
    expect(hook.result.current.provider).toBe(provider);
    expect(newHandler).toHaveBeenCalledOnce();
    expect(oldHandler).not.toHaveBeenCalled();
    peer.destroy();
    hook.unmount();
  });

  it('retries the latest pending remote canvas after initialization without another peer message', () => {
    vi.useFakeTimers();
    const handler = vi.fn<(snapshot: { nodes: Node[]; edges: Edge[] }) => boolean>().mockReturnValue(false);
    const hook = renderHook(() => useYjsCollaboration({ ...options, onRemoteSnapshot: handler }));
    const peer = new Y.Doc();
    try {
      const remote: Node = { id: 'remote', position: { x: 1, y: 2 }, data: {} };
      peer.getMap<Node>('flowchart-nodes').set(remote.id, remote);
      act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
      const latest = { ...remote, position: { x: 50, y: 60 } };
      peer.getMap<Node>('flowchart-nodes').set(remote.id, latest);
      act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
      handler.mockReturnValue(true);
      act(() => vi.advanceTimersByTime(100));
      expect(handler).toHaveBeenLastCalledWith({ nodes: [latest], edges: [] });
      handler.mockClear(); act(() => vi.advanceTimersByTime(1000));
      expect(handler).not.toHaveBeenCalled();
    } finally { hook.unmount(); peer.destroy(); vi.useRealTimers(); }
  });

  it('cancels the pending remote retry when changing rooms and on unmount', () => {
    vi.useFakeTimers();
    const handler = vi.fn(() => false);
    const hook = renderHook(({ roomName }) => useYjsCollaboration({ ...options, roomName, onRemoteSnapshot: handler }), {
      initialProps: { roomName: 'first-room' },
    });
    const peer = new Y.Doc();
    try {
      peer.getMap<Node>('flowchart-nodes').set('remote', { id: 'remote', position: { x: 0, y: 0 }, data: {} });
      act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
      hook.rerender({ roomName: 'second-room' }); handler.mockClear();
      act(() => vi.advanceTimersByTime(200)); expect(handler).not.toHaveBeenCalled();
      act(() => Y.applyUpdate(fixture.providers.at(-1)!.doc, Y.encodeStateAsUpdate(peer)));
      hook.unmount(); handler.mockClear();
      act(() => vi.advanceTimersByTime(200)); expect(handler).not.toHaveBeenCalled();
    } finally { hook.unmount(); peer.destroy(); vi.useRealTimers(); }
  });

  it('blocks local publication before canvas readiness and on readiness failure', () => {
    const ready = vi.fn(() => false);
    const hook = renderHook(() => useYjsCollaboration({ ...options, isLocalSnapshotReady: ready }));
    try {
      grantServerAccess();
      const node: Node = { id: 'local', position: { x: 0, y: 0 }, data: {} };
      act(() => hook.result.current.pushLocalChangesToYjs([node], []));
      expect(fixture.providers[0].doc.getMap('flowchart-nodes').size).toBe(0);
      ready.mockImplementation(() => { throw new Error('Unavailable'); });
      act(() => hook.result.current.pushLocalChangesToYjs([node], []));
      expect(fixture.providers[0].doc.getMap('flowchart-nodes').size).toBe(0);
      ready.mockReturnValue(true);
      act(() => hook.result.current.pushLocalChangesToYjs([node], []));
      expect(readCollaborationElement(fixture.providers[0].doc.getMap('flowchart-nodes').get('local'))).toEqual(node);
    } finally { hook.unmount(); }
  });

  it('retains remote data when the designer commit fails and retries without overwriting it', async () => {
    const handler = vi.fn<(snapshot: { nodes: Node[]; edges: Edge[] }) => boolean>(() => { throw new Error('Designer unavailable'); });
    const hook = renderHook(() => useYjsCollaboration({ ...options, onRemoteSnapshot: handler }));
    const peer = new Y.Doc();
    const remote: Node = { id: 'remote', position: { x: 1, y: 2 }, data: {} };
    peer.getMap<Node>('flowchart-nodes').set(remote.id, remote);
    act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
    const stale: Node = { id: 'stale', position: { x: 0, y: 0 }, data: {} };
    await act(async () => hook.result.current.pushLocalChangesToYjs([stale], []));
    expect(fixture.providers[0].doc.getMap<Node>('flowchart-nodes').has('stale')).toBe(false);
    handler.mockImplementation(() => true);
    await act(async () => hook.result.current.pushLocalChangesToYjs([stale], []));
    expect(handler).toHaveBeenLastCalledWith({ nodes: [remote], edges: [] });
    expect(fixture.providers[0].doc.getMap<Node>('flowchart-nodes').get('remote')).toEqual(remote);
    expect(fixture.providers[0].doc.getMap<Node>('flowchart-nodes').has('stale')).toBe(false);
    peer.destroy();
    hook.unmount();
  });

  it('commits a valid empty remote document after the last remote node is removed', () => {
    const handler = vi.fn(() => true);
    const hook = renderHook(() => useYjsCollaboration({ ...options, onRemoteSnapshot: handler }));
    const peer = new Y.Doc();
    peer.getMap<Node>('flowchart-nodes').set('remote', { id: 'remote', position: { x: 1, y: 2 }, data: {} });
    act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
    peer.getMap<Node>('flowchart-nodes').delete('remote');
    act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
    expect(handler).toHaveBeenLastCalledWith({ nodes: [], edges: [] });
    peer.destroy();
    hook.unmount();
  });
  it('commits initial empty remote deletion history rather than restoring stale local nodes', () => {
    const handler = vi.fn(() => true);
    const hook = renderHook(() => useYjsCollaboration({ ...options, onRemoteSnapshot: handler }));
    const peer = new Y.Doc();
    try {
      peer.getMap<Node>('flowchart-nodes').set('deleted', { id: 'deleted', position: { x: 0, y: 0 }, data: {} });
      peer.getMap('flowchart-nodes').delete('deleted');
      act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
      grantServerAccess('viewer');
      expect(handler).toHaveBeenLastCalledWith({ nodes: [], edges: [] });
    } finally { hook.unmount(); peer.destroy(); }
  });

  it('clears pending remote data when changing rooms', async () => {
    const handler = vi.fn(() => false);
    const hook = renderHook(({ roomName }) => useYjsCollaboration({ ...options, roomName, onRemoteSnapshot: handler }), {
      initialProps: { roomName: 'old-room' },
    });
    const peer = new Y.Doc();
    peer.getMap<Node>('flowchart-nodes').set('old-peer', { id: 'old-peer', position: { x: 0, y: 0 }, data: {} });
    act(() => Y.applyUpdate(fixture.providers[0].doc, Y.encodeStateAsUpdate(peer)));
    hook.rerender({ roomName: 'new-room' });
    handler.mockReturnValue(true);
    handler.mockClear();
    await act(async () => hook.result.current.pushLocalChangesToYjs([], []));
    expect(handler).not.toHaveBeenCalled();
    expect(fixture.providers.at(-1)?.doc.getMap<Node>('flowchart-nodes').size).toBe(0);
    peer.destroy();
    hook.unmount();
  });

  it('merges a peer drag with a local label edit and commits nested changes to the canvas', () => {
    const baseline: Node = { id: 'shared', position: { x: 10, y: 20 }, data: { label: 'Initial' } };
    const hook = renderHook(() => useYjsCollaboration(options));
    const peer = new Y.Doc();
    try {
      grantServerAccess();
      act(() => hook.result.current.pushLocalChangesToYjs([baseline], []));
      const local = fixture.providers[0].doc;
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(local));
      act(() => hook.result.current.pushLocalChangesToYjs([{ ...baseline, data: { label: 'Local label' } }], []));
      peer.transact(() => publishCollaborationElement(peer.getMap('flowchart-nodes'), baseline.id,
        { ...baseline, position: { x: 99, y: 88 } }, baseline));
      const localUpdate = Y.encodeStateAsUpdate(local);
      const peerUpdate = Y.encodeStateAsUpdate(peer);
      act(() => { Y.applyUpdate(local, peerUpdate); Y.applyUpdate(peer, localUpdate); });
      const expected = { ...baseline, position: { x: 99, y: 88 }, data: { label: 'Local label' } };
      expect(readCollaborationElement(local.getMap('flowchart-nodes').get(baseline.id))).toEqual(expected);
      expect(readCollaborationElement(peer.getMap('flowchart-nodes').get(baseline.id))).toEqual(expected);
      expect(fixture.flow.setNodes).toHaveBeenLastCalledWith([expected]);
    } finally { peer.destroy(); hook.unmount(); }
  });

  it('uses an owned baseline when a caller mutates an existing node reference', () => {
    const node: Node = { id: 'mutable', position: { x: 0, y: 0 }, data: { label: 'Before' } };
    const hook = renderHook(() => useYjsCollaboration(options));
    try {
      grantServerAccess();
      act(() => hook.result.current.pushLocalChangesToYjs([node], []));
      node.data.label = 'After';
      act(() => hook.result.current.pushLocalChangesToYjs([node], []));
      expect(readCollaborationElement(fixture.providers[0].doc.getMap('flowchart-nodes').get(node.id))?.data).toEqual({ label: 'After' });
    } finally { hook.unmount(); }
  });

  it('rejects a partially invalid local batch before any shared mutation', () => {
    const node: Node = { id: 'valid', position: { x: 0, y: 0 }, data: { label: 'Before' } };
    const hook = renderHook(() => useYjsCollaboration(options));
    try {
      grantServerAccess();
      act(() => hook.result.current.pushLocalChangesToYjs([node], []));
      const doc = fixture.providers[0].doc;
      const before = Y.encodeStateAsUpdate(doc);
      act(() => hook.result.current.pushLocalChangesToYjs([
        { ...node, data: { label: 'Should not publish' } },
        { id: 'invalid', position: { x: Number.NaN, y: 0 }, data: {} },
      ], []));
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { hook.unmount(); }
  });

  it('destroys the document when connection construction fails', () => {
    fixture.failConstruction = true;
    expect(() => renderHook(() => useYjsCollaboration(options))).toThrow('Test connection creation failed');
    expect(fixture.providers.length).toBeGreaterThan(0);
    expect(fixture.providers.every(provider => provider.doc.isDestroyed)).toBe(true);
  });
});
