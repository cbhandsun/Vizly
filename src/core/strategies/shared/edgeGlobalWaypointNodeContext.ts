import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  routingObstacles,
  type Rect,
  type Segment,
} from './edgeGlobalWaypointGeometry';
import {
  createRoutingWaypointVisualRectIndex,
  type RoutingWaypointVisualRectEntry,
  type RoutingWaypointVisualRectIndex,
} from './edgeRoutingWaypointVisualRectIndex';

const SEGMENT_OBSTACLE_PADDING = 4;

export type GlobalEdgeWaypointNodeContext = Readonly<{
  nodeById: Map<string, ReactFlowNode>;
  obstacleEntries: readonly RoutingWaypointVisualRectEntry[];
  obstacleIndex: RoutingWaypointVisualRectIndex;
  obstacles: Map<string, Rect>;
  softObstacles: Rect[];
}>;

export const createGlobalEdgeWaypointNodeContext = (
  nodes: ReactFlowNode[],
): GlobalEdgeWaypointNodeContext => {
  const obstacles = routingObstacles(nodes);
  const obstacleEntries = [...obstacles].map(([id, rect]) => ({ id, rect }));
  return {
    nodeById: new Map(nodes.map(node => [node.id, node] as const)),
    obstacleEntries,
    obstacleIndex: createRoutingWaypointVisualRectIndex(obstacleEntries),
    obstacles,
    softObstacles: [...obstacles.values()],
  };
};

export const queryGlobalEdgeWaypointObstacles = ({
  context,
  disableIndex,
  edge,
  segment,
}: Readonly<{
  context: GlobalEdgeWaypointNodeContext;
  disableIndex: boolean;
  edge: Edge;
  segment: Segment;
}>): Readonly<{ rects: readonly Rect[]; scannedNodeCount: number }> => {
  const query = disableIndex
    ? { entries: context.obstacleEntries }
    : context.obstacleIndex.queryPotentialEntries(segment, SEGMENT_OBSTACLE_PADDING);
  const entries = query.entries.filter(entry => (
    entry.id !== edge.source && entry.id !== edge.target
  ));
  return {
    rects: entries.map(entry => entry.rect),
    scannedNodeCount: entries.length,
  };
};
