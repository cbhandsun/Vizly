import type { Edge, Node } from '@xyflow/react';
import { stripRoutingOwnedDocumentEdges } from '../../routing/routingDocumentSanitizer';
import { createPersistedRoutingCandidate, createRoutingOnlyDocumentSnapshot,
  parseRoutingOnlyDocumentSnapshot, type RoutingOnlyDocumentSnapshot } from '../../routing/persistedRoutingCandidate';
import { EDGE_ROUTING_CACHE_VERSION } from '../../routing/routingVersion';
import { isDisplayRoutingCapabilityEnabled } from '../../routing/displayRoutingCapabilities';
import { computeBaseReactFlowDisplayInputIdentityBundle } from './baseReactFlowDisplayInputIdentity';
import { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';
import { baseReactFlowDisplayOutputRouteSignatureMatches } from './baseReactFlowDisplayCache';
import { createBaseReactFlowDisplayEdgePatches, mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDocumentCandidatePatches } from './baseReactFlowDisplayRoutingTransaction';
import { isBaseReactFlowDisplayCommittedSnapshotBaselineTrusted,
  type BaseReactFlowDisplayCommittedSnapshotBaseline } from './baseReactFlowDisplayCommittedSnapshot';

export type DocumentSnapshotRoutingOptions = Readonly<{
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
}>;

export type BaseReactFlowDocumentSnapshotSource = Readonly<{
  read: (nodes: Node[], edges: Edge[]) => RoutingOnlyDocumentSnapshot | null;
}>;

const projectDocumentInput = (nodes: Node[], edges: Edge[]) => {
  if (nodes.length === 0 || nodes.length > 5000 || edges.length === 0 || edges.length > 300) return null;
  const ids = new Set(nodes.map(node => node.id));
  if (ids.size !== nodes.length || new Set(edges.map(edge => edge.id)).size !== edges.length
    || edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target) || edge.hidden === true)
    || nodes.some(node => node.hidden === true || node.data?.collapsed === true
      || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) return null;
  const projected = projectBaseReactFlowDisplayWorkerInput({ nodes, edges: stripRoutingOwnedDocumentEdges(edges) });
  const geometry = projected.nodes.map(node => ({
    id: node.id, type: node.type, parentId: node.parentId,
    x: node.positionAbsolute.x, y: node.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? node.style?.width,
    height: node.measured?.height ?? node.height ?? node.style?.height,
    layoutDirection: node.data.layoutDirection,
  }));
  if (geometry.some(node => ![node.x, node.y, node.width, node.height]
    .every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000)
    || typeof node.width !== 'number' || node.width <= 0
    || typeof node.height !== 'number' || node.height <= 0)) return null;
  // Full normalized values, not a route hash or a list of matching edge IDs.
  // Presentation-only array copies do not alter this document identity.
  return { projected, key: JSON.stringify({ geometry, edges: projected.edges }) };
};

/** A Canvas-scoped export capability, created only after an accepted commit. */
export const createBaseReactFlowDocumentSnapshotSource = (
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline,
  options: DocumentSnapshotRoutingOptions,
): BaseReactFlowDocumentSnapshotSource | null => {
  if (!isDisplayRoutingCapabilityEnabled('routingOnlyDocumentSnapshot')
    || !isBaseReactFlowDisplayCommittedSnapshotBaselineTrusted(baseline)
    || typeof options.enableSmartEdges !== 'boolean' || typeof options.isLargeGraph !== 'boolean'
    || !Number.isFinite(options.smartEdgePadding) || options.smartEdgePadding < 0
    || options.smartEdgePadding > 10_000) return null;
  const document = projectDocumentInput(baseline.nodes, baseline.sourceEdges);
  const routed = mergeBaseReactFlowDisplayEdgePatches(baseline.sourceEdges, baseline.routingPatches);
  if (!document || !routed || !baseReactFlowDisplayOutputRouteSignatureMatches(routed, baseline.outputRouteSignature)) return null;
  // Rebase patches and input identity onto the durable, routing-stripped graph.
  // A delta relative to runtime edges is not a portable document snapshot.
  const patches = createBaseReactFlowDisplayEdgePatches(document.projected.edges, routed);
  const safePatches = patches && sanitizeBaseReactFlowDocumentCandidatePatches(document.projected.edges, patches);
  if (!safePatches) return null;
  const replayed = mergeBaseReactFlowDisplayEdgePatches(document.projected.edges, safePatches);
  if (!replayed || !baseReactFlowDisplayOutputRouteSignatureMatches(replayed, baseline.outputRouteSignature)) return null;
  const identity = computeBaseReactFlowDisplayInputIdentityBundle({ ...document.projected, ...options });
  const candidate = createPersistedRoutingCandidate({
    routingVersion: EDGE_ROUTING_CACHE_VERSION,
    inputSignature: identity.cacheSignature,
    inputGeometryDigest: identity.geometryDigest,
    outputRouteSignature: baseline.outputRouteSignature,
    patches: safePatches,
  });
  const snapshot = candidate && createRoutingOnlyDocumentSnapshot(candidate);
  if (!snapshot) return null;
  return {
    read: (nodes, edges) => {
      if (!isDisplayRoutingCapabilityEnabled('routingOnlyDocumentSnapshot')) return null;
      const current = projectDocumentInput(nodes, edges);
      return current?.key === document.key ? parseRoutingOnlyDocumentSnapshot(snapshot) : null;
    },
  };
};
