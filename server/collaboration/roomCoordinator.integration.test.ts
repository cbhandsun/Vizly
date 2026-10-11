// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { createFilePersistence } from './persistence.js';
import { createCollaborationServer } from './server.js';
import { createActiveRoomCoordinator, createRoomCoordinator } from './roomCoordinator.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import type { RoomCheckpoint } from './roomCheckpoint.js';
import { COORDINATION_STATUS_MESSAGE, readCoordinationProblem, type CoordinationProblem } from './coordinationStatus.js';
import type { AuthorizeDiagram } from './authorization.js';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { CLOUD_REVISION_MESSAGE, hasAcceptedCloudState, readAcceptedCloudRevision, writeAcceptedCloudRevision } from './cloudRevisionProtocol.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const origin = 'http://localhost:5419';
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });
const node = (label = 'Original', x = 10) => ({ id: 'a', position: { x, y: 20 }, data: { label } });
const checkpoint = (label = 'Original', revision = '2026-10-08T20:00:00.123456Z'): RoomCheckpoint => {
  const doc = new Y.Doc();
  try {
    publishCollaborationElement(doc.getMap('flowchart-nodes'), 'a', node(label));
    const state = Y.encodeStateAsUpdate(doc); return { revision, base: state, state };
  } finally { doc.destroy(); }
};
const peer = async (url: string, token: string) => {
  const doc = new Y.Doc();
  class Socket extends WebSocket { constructor(address: string) { super(address, { origin }); } }
  const provider = new WebsocketProvider(url, `vizly-room-${id}`, doc, { params: { token }, disableBc: true, WebSocketPolyfill: Socket as unknown as typeof globalThis.WebSocket });
  provider.awareness.setLocalState(null); provider.messageHandlers[4] = () => undefined;
  const problems: CoordinationProblem[] = [];
  const revisions: Array<{ revision: string; statePresent: boolean; node: unknown }> = [];
  provider.messageHandlers[CLOUD_REVISION_MESSAGE] = (_encoder, decoder) => {
    const accepted = readAcceptedCloudRevision(decoder);
    if (accepted) revisions.push({ revision: accepted.revision, statePresent: hasAcceptedCloudState(doc, accepted),
      node: readCollaborationElement(doc.getMap('flowchart-nodes').get('a')) });
  };
  provider.messageHandlers[COORDINATION_STATUS_MESSAGE] = (_encoder, decoder) => {
    const problem = readCoordinationProblem(decoder);
    if (problem) problems.push(problem);
  };
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; provider.destroy(); doc.destroy(); } };
  cleanup.push(dispose);
  await vi.waitFor(() => expect(provider.synced).toBe(true), { timeout: 5000 });
  return { doc, provider, dispose, problems, revisions };
};
const setup = async (active = false) => {
  const directory = await mkdtemp(join(tmpdir(), 'vizly-coordinator-integration-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const persistence = createFilePersistence(directory);
  let cloud = checkpoint();
  const readCloud = vi.fn(async () => cloud);
  const readRevision = vi.fn(async () => cloud.revision);
  const coordinate = createRoomCoordinator(persistence, readCloud);
  const log = vi.fn();
  const authorize = vi.fn<AuthorizeDiagram>(async token => token === 'editor' ? { userId: 'verified-editor', role: 'editor' }
    : token === 'viewer' ? { userId: 'verified-viewer', role: 'viewer' } : null);
  const server = createCollaborationServer({
    origins: new Set([origin]), persistence, loadInitialRoom: coordinate, log,
    readAcceptedRoomRevision: async diagramId => (await persistence.loadRecord(diagramId))?.checkpoint?.revision,
    coordinateActiveRoom: active ? createActiveRoomCoordinator(persistence, readRevision, coordinate) : undefined,
    recheckMs: active ? 40 : undefined,
    authorize,
  });
  cleanup.push(() => server.stop());
  return { ...await server.listen(), persistence, directory, readCloud, readRevision, log, authorize, setCloud: (value: RoomCheckpoint) => { cloud = value; } };
};
const recoverySocket = async (url: string, token = 'viewer', attemptWrite = false) => {
  const socket = new WebSocket(`${url}/vizly-room-${id}?token=${token}`, { origin });
  cleanup.push(() => socket.terminate());
  const frames: number[] = [];
  const problems: CoordinationProblem[] = [];
  return new Promise<{ frames: number[]; problems: CoordinationProblem[] }>((resolve, reject) => {
    socket.on('message', data => {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : Array.isArray(data) ? Buffer.concat(data) : data;
      const decoder = decoding.createDecoder(bytes);
      const kind = decoding.readVarUint(decoder); frames.push(kind);
      if (kind === COORDINATION_STATUS_MESSAGE) {
        const problem = readCoordinationProblem(decoder); if (problem) problems.push(problem);
      }
    });
    if (attemptWrite) socket.once('open', () => {
      const doc = new Y.Doc();
      try {
        publishCollaborationElement(doc.getMap('flowchart-nodes'), 'a', node('Must not accept'));
        const frame = encoding.createEncoder(); encoding.writeVarUint(frame, 0); sync.writeUpdate(frame, Y.encodeStateAsUpdate(doc));
        socket.send(encoding.toUint8Array(frame));
      } finally { doc.destroy(); }
    });
    socket.once('close', () => resolve({ frames, problems })); socket.once('error', reject);
  });
};
describe('cold cloud coordinator over actual sockets and disk', () => {
  it('rejects an editor attempting to publish a forged cloud revision without changing the checkpoint or peers', async () => {
    const runtime = await setup(true);
    const viewer = await peer(runtime.url, 'viewer');
    const before = await readFile(join(runtime.directory, `${id}.yjs`));
    const socket = new WebSocket(`${runtime.url}/vizly-room-${id}?token=editor`, { origin });
    cleanup.push(() => socket.terminate());
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => {
        const frame = encoding.createEncoder(); encoding.writeVarUint(frame, CLOUD_REVISION_MESSAGE);
        writeAcceptedCloudRevision(frame, '2026-10-08T20:00:00.123457Z', viewer.doc);
        socket.send(encoding.toUint8Array(frame));
      });
      socket.once('close', () => resolve()); socket.once('error', reject);
    });
    expect(runtime.log).toHaveBeenCalledWith('invalid-message');
    expect(await readFile(join(runtime.directory, `${id}.yjs`))).toEqual(before);
    expect(viewer.revisions.every(value => value.revision === '2026-10-08T20:00:00.123456Z')).toBe(true);
    expect(readCollaborationElement(viewer.doc.getMap('flowchart-nodes').get('a'))).toEqual(node());
  });
  it('sends checkpoint revision after its initial graph and after a newer cloud merge to both identities', async () => {
    const runtime = await setup(true);
    const editor = await peer(runtime.url, 'editor'), viewer = await peer(runtime.url, 'viewer');
    await vi.waitFor(() => {
      for (const client of [editor, viewer]) expect(client.revisions).toEqual([
        { revision: '2026-10-08T20:00:00.123456Z', statePresent: true, node: node() },
      ]);
    });
    runtime.setCloud(checkpoint('Accepted newer cloud', '2026-10-08T20:00:00.123457Z'));
    await vi.waitFor(() => {
      for (const client of [editor, viewer]) expect(client.revisions.at(-1)).toEqual({
        revision: '2026-10-08T20:00:00.123457Z', statePresent: true, node: node('Accepted newer cloud'),
      });
    });
  });
  it('does not publish a coordinated cloud snapshot when its checkpoint write fails', async () => {
    const runtime = await setup(true);
    const editor = await peer(runtime.url, 'editor');
    const before = await readFile(join(runtime.directory, `${id}.yjs`));
    const save = vi.spyOn(runtime.persistence, 'saveCheckpoint').mockRejectedValueOnce(new Error('Synthetic disk failure'));
    let closed = false;
    const onClose = () => { editor.provider.off('connection-close', onClose); closed = true; editor.provider.disconnect(); };
    editor.provider.on('connection-close', onClose);
    runtime.setCloud(checkpoint('Must not publish', '2026-10-08T20:00:00.123457Z'));
    await vi.waitFor(() => expect(closed).toBe(true));
    expect(readCollaborationElement(editor.doc.getMap('flowchart-nodes').get('a'))).toEqual(node());
    expect(await readFile(join(runtime.directory, `${id}.yjs`))).toEqual(before);
    expect(runtime.log).toHaveBeenCalledWith('cloud-coordination-failed');
    expect(editor.problems).toEqual(['cloud-unavailable']);
    expect(editor.revisions.map(value => value.revision)).toEqual(['2026-10-08T20:00:00.123456Z']);
    save.mockRestore();
  });
  it('serializes a drag received during cloud coordination without overwriting the cloud label', async () => {
    const runtime = await setup(true);
    const editor = await peer(runtime.url, 'editor');
    const viewer = await peer(runtime.url, 'viewer');
    await vi.waitFor(() => {
      for (const client of [editor, viewer]) {
        expect(readCollaborationElement(client.doc.getMap('flowchart-nodes').get('a'))).toEqual(node());
      }
    });
    let release: () => void = () => { throw new Error('Not initialized'); };
    let begin: () => void = () => { throw new Error('Not initialized'); };
    const pending = new Promise<void>(resolve => { release = resolve; });
    const begun = new Promise<void>(resolve => { begin = resolve; });
    const cloud = checkpoint('Queued cloud label', '2026-10-08T20:00:00.123457Z');
    runtime.readCloud.mockImplementationOnce(async () => { begin(); await pending; return cloud; });
    runtime.setCloud(cloud);
    try {
      await begun;
      const map = editor.doc.getMap<unknown>('flowchart-nodes');
      editor.doc.transact(() => publishCollaborationElement(map, 'a', node('Original', 101), readCollaborationElement(map.get('a')) ?? undefined));
      // A transport fence proves the server received the drag while its cloud
      // read is blocked. Sending locally alone does not establish that order.
      const socket = editor.provider.ws as unknown as WebSocket | null;
      if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Editor socket is unavailable');
      await new Promise<void>((resolve, reject) => {
        const onPong = () => { socket.off('error', onError); resolve(); };
        const onError = (error: Error) => { socket.off('pong', onPong); reject(error); };
        socket.once('pong', onPong);
        socket.once('error', onError);
        socket.ping();
      });
    } finally { release(); }
    await vi.waitFor(() => {
      for (const client of [editor, viewer]) expect(readCollaborationElement(client.doc.getMap('flowchart-nodes').get('a'))).toEqual(node('Queued cloud label', 101));
    });
  });
  it('merges a newer cloud label into both online peers while retaining unsaved drag', async () => {
    const runtime = await setup(true);
    const editor = await peer(runtime.url, 'editor');
    const viewer = await peer(runtime.url, 'viewer');
    const map = editor.doc.getMap<unknown>('flowchart-nodes');
    const previous = readCollaborationElement(map.get('a')) ?? undefined;
    editor.doc.transact(() => publishCollaborationElement(map, 'a', node('Original', 99), previous));
    await vi.waitFor(() => expect(readCollaborationElement(viewer.doc.getMap('flowchart-nodes').get('a'))).toEqual(node('Original', 99)));
    runtime.setCloud(checkpoint('Online cloud change', '2026-10-08T20:00:00.123457Z'));
    await vi.waitFor(() => {
      for (const client of [editor, viewer]) {
        expect(readCollaborationElement(client.doc.getMap('flowchart-nodes').get('a'))).toEqual(node('Online cloud change', 99));
        expect(client.provider.wsconnected).toBe(true);
      }
    });
    expect((await runtime.persistence.loadRecord(id))?.checkpoint?.revision).toBe('2026-10-08T20:00:00.123457Z');
    expect(runtime.readCloud, JSON.stringify({ events: runtime.log.mock.calls,
      readers: runtime.readCloud.mock.calls.map(call => (call as unknown as [{ userId: string }])[0]?.userId) })).toHaveBeenCalledTimes(2);
  });
  it('polls revision only without downloading an unchanged full graph repeatedly', async () => {
    const runtime = await setup(true);
    await peer(runtime.url, 'viewer');
    await vi.waitFor(() => expect(runtime.readRevision.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(runtime.readCloud).toHaveBeenCalledOnce();
  });
  it('closes conflicting online peers while retaining their last accepted persisted edits', async () => {
    const runtime = await setup(true);
    const editor = await peer(runtime.url, 'editor');
    const viewer = await peer(runtime.url, 'viewer');
    const map = editor.doc.getMap<unknown>('flowchart-nodes');
    editor.doc.transact(() => publishCollaborationElement(map, 'a', node('Unsaved live'), readCollaborationElement(map.get('a')) ?? undefined));
    await vi.waitFor(() => expect(readCollaborationElement(viewer.doc.getMap('flowchart-nodes').get('a'))).toEqual(node('Unsaved live')));
    const before = await readFile(join(runtime.directory, `${id}.yjs`));
    let closed = 0;
    for (const client of [editor, viewer]) {
      const onClose = () => {
        client.provider.off('connection-close', onClose);
        closed++; client.provider.disconnect();
      };
      client.provider.on('connection-close', onClose);
    }
    runtime.setCloud(checkpoint('Conflicting online cloud', '2026-10-08T20:00:00.123457Z'));
    await vi.waitFor(() => expect(closed).toBe(2));
    expect(await readFile(join(runtime.directory, `${id}.yjs`))).toEqual(before);
    expect(runtime.log).toHaveBeenCalledWith('cloud-coordination-failed');
    for (const client of [editor, viewer]) expect(client.problems).toEqual(['cloud-conflict']);
    for (const client of [editor, viewer]) expect(readCollaborationElement(client.doc.getMap('flowchart-nodes').get('a'))).toEqual(node('Unsaved live'));
  });
  it('persists editor changes and merges a later cloud change before viewer-first reopening', async () => {
    const runtime = await setup();
    const editor = await peer(runtime.url, 'editor');
    const map = editor.doc.getMap<unknown>('flowchart-nodes');
    const previous = readCollaborationElement(map.get('a')) ?? undefined;
    editor.doc.transact(() => publishCollaborationElement(map, 'a', node('Original', 99), previous));
    await vi.waitFor(async () => {
      const state = await runtime.persistence.load(id);
      const doc = new Y.Doc();
      try { Y.applyUpdate(doc, state!); expect(readCollaborationElement(doc.getMap('flowchart-nodes').get('a'))?.position).toEqual({ x: 99, y: 20 }); }
      finally { doc.destroy(); }
    });
    const disconnected = new Promise<void>(resolve => editor.provider.on('connection-close', () => resolve()));
    editor.provider.disconnect(); await disconnected; editor.dispose();
    runtime.setCloud(checkpoint('New cloud label', '2026-10-08T20:00:00.123457Z'));
    const viewer = await peer(runtime.url, 'viewer');
    expect(readCollaborationElement(viewer.doc.getMap('flowchart-nodes').get('a'))).toEqual(node('New cloud label', 99));
    expect((await runtime.persistence.loadRecord(id))?.checkpoint?.revision).toBe('2026-10-08T20:00:00.123457Z');
    expect(runtime.readCloud).toHaveBeenCalledTimes(2);
  });
  it('shares one cloud read and persisted checkpoint for concurrent first arrivals', async () => {
    const runtime = await setup();
    const [viewer, editor] = await Promise.all([peer(runtime.url, 'viewer'), peer(runtime.url, 'editor')]);
    expect(runtime.readCloud).toHaveBeenCalledOnce();
    for (const client of [viewer, editor]) expect(readCollaborationElement(client.doc.getMap('flowchart-nodes').get('a'))).toEqual(node());
    expect((await runtime.persistence.loadRecord(id))?.checkpoint).not.toBeNull();
  });
  it('reports authenticated cold conflict without admitting document synchronization or altering storage', async () => {
    const runtime = await setup();
    const baseline = checkpoint();
    await runtime.persistence.saveCheckpoint(id, { ...baseline, state: checkpoint('Unsaved live').state });
    runtime.setCloud(checkpoint('Conflicting cloud', '2026-10-08T20:00:00.123457Z'));
    const before = await readFile(join(runtime.directory, `${id}.yjs`));
    expect(await recoverySocket(runtime.url, 'editor', true)).toEqual({ frames: [COORDINATION_STATUS_MESSAGE], problems: ['cloud-conflict'] });
    expect(await readFile(join(runtime.directory, `${id}.yjs`))).toEqual(before);
  });
  it('reports an authenticated unavailable source without creating an empty room', async () => {
    const runtime = await setup();
    runtime.readCloud.mockRejectedValueOnce(new Error('Synthetic private provider failure'));
    expect(await recoverySocket(runtime.url)).toEqual({ frames: [COORDINATION_STATUS_MESSAGE], problems: ['cloud-unavailable'] });
    expect(await runtime.persistence.loadRecord(id)).toBeNull();
  });
  it('does not disclose recovery status to unauthorized identities', async () => {
    const runtime = await setup();
    await expect(recoverySocket(runtime.url, 'unauthorized')).rejects.toThrow('403');
    expect(runtime.readCloud).not.toHaveBeenCalled();
  });
  it('rechecks access after failed preparation and rejects a newly revoked identity', async () => {
    const runtime = await setup();
    runtime.readCloud.mockImplementationOnce(async () => {
      runtime.authorize.mockResolvedValue(null);
      throw new Error('Synthetic failed preparation');
    });
    await expect(recoverySocket(runtime.url)).rejects.toThrow('403');
    expect(await runtime.persistence.loadRecord(id)).toBeNull();
  });
});
