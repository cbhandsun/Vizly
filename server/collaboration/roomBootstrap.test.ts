// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { createRoomBootstrap } from './roomBootstrap.js';
import { createCollaborationServer } from './server.js';
import { readCollaborationElement } from './documentModel.js';
import type { createCloudRoomSource } from './cloudRoomSource.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin = 'http://localhost:5419';
const node = { id: 'saved', position: { x: 123, y: 456 }, data: { label: 'Cloud' }, style: { width: 160, height: 60 } };
const source = vi.fn<ReturnType<typeof createCloudRoomSource>>(async () => ({
  diagramId: id, revision: '2026-10-08T20:00:00.123456Z', content: {
    id, name: 'Synthetic', type: 'flowchart', version: '1.0.0', nodes: [], edges: [],
    layout: { type: 'dagre', direction: 'TB' }, theme: { name: 'manual' },
  },
}));
const disposals: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose(); vi.clearAllMocks(); });
const connect = async (url: string, token: string) => {
  const doc = new Y.Doc();
  class Socket extends WebSocket { constructor(address: string) { super(address, { origin }); } }
  const provider = new WebsocketProvider(url, `vizly-room-${id}`, doc, {
    params: { token }, disableBc: true, WebSocketPolyfill: Socket as unknown as typeof globalThis.WebSocket,
  });
  provider.awareness.setLocalState(null);
  provider.messageHandlers[4] = () => undefined;
  disposals.push(() => { provider.destroy(); doc.destroy(); });
  await vi.waitFor(() => expect(provider.synced).toBe(true), { timeout: 5000 });
  return { doc, provider };
};
const runtime = async (bootstrap: ReturnType<typeof createRoomBootstrap>, stored = new Map<string, Uint8Array>(), fail = false) => {
  const server = createCollaborationServer({ origins: new Set([origin]), authorize: async token =>
    token === 'viewer' || token === 'editor' ? { userId: user, role: token } : null,
    bootstrap, persistence: { load: async diagram => stored.get(diagram) ?? null,
      save: async (diagram, state) => { if (fail) throw new Error('Synthetic disk failure'); stored.set(diagram, Uint8Array.from(state)); } },
  });
  disposals.push(() => server.stop());
  return { ...await server.listen(), server, stored };
};
describe('cloud room initialization before synchronization', () => {
  it('initializes a viewer-first room durably and synchronizes the cloud canvas to both roles', async () => {
    const bootstrap = createRoomBootstrap(source, async () => ({ nodes: [node], edges: [] }));
    const state = await runtime(bootstrap);
    const viewer = await connect(state.url, 'viewer');
    const editor = await connect(state.url, 'editor');
    expect(source).toHaveBeenCalledOnce();
    expect(source).toHaveBeenCalledWith('viewer', id, user);
    expect(state.stored.has(id)).toBe(true);
    expect(readCollaborationElement(viewer.doc.getMap('flowchart-nodes').get('saved'))).toEqual(node);
    expect(readCollaborationElement(editor.doc.getMap('flowchart-nodes').get('saved'))).toEqual(node);
  });
  it('marks an empty cloud graph authoritative instead of allowing stale local seeding', async () => {
    const bytes = await createRoomBootstrap(source, async () => ({ nodes: [], edges: [] }))({ token: 'viewer', diagramId: id, userId: user });
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, bytes);
      expect(doc.getMap('flowchart-nodes').size).toBe(0);
      expect(Y.decodeStateVector(Y.encodeStateVector(doc)).size).toBeGreaterThan(0);
    } finally { doc.destroy(); }
  });
  it('uses one bootstrap for concurrent first arrivals', async () => {
    const convert = vi.fn(async () => ({ nodes: [node], edges: [] }));
    const state = await runtime(createRoomBootstrap(source, convert));
    await Promise.all([connect(state.url, 'viewer'), connect(state.url, 'editor')]);
    expect(convert).toHaveBeenCalledOnce();
    expect(source).toHaveBeenCalledOnce();
  });
  it('keeps existing durable room state authoritative without reading cloud content again', async () => {
    const initial = await createRoomBootstrap(source, async () => ({ nodes: [node], edges: [] }))({ token: 'editor', diagramId: id, userId: user });
    source.mockClear();
    const state = await runtime(createRoomBootstrap(source, async () => ({ nodes: [], edges: [] })), new Map([[id, initial]]));
    const viewer = await connect(state.url, 'viewer');
    expect(source).not.toHaveBeenCalled();
    expect(viewer.doc.getMap('flowchart-nodes').has('saved')).toBe(true);
  });
  it('rejects room synchronization if initial persistence fails', async () => {
    const state = await runtime(createRoomBootstrap(source, async () => ({ nodes: [node], edges: [] })), new Map(), true);
    const socket = new WebSocket(`${state.url}/vizly-room-${id}?token=viewer`, { origin });
    disposals.push(() => socket.terminate());
    await expect(new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); })).rejects.toThrow('403');
    expect(state.stored.size).toBe(0);
  });
  it.each([null, { nodes: 'bad', edges: [] }, { nodes: [node, node], edges: [] }, { nodes: [node], edges: [{ id: 'bad', source: 'saved', target: 'missing' }] },
    { nodes: [{ ...node, position: { x: Infinity, y: 0 } }], edges: [] }])('rejects malformed conversion results without a partial document', async canvas => {
      await expect(createRoomBootstrap(source, async () => canvas)({ token: 'editor', diagramId: id, userId: user })).rejects.toThrow('Invalid initial room');
    });
});
