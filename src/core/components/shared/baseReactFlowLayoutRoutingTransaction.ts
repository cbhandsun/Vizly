import type { Edge, Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';
import type { RoutingPatch } from '../../routing/routingPatch';

import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import {
  readBaseReactFlowDisplayCommittedSnapshot,
  markBaseReactFlowStagedLayoutSnapshotHandoff,
  writeBaseReactFlowDisplayCommittedSnapshot,
  type RoutingCommittedSnapshot,
} from './baseReactFlowDisplayCommittedSnapshot';
import { anchorComputedDisplayEdgeEndpoints } from './baseReactFlowDisplayEndpointAnchoring';
import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeConversions';
import {
  canCommitBaseReactFlowDisplayResult,
} from './baseReactFlowDisplayCommitPolicy';
import { computeBaseReactFlowDisplayInputIdentityBundle } from './baseReactFlowDisplayInputIdentity';
import { synthesizeStableFallbackPath } from './baseReactFlowDisplayEdgeCore';
import {
  createBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayRoutingTransactions,
} from './baseReactFlowDisplayRoutingTransaction';
import {
  computeBaseReactFlowDisplayEdgesInWorker,
  projectBaseReactFlowDisplayWorkerInput,
  repairBaseReactFlowDisplayEdgesInWorker,
  type BaseReactFlowDisplayWorkerResult,
} from './baseReactFlowDisplayWorkerClient';
import {
  LAYOUT_DISPLAY_WORKER_TIMEOUT_MS,
  LAYOUT_FULL_DISPLAY_WORKER_TIMEOUT_MS,
} from './baseReactFlowDisplayWorkerTimeout';
import { recordBaseReactFlowRejectedDisplayDiagnostics } from './baseReactFlowDisplayRejectedDiagnostics';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
import { buildLayoutFacingTerminalShortcutCandidates } from './baseReactFlowDisplayCommercialTerminalShortcut';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import { clearBaseReactFlowLayoutEdgeRoutingData } from './baseReactFlowLayoutEdgeRoutingData';
import { updateDisplayRoutingDebugState } from './baseReactFlowDisplayRoutingDebug';

export { clearBaseReactFlowLayoutEdgeRoutingData } from './baseReactFlowLayoutEdgeRoutingData';

export type BaseReactFlowLayoutRoutingCommit = Readonly<{
  routedEdges: Edge[];
}>;

type LayoutRuntimeNode = Node & Readonly<{
  internals?: unknown;
  positionAbsolute?: unknown;
}>;

/**
 * A layout strategy owns the next relative positions. Runtime absolute
 * geometry belongs to the previous React Flow render and must not enter the
 * hidden transaction identity or the subsequent state commit.
 */
export const clearBaseReactFlowLayoutNodeRuntimeGeometry = (
  nodes: Node[],
): Node[] => nodes.map((sourceNode) => {
  const {
    internals: _internals,
    positionAbsolute: _positionAbsolute,
    ...node
  } = sourceNode as LayoutRuntimeNode;
  return node as Node;
});

/**
 * The full-quality worker refines an existing orthogonal candidate. Dynamic
 * layouts therefore receive a private, geometry-anchored seed; this candidate
 * is never visible and still has to pass the final hard-quality transaction.
 */
export const seedBaseReactFlowStagedLayoutEdges = ({
  sourceEdges,
  sourceNodes,
}: {
  sourceEdges: Edge[];
  sourceNodes: Node[];
}): Edge[] => {
  const projected = projectBaseReactFlowDisplayWorkerInput({
    edges: sourceEdges,
    nodes: sourceNodes,
  });
  const nodeById = new Map(projected.nodes.map(node => [node.id, node] as const));
  const seededEdges = projected.edges.map((edge) => {
    if (String(edge.type ?? '').toLowerCase() === 'canvas-ref') return edge;
    const data = edge.data && typeof edge.data === 'object'
      ? edge.data as Record<string, unknown>
      : {};
    const elkPath = data.layoutRoutingCandidate === true && Array.isArray(data.elkPath)
      && data.elkPath.length >= 2
      && data.elkPath.every(point => (
        point !== null
        && typeof point === 'object'
        && !Array.isArray(point)
        && Number.isFinite((point as Record<string, unknown>).x)
        && Number.isFinite((point as Record<string, unknown>).y)
      ))
      ? data.elkPath as Array<{ x: number; y: number }>
      : null;
    if (elkPath) {
      return {
        ...edge,
        type: 'stablePath',
        data: {
          ...clearBaseReactFlowLayoutEdgeRoutingData(edge.data),
          computedPath: elkPath.map(point => ({ ...point })),
          layoutPathLocked: true,
          _layoutPathLocked: true,
          algorithm: 'elk-layout-candidate',
        },
      };
    }
    return synthesizeStableFallbackPath({
      edge: {
        ...edge,
        type: 'stablePath',
        data: clearBaseReactFlowLayoutEdgeRoutingData(edge.data),
      },
      nodeById,
    });
  });
  const anchoredEdges = anchorComputedDisplayEdgeEndpoints(seededEdges, projected.nodes);
  const axisRepairedEdges = repairAxisMismatchedTerminalsWithBoundedPortRoles(
    anchoredEdges,
    projected.nodes,
    Math.min(128, Math.max(32, anchoredEdges.length * 4)),
  );
  const geometryNormalizedEdges = repairResidualHairpinBridges(
    axisRepairedEdges,
    projected.nodes,
  );
  // ELK owns node placement, but its terminal choice is only a candidate.
  // Normalize attachment/axis defects first because those repairs can expose a
  // compact same-side U that was not present in raw ELK waypoints. Negotiating
  // after normalization but before the Worker lets the whole graph assess the
  // new port role atomically, before topology/trunk ownership is established.
  return geometryNormalizedEdges.map((edge) => {
    const data = edge.data && typeof edge.data === 'object'
      ? edge.data as Record<string, unknown>
      : {};
    if (data.algorithm !== 'elk-layout-candidate') return edge;
    return buildLayoutFacingTerminalShortcutCandidates(edge, projected.nodes)[0] ?? edge;
  });
};

/**
 * Validates an off-screen route against the exact edge graph that will be
 * committed. Its snapshot is keyed to the target geometry, so React Flow can
 * only reuse it when the rendered geometry is identical.
 */
export const commitBaseReactFlowStagedLayoutRoutingResult = ({
  sourceEdges,
  sourceNodes,
  workerResult,
  enableSmartEdges = true,
  smartEdgePadding = 20,
  isLargeGraph = false,
}: {
  sourceEdges: Edge[];
  sourceNodes: Node[];
  workerResult: BaseReactFlowDisplayWorkerResult;
  enableSmartEdges?: boolean;
  smartEdgePadding?: number;
  isLargeGraph?: boolean;
}): BaseReactFlowLayoutRoutingCommit | null => {
  if (!Array.isArray(workerResult.routingPatches) || !workerResult.hardReport) return null;
  const workerInputRoutingPatches = createBaseReactFlowDisplayEdgePatches(
    sourceEdges,
    workerResult.projectedEdges,
  );
  if (!workerInputRoutingPatches) return null;
  const merged = mergeBaseReactFlowDisplayRoutingTransactions({
    latestSourceEdges: sourceEdges,
    workerRoutingPatches: workerInputRoutingPatches,
    repairRoutingPatches: workerResult.routingPatches,
  });
  if (!merged) return null;

  const routesMatch = doBaseReactFlowDisplayRoutesMatchExactly(
    workerResult.edges,
    merged.edges,
  );
  if (!canCommitBaseReactFlowDisplayResult({
    qualityMode: 'full',
    hardClean: workerResult.hardClean,
    routeResolution: workerResult.routeResolution,
    routesMatch,
  })) return null;

  if (!writeBaseReactFlowStagedLayoutSnapshot({
    sourceEdges,
    routedEdges: merged.edges,
    sourceNodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    hardReport: workerResult.hardReport,
  })) return null;
  return { routedEdges: merged.edges };
};

const writeBaseReactFlowStagedLayoutSnapshot = ({
  sourceEdges,
  routedEdges,
  sourceNodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  hardReport,
  hardReportDigest,
}: {
  sourceEdges: Edge[];
  routedEdges: Edge[];
  sourceNodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  hardReport?: NonNullable<BaseReactFlowDisplayWorkerResult['hardReport']>;
  hardReportDigest?: RoutingCommittedSnapshot['hardReportDigest'];
}): boolean => {
  const hardReportIdentity = hardReport
    ? { hardReport }
    : hardReportDigest
      ? { hardReportDigest }
      : null;
  if (!hardReportIdentity) return false;
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routedEdges);
  const displayPatches = createBaseReactFlowDisplayEdgePatches(routedEdges, routedEdges);
  if (!outputRouteSignature || !displayPatches) return false;
  const writeSnapshot = (
    edges: Edge[],
    patches: RoutingPatch[],
  ): ReturnType<typeof computeBaseReactFlowDisplayInputIdentityBundle> | null => {
    // Layout strategies keep child coordinates relative to their domain. The
    // display router identifies the same nodes by their projected absolute
    // geometry, so staged snapshots must use that canonical representation too.
    const projectedInput = projectBaseReactFlowDisplayWorkerInput({
      edges,
      nodes: sourceNodes,
    });
    const identity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: projectedInput.nodes,
      edges: projectedInput.edges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    });
    const written = writeBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: identity.cacheSignature,
      inputGeometryDigest: identity.geometryDigest,
      sourceEdges: edges,
      sourceNodes,
      displayPatches: patches,
      outputRouteSignature,
      ...hardReportIdentity,
    });
    return written ? identity : null;
  };
  const primaryIdentity = writeSnapshot(routedEdges, displayPatches);
  const sourcePatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges);
  const sourceIdentity = sourcePatches ? writeSnapshot(sourceEdges, sourcePatches) : null;
  if (primaryIdentity) markBaseReactFlowStagedLayoutSnapshotHandoff(routedEdges);
  updateDisplayRoutingDebugState({
    stagedLayoutPrimarySignature: primaryIdentity?.cacheSignature,
    stagedLayoutPrimaryGeometryDigest: primaryIdentity?.geometryDigest,
    stagedLayoutSourceSignature: sourceIdentity?.cacheSignature,
    stagedLayoutSourceGeometryDigest: sourceIdentity?.geometryDigest,
  });
  return primaryIdentity !== null;
};

