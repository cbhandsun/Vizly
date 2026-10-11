import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import type { Edge, Node } from '@xyflow/react';
import { createCollaborationServer } from '../../../../../server/collaboration/server';
import { publishCollaborationElement, readCollaborationElement } from '../../../../../server/collaboration/documentModel';

vi.mock('@xyflow/react', () => ({ useReactFlow: () => ({ setNodes: vi.fn(), setEdges: vi.fn() }) }));
import { useYjsCollaboration } from '../YjsProviderHooks';

type Snapshot = { nodes: Node[]; edges: Edge[] };
const origin = 'http://localhost:5419';
const roomName = 'vizly-room-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const child = (snapshot: Snapshot) => {
  const value = snapshot.nodes.find(node => node.id === 'child');
  if (!value) throw new Error('Synthetic child missing');
  return value;
};
afterEach(() => vi.unstubAllGlobals());

describe('visible fields through two actual collaboration clients', () => {
  it('converges label, style, marker, parent and removed fields without republishing selection or remote acknowledgements', async () => {
    const initial = new Y.Doc();
    const nodes: Node[] = [
      { id: 'group', type: 'group', position: { x: 0, y: 0 }, data: { label: 'Group' } },
      { id: 'child', position: { x: 10, y: 20 }, data: { label: 'Before' }, style: { opacity: 1 } },
    ];
    const edges: Edge[] = [{ id: 'edge', source: 'child', target: 'child', markerEnd: 'old-marker' }];
    for (const node of nodes) publishCollaborationElement(initial.getMap('flowchart-nodes'), node.id, node);
    for (const edge of edges) publishCollaborationElement(initial.getMap('flowchart-edges'), edge.id, edge);
    let persisted: Uint8Array | undefined;
    const save = vi.fn(async (_id: string, state: Uint8Array) => { persisted = Uint8Array.from(state); });
    const server = createCollaborationServer({
      origins: new Set([origin]),
      authorize: async token => token === 'synthetic-first' || token === 'synthetic-second'
        ? { userId: token, role: 'editor' } : null,
      bootstrap: async () => Y.encodeStateAsUpdate(initial),
      persistence: { load: async () => persisted ?? null, save },
    });
    class Socket extends WebSocket {
      constructor(address: string | URL, protocols?: string | string[]) { super(address, protocols, { origin }); }
    }
    vi.stubGlobal('WebSocket', Socket);
    const { url } = await server.listen();
    let firstCanvas: Snapshot = { nodes: [], edges: [] };
    let secondCanvas: Snapshot = { nodes: [], edges: [] };
    const firstRemote = vi.fn((snapshot: Snapshot) => { firstCanvas = snapshot; return true; });
    const secondRemote = vi.fn((snapshot: Snapshot) => { secondCanvas = snapshot; return true; });
    const first = renderHook(() => useYjsCollaboration({ roomName, serverUrl: url, token: 'synthetic-first', onRemoteSnapshot: firstRemote }));
    const second = renderHook(() => useYjsCollaboration({ roomName, serverUrl: url, token: 'synthetic-second', onRemoteSnapshot: secondRemote }));
    const publish = (snapshot: Snapshot) => act(() => {
      firstCanvas = snapshot;
      first.result.current.pushLocalChangesToYjs(snapshot.nodes, snapshot.edges);
    });
    const replaceChild = (patch: Partial<Node>): Snapshot => ({ ...firstCanvas, nodes: firstCanvas.nodes.map(node => node.id === 'child' ? { ...node, ...patch } : node) });
    try {
      await waitFor(() => {
        expect(first.result.current).toMatchObject({ isSynced: true, accessRole: 'editor' });
        expect(second.result.current).toMatchObject({ isSynced: true, accessRole: 'editor' });
        expect(secondCanvas.nodes).toHaveLength(2);
      });
      publish(replaceChild({ data: { label: 'Changed' } }));
      await waitFor(() => expect(child(secondCanvas).data.label).toBe('Changed'));
      publish(replaceChild({ style: { opacity: 0.4 } }));
      await waitFor(() => expect(child(secondCanvas).style).toEqual({ opacity: 0.4 }));
      publish(replaceChild({ parentId: 'group' }));
      await waitFor(() => expect(child(secondCanvas).parentId).toBe('group'));
      publish({ ...firstCanvas, edges: firstCanvas.edges.map(edge => ({ ...edge, markerEnd: 'new-marker' })) });
      await waitFor(() => expect(secondCanvas.edges[0].markerEnd).toBe('new-marker'));
      const { style: _style, ...withoutStyle } = child(firstCanvas);
      publish({ ...firstCanvas, nodes: firstCanvas.nodes.map(node => node.id === 'child' ? withoutStyle : node) });
      await waitFor(() => expect(child(secondCanvas)).not.toHaveProperty('style'));
      const { markerEnd: _markerEnd, ...withoutMarker } = firstCanvas.edges[0];
      publish({ ...firstCanvas, edges: [withoutMarker] });
      await waitFor(() => expect(secondCanvas.edges[0]).not.toHaveProperty('markerEnd'));
      await waitFor(() => {
        expect(persisted).toBeDefined();
        const restored = new Y.Doc();
        try {
          Y.applyUpdate(restored, persisted!);
          expect(readCollaborationElement(restored.getMap('flowchart-edges').get('edge'))).not.toHaveProperty('markerEnd');
          expect(readCollaborationElement(restored.getMap('flowchart-nodes').get('child'))).toMatchObject({ parentId: 'group', data: { label: 'Changed' } });
        } finally { restored.destroy(); }
      });
      const provider = second.result.current.provider;
      if (!provider) throw new Error('Synthetic peer missing');
      const stateBefore = Y.encodeStateVector(provider.doc);
      const callsBefore = secondRemote.mock.calls.length;
      const savesBefore = save.mock.calls.length;
      act(() => {
        second.result.current.pushLocalChangesToYjs(secondCanvas.nodes, secondCanvas.edges);
        second.result.current.pushLocalChangesToYjs(secondCanvas.nodes.map(node => ({ ...node, selected: true, dragging: true })), secondCanvas.edges);
      });
      expect(Y.encodeStateVector(provider.doc)).toEqual(stateBefore);
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(secondRemote).toHaveBeenCalledTimes(callsBefore);
      expect(save).toHaveBeenCalledTimes(savesBefore);
      expect(firstCanvas).toEqual(secondCanvas);
    } finally { first.unmount(); second.unmount(); await server.stop(); initial.destroy(); }
  });
});
