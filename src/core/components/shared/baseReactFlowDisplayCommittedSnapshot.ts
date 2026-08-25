import type { Edge, Node } from '@xyflow/react';

import {
  createPersistedRoutingCandidate,
  createRoutingOnlyDocumentSnapshot,
  type RoutingOnlyDocumentSnapshot,
} from '../../routing/persistedRoutingCandidate';
import { EDGE_ROUTING_CACHE_VERSION } from '../../routing/routingVersion';
import { isDisplayRoutingCapabilityEnabled } from '../../routing/displayRoutingCapabilities';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  computeDisplayRoutingHardReportDigest,
  isDisplayRoutingHardReportDigest,
  type DisplayRoutingHardReportDigest,
} from './baseReactFlowDisplayHardReportDigest';

import {
  baseReactFlowDisplayOutputRouteSignatureMatches,
  isBaseReactFlowDisplayOutputRouteSignature,
} from './baseReactFlowDisplayCache';
import { isBaseReactFlowDisplayGeometryDigest } from './baseReactFlowDisplayInputIdentity';
import {
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDisplayCachePatches,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';
import {
  displayRoutingIdentitiesMatch,
  createDisplayRoutingIdentity,
  isDisplayRoutingWorkerSessionRef,
  type RoutingWorkerSessionRef,
  type RoutingIdentity,
} from './baseReactFlowDisplayRoutingSession';
import { publishBaseReactFlowPrecompiledCommittedRoute } from './baseReactFlowPrecompiledCaptureMode';

const MAX_COMMITTED_DISPLAY_SNAPSHOTS = 16;
const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;

type CommittedHardReportIdentity =
  | Readonly<{ hardReport: BaseDisplayBoundedCandidateReport; hardReportDigest?: never }>
  | Readonly<{ hardReport?: never; hardReportDigest: DisplayRoutingHardReportDigest }>;

export type RoutingCommittedSnapshot = Readonly<{
  identity: RoutingIdentity;
  projectedSourceGeometry: Readonly<{
    nodes: Node[];
    edges: Edge[];
  }>;
  routingPatches: Edge[];
  outputRouteSignature: string;
  hardReportDigest: DisplayRoutingHardReportDigest;
  workerSessionRef?: RoutingWorkerSessionRef;
}>;

/** Transitional aliases keep existing incremental callers source-compatible. */
export type BaseReactFlowDisplayCommittedSnapshotBaseline = RoutingCommittedSnapshot & Readonly<{
  inputSignature: string;
  inputGeometryDigest: string;
  nodes: Node[];
  sourceEdges: Edge[];
  displayPatches: Edge[];
  outputRouteSignature: string;
  workerSessionRef?: RoutingWorkerSessionRef;
}>;

export type BaseReactFlowDisplayCommittedSnapshotHit = Readonly<{
  edges: Edge[];
  outputRouteSignature: string;
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline;
}>;

export const doesBaseReactFlowDisplayCommittedBaselineMatchIdentity = (
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline | null,
  inputSignature: string,
  inputGeometryDigest: string,
): baseline is BaseReactFlowDisplayCommittedSnapshotBaseline => (
  baseline?.identity.inputSignature === inputSignature
  && baseline.identity.inputGeometryDigest === inputGeometryDigest
);

const committedDisplaySnapshots =
  new Map<string, BaseReactFlowDisplayCommittedSnapshotBaseline>();
let committedSnapshotBySourceEdges =
  new WeakMap<Edge[], BaseReactFlowDisplayCommittedSnapshotBaseline>();

const snapshotKey = (inputSignature: string, inputGeometryDigest: string): string => (
  `${inputSignature}\u0000${inputGeometryDigest}`
);

const hasValidIdentity = (
  inputSignature: unknown,
  inputGeometryDigest: unknown,
): inputSignature is string => (
  typeof inputSignature === 'string'
  && INPUT_SIGNATURE_PATTERN.test(inputSignature)
  && isBaseReactFlowDisplayGeometryDigest(inputGeometryDigest)
);

const rememberSnapshot = (
  key: string,
  snapshot: BaseReactFlowDisplayCommittedSnapshotBaseline,
): void => {
  if (committedDisplaySnapshots.has(key)) committedDisplaySnapshots.delete(key);
  committedDisplaySnapshots.set(key, snapshot);
  while (committedDisplaySnapshots.size > MAX_COMMITTED_DISPLAY_SNAPSHOTS) {
    const oldestKey = committedDisplaySnapshots.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    committedDisplaySnapshots.delete(oldestKey);
  }
};

export const writeBaseReactFlowDisplayCommittedSnapshot = (options: {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceEdges: Edge[];
  sourceNodes: Node[];
  displayPatches: Edge[];
  outputRouteSignature: string | null;
  workerSessionRef?: RoutingWorkerSessionRef;
} & CommittedHardReportIdentity): boolean => {
  if (!isDisplayRoutingCapabilityEnabled('routingSessionSnapshot')) return false;
  const snapshot = createCommittedSnapshot(options);
  if (!snapshot) return false;
  rememberSnapshot(
    snapshotKey(options.inputSignature, options.inputGeometryDigest),
    snapshot,
  );
  committedSnapshotBySourceEdges.set(options.sourceEdges, snapshot);
  return true;
};

const createCommittedSnapshot = ({
  inputSignature,
  inputGeometryDigest,
  sourceEdges,
  sourceNodes,
  displayPatches,
  outputRouteSignature,
  hardReport,
  hardReportDigest,
  workerSessionRef,
}: {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceEdges: Edge[];
  sourceNodes: Node[];
  displayPatches: Edge[];
  outputRouteSignature: string | null;
  workerSessionRef?: RoutingWorkerSessionRef;
} & CommittedHardReportIdentity): BaseReactFlowDisplayCommittedSnapshotBaseline | null => {
  if (
    !hasValidIdentity(inputSignature, inputGeometryDigest)
    || !isBaseReactFlowDisplayOutputRouteSignature(outputRouteSignature)
  ) return null;
  const safePatches = sanitizeBaseReactFlowTrustedDisplayPatches(sourceEdges, displayPatches);
  if (!safePatches) return null;
  const replayedEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, safePatches);
  if (
    !replayedEdges
    || !baseReactFlowDisplayOutputRouteSignatureMatches(replayedEdges, outputRouteSignature)
  ) return null;
  const projectedInput = projectBaseReactFlowDisplayWorkerInput({
    edges: sourceEdges,
    nodes: sourceNodes,
  });
  const expectedIdentity = createDisplayRoutingIdentity(inputSignature, inputGeometryDigest);
  const safeHardReportDigest = hardReport
    ? computeDisplayRoutingHardReportDigest(hardReport)
    : isDisplayRoutingHardReportDigest(hardReportDigest)
      ? hardReportDigest
      : null;
  if (!safeHardReportDigest) return null;
  const safeWorkerSessionRef = isDisplayRoutingWorkerSessionRef(workerSessionRef)
    && displayRoutingIdentitiesMatch(workerSessionRef.identity, expectedIdentity)
    && workerSessionRef.outputRouteSignature === outputRouteSignature
    ? workerSessionRef
    : undefined;
  return {
    identity: expectedIdentity,
    projectedSourceGeometry: {
      nodes: projectedInput.nodes,
      edges: projectedInput.edges,
    },
    routingPatches: safePatches,
    hardReportDigest: safeHardReportDigest,
    inputSignature,
    inputGeometryDigest,
    nodes: projectedInput.nodes,
    sourceEdges: projectedInput.edges,
    displayPatches: safePatches,
    outputRouteSignature,
    ...(safeWorkerSessionRef ? { workerSessionRef: safeWorkerSessionRef } : {}),
  };
};

