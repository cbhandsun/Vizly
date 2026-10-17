import { useEffect, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider, type Edge, type Node, useNodes } from '@xyflow/react';
import * as Y from 'yjs';
import { registerFlowDataBridge } from '@vizly/core/diagram-data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ docs: [] as Y.Doc[] }));
vi.mock('y-websocket', () => ({
  WebsocketProvider: class {
    messageHandlers = [];
    awareness = { clientID: 1, setLocalStateField: vi.fn(), getStates: () => new Map(), on: vi.fn(), off: vi.fn() };
    on = vi.fn();
    off = vi.fn();
    destroy = vi.fn();
    constructor(_url: string, _room: string, doc: Y.Doc) { fixture.docs.push(doc); }
  },
}));
import { useDiagramViewerCollaboration } from '../../../useDiagramViewerCollaboration';

const diagramId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const initialNode: Node = { id: 'initial', position: { x: 0, y: 0 }, data: { label: 'Initial' } };
const remoteNode: Node = { id: 'remote', position: { x: 10, y: 20 }, data: { label: 'Remote', description: 'Peer edit' } };

const Designer = ({ id, ready = true, editing = false }: { id: string; ready?: boolean; editing?: boolean }) => {
  const [nodes, setNodes] = useState<Node[]>([{ ...initialNode, selected: editing, data: { ...initialNode.data, isEditing: editing } }]);
  const [edges, setEdges] = useState<Edge[]>([]);
  useEffect(() => registerFlowDataBridge(id, {
    id,
    metadata: { cloud: { provider: 'supabase', id } },
    getCanvasSnapshot: () => ({ nodes, edges }),
    isCanvasReady: () => ready,
    replaceCanvasSnapshot: (snapshot: unknown) => {
      const parsed = snapshot as { nodes: Node[]; edges: Edge[] };
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
    },
  }), [id, nodes, edges, ready]);
  return <output data-testid="designer-canvas" data-editing={String(nodes[0]?.data.isEditing ?? false)} data-selected={String(nodes[0]?.selected ?? false)}>{nodes.map(node => node.id).join(',')}:{edges.length}</output>;
};
const Host = ({ room = null, ready = true, editing = false }: { room?: string | null; ready?: boolean; editing?: boolean }) => {
  const collaboration = useDiagramViewerCollaboration({ selectedDiagramId: diagramId, roomFromUrl: room });
  const hostNodes = useNodes();
  return <>{collaboration.collaborationRuntime}<output data-testid="host-canvas">{hostNodes.map(node => node.id).join(',')}</output><ReactFlowProvider><Designer id={diagramId} ready={ready} editing={editing} /></ReactFlowProvider></>;
};

describe('remote collaboration targets the active controlled designer', () => {
  it('keeps a local text editor open when the saved canvas is acknowledged remotely', async () => {
    const view = render(<ReactFlowProvider><Host editing /></ReactFlowProvider>);
    await waitFor(() => expect(fixture.docs).toHaveLength(1));
    const peer = new Y.Doc();
    try {
      peer.getMap<Node>('flowchart-nodes').set(initialNode.id, { ...initialNode, data: { label: 'Accepted cloud label' } });
      act(() => Y.applyUpdate(fixture.docs[0], Y.encodeStateAsUpdate(peer)));
      expect(screen.getByTestId('designer-canvas').getAttribute('data-editing')).toBe('true');
      expect(screen.getByTestId('designer-canvas').getAttribute('data-selected')).toBe('true');
    } finally { peer.destroy(); view.unmount(); }
  });
  beforeEach(() => {
    fixture.docs = [];
    vi.stubEnv('VITE_YJS_WEBSOCKET_URL', 'wss://collaboration.example.com');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('commits remote node edits through the designer bridge instead of the outer ReactFlow context', async () => {
    const view = render(<ReactFlowProvider><Host /></ReactFlowProvider>);
    expect(screen.getByTestId('designer-canvas').textContent).toBe('initial:0');
    await waitFor(() => expect(fixture.docs).toHaveLength(1));
    const peer = new Y.Doc();
    peer.getMap<Node>('flowchart-nodes').set(remoteNode.id, remoteNode);
    act(() => Y.applyUpdate(fixture.docs[0], Y.encodeStateAsUpdate(peer)));
    expect(screen.getByTestId('designer-canvas').textContent).toBe('remote:0');
    expect(screen.getByTestId('host-canvas').textContent).toBe('');
    peer.destroy();
    view.unmount();
  });
  it('does not connect a room belonging to a different selected diagram', () => {
    const view = render(<ReactFlowProvider><Host room="vizly-room-other-diagram" /></ReactFlowProvider>);
    expect(fixture.docs).toHaveLength(0);
    expect(screen.getByTestId('designer-canvas').textContent).toBe('initial:0');
    view.unmount();
  });
  it('retains a remote snapshot while initialization is pending and commits it after readiness', async () => {
    const view = render(<ReactFlowProvider><Host ready={false} /></ReactFlowProvider>);
    await waitFor(() => expect(fixture.docs).toHaveLength(1));
    const peer = new Y.Doc();
    try {
      peer.getMap<Node>('flowchart-nodes').set(remoteNode.id, remoteNode);
      act(() => Y.applyUpdate(fixture.docs[0], Y.encodeStateAsUpdate(peer)));
      expect(screen.getByTestId('designer-canvas').textContent).toBe('initial:0');
      view.rerender(<ReactFlowProvider><Host ready /></ReactFlowProvider>);
      await waitFor(() => expect(screen.getByTestId('designer-canvas').textContent).toBe('remote:0'));
    } finally { view.unmount(); peer.destroy(); }
  });
});
