import type { Edge, Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';

import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import {
  readBaseReactFlowDisplayCommittedSnapshot,
  writeBaseReactFlowDisplayCommittedSnapshot,
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
import { LAYOUT_DISPLAY_WORKER_TIMEOUT_MS } from './baseReactFlowDisplayWorkerTimeout';
import { recordBaseReactFlowRejectedDisplayDiagnostics } from './baseReactFlowDisplayRejectedDiagnostics';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';

export type BaseReactFlowLayoutRoutingCommit = Readonly<{
  routedEdges: Edge[];
}>;

export const clearBaseReactFlowLayoutEdgeRoutingData = (data: Edge['data']): Edge['data'] => ({
  ...data,
  waypoints: [],
  computedPath: undefined,
  elkPath: undefined,
  treeRouting: undefined,
  algorithm: undefined,
  auto: undefined,
  autoSource: undefined,
  autoTarget: undefined,
  _layoutEpoch: undefined,
  layoutPathLocked: undefined,
  _layoutPathLocked: undefined,
  runtimeHandleLock: undefined,
  _runtimeHandleLock: undefined,
  __baseDisplayFinalizedSignature: undefined,
  stablePathQuality: undefined,
  isTreeBus: undefined,
  sharedTrunkAware: undefined,
  sharedTrunkSynthesized: undefined,
  overextendedTargetTrunkCorridorReclaimed: undefined,
  useElkRouting: undefined,
  layoutRoutingCandidate: undefined,
  h: undefined,
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
  return repairResidualHairpinBridges(axisRepairedEdges, projected.nodes);
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
  const workerRoutingPatches = createBaseReactFlowDisplayEdgePatches(
    workerResult.projectedEdges,
    workerResult.edges,
  );
  if (!workerRoutingPatches) return null;

  const merged = mergeBaseReactFlowDisplayRoutingTransactions({
    latestSourceEdges: sourceEdges,
    workerRoutingPatches,
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
}: {
  sourceEdges: Edge[];
  routedEdges: Edge[];
  sourceNodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
}): boolean => {
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routedEdges);
  const displayPatches = createBaseReactFlowDisplayEdgePatches(routedEdges, routedEdges);
  if (!outputRouteSignature || !displayPatches) return false;
  const writeSnapshot = (edges: Edge[], patches: Edge[]): boolean => {
    const identity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: sourceNodes,
      edges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    });
    return writeBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: identity.cacheSignature,
      inputGeometryDigest: identity.geometryDigest,
      sourceEdges: edges,
      sourceNodes,
      displayPatches: patches,
      outputRouteSignature,
    });
  };
  const primaryWritten = writeSnapshot(routedEdges, displayPatches);
  const sourcePatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges);
  if (sourcePatches) writeSnapshot(sourceEdges, sourcePatches);
  return primaryWritten;
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
  if (cachedEdges && writeBaseReactFlowStagedLayoutSnapshot({
    sourceEdges: unseededSourceEdges,
    routedEdges: cachedEdges,
    sourceNodes: projectedSource.nodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
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
      workerResult: {
        ...candidateRepairResult,
        projectedEdges: projectedSource.edges,
      },
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
    qualityMode: 'full',
    timeoutMs: LAYOUT_DISPLAY_WORKER_TIMEOUT_MS,
    signal,
  });
  const workerResult = {
    ...initialResult,
    // Route patches must be calculated against the unseeded business graph;
    // otherwise an unchanged successful seed would disappear during merge.
    projectedEdges: projectedSource.edges,
  };
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
