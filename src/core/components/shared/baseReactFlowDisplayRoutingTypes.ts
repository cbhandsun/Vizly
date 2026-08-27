import type { Edge, Node } from '@xyflow/react';
import type { DisplayRoutingRenderAuthority } from '../../routing/displayRoutingRenderAuthority';
import type { BaseReactFlowRoutingSessionRuntime } from './baseReactFlowRoutingSessionRuntime';

export type UseBaseReactFlowDisplayRoutingOptions = {
  edges: Edge[];
  routingNodes: Node[];
  routingGeometryReady: boolean;
  routingPaused?: boolean;
  isContainerReady: boolean;
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  isNodeDragging: boolean;
  isNodeDragFallbackPending: boolean;
  nodeDragFallbackIds: readonly string[];
  onNodeDragFallbackResolved: () => void;
  onDisplayRoutingFinalApplied?: () => void;
  routingSessionRuntime?: BaseReactFlowRoutingSessionRuntime;
};

export type UseBaseReactFlowDisplayRoutingResult = {
  edges: Edge[];
  renderAuthority: DisplayRoutingRenderAuthority | null;
};
