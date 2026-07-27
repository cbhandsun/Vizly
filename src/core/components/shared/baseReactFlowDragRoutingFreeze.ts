import type { Edge, Node } from '@xyflow/react';

import { computeBaseReactFlowDisplayEdgeEpoch } from './baseReactFlowDisplayEdgeCore';
import {
  computeBaseReactFlowDisplayInputIdentityBundle,
  type BaseReactFlowDisplayInputIdentityBundle,
} from './baseReactFlowDisplayInputIdentity';

/**
 * Avoids rebuilding full-graph routing identities while a node is moving.
 * The drag fallback owns edge rendering until the gesture ends, so those
 * identities are intentionally recomputed only after drop.
 */
export const resolveBaseReactFlowRoutingComputation = <T>({
  isNodeDragging,
  pausedValue,
  compute,
}: {
  isNodeDragging: boolean;
  pausedValue: T;
  compute: () => T;
}): T => (
  isNodeDragging ? pausedValue : compute()
);

export const resolveBaseReactFlowDragAwareDisplayEpoch = ({
  isNodeDragging,
  nodes,
  edges,
}: {
  isNodeDragging: boolean;
  nodes: Node[];
  edges: Edge[];
}): number => resolveBaseReactFlowRoutingComputation({
  isNodeDragging,
  pausedValue: 0,
  compute: () => computeBaseReactFlowDisplayEdgeEpoch({ nodes, edges }),
});

export const resolveBaseReactFlowDragAwareInputIdentity = ({
  isNodeDragging,
  nodes,
  edges,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
}: {
  isNodeDragging: boolean;
  nodes: Node[];
  edges: Edge[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
}): BaseReactFlowDisplayInputIdentityBundle => resolveBaseReactFlowRoutingComputation({
  isNodeDragging,
  pausedValue: {
    cacheSignature: 'node-drag-paused',
    geometryDigest: 'node-drag-paused',
  },
  compute: () => computeBaseReactFlowDisplayInputIdentityBundle({
    nodes,
    edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  }),
});
