import type { Edge, Node } from '@xyflow/react';
import {
  computeBaseReactFlowDisplayEdgeEpoch,
  createBaseReactFlowDisplayEdges,
} from '../../shared/baseReactFlowDisplayEdges';
import {
  hasTrustedLayoutPath,
  prepareBaseDiagramDisplayEdges,
} from './baseDiagramEdgePreparation';

export { hasTrustedLayoutPath } from './baseDiagramEdgePreparation';

export const hasPostProcessedLayoutPath = hasTrustedLayoutPath;

type BaseDiagramDisplayEdgesOptions = {
  edges: Edge[];
  nodes?: Node[];
  enableSmartEdges?: boolean;
  smartEdgePadding?: number;
  isLargeGraph?: boolean;
  displayEdgeEpoch?: number;
};

export const createBaseDiagramDisplayEdges = (
  input: Edge[] | BaseDiagramDisplayEdgesOptions,
): Edge[] => {
  const options = Array.isArray(input) ? { edges: input } : input;
  const {
    edges,
    nodes,
    enableSmartEdges = false,
    smartEdgePadding = 20,
    isLargeGraph = false,
    displayEdgeEpoch,
  } = options;

  if (!nodes?.length) return prepareBaseDiagramDisplayEdges(edges);

  return createBaseReactFlowDisplayEdges({
    edges,
    nodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    displayEdgeEpoch: displayEdgeEpoch ?? computeBaseReactFlowDisplayEdgeEpoch({ edges, nodes }),
  });
};
