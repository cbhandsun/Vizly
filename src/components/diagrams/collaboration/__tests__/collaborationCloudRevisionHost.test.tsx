import { renderCollaborationHook } from './renderCollaborationHook';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { registerFlowDataBridge } from '@vizly/core/diagram-data';
import { publishCollaborationElement } from '../../../../../server/collaboration/documentModel';
import { CLOUD_REVISION_MESSAGE, writeAcceptedCloudRevision } from '../../../../../server/collaboration/cloudRevisionProtocol';
import { beginVersionPreview, discardVersionPreview, endVersionPreview } from '../versionPreviewSession';
const fixture = vi.hoisted(() => ({ providers: [] as Array<{ doc: Y.Doc;
  messageHandlers: Array<(_encoder: unknown, decoder: decoding.Decoder, _provider: unknown, server: boolean) => void> }> }));
vi.mock('@xyflow/react', () => ({ useReactFlow: () => ({ setNodes: vi.fn(), setEdges: vi.fn() }) }));
vi.mock('y-websocket', () => ({ WebsocketProvider: class {
  on = vi.fn(); off = vi.fn(); destroy = vi.fn(); messageHandlers = [];
  awareness = { clientID: 1, setLocalStateField: vi.fn(), getStates: () => new Map(), on: vi.fn(), off: vi.fn() };
  constructor(_url: string, _room: string, public doc: Y.Doc) { fixture.providers.push(this); }
} }));
import { useDiagramViewerCollaboration } from '../../../useDiagramViewerCollaboration';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const oldRevision = '2026-10-08T20:00:00.123456Z', revision = '2026-10-08T20:00:00.123457Z';
const node = { id: 'a', position: { x: 0, y: 0 }, data: { label: 'Accepted cloud' } };
const signal = () => {
  const provider = fixture.providers.at(-1)!;
  const peer = new Y.Doc();
  try {
    publishCollaborationElement(peer.getMap('flowchart-nodes'), 'a', node);
    act(() => Y.applyUpdate(provider.doc, Y.encodeStateAsUpdate(peer)));
    const encoder = encoding.createEncoder(); writeAcceptedCloudRevision(encoder, revision, peer);
    act(() => provider.messageHandlers[CLOUD_REVISION_MESSAGE](null, decoding.createDecoder(encoding.toUint8Array(encoder)), provider, true));
  } finally { peer.destroy(); }
};
const useHost = () => useDiagramViewerCollaboration({ selectedDiagramId: id, roomFromUrl: null });
describe('trusted collaboration revision commits through the active designer', () => {
  beforeEach(() => { fixture.providers = []; vi.stubEnv('VITE_YJS_WEBSOCKET_URL', 'wss://collaboration.example.com'); });
  afterEach(() => { discardVersionPreview(id); vi.unstubAllEnvs(); });
  it('retains the old revision on canvas failure and advances it only after readiness and commit', async () => {
    let ready = false;
    const replace = vi.fn<() => void>(() => { throw new Error('Synthetic canvas failure'); });
    const bridge = { id, metadata: { cloud: { provider: 'supabase', id, revision: oldRevision } },
      isCanvasReady: () => ready, replaceCanvasSnapshot: replace };
    const unregister = registerFlowDataBridge(id, bridge), hook = renderCollaborationHook(useHost, value => value.collaborationRuntime);
    try {
      await waitFor(() => expect(fixture.providers).toHaveLength(1));
      signal(); expect(replace).not.toHaveBeenCalled(); expect(bridge.metadata.cloud.revision).toBe(oldRevision);
      ready = true;
      await waitFor(() => expect(replace).toHaveBeenCalled());
      expect(bridge.metadata.cloud.revision).toBe(oldRevision);
      replace.mockImplementation(() => undefined);
      await waitFor(() => expect(bridge.metadata.cloud.revision).toBe(revision));
      expect(replace).toHaveBeenLastCalledWith({ nodes: [node], edges: [] });
    } finally { hook.unmount(); unregister(); }
  });
  it('keeps historical preview metadata unchanged and advances it after the live canvas resumes', async () => {
    const replace = vi.fn();
    const bridge = { id, metadata: { cloud: { provider: 'supabase', id, revision: oldRevision } },
      isCanvasReady: () => true, replaceCanvasSnapshot: replace };
    const unregister = registerFlowDataBridge(id, bridge), hook = renderCollaborationHook(useHost, value => value.collaborationRuntime);
    try {
      await waitFor(() => expect(fixture.providers).toHaveLength(1));
      act(() => { expect(beginVersionPreview(id, { nodes: [], edges: [] })).toBe(true); });
      signal(); expect(replace).not.toHaveBeenCalled(); expect(bridge.metadata.cloud.revision).toBe(oldRevision);
      act(() => { expect(endVersionPreview(id)).toEqual({ nodes: [node], edges: [] }); });
      await waitFor(() => expect(bridge.metadata.cloud.revision).toBe(revision));
      expect(replace).toHaveBeenLastCalledWith({ nodes: [node], edges: [] });
    } finally { hook.unmount(); unregister(); }
  });
});
