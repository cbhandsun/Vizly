import { renderCollaborationHook } from './renderCollaborationHook';
import { useEffect, useState } from 'react';
import { act, waitFor } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerFlowDataBridge } from '@vizly/core/diagram-data';
import { publishCollaborationElement, readCollaborationElement } from '../../../../../server/collaboration/documentModel';
const fixture = vi.hoisted(() => ({ providers: [] as Array<{ doc: Y.Doc; on: ReturnType<typeof vi.fn>;
  messageHandlers: Array<(_encoder: unknown, decoder: decoding.Decoder, _provider: unknown, server: boolean) => void> }> }));
vi.mock('@xyflow/react', () => ({ useReactFlow: () => ({ setNodes: vi.fn(), setEdges: vi.fn() }) }));
vi.mock('y-websocket', () => ({ WebsocketProvider: class {
  on = vi.fn(); off = vi.fn(); destroy = vi.fn(); messageHandlers = [];
  awareness = { clientID: 1, setLocalStateField: vi.fn(), getStates: () => new Map(), on: vi.fn(), off: vi.fn() };
  constructor(_url: string, _room: string, public doc: Y.Doc) { fixture.providers.push(this); }
} }));
vi.mock('react-i18next', () => { const t = (key: string) => key; return { useTranslation: () => ({ t }) }; });
vi.mock('@vizly/core/antd', () => ({ appMessage: { error: vi.fn(), success: vi.fn() } }));
const storage = vi.hoisted(() => ({ listVersions: vi.fn(), loadVersion: vi.fn(), saveVersion: vi.fn() }));
vi.mock('@/services/UnifiedStorageService', () => ({ unifiedStorage: storage }));
import { useDiagramViewerCollaboration } from '../../../useDiagramViewerCollaboration';
import { useVersionHistory } from '../../hooks/useVersionHistory';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const live: Node = { id: 'live', position: { x: 0, y: 0 }, data: { label: 'Current' } };
const historical: Node = { id: 'history', position: { x: 10, y: 20 }, data: { label: 'Historical' } };
const peer: Node = { ...live, data: { label: 'Peer edit' } };
const useHarness = () => {
  const [nodes, setNodes] = useState<Node[]>([live]);
  const [edges, setEdges] = useState<Edge[]>([]);
  useEffect(() => registerFlowDataBridge(id, { id, nodes, edges,
    metadata: { cloud: { provider: 'supabase', id } }, isCanvasReady: () => true,
    getCanvasSnapshot: () => ({ nodes, edges }), replaceCanvasSnapshot: (value: unknown) => {
      const canvas = value as { nodes: Node[]; edges: Edge[] };
      setNodes(canvas.nodes); setEdges(canvas.edges);
    } }), [nodes, edges]);
  const collaboration = useDiagramViewerCollaboration({ selectedDiagramId: id, roomFromUrl: null });
  const publish = collaboration.pushLocalChangesToYjs;
  useEffect(() => publish(nodes, edges), [nodes, edges, publish]);
  const history = useVersionHistory(id);
  return { nodes, setNodes, setEdges, history, collaboration };
};
const grant = () => {
  const provider = fixture.providers.at(-1);
  expect(provider, 'The cloud fixture must create a collaboration provider').toBeDefined();
  if (!provider) throw new Error('Missing cloud collaboration provider');
  const claim = encoding.createEncoder(); encoding.writeVarString(claim, 'editor:fields-v1');
  act(() => {
    provider.messageHandlers[4](null, decoding.createDecoder(encoding.toUint8Array(claim)), provider, true);
    provider.on.mock.calls.find(call => call[0] === 'sync')?.[1](true);
  });
  return provider;
};
describe('version preview remains local during collaboration', () => {
  beforeEach(() => {
    fixture.providers = [];
    storage.saveVersion.mockReset();
    vi.stubEnv('VITE_YJS_WEBSOCKET_URL', 'wss://collaboration.example.com');
    storage.listVersions.mockResolvedValue([]);
    storage.loadVersion.mockResolvedValue({ id: 'v1', diagramId: id, createdAt: 1, message: 'Snapshot', snapshotData: { nodes: [historical], edges: [] } });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('never publishes a historical preview into the shared document', async () => {
    const hook = renderCollaborationHook(useHarness, value => value.collaboration.collaborationRuntime);
    await waitFor(() => expect(fixture.providers).toHaveLength(1)); const provider = grant();
    await waitFor(() => expect(provider.doc.getMap('flowchart-nodes').has('live')).toBe(true));
    await act(async () => { await hook.result.current.history.enterPreview('v1', hook.result.current.setNodes, hook.result.current.setEdges, () => hook.result.current.nodes, () => []); });
    expect(hook.result.current.nodes[0].id).toBe('history');
    expect(provider.doc.getMap('flowchart-nodes').has('history')).toBe(false);
    expect(provider.doc.getMap('flowchart-nodes').has('live')).toBe(true);
    hook.unmount();
  });
  it('retains incoming peer edits while previewing and restores the newest live canvas on exit', async () => {
    const hook = renderCollaborationHook(useHarness, value => value.collaboration.collaborationRuntime);
    await waitFor(() => expect(fixture.providers).toHaveLength(1)); const provider = grant();
    await act(async () => { await hook.result.current.history.enterPreview('v1', hook.result.current.setNodes, hook.result.current.setEdges, () => hook.result.current.nodes, () => []); });
    act(() => {
      const remote = new Y.Doc();
      try {
        Y.applyUpdate(remote, Y.encodeStateAsUpdate(provider.doc));
        publishCollaborationElement(remote.getMap('flowchart-nodes'), 'live', peer);
        Y.applyUpdate(provider.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(provider.doc)));
      } finally { remote.destroy(); }
    });
    expect(hook.result.current.nodes[0].id).toBe('history');
    let resume: ReturnType<typeof hook.result.current.history.exitPreview> = null;
    act(() => { resume = hook.result.current.history.exitPreview(); if (resume) { hook.result.current.setNodes(resume.nodes); hook.result.current.setEdges(resume.edges); } });
    expect(hook.result.current.nodes).toEqual([peer]);
    expect(readCollaborationElement(provider.doc.getMap('flowchart-nodes').get('live'))).toEqual(peer);
    hook.unmount();
  });
  it('cancels restore when a peer changes the live canvas while the safety backup is pending', async () => {
    const hook = renderCollaborationHook(useHarness, value => value.collaboration.collaborationRuntime);
    await waitFor(() => expect(fixture.providers).toHaveLength(1)); const provider = grant();
    await act(async () => { await hook.result.current.history.enterPreview('v1', hook.result.current.setNodes, hook.result.current.setEdges, () => hook.result.current.nodes, () => []); });
    let resolveBackup: ((value: unknown) => void) | undefined;
    storage.saveVersion.mockImplementation(() => new Promise(resolve => { resolveBackup = resolve; }));
    let restore: Promise<boolean> | undefined;
    act(() => { restore = hook.result.current.history.restoreVersion('v1', hook.result.current.setNodes, hook.result.current.setEdges); });
    await waitFor(() => expect(storage.saveVersion).toHaveBeenCalledOnce());
    act(() => {
      const remote = new Y.Doc();
      try {
        Y.applyUpdate(remote, Y.encodeStateAsUpdate(provider.doc));
        publishCollaborationElement(remote.getMap('flowchart-nodes'), 'live', peer);
        Y.applyUpdate(provider.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(provider.doc)));
      } finally { remote.destroy(); }
    });
    let restored: boolean | undefined;
    await act(async () => {
      resolveBackup?.({ id: 'backup', diagramId: id, createdAt: 2, message: 'Backup', snapshotData: { nodes: [live], edges: [] } });
      restored = await restore;
    });
    expect(restored).toBe(false);
    expect(hook.result.current.nodes[0].id).toBe('history');
    expect(readCollaborationElement(provider.doc.getMap('flowchart-nodes').get('live'))).toEqual(peer);
    hook.unmount();
  });
});
