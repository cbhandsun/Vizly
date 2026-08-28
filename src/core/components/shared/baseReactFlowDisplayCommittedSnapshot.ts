import type { Edge, Node } from '@xyflow/react';

import {
  createPersistedRoutingCandidate,
  createRoutingOnlyDocumentSnapshot,
  type RoutingOnlyDocumentSnapshot,
} from '../../routing/persistedRoutingCandidate';
import { EDGE_ROUTING_CACHE_VERSION } from '../../routing/routingVersion';
import { isDisplayRoutingCapabilityEnabled } from '../../routing/displayRoutingCapabilities';
import type { RoutingPatch } from '../../routing/routingPatch';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  cloneRoutingHardReport,
  computeDisplayRoutingHardReportDigest,
  isDisplayRoutingHardReportDigest,
  type DisplayRoutingHardReportDigest,
  type RoutingHardReport,
} from './baseReactFlowDisplayHardReportDigest';

import {
  baseReactFlowDisplayOutputRouteSignatureMatches,
  isBaseReactFlowDisplayOutputRouteSignature,
} from './baseReactFlowDisplayCache';
import { isBaseReactFlowDisplayGeometryDigest } from './baseReactFlowDisplayInputIdentity';
import {
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDocumentCandidatePatches,
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
import {
  publishBaseReactFlowPrecompiledCommittedRoute,
  type BaseReactFlowPrecompiledLayoutRegeneration,
} from './baseReactFlowPrecompiledCaptureMode';

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
  routingPatches: RoutingPatch[];
  outputRouteSignature: string;
  hardReportDigest: DisplayRoutingHardReportDigest;
  hardReport?: RoutingHardReport;
  workerSessionRef?: RoutingWorkerSessionRef;
}>;

/** Transitional aliases keep existing incremental callers source-compatible. */
export type BaseReactFlowDisplayCommittedSnapshotBaseline = RoutingCommittedSnapshot & Readonly<{
  inputSignature: string;
  inputGeometryDigest: string;
  nodes: Node[];
  sourceEdges: Edge[];
  displayPatches: RoutingPatch[];
  outputRouteSignature: string;
  workerSessionRef?: RoutingWorkerSessionRef;
}>;

export type BaseReactFlowDisplayCommittedSnapshotHit = Readonly<{
  edges: Edge[];
  outputRouteSignature: string;
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline;
  trustedTransactionHandoff: boolean;
}>;

export const doesBaseReactFlowDisplayCommittedBaselineMatchIdentity = (
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline | null,
  inputSignature: string,
  inputGeometryDigest: string,
): baseline is BaseReactFlowDisplayCommittedSnapshotBaseline => (
  baseline?.identity.inputSignature === inputSignature
  && baseline.identity.inputGeometryDigest === inputGeometryDigest
);

/**
 * A historical L0 entry may bootstrap a canvas or serve the identity that is
 * already active. It must not replace a different active baseline during an
 * edit transition: that would turn undoing a topology edit into an unobserved
 * cache replay and skip the required atomic Worker transaction.
 */
export const canReuseBaseReactFlowDisplayCommittedSnapshot = (
  activeBaseline: BaseReactFlowDisplayCommittedSnapshotBaseline | null,
  candidate: BaseReactFlowDisplayCommittedSnapshotHit | null,
  inputSignature: string,
  inputGeometryDigest: string,
): candidate is BaseReactFlowDisplayCommittedSnapshotHit => (
  candidate !== null
  && (
    candidate.trustedTransactionHandoff
    ||
    activeBaseline === null
    || doesBaseReactFlowDisplayCommittedBaselineMatchIdentity(
      activeBaseline,
      inputSignature,
      inputGeometryDigest,
    )
  )
);

const committedDisplaySnapshots =
  new Map<string, BaseReactFlowDisplayCommittedSnapshotBaseline>();
let committedSnapshotBySourceEdges =
  new WeakMap<Edge[], BaseReactFlowDisplayCommittedSnapshotBaseline>();
