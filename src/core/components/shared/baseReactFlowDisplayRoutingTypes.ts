import type { Edge, Node } from '@xyflow/react';

export type UseBaseReactFlowDisplayRoutingOptions = {
  edges: Edge[];
  routingNodes: Node[];
  routingGeometryReady: boolean;
  isContainerReady: boolean;
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  isNodeDragging: boolean;
  isNodeDragFallbackPending: boolean;
  nodeDragFallbackIds: readonly string[];
  onNodeDragFallbackResolved: () => void;
};

export type UseBaseReactFlowDisplayRoutingResult = {
  edges: Edge[];
  routingOwner: 'edge' | 'canvas';
};