export const readBaseReactFlowDisplayCommittedSnapshot = ({
  inputSignature,
  inputGeometryDigest,
  sourceEdges,
}: {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceEdges: Edge[];
}): BaseReactFlowDisplayCommittedSnapshotHit | null => {
  if (!isDisplayRoutingCapabilityEnabled('routingSessionSnapshot')) return null;
  if (!hasValidIdentity(inputSignature, inputGeometryDigest)) return null;
  const key = snapshotKey(inputSignature, inputGeometryDigest);
  const snapshot = committedDisplaySnapshots.get(key);
  if (!snapshot) return null;
  const displayPatches = sanitizeBaseReactFlowTrustedDisplayPatches(
    sourceEdges,
    snapshot.displayPatches,
  );
  const edges = displayPatches
    ? mergeBaseReactFlowDisplayEdgePatches(sourceEdges, displayPatches)
    : null;
  if (
    !edges
    || !baseReactFlowDisplayOutputRouteSignatureMatches(
      edges,
      snapshot.outputRouteSignature,
    )
  ) return null;
  const baselineInput = projectBaseReactFlowDisplayWorkerInput({
    edges: snapshot.sourceEdges,
    nodes: snapshot.nodes,
  });
  committedSnapshotBySourceEdges.set(sourceEdges, snapshot);
  return {
    edges,
    outputRouteSignature: snapshot.outputRouteSignature,
    baseline: {
      identity: snapshot.identity,
      projectedSourceGeometry: {
        nodes: baselineInput.nodes,
        edges: baselineInput.edges,
      },
      routingPatches: sanitizeBaseReactFlowTrustedDisplayPatches(
        snapshot.sourceEdges,
        snapshot.displayPatches,
      ) ?? [],
      hardReportDigest: snapshot.hardReportDigest,
      inputSignature: snapshot.inputSignature,
      inputGeometryDigest: snapshot.inputGeometryDigest,
      nodes: baselineInput.nodes,
      sourceEdges: baselineInput.edges,
      displayPatches: sanitizeBaseReactFlowTrustedDisplayPatches(
        snapshot.sourceEdges,
        snapshot.displayPatches,
      ) ?? [],
      outputRouteSignature: snapshot.outputRouteSignature,
      ...(snapshot.workerSessionRef ? { workerSessionRef: snapshot.workerSessionRef } : {}),
    },
  };
};

