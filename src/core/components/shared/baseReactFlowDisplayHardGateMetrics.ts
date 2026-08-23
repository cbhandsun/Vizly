import type { Edge, Node } from '@xyflow/react';

import { MINIMUM_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { edgeRoutingQualityIntentToken } from '../../strategies/shared/edgeRoutingQualityIntent';
import {
  calculateEdgePathQualityScore,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { createNodeClearanceGraphEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  compactDisplayEdgePaths,
  getDisplayComputedPath,
  getDisplayNodeRect,
} from './baseReactFlowDisplayGeometry';
import { createDisplayObstacleHitContext } from './baseReactFlowDisplayObstacleHitCache';

export const displayObstacleEdgeSignature = (edge: Edge): string => {
  const path = getDisplayComputedPath(edge);
  return JSON.stringify([
    edge.source,
    edge.target,
    path.map(point => [point.x, point.y]),
  ]);
};

type DisplayHardGateMetrics = {
  signature: string;
  renderNormalizedEdges: Edge[];
  quality: EdgePathQualityScore;
  obstacleHits: number;
  minimumClearanceViolationEdgeIds: string[];
};

export type DisplayHardGateScanMetrics = Readonly<{
  scannedNodeCount: number;
  scannedEdgePairCount: number;
}>;

export type DisplayHardGateMetricsEvaluation = Readonly<{
  metrics: DisplayHardGateMetrics;
  scanMetrics: DisplayHardGateScanMetrics;
}>;

const metricsCache = new WeakMap<Edge[], WeakMap<Node[], DisplayHardGateMetrics>>();

const displayHardGateSignature = (edges: Edge[], nodes: Node[]): string => {
  const edgeSignature = edges.map(edge => (
    `${displayObstacleEdgeSignature(edge)}\u001f${String(edge.sourceHandle ?? '')}\u001f${String(edge.targetHandle ?? '')}\u001f${edgeRoutingQualityIntentToken(edge)}`
  )).join('\u001e');
  const nodeSignature = nodes.map((node) => {
    const rect = getDisplayNodeRect(node);
    return rect
      ? `${node.id}:${String(node.type ?? '')}:${rect.x},${rect.y},${rect.width},${rect.height}`
      : `${node.id}:${String(node.type ?? '')}:none`;
  }).join('\u001e');
  return `${edgeSignature}\u001d${nodeSignature}`;
};

export const getDisplayHardGateMetricsEvaluation = (
  edges: Edge[],
  nodes: Node[],
): DisplayHardGateMetricsEvaluation => {
  const signature = displayHardGateSignature(edges, nodes);
  const byNodes = metricsCache.get(edges);
  const cached = byNodes?.get(nodes);
  if (cached?.signature === signature) {
    return {
      metrics: cached,
      scanMetrics: { scannedNodeCount: 0, scannedEdgePairCount: 0 },
    };
  }
  const renderNormalizedEdges = compactDisplayEdgePaths(edges);
  const nodeClearanceContext = createNodeClearanceGraphEvaluationContext(nodes);
  const minimumClearanceViolationEdgeIds = renderNormalizedEdges.flatMap(edge => (
    nodeClearanceContext.score(
      getDisplayComputedPath(edge),
      edge,
      MINIMUM_BUSINESS_NODE_CLEARANCE,
    ) > 0.5 ? [edge.id] : []
  ));
  const qualityScanMetrics = { scannedEdgePairCount: 0 };
  const obstacleContext = createDisplayObstacleHitContext(nodes);
  const obstacleMetricsBefore = obstacleContext.readMetrics();
  const obstacleHits = obstacleContext.obstacles.size === 0
    ? 0
    : renderNormalizedEdges.reduce((total, edge) => (
      total + obstacleContext.countRouting(getDisplayComputedPath(edge), edge)
    ), 0);
  const metrics: DisplayHardGateMetrics = {
    signature,
    renderNormalizedEdges,
    quality: calculateEdgePathQualityScore(renderNormalizedEdges, qualityScanMetrics),
    obstacleHits,
    minimumClearanceViolationEdgeIds,
  };
  const nextByNodes = byNodes ?? new WeakMap<Node[], DisplayHardGateMetrics>();
  nextByNodes.set(nodes, metrics);
  if (!byNodes) metricsCache.set(edges, nextByNodes);
  return {
    metrics,
    scanMetrics: {
      scannedNodeCount: nodeClearanceContext.readMetrics().scannedNodeCount
        + Math.max(
          0,
          obstacleContext.readMetrics().scannedNodeCount - obstacleMetricsBefore.scannedNodeCount,
        ),
      scannedEdgePairCount: qualityScanMetrics.scannedEdgePairCount,
    },
  };
};
