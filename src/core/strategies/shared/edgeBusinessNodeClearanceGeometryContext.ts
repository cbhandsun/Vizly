import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import type { BusinessNodeClearanceRectContext } from './edgeBusinessNodeClearanceRectContext';
import { createBusinessNodeClearanceRectContext } from './edgeBusinessNodeClearanceRectContext';
import {
  createNodeClearanceGraphEvaluationContext,
  createRoutingObstacleEvaluationContext,
  type NodeClearanceGraphEvaluationContext,
  type RoutingObstacleEvaluationContext,
} from './edgeWaypointCandidateRepair';

const MAX_OBSTACLE_CONTEXTS = 512;

export type BusinessNodeClearanceGeometryContext = Readonly<{
  clearance: NodeClearanceGraphEvaluationContext;
  matchesNodes: (nodes: readonly ReactFlowNode[]) => boolean;
  obstacleFor: (edge: Edge) => RoutingObstacleEvaluationContext;
  readMetrics: () => Readonly<{
    obstacleContextBuildCount: number;
    obstacleContextCacheHitCount: number;
  }>;
  rects: BusinessNodeClearanceRectContext;
}>;

/** Request-local geometry shared by consecutive repairs over one immutable node snapshot. */
export const createBusinessNodeClearanceGeometryContext = (
  nodes: ReactFlowNode[],
): BusinessNodeClearanceGeometryContext => {
  const rects = createBusinessNodeClearanceRectContext(nodes);
  const clearance = createNodeClearanceGraphEvaluationContext(nodes);
  const obstacleByTerminals = new Map<string, RoutingObstacleEvaluationContext>();
  let obstacleContextBuildCount = 0;
  let obstacleContextCacheHitCount = 0;

  return Object.freeze({
    clearance,
    matchesNodes: (candidateNodes) => candidateNodes === nodes,
    obstacleFor: (edge) => {
      const key = JSON.stringify([edge.source, edge.target]);
      const cached = obstacleByTerminals.get(key);
      if (cached) {
        obstacleContextCacheHitCount += 1;
        return cached;
      }
      const context = createRoutingObstacleEvaluationContext(edge, rects.obstacles);
      obstacleContextBuildCount += 1;
      if (obstacleByTerminals.size < MAX_OBSTACLE_CONTEXTS) {
        obstacleByTerminals.set(key, context);
      }
      return context;
    },
    readMetrics: () => ({ obstacleContextBuildCount, obstacleContextCacheHitCount }),
    rects,
  });
};