export const commitBaseReactFlowDisplaySnapshot = (options: {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceEdges: Edge[];
  sourceNodes: Node[];
  displayPatches: Edge[];
  outputRouteSignature: string | null;
  workerSessionRef?: RoutingWorkerSessionRef;
  precompiledCapturePresetId?: string | null;
} & CommittedHardReportIdentity): BaseReactFlowDisplayCommittedSnapshotBaseline | null => {
  if (!isDisplayRoutingCapabilityEnabled('routingSessionSnapshot')) return null;
  const snapshot = createCommittedSnapshot(options);
  if (!snapshot) return null;
  rememberSnapshot(
    snapshotKey(options.inputSignature, options.inputGeometryDigest),
    snapshot,
  );
  committedSnapshotBySourceEdges.set(options.sourceEdges, snapshot);
  if (options.precompiledCapturePresetId) {
    publishBaseReactFlowPrecompiledCommittedRoute({
      presetId: options.precompiledCapturePresetId,
      inputSignature: options.inputSignature,
      inputGeometryDigest: options.inputGeometryDigest,
      outputRouteSignature: snapshot.outputRouteSignature,
      sourceEdges: options.sourceEdges,
      displayPatches: options.displayPatches,
    });
  }
  return snapshot;
};

export const clearBaseReactFlowDisplayCommittedSnapshots = (): void => {
  committedDisplaySnapshots.clear();
  committedSnapshotBySourceEdges = new WeakMap<Edge[], BaseReactFlowDisplayCommittedSnapshotBaseline>();
};

/**
 * Creates a portable routing-only snapshot only from geometry that Canvas has
 * atomically committed for this exact source-edge collection. Display paint,
 * marker, label, selection, and business metadata are never serialized here.
 */
export const createBaseReactFlowRoutingOnlyDocumentSnapshot = (
  sourceEdges: Edge[],
): RoutingOnlyDocumentSnapshot | null => {
  if (!isDisplayRoutingCapabilityEnabled('routingOnlyDocumentSnapshot')) return null;
  const snapshot = committedSnapshotBySourceEdges.get(sourceEdges);
  if (
    !snapshot
    || snapshot.projectedSourceGeometry.edges.length !== sourceEdges.length
  ) return null;
  const safePatches = sanitizeBaseReactFlowDisplayCachePatches(
    sourceEdges,
    snapshot.routingPatches,
  );
  if (!safePatches) return null;
  const replayedEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, safePatches);
  if (
    !replayedEdges
    || !baseReactFlowDisplayOutputRouteSignatureMatches(
      replayedEdges,
      snapshot.outputRouteSignature,
    )
  ) return null;
  const candidate = createPersistedRoutingCandidate({
    routingVersion: EDGE_ROUTING_CACHE_VERSION,
    inputSignature: snapshot.identity.inputSignature,
    inputGeometryDigest: snapshot.identity.inputGeometryDigest,
    outputRouteSignature: snapshot.outputRouteSignature,
    patches: safePatches,
  });
  return candidate ? createRoutingOnlyDocumentSnapshot(candidate) : null;
};
