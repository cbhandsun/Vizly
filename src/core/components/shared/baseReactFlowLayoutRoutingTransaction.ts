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
  computeBaseReactFlowLayoutRepairAndRouteInWorker,
  projectBaseReactFlowDisplayWorkerInput,
  type BaseReactFlowDisplayWorkerResult,
} from './baseReactFlowDisplayWorkerClient';
import {
  LAYOUT_FULL_DISPLAY_WORKER_TIMEOUT_MS,
} from './baseReactFlowDisplayWorkerTimeout';
import { recordBaseReactFlowRejectedDisplayDiagnostics } from './baseReactFlowDisplayRejectedDiagnostics';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
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
import {
  loadBaseReactFlowPrecompiledRouteCandidate,
  type BaseReactFlowPrecompiledRouteLookupInput,
} from './baseReactFlowPrecompiledRouteRegistry';
import type { BaseReactFlowPrecompiledLayoutRegeneration } from './baseReactFlowPrecompiledCaptureMode';
import { isBaseReactFlowDisplayDiagnosticsEnabled } from './baseReactFlowDisplayDiagnostics';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalValidation';

export { clearBaseReactFlowLayoutEdgeRoutingData } from './baseReactFlowLayoutEdgeRoutingData';

export type BaseReactFlowLayoutRoutingCommit = Readonly<{
  committedSourceEdges: Edge[];
  routedEdges: Edge[];
  commitSnapshot: (runtime: BaseReactFlowRoutingSessionRuntime) => boolean;
}>;

export type BaseReactFlowLayoutPrecompiledCandidateLoader = (
  input: BaseReactFlowPrecompiledRouteLookupInput,
) => Promise<Edge[] | null>;