/** Routes target layout geometry without mutating the visible graph. */
export const stageBaseReactFlowLayoutRouting = async ({
  workerRef,
  requestId,
  sourceEdges,
  sourceNodes,
  enableSmartEdges = true,
  smartEdgePadding = 20,
  isLargeGraph,
  signal,
}: {
  workerRef: MutableRefObject<Worker | null>;
  requestId: string;
  sourceEdges: Edge[];
  sourceNodes: Node[];
  enableSmartEdges?: boolean;
  smartEdgePadding?: number;
  isLargeGraph: boolean;
  signal?: AbortSignal;
}): Promise<BaseReactFlowLayoutRoutingCommit> => {
  const unseededSourceEdges = sourceEdges.map(edge => ({
    ...edge,
    data: clearBaseReactFlowLayoutEdgeRoutingData(edge.data),
  }));
  const projectedSource = projectBaseReactFlowDisplayWorkerInput({
    edges: unseededSourceEdges,
    nodes: sourceNodes,
  });
  const projectedIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
    nodes: projectedSource.nodes,
    edges: projectedSource.edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
  const cached = readBaseReactFlowDisplayCommittedSnapshot({
    inputSignature: projectedIdentity.cacheSignature,
    inputGeometryDigest: projectedIdentity.geometryDigest,
    sourceEdges: unseededSourceEdges,
  });
  const cachedEdges = cached
    ? lockFinalDisplayComputedPaths(cached.edges, projectedSource.nodes)
    : null;
  const cachedHardReportDigest = cached?.baseline.hardReportDigest;
  if (cachedEdges && writeBaseReactFlowStagedLayoutSnapshot({
    sourceEdges: unseededSourceEdges,
    routedEdges: cachedEdges,
    sourceNodes: projectedSource.nodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    hardReportDigest: cachedHardReportDigest,
  })) {
    return { routedEdges: cachedEdges };
  }
  const stagedSeedEdges = seedBaseReactFlowStagedLayoutEdges({
    sourceEdges,
    sourceNodes,
  });
  // ELK and the geometry-anchored fallback already provide a complete hidden
  // candidate. Run the bounded measured repair first: clean candidates commit
  // in one short pass, while rejected candidates still fall through to the
  // unchanged full-quality route and hard gate.
  const candidateRepairResult = await repairBaseReactFlowDisplayEdgesInWorker({
    workerRef,
    requestId: `${requestId}:candidate-repair`,
    edges: stagedSeedEdges,
    nodes: sourceNodes,
    timeoutMs: LAYOUT_DISPLAY_WORKER_TIMEOUT_MS,
    signal,
    requireHardClean: false,
    repairMode: 'bounded',
  });
  const candidateCommit = candidateRepairResult.hardClean
    ? commitBaseReactFlowStagedLayoutRoutingResult({
      sourceEdges: unseededSourceEdges,
      sourceNodes: projectedSource.nodes,
      workerResult: candidateRepairResult,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    })
    : null;
  if (candidateCommit) {
    return candidateCommit;
  }
  const fallbackSeedEdges = seedBaseReactFlowStagedLayoutEdges({
    sourceEdges: unseededSourceEdges,
    sourceNodes,
  });
  const initialResult = await computeBaseReactFlowDisplayEdgesInWorker({
    workerRef,
    requestId,
    edges: fallbackSeedEdges,
    nodes: sourceNodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    displayEdgeEpoch: 0,
    inputSignature: projectedIdentity.cacheSignature,
    inputGeometryDigest: projectedIdentity.geometryDigest,
    qualityMode: 'full',
    timeoutMs: LAYOUT_FULL_DISPLAY_WORKER_TIMEOUT_MS,
    signal,
  });
  const workerResult = initialResult;
  const committed = commitBaseReactFlowStagedLayoutRoutingResult({
    sourceEdges: unseededSourceEdges,
    sourceNodes: projectedSource.nodes,
    workerResult,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
  if (!committed) {
    if (import.meta.env.DEV) {
      recordBaseReactFlowRejectedDisplayDiagnostics({
        edges: workerResult.edges,
        nodes: sourceNodes,
        sourceEdges,
        initialEdges: initialResult.edges,
      });
    }
    throw new Error('layout-routing-hard-quality-rejected');
  }
  return committed;
};