let trustedCommittedSnapshotBaselines = new WeakSet<object>();
const stagedLayoutSnapshotHandoffs = new Map<string, number>();
const STAGED_LAYOUT_HANDOFF_TTL_MS = 10_000;

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
  displayPatches: RoutingPatch[];
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
  const safeHardReport = hardReport ? cloneRoutingHardReport(hardReport) : null;
  if (hardReport && !safeHardReport) return null;
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
    ...(safeHardReport ? { hardReport: safeHardReport } : {}),
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
  const handoffExpiresAt = stagedLayoutSnapshotHandoffs.get(key) ?? 0;
  const trustedTransactionHandoff = handoffExpiresAt >= Date.now();
  if (handoffExpiresAt > 0 && !trustedTransactionHandoff) {
    stagedLayoutSnapshotHandoffs.delete(key);
  }
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
  const baseline: BaseReactFlowDisplayCommittedSnapshotBaseline = {
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
    ...(snapshot.hardReport ? { hardReport: snapshot.hardReport } : {}),
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
  };
  trustedCommittedSnapshotBaselines.add(baseline);
  return {
    edges,
    outputRouteSignature: snapshot.outputRouteSignature,
    trustedTransactionHandoff,
    baseline,
  };
};

/** Realm-local proof that a baseline came from the committed snapshot store. */
export const isBaseReactFlowDisplayCommittedSnapshotBaselineTrusted = (
  value: unknown,
): value is BaseReactFlowDisplayCommittedSnapshotBaseline => (
  Boolean(value && typeof value === 'object')
  && trustedCommittedSnapshotBaselines.has(value as object)
);

/** Marks only the exact edge array produced by an active staged layout transaction. */
export const markBaseReactFlowStagedLayoutSnapshotHandoff = (
  sourceEdges: Edge[],
): boolean => {
  const snapshot = committedSnapshotBySourceEdges.get(sourceEdges);
  if (!snapshot) return false;
  stagedLayoutSnapshotHandoffs.set(
    snapshotKey(snapshot.inputSignature, snapshot.inputGeometryDigest),
    Date.now() + STAGED_LAYOUT_HANDOFF_TTL_MS,
  );
  return true;
};

/** Consumes the short-lived layout handoff after Canvas adopts its snapshot. */
export const consumeBaseReactFlowStagedLayoutSnapshotHandoff = (
  candidate: BaseReactFlowDisplayCommittedSnapshotHit,
): void => {
  if (!candidate.trustedTransactionHandoff) return;
  stagedLayoutSnapshotHandoffs.delete(snapshotKey(
    candidate.baseline.inputSignature,
    candidate.baseline.inputGeometryDigest,
  ));
};

export type BaseReactFlowDisplaySnapshotCommitOptions = {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceEdges: Edge[];
  sourceNodes: Node[];
  displayPatches: RoutingPatch[];
  outputRouteSignature: string | null;
  workerSessionRef?: RoutingWorkerSessionRef;
  precompiledCapturePresetId?: string | null;
  precompiledLayoutCapture?: BaseReactFlowPrecompiledLayoutRegeneration & Readonly<{
    provenance: 'fresh-layout-repair-validated' | 'fresh-full-route';
  }>;
} & CommittedHardReportIdentity;

/** Internal mutation primitive; production callers commit through the Canvas runtime. */
export const commitBaseReactFlowDisplaySnapshot = (
  options: BaseReactFlowDisplaySnapshotCommitOptions,
): BaseReactFlowDisplayCommittedSnapshotBaseline | null => {
  if (!isDisplayRoutingCapabilityEnabled('routingSessionSnapshot')) return null;
  const snapshot = createCommittedSnapshot(options);
  if (!snapshot) return null;
  rememberSnapshot(
    snapshotKey(options.inputSignature, options.inputGeometryDigest),
    snapshot,
  );
  trustedCommittedSnapshotBaselines.add(snapshot);
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
  if (options.precompiledLayoutCapture) {
    publishBaseReactFlowPrecompiledCommittedRoute({
      ...options.precompiledLayoutCapture,
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
  trustedCommittedSnapshotBaselines = new WeakSet<object>();
  stagedLayoutSnapshotHandoffs.clear();
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
  const safePatches = sanitizeBaseReactFlowDocumentCandidatePatches(
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
