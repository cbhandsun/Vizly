import * as Y from 'yjs';
import { validateDocument } from './boundary.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import type { createCloudRoomSource } from './cloudRoomSource.js';
import { readPersistedCanvasZIndex, restorePersistedCanvasGeometry } from './persistedCanvasGeometry.js';
import { readPersistedAutomaticHandleRoles, type HandleRole } from './persistedEdgeHandlePolicy.js';

export interface BootstrapIdentity { token: string; diagramId: string; userId: string }
type Source = ReturnType<typeof createCloudRoomSource>;
type Content = Awaited<ReturnType<Source>>['content'];
export const createCloudRoomCheckpoint = (source: Source, convert: (content: Content) => Promise<unknown>) => async (identity: BootstrapIdentity) => {
  const cloud = await source(identity.token, identity.diagramId, identity.userId);
  const canvas = await convert(cloud.content);
  if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) throw new Error('Invalid initial room');
  const value = canvas as Record<string, unknown>;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length > 1000 || value.edges.length > 2000) throw new Error('Invalid initial room');
  const initialNodes: unknown[] = value.nodes;
  const initialEdges: unknown[] = value.edges;
  const savedNodes = new Map([...cloud.content.nodes, ...(cloud.content.groups ?? [])].map(node => [node.id, node]));
  const automaticHandleRoles = new Map<string, HandleRole[]>(cloud.content.edges.map((edge: { id: string }) =>
    [edge.id, readPersistedAutomaticHandleRoles(edge)] as const));
  const canvasNodeZIndexes = new Map<string, number>();
  for (const [id, node] of savedNodes) {
    const zIndex = readPersistedCanvasZIndex(node);
    if (typeof id === 'string' && zIndex !== undefined) canvasNodeZIndexes.set(id, zIndex);
  }
  const doc = new Y.Doc();
  try {
    doc.transact(() => {
      for (const [name, elements] of [['flowchart-nodes', initialNodes], ['flowchart-edges', initialEdges]] as const) {
        const map = doc.getMap<unknown>(name);
        for (const input of elements) {
          const parsedElement = readCollaborationElement(input);
          const element = parsedElement && name === 'flowchart-nodes' && typeof parsedElement.id === 'string'
            ? restorePersistedCanvasGeometry(parsedElement, savedNodes.get(parsedElement.id), { restoreZIndex: false })
            : parsedElement;
          if (!element || typeof element.id !== 'string' || map.has(element.id)
            || !publishCollaborationElement(map, element.id, element)) throw new Error('Invalid initial room');
        }
      }
      if (initialNodes.length === 0 && initialEdges.length === 0) {
        // A tombstone gives an intentionally empty cloud graph an authoritative
        // state vector, preventing clients from re-seeding stale local content.
        const nodes = doc.getMap('flowchart-nodes');
        nodes.set('__room_initialized__', true);
        nodes.delete('__room_initialized__');
      }
    });
    if (!validateDocument(doc)) throw new Error('Invalid initial room');
    const state = Y.encodeStateAsUpdate(doc);
    // Keep the converter's baseline intact so an older server can still read
    // this checkpoint after rollback. Rendering order and automatic ports are
    // projected at merge time, without rewriting that historical representation.
    return { revision: cloud.revision, base: state, state, automaticHandleRoles, canvasNodeZIndexes };
  } finally { doc.destroy(); }
};

export const createRoomBootstrap = (source: Source, convert: (content: Content) => Promise<unknown>) => {
  const load = createCloudRoomCheckpoint(source, convert);
  return async (identity: BootstrapIdentity) => (await load(identity)).state;
};
