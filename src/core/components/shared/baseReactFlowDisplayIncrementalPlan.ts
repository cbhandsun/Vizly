import type { Edge, Node } from '@xyflow/react';

import type {
  BaseReactFlowDisplayCommittedSnapshotBaseline,
} from './baseReactFlowDisplayCommittedSnapshot';
import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
  type BaseReactFlowRoutingAffectedClosure,
  type BaseReactFlowRoutingChangeSet,
} from './baseReactFlowDisplayRoutingChangeSet';
import { mergeBaseReactFlowDisplayEdgePatches } from './baseReactFlowDisplayRoutingTransaction';

export type BaseReactFlowDisplayIncrementalPlan = Readonly<{
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline;
  changeSet: BaseReactFlowRoutingChangeSet;
  affectedClosure: BaseReactFlowRoutingAffectedClosure;
}>;

export const createBaseReactFlowDisplayIncrementalPlan = ({
  baseline,
  nextInputSignature,
  nextInputGeometryDigest,
  nextNodes,
  nextEdges,
  draggedNodeIds,
}: {
  baseline: BaseReactFlowDisplayCommittedSnapshotBaseline | null;
  nextInputSignature: string;
  nextInputGeometryDigest: string;
  nextNodes: Node[];
  nextEdges: Edge[];
  draggedNodeIds: readonly string[];
}): BaseReactFlowDisplayIncrementalPlan | null => {
  if (
    !baseline
    || (
      baseline.identity.inputSignature === nextInputSignature
      && baseline.identity.inputGeometryDigest === nextInputGeometryDigest
    )
  ) return null;
  const baselineEdges = mergeBaseReactFlowDisplayEdgePatches(
    baseline.projectedSourceGeometry.edges,
    baseline.routingPatches,
  );
  if (!baselineEdges) return null;
  const changeSet = createBaseReactFlowRoutingChangeSet({
    previousNodes: baseline.projectedSourceGeometry.nodes,
    previousEdges: baseline.projectedSourceGeometry.edges,
    nextNodes,
    nextEdges,
    reasonHint: draggedNodeIds.length > 0 ? 'node-drag' : 'unknown',
  });
  if (
    !changeSet.geometryChanged
    || (
      draggedNodeIds.length > 0
      && !changeSet.changedNodeIds.some(nodeId => draggedNodeIds.includes(nodeId))
    )
  ) return null;
  const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
    changeSet,
    previousNodes: baseline.projectedSourceGeometry.nodes,
    nextNodes,
    baselineEdges,
    nextEdges,
  });
  return affectedClosure.mutableEdgeIds.length > 0
    ? { baseline, changeSet, affectedClosure }
    : null;
};
