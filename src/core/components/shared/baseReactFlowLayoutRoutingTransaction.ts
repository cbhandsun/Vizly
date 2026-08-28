import type { Edge, Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';
import type { RoutingPatch } from '../../routing/routingPatch';

import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import {
  readBaseReactFlowDisplayCommittedSnapshot,
  markBaseReactFlowStagedLayoutSnapshotHandoff,
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
import { baseReactFlowDisplayCommercialQualityIsClean } from './baseReactFlowDisplayCommercialQuality';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import { clearBaseReactFlowLayoutEdgeRoutingData } from './baseReactFlowLayoutEdgeRoutingData';
import { updateDisplayRoutingDebugState } from './baseReactFlowDisplayRoutingDebug';
import {
  auditBaseReactFlowLayoutCandidateSeed,
  shouldSkipBaseReactFlowLayoutCandidateRepair,
} from './baseReactFlowLayoutCandidateSeedAudit';
import type { DisplayRoutingWorkerCommitReceipt } from './baseReactFlowDisplayWorkerCommitReceipt';
import {
  createDisplayRoutingIdentity,
  displayRoutingIdentitiesMatch,
} from './baseReactFlowDisplayRoutingSession';
import type { BaseReactFlowRoutingSessionRuntime } from './baseReactFlowRoutingSessionRuntime';

export { clearBaseReactFlowLayoutEdgeRoutingData } from './baseReactFlowLayoutEdgeRoutingData';

export type BaseReactFlowLayoutRoutingCommit = Readonly<{
  committedSourceEdges: Edge[];
  routedEdges: Edge[];
  commitSnapshot: (runtime: BaseReactFlowRoutingSessionRuntime) => boolean;
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
  retainWorkerSession = true,
}: {
  sourceEdges: Edge[];
  sourceNodes: Node[];
  workerResult: BaseReactFlowDisplayWorkerResult;
  enableSmartEdges?: boolean;
  smartEdgePadding?: number;
  isLargeGraph?: boolean;
  /**
   * A bounded layout repair is evaluated from seeded edges. Its receipt proves
   * the canonical identity and final quality, but its Worker-private session
   * still records the seeded graph as the source. Omitting that session keeps
   * incremental routing on the portable canonical snapshot instead.
   */
  retainWorkerSession?: boolean;
}): BaseReactFlowLayoutRoutingCommit | null => {
  if (!Array.isArray(workerResult.routingPatches) || !workerResult.commitReceipt) return null;
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

  return {
    committedSourceEdges: sourceEdges,
    routedEdges: merged.edges,
    commitSnapshot: runtime => writeBaseReactFlowStagedLayoutSnapshot({
      runtime,
      sourceEdges,
      routedEdges: merged.edges,
      sourceNodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      commitReceipt: workerResult.commitReceipt,
      retainCommitReceiptSession: retainWorkerSession,
    }),
  };
};

const writeBaseReactFlowStagedLayoutSnapshot = ({
  runtime,
  sourceEdges,
  routedEdges,
  sourceNodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  commitReceipt,
  hardReport,
  hardReportDigest,
  workerSessionRef,
  retainCommitReceiptSession = true,
}: {
  runtime: BaseReactFlowRoutingSessionRuntime;
  sourceEdges: Edge[];
  routedEdges: Edge[];
  sourceNodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  commitReceipt?: DisplayRoutingWorkerCommitReceipt;
  hardReport?: RoutingCommittedSnapshot['hardReport'];
  hardReportDigest?: RoutingCommittedSnapshot['hardReportDigest'];
  workerSessionRef?: RoutingCommittedSnapshot['workerSessionRef'];
  retainCommitReceiptSession?: boolean;
}): boolean => {
  const hardReportIdentity = commitReceipt
    ? { hardReport: commitReceipt.hardReport }
    : hardReport
      ? { hardReport }
      : hardReportDigest
        ? { hardReportDigest }
        : null;
  if (!hardReportIdentity) return false;
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routedEdges);
  const displayPatches = createBaseReactFlowDisplayEdgePatches(routedEdges, routedEdges);
  if (!outputRouteSignature || !displayPatches) return false;
  if (commitReceipt) {
    const projectedInput = projectBaseReactFlowDisplayWorkerInput({
      edges: sourceEdges,
      nodes: sourceNodes,
    });
    const sourceIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: projectedInput.nodes,
      edges: projectedInput.edges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    });
    const expectedIdentity = createDisplayRoutingIdentity(
      sourceIdentity.cacheSignature,
      sourceIdentity.geometryDigest,
    );
    if (
      !displayRoutingIdentitiesMatch(commitReceipt.identity, expectedIdentity)
      || commitReceipt.outputRouteSignature !== outputRouteSignature
    ) return false;
  }
  const safeWorkerSessionRef = retainCommitReceiptSession
    ? (commitReceipt?.sessionRef ?? workerSessionRef)
    : workerSessionRef;
  const writeSnapshot = (
    edges: Edge[],
    patches: RoutingPatch[],
    snapshotWorkerSessionRef: RoutingCommittedSnapshot['workerSessionRef'],
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
    const committed = runtime.commitDisplaySnapshot({
      inputSignature: identity.cacheSignature,
      inputGeometryDigest: identity.geometryDigest,
      sourceEdges: edges,
      sourceNodes,
      displayPatches: patches,
      outputRouteSignature,
      workerSessionRef: snapshotWorkerSessionRef,
      ...hardReportIdentity,
    });
    return committed ? identity : null;
  };
  const primaryIdentity = writeSnapshot(routedEdges, displayPatches, undefined);
  const sourcePatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges);
  const sourceIdentity = sourcePatches
    ? writeSnapshot(sourceEdges, sourcePatches, safeWorkerSessionRef)
    : null;
  if (sourceIdentity) markBaseReactFlowStagedLayoutSnapshotHandoff(sourceEdges);
  updateDisplayRoutingDebugState({
    stagedLayoutPrimarySignature: primaryIdentity?.cacheSignature,
    stagedLayoutPrimaryGeometryDigest: primaryIdentity?.geometryDigest,
    stagedLayoutSourceSignature: sourceIdentity?.cacheSignature,
    stagedLayoutSourceGeometryDigest: sourceIdentity?.geometryDigest,
  });
  return sourceIdentity !== null;
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
  const cachedHardReport = cached?.baseline.hardReport;
  const cachedWorkerSessionRef = cached?.baseline.workerSessionRef;
  if (cachedEdges && cachedHardReportDigest) {
    return {
      committedSourceEdges: unseededSourceEdges,
      routedEdges: cachedEdges,
      commitSnapshot: runtime => writeBaseReactFlowStagedLayoutSnapshot({
        runtime,
        sourceEdges: unseededSourceEdges,
        routedEdges: cachedEdges,
        sourceNodes: projectedSource.nodes,
        enableSmartEdges,
        smartEdgePadding,
        isLargeGraph,
        hardReport: cachedHardReport,
        hardReportDigest: cachedHardReportDigest,
        workerSessionRef: cachedWorkerSessionRef,
      }),
    };
  }
  const stagedSeedEdges = seedBaseReactFlowStagedLayoutEdges({
    sourceEdges,
    sourceNodes,
  });
  const seedAudit = auditBaseReactFlowLayoutCandidateSeed(
    stagedSeedEdges,
    projectedSource.nodes,
  );
  updateDisplayRoutingDebugState({
    layoutSeedTerminalsAttached: seedAudit.terminalsAttached,
    layoutSeedTerminalsAnchored: seedAudit.terminalsAnchored,
    layoutSeedObstacleHits: seedAudit.obstacleHits,
    layoutSeedStrictCrossings: seedAudit.strictCrossings,
  });
  const skipBoundedCandidateRepair = shouldSkipBaseReactFlowLayoutCandidateRepair(
    stagedSeedEdges.length,
    seedAudit,
  );
  // ELK and the geometry-anchored fallback already provide a complete hidden
  // candidate. Near-clean seeds retain the bounded measured repair and can
  // commit in one short pass. A detached seed with at least one strict
  // crossing per edge is already compound-dirty; send it directly through the
  // canonical exact audit and unchanged full-route fallback instead of paying
  // for a measured pass known not to reduce that defect class.
  const candidateRepairResult = skipBoundedCandidateRepair
    ? null
    : await repairBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: `${requestId}:candidate-repair`,
      edges: stagedSeedEdges,
      nodes: sourceNodes,
      timeoutMs: LAYOUT_DISPLAY_WORKER_TIMEOUT_MS,
      signal,
      requireHardClean: false,
      repairMode: 'bounded',
      inputSignature: projectedIdentity.cacheSignature,
      inputGeometryDigest: projectedIdentity.geometryDigest,
    });
  if (
    candidateRepairResult?.hardClean
    && baseReactFlowDisplayCommercialQualityIsClean(candidateRepairResult.edges)
  ) {
    const boundedCommit = commitBaseReactFlowStagedLayoutRoutingResult({
      sourceEdges: unseededSourceEdges,
      sourceNodes: projectedSource.nodes,
      workerResult: candidateRepairResult,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      // The repair session is seeded-edge-relative. The committed snapshot
      // remains canonical and portable, but must not advertise that session
      // as an incremental baseline for the unseeded source graph.
      retainWorkerSession: false,
    });
    if (boundedCommit) return boundedCommit;
  }
  // The bounded repair uses seeded paths as its working source. Promote its
  // result through a canonical source-edge request before committing so the
  // Worker-private session stores source -> final patches under the same
  // identity exposed to the incremental client.
  const canonicalCandidateEdges = candidateRepairResult?.hardClean
    ? candidateRepairResult.edges
    : skipBoundedCandidateRepair
      ? stagedSeedEdges
      : seedBaseReactFlowStagedLayoutEdges({
        sourceEdges: unseededSourceEdges,
        sourceNodes,
      });
  const initialResult = await computeBaseReactFlowDisplayEdgesInWorker({
    workerRef,
    requestId,
    edges: unseededSourceEdges,
    nodes: sourceNodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    displayEdgeEpoch: 0,
    inputSignature: projectedIdentity.cacheSignature,
    inputGeometryDigest: projectedIdentity.geometryDigest,
    cachedCandidateEdges: canonicalCandidateEdges,
    candidateSource: 'persistent',
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
