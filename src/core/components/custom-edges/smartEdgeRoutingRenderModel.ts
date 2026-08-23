import type { SimpleNodeData } from '../../hooks/useNodeMap';

export type SmartEdgeRenderPoint = { x: number; y: number };

export type SmartEdgeRenderObstacle = SmartEdgeRenderPoint & {
  id: string;
  width: number;
  height: number;
  type?: string;
};

export type SmartEdgeRenderCenteredCoords = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  busTrunkSource?: SmartEdgeRenderPoint;
  busTrunkTarget?: SmartEdgeRenderPoint;
};

/** Pure renderer input. It contains no scheduling, cache, or Worker lease. */
export interface SmartEdgeRoutingRenderModel {
  safeFinalPath: string;
  finalLabelX: number;
  finalLabelY: number;
  crossfadeOpacity: number;
  opacity: number;
  isLoading: boolean;
  nodesDragging: boolean;
  shouldRenderDebugVisuals: boolean;
  shouldRenderPortHeatmap: boolean;
  isStale: boolean;
  workerSmartPoints: SmartEdgeRenderPoint[] | null;
  obstacles: SmartEdgeRenderObstacle[];
  isBusEdge: boolean;
  centeredCoords: SmartEdgeRenderCenteredCoords;
  workerSmartLabelPos: SmartEdgeRenderPoint | null;
  simpleNodeMap: Map<string, SimpleNodeData>;
}