type BaseReactFlowLayoutPrecompiledCapture = BaseReactFlowPrecompiledLayoutRegeneration & Readonly<{
  provenance: 'fresh-layout-repair-validated' | 'fresh-full-route';
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
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(projected.nodes);
  const recoveredEdges = anchoredEdges.map((edge) => {
    const data = edge.data && typeof edge.data === 'object'
      ? edge.data as Record<string, unknown>
      : {};
    if (
      data.algorithm !== 'elk-layout-candidate'
      || terminalSnapshot.validateEdge(edge).attached
    ) return edge;

    return synthesizeStableFallbackPath({
      edge: {
        ...edge,
        data: clearBaseReactFlowLayoutEdgeRoutingData(edge.data),
      },
      nodeById,
    });
  });
  const axisRepairedEdges = repairAxisMismatchedTerminalsWithBoundedPortRoles(
    recoveredEdges,
    projected.nodes,
    Math.min(128, Math.max(32, recoveredEdges.length * 4)),
  );
  const geometryNormalizedEdges = repairResidualHairpinBridges(
    axisRepairedEdges,
    projected.nodes,
  );
  // The Worker owns graph-wide shortcut acceptance. Applying the shortest
  // per-edge candidate here can reduce one route while increasing crossings
  // and obstacle hits across the staged graph.
  const finalEdges = geometryNormalizedEdges;
  if (isBaseReactFlowDisplayDiagnosticsEnabled()) {
    updateDisplayRoutingDebugState({
      layoutSeedStageAudits: {
        raw: auditBaseReactFlowLayoutCandidateSeed(seededEdges, projected.nodes),
        anchored: auditBaseReactFlowLayoutCandidateSeed(anchoredEdges, projected.nodes),
        'detached-fallback': auditBaseReactFlowLayoutCandidateSeed(
          recoveredEdges,
          projected.nodes,
        ),
        'axis-repaired': auditBaseReactFlowLayoutCandidateSeed(
          axisRepairedEdges,
          projected.nodes,
        ),
        'geometry-normalized': auditBaseReactFlowLayoutCandidateSeed(
          geometryNormalizedEdges,
          projected.nodes,
        ),
        final: auditBaseReactFlowLayoutCandidateSeed(finalEdges, projected.nodes),
      },
    });
  }
  return finalEdges;
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
  precompiledLayoutCapture,
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
  precompiledLayoutCapture?: BaseReactFlowLayoutPrecompiledCapture;
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
      precompiledLayoutCapture,
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
  precompiledLayoutCapture,
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
  precompiledLayoutCapture?: BaseReactFlowLayoutPrecompiledCapture;
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
    snapshotPrecompiledLayoutCapture?: BaseReactFlowLayoutPrecompiledCapture,
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
      precompiledLayoutCapture: snapshotPrecompiledLayoutCapture,
      ...hardReportIdentity,
    });
    return committed ? identity : null;
  };
  const primaryIdentity = writeSnapshot(routedEdges, displayPatches, undefined);
  const sourcePatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges);
  const sourceIdentity = sourcePatches
    ? writeSnapshot(
      sourceEdges,
      sourcePatches,
      safeWorkerSessionRef,
      precompiledLayoutCapture,
    )
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
  forceFreshFullRoute = false,
  loadPrecompiledCandidate = loadBaseReactFlowPrecompiledRouteCandidate,
  fullRouteTimeoutMs = LAYOUT_FULL_DISPLAY_WORKER_TIMEOUT_MS,
  precompiledLayoutRegeneration,
  rejectObstacleDirtyBoundedCandidate = false,
  candidateRepairPolicy = 'default',
}: {
  workerRef: MutableRefObject<Worker | null>;
  requestId: string;
  sourceEdges: Edge[];
  sourceNodes: Node[];
  enableSmartEdges?: boolean;
  smartEdgePadding?: number;
  isLargeGraph: boolean;
  signal?: AbortSignal;
  forceFreshFullRoute?: boolean;
  loadPrecompiledCandidate?: BaseReactFlowLayoutPrecompiledCandidateLoader;
  fullRouteTimeoutMs?: number;
  precompiledLayoutRegeneration?: BaseReactFlowPrecompiledLayoutRegeneration | null;
  rejectObstacleDirtyBoundedCandidate?: boolean;
  candidateRepairPolicy?: 'default' | 'skip-exact-clean';
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
  const cached = forceFreshFullRoute
    ? null
    : readBaseReactFlowDisplayCommittedSnapshot({
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
  const precompiledCandidateEdges = forceFreshFullRoute
    ? null
    : await loadPrecompiledCandidate({
      inputSignature: projectedIdentity.cacheSignature,
      inputGeometryDigest: projectedIdentity.geometryDigest,
      nodes: projectedSource.nodes,
      edges: unseededSourceEdges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    });
  if (signal?.aborted) throw new Error('layout-routing-cancelled');
  const stagedSeedEdges = precompiledCandidateEdges
    ? null
    : seedBaseReactFlowStagedLayoutEdges({
      sourceEdges,
      sourceNodes,
    });
  const seedAudit = stagedSeedEdges
    ? auditBaseReactFlowLayoutCandidateSeed(stagedSeedEdges, projectedSource.nodes)
    : null;
  if (seedAudit) {
    updateDisplayRoutingDebugState({
      layoutSeedTerminalsAttached: seedAudit.terminalsAttached,
      layoutSeedTerminalsAnchored: seedAudit.terminalsAnchored,
      layoutSeedObstacleHits: seedAudit.obstacleHits,
      layoutSeedStrictCrossings: seedAudit.strictCrossings,
    });
  }
  const skipBoundedCandidateRepair = Boolean(
    stagedSeedEdges
    && seedAudit
    && shouldSkipBaseReactFlowLayoutCandidateRepair(
      stagedSeedEdges.length,
      seedAudit,
      candidateRepairPolicy === 'skip-exact-clean',
    ),
  );
  // ELK and the geometry-anchored fallback already provide a complete hidden
  // candidate. Flat full-graph ELK can opt to send an exact-clean seed directly
  // through the canonical audit; other near-clean seeds retain the bounded
  // measured repair because it materially improves compound candidates. A
  // detached seed with at least one strict
  // crossing per edge is already compound-dirty; send it directly through the
  // canonical exact audit and unchanged full-route fallback instead of paying
  // for a measured pass known not to reduce that defect class.
  const useFusedCandidateRepair = Boolean(
    !precompiledCandidateEdges
    && !skipBoundedCandidateRepair
    && stagedSeedEdges,
  );
  // The fallback candidate must remain byte-equivalent to the second request
  // of the legacy transaction: when measured repair stays dirty it is rebuilt
  // from canonical, routing-free source edges rather than the ELK seed.
  const canonicalCandidateEdges = precompiledCandidateEdges
    ?? (skipBoundedCandidateRepair
      ? stagedSeedEdges ?? []
      : seedBaseReactFlowStagedLayoutEdges({
        sourceEdges: unseededSourceEdges,
        sourceNodes,
      }));
  const initialResult = useFusedCandidateRepair
    ? await computeBaseReactFlowLayoutRepairAndRouteInWorker({
      workerRef,
      requestId,
      edges: unseededSourceEdges,
      nodes: sourceNodes,
      stagedCandidateEdges: stagedSeedEdges ?? [],
      fallbackCandidateEdges: canonicalCandidateEdges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      inputSignature: projectedIdentity.cacheSignature,
      inputGeometryDigest: projectedIdentity.geometryDigest,
      stopAfterObstacleFailure: rejectObstacleDirtyBoundedCandidate,
      timeoutMs: fullRouteTimeoutMs,
      signal,
    })
    : await computeBaseReactFlowDisplayEdgesInWorker({
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
      candidateSource: precompiledCandidateEdges ? 'precompiled' : 'persistent',
      qualityMode: 'full',
      timeoutMs: fullRouteTimeoutMs,
      signal,
    });
  if (
    rejectObstacleDirtyBoundedCandidate
    && initialResult.routeResolution === 'repair'
    && initialResult.hardClean === false
    && (initialResult.hardReport?.obstacleHits ?? 0) > 0
  ) throw new Error('layout-routing-hard-quality-rejected');
  const workerResult = initialResult;
  const precompiledLayoutCapture = precompiledLayoutRegeneration
    ? {
      ...precompiledLayoutRegeneration,
      provenance: workerResult.routeResolution === 'full-route'
        || workerResult.routeResolution === 'full-route-repaired'
        ? 'fresh-full-route' as const
        : 'fresh-layout-repair-validated' as const,
    }
    : undefined;
  const committed = commitBaseReactFlowStagedLayoutRoutingResult({
    sourceEdges: unseededSourceEdges,
    sourceNodes: projectedSource.nodes,
    workerResult,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    precompiledLayoutCapture,
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
