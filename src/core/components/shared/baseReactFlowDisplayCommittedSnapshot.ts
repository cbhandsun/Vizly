import type { Edge, Node } from '@xyflow/react';

import {
  baseReactFlowDisplayOutputRouteSignatureMatches,
  isBaseReactFlowDisplayOutputRouteSignature,
} from './baseReactFlowDisplayCache';
import { isBaseReactFlowDisplayGeometryDigest } from './baseReactFlowDisplayInputIdentity';
import {
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';

const MAX_COMMITTED_DISPLAY_SNAPSHOTS = 16;
const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;

export type BaseReactFlowDisplayCommittedSnapshotBaseline = Readonly<{
  inputSignature: string;
  inputGeometryDigest: string;
  nodes: Node[];
  sourceEdges: Edge[];
  displayPatches: Edge[];
  outputRouteSignature: string;
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
  baseline?.inputSignature === inputSignature
  && baseline.inputGeometryDigest === inputGeometryDigest
);

const committedDisplaySnapshots =
  new Map<string, BaseReactFlowDisplayCommittedSnapshotBaseline>();

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

export const writeBaseReactFlowDisplayCommittedSnapshot = ({
  inputSignature,
  inputGeometryDigest,
  sourceEdges,
  sourceNodes,
  displayPatches,
  outputRouteSignature,
}: {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceEdges: Edge[];
  sourceNodes: Node[];
  displayPatches: Edge[];
  outputRouteSignature: string | null;
}): boolean => {
  if (
    !hasValidIdentity(inputSignature, inputGeometryDigest)
    || !isBaseReactFlowDisplayOutputRouteSignature(outputRouteSignature)
  ) return false;
  const safePatches = sanitizeBaseReactFlowTrustedDisplayPatches(sourceEdges, displayPatches);
  if (!safePatches) return false;
  const replayedEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, safePatches);
  if (
    !replayedEdges
    || !baseReactFlowDisplayOutputRouteSignatureMatches(replayedEdges, outputRouteSignature)
  ) return false;
  const projectedInput = projectBaseReactFlowDisplayWorkerInput({
    edges: sourceEdges,
    nodes: sourceNodes,
  });
  rememberSnapshot(snapshotKey(inputSignature, inputGeometryDigest), {
    inputSignature,
    inputGeometryDigest,
    nodes: projectedInput.nodes,
    sourceEdges: projectedInput.edges,
    displayPatches: safePatches,
    outputRouteSignature,
  });
  return true;
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
  return {
    edges,
    outputRouteSignature: snapshot.outputRouteSignature,
    baseline: {
      inputSignature: snapshot.inputSignature,
      inputGeometryDigest: snapshot.inputGeometryDigest,
      nodes: baselineInput.nodes,
      sourceEdges: baselineInput.edges,
      displayPatches: sanitizeBaseReactFlowTrustedDisplayPatches(
        snapshot.sourceEdges,
        snapshot.displayPatches,
      ) ?? [],
      outputRouteSignature: snapshot.outputRouteSignature,
    },
  };
};

export const clearBaseReactFlowDisplayCommittedSnapshots = (): void => {
  committedDisplaySnapshots.clear();
};
