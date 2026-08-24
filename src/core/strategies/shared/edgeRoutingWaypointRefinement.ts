import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
type PositionedNode = ReactFlowNode & { positionAbsolute?: EdgeRoutingPoint };

import { repairEdgeCrossingViolations } from '../../algorithms/edgeCrossingRepair';
import { repairHardObstacleViolations } from '../../algorithms/hardObstaclePathRepair';
import {
  buildEdgeTopologyStats,
  buildPipelineBuddyGroups,
  edgeTopologyPriority,
} from './edgeRoutingTopology';
import {
  compactEdgeRoutingPath,
  edgeRoutingPathsEqual,
  edgeRoutingRangeOverlap,
  edgeRoutingSegmentIntersectsRect,
  edgeRoutingSegmentRelation,
  finiteNumberOrFallback,
  getEdgePath,
  getRoutingObstacles,
  sanitizeComputedPaths,
  toEdgeRoutingSegments,
  withComputedPath,
  type EdgeRoutingPoint,
  type EdgeRoutingRect,
  type EdgeRoutingSegment,
} from './edgeRoutingPathGeometry';
import { repairSameNodeInOutCrossings } from './edgeSameNodeRoleRepair';
import {
  createRoutingObstacleEvaluationContext,
  createSharedTrunkPreservationContext,
  generateWaypointCandidates,
  pathHasNodeRoutingRisk,
  pathHasVisualComplexityRisk,
  preservesSharedTrunkWithContext,
  type RoutingWaypointCandidateAxes,
} from './edgeWaypointCandidateRepair';
import {
  createRoutingWaypointSegmentGroupIndex,
  type RoutingWaypointSegmentGroupIndex,
} from './edgeRoutingWaypointSegmentIndex';
import {
  createRoutingWaypointVisualRectIndex,
  type RoutingWaypointVisualRectIndex,
} from './edgeRoutingWaypointVisualRectIndex';

export type EdgeWaypointRefinementDiagnostics = {
  processedCandidateEdgeCount: number;
  generatedCandidateCount: number;
  evaluationCount: number;
  scannedNodeCount: number;
  scannedSegmentCount: number;
  scannedEdgePairCount: number;
  lowerBoundRejectionCount: number;
  cacheHitCount: number;
};

export const createEdgeWaypointRefinementDiagnostics = (
): EdgeWaypointRefinementDiagnostics => ({
  processedCandidateEdgeCount: 0,
  generatedCandidateCount: 0,
  evaluationCount: 0,
  scannedNodeCount: 0,
  scannedSegmentCount: 0,
  scannedEdgePairCount: 0,
  lowerBoundRejectionCount: 0,
  cacheHitCount: 0,
});

export function repairSharedTrunkAwareCrossings(
  edges: Edge[],
  nodes: ReactFlowNode[],
): Edge[] {
  const inputEdges = repairSameNodeInOutCrossings(edges, nodes);
  const edgePaths = new Map<string, EdgeRoutingPoint[]>();
  for (const edge of inputEdges) {
    const path = compactEdgeRoutingPath(getEdgePath(edge));
    if (edge.id && path.length >= 2) edgePaths.set(edge.id, path);
  }
  if (edgePaths.size < 2) return inputEdges;

  const obstaclesByNode = getRoutingObstacles(nodes);
  const ignoredRectsByEdge = new Map<string, EdgeRoutingRect[]>();
  for (const edge of inputEdges) {
    const ignored = [obstaclesByNode.get(edge.source), obstaclesByNode.get(edge.target)]
      .filter((rect): rect is EdgeRoutingRect => !!rect);
    if (ignored.length > 0) ignoredRectsByEdge.set(edge.id, ignored);
  }

  const repaired = repairEdgeCrossingViolations(edgePaths, {
    spacing: 12,
    maxIterations: 8,
    buddyGroups: buildPipelineBuddyGroups(edges),
    obstacles: Array.from(obstaclesByNode.values()),
    ignoredRectsByEdge,
    preserveEndpointDirections: true,
  });
  const edgesById = new Map(inputEdges.map(edge => [edge.id, edge] as const));
  const repairedPaths = new Map(edgePaths);
  for (const [edgeId, path] of repaired) {
    if (path) repairedPaths.set(edgeId, path);
  }
  const repairedSegmentsByEdgeId = new Map(
    [...repairedPaths].map(([edgeId, path]) => [edgeId, toEdgeRoutingSegments(path)] as const),
  );

  return inputEdges.map(edge => {
    const path = repaired.get(edge.id);
    const original = edgePaths.get(edge.id);
    if (!path || !original || edgeRoutingPathsEqual(path, original)) return edge;
    if (
      strictCrossingCountForEdgePath(path, edge, repairedSegmentsByEdgeId, edgesById)
      > strictCrossingCountForEdgePath(original, edge, repairedSegmentsByEdgeId, edgesById)
    ) {
      return edge;
    }
    return withComputedPath(edge, path, { crossingOptimized: true, sharedTrunkAware: true });
  });
}

function strictCrossingCountForEdgePath(
  path: EdgeRoutingPoint[],
  edge: Edge,
  segmentsByEdgeId: ReadonlyMap<string, readonly EdgeRoutingSegment[]>,
  edgesById: Map<string, Edge>,
): number {
  const segments = toEdgeRoutingSegments(path);
  let crossings = 0;
  for (const [otherId, otherSegments] of segmentsByEdgeId) {
    if (otherId === edge.id) continue;
    const other = edgesById.get(otherId);
    if (!other || other.source === edge.source || other.target === edge.target) continue;
    for (const first of segments) {
      for (const second of otherSegments) {
        crossings += edgeRoutingSegmentRelation(first, second).crossings;
      }
    }
  }
  return crossings;
}

export function repairSharedTrunkAwareObstacles(
  edges: Edge[],
  nodes: ReactFlowNode[],
  minClearance = 0,
): Edge[] {
  const edgePaths = new Map<string, EdgeRoutingPoint[]>();
  for (const edge of edges) {
    const path = compactEdgeRoutingPath(getEdgePath(edge));
    if (edge.id && path.length >= 2) edgePaths.set(edge.id, path);
  }
  if (edgePaths.size === 0) return edges;

  const obstaclesByNode = getRoutingObstacles(nodes);
  const ignoredRectsByEdge = new Map<string, EdgeRoutingRect[]>();
  for (const edge of edges) {
    const ignored = [obstaclesByNode.get(edge.source), obstaclesByNode.get(edge.target)]
      .filter((rect): rect is EdgeRoutingRect => !!rect);
    if (ignored.length > 0) ignoredRectsByEdge.set(edge.id, ignored);
  }

  const repaired = repairHardObstacleViolations(edgePaths, {
    spacing: 12,
    maxIterationsPerEdge: 6,
    buddyGroups: buildPipelineBuddyGroups(edges),
    obstacles: Array.from(obstaclesByNode.values()),
    ignoredRectsByEdge,
    minClearance,
  });

  return edges.map(edge => {
    const path = repaired.get(edge.id);
    const original = edgePaths.get(edge.id);
    if (!path || !original || edgeRoutingPathsEqual(path, original)) return edge;
    return withComputedPath(edge, path, {
      hardObstacleRepaired: true,
      obstacleClearanceOptimized: minClearance > 0,
      sharedTrunkAware: true,
    });
  });
}

function getNodeRect(node: ReactFlowNode): EdgeRoutingRect | null {
  const position = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = finiteNumberOrFallback(
    node.measured?.width ?? node.width ?? node.style?.width,
    0,
  );
  const height = finiteNumberOrFallback(
    node.measured?.height ?? node.height ?? node.style?.height,
    0,
  );
  if (width <= 1 || height <= 1) return null;
  return {
    x: finiteNumberOrFallback(position.x, 0),
    y: finiteNumberOrFallback(position.y, 0),
    width,
    height,
  };
}

function isContainerNode(node: ReactFlowNode): boolean {
  return new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])
    .has(String(node.type ?? ''));
}

function rectCenter(rect: EdgeRoutingRect): EdgeRoutingPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function pointInRect(point: EdgeRoutingPoint, rect: EdgeRoutingRect, padding = 0): boolean {
  return point.x >= rect.x - padding
    && point.x <= rect.x + rect.width + padding
    && point.y >= rect.y - padding
    && point.y <= rect.y + rect.height + padding;
}

function segmentLength(segment: EdgeRoutingSegment): number {
  return Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y);
}

function distancePointToSegment(point: EdgeRoutingPoint, segment: EdgeRoutingSegment): number {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const lengthSquared = dx * dx + dy * dy;
  const offset = lengthSquared === 0
    ? 0
    : Math.max(
      0,
      Math.min(
        1,
        ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lengthSquared,
      ),
    );
  const x = segment.a.x + dx * offset;
  const y = segment.a.y + dy * offset;
  return Math.hypot(point.x - x, point.y - y);
}

function segmentToRectDistance(segment: EdgeRoutingSegment, rect: EdgeRoutingRect): number {
  if (edgeRoutingSegmentIntersectsRect(segment, rect, 0)) return 0;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  let min = Infinity;
  for (const corner of corners) {
    min = Math.min(min, distancePointToSegment(corner, segment));
  }

  const isVertical = Math.abs(segment.a.x - segment.b.x) < 0.5;
  const isHorizontal = Math.abs(segment.a.y - segment.b.y) < 0.5;
  if (isVertical && segment.a.x >= rect.x && segment.a.x <= rect.x + rect.width) {
    if (Math.max(segment.a.y, segment.b.y) < rect.y) {
      min = Math.min(min, rect.y - Math.max(segment.a.y, segment.b.y));
    } else if (Math.min(segment.a.y, segment.b.y) > rect.y + rect.height) {
      min = Math.min(min, Math.min(segment.a.y, segment.b.y) - (rect.y + rect.height));
    }
  }
  if (isHorizontal && segment.a.y >= rect.y && segment.a.y <= rect.y + rect.height) {
    if (Math.max(segment.a.x, segment.b.x) < rect.x) {
      min = Math.min(min, rect.x - Math.max(segment.a.x, segment.b.x));
    } else if (Math.min(segment.a.x, segment.b.x) > rect.x + rect.width) {
      min = Math.min(min, Math.min(segment.a.x, segment.b.x) - (rect.x + rect.width));
    }
  }
  return min;
}

function segmentInsideRectLength(segment: EdgeRoutingSegment, rect: EdgeRoutingRect): number {
  const midpoint = {
    x: (segment.a.x + segment.b.x) / 2,
    y: (segment.a.y + segment.b.y) / 2,
  };
  return pointInRect(midpoint, rect) ? segmentLength(segment) : 0;
}

function scoreContainerBoundaryHug(segment: EdgeRoutingSegment, rect: EdgeRoutingRect): number {
  const length = segmentLength(segment);
  if (length < 40) return 0;

  const isVertical = Math.abs(segment.a.x - segment.b.x) < 0.5;
  const isHorizontal = Math.abs(segment.a.y - segment.b.y) < 0.5;
  if (isVertical) {
    const x = segment.a.x;
    const overlap = edgeRoutingRangeOverlap(segment.a.y, segment.b.y, rect.y, rect.y + rect.height);
    const distance = Math.min(Math.abs(x - rect.x), Math.abs(x - (rect.x + rect.width)));
    return overlap > 40 && distance < 8 ? (8 - distance) * overlap * 4 : 0;
  }
  if (isHorizontal) {
    const y = segment.a.y;
    const overlap = edgeRoutingRangeOverlap(segment.a.x, segment.b.x, rect.x, rect.x + rect.width);
    const distance = Math.min(Math.abs(y - rect.y), Math.abs(y - (rect.y + rect.height)));
    return overlap > 40 && distance < 8 ? (8 - distance) * overlap * 4 : 0;
  }
  return 0;
}

type NodeVisualContext = Readonly<{
  business: Array<{ id: string; rect: EdgeRoutingRect }>;
  businessIndex?: RoutingWaypointVisualRectIndex;
  containers: Array<{ id: string; rect: EdgeRoutingRect }>;
  containerIndex?: RoutingWaypointVisualRectIndex;
}>;

type EdgeVisualContext = NodeVisualContext & Readonly<{
  relatedContainerIds: ReadonlySet<string>;
}>;

function buildNodeVisualContext(
  nodes: ReactFlowNode[],
  disableIndex = false,
): NodeVisualContext {
  const business: Array<{ id: string; rect: EdgeRoutingRect }> = [];
  const containers: Array<{ id: string; rect: EdgeRoutingRect }> = [];
  for (const node of nodes) {
    const rect = getNodeRect(node);
    if (!rect) continue;
    if (isContainerNode(node)) {
      containers.push({ id: node.id, rect });
    } else {
      business.push({ id: node.id, rect });
    }
  }
  return {
    business,
    businessIndex: disableIndex ? undefined : createRoutingWaypointVisualRectIndex(business),
    containers,
    containerIndex: disableIndex ? undefined : createRoutingWaypointVisualRectIndex(containers),
  };
}

function createEdgeVisualContext(
  edge: Edge,
  context: NodeVisualContext,
): EdgeVisualContext {
  const sourceRect = context.business.find(node => node.id === edge.source)?.rect;
  const targetRect = context.business.find(node => node.id === edge.target)?.rect;
  const relatedContainerIds = new Set<string>();
  for (const container of context.containers) {
    if ((sourceRect && pointInRect(rectCenter(sourceRect), container.rect))
      || (targetRect && pointInRect(rectCenter(targetRect), container.rect))) {
      relatedContainerIds.add(container.id);
    }
  }
  return { ...context, relatedContainerIds };
}

function scoreVisualSoftConstraints(
  path: EdgeRoutingPoint[],
  segments: readonly EdgeRoutingSegment[],
  edge: Edge,
  context: EdgeVisualContext,
  baseLength: number,
  length: number,
): Readonly<{ score: number; scannedNodeCount: number }> {
  const {
    business,
    businessIndex,
    containers,
    containerIndex,
    relatedContainerIds,
  } = context;
  let score = 0;
  let scannedNodeCount = 0;
  for (const segment of segments) {
    const businessQuery = businessIndex?.queryPotentialEntries(segment, 28);
    const candidateBusinessNodes = businessQuery?.entries ?? business;
    scannedNodeCount += businessQuery?.scannedNodeCount ?? business.length;
    for (const node of candidateBusinessNodes) {
      if (node.id === edge.source || node.id === edge.target) continue;
      const distance = segmentToRectDistance(segment, node.rect);
      if (distance < 12) {
        score += (12 - distance) * 120;
      } else if (distance < 28) {
        score += (28 - distance) * 18;
      }
    }

    const containerQuery = containerIndex?.queryPotentialEntries(segment, 8);
    const candidateContainers = containerQuery?.entries ?? containers;
    scannedNodeCount += containerQuery?.scannedNodeCount ?? containers.length;
    for (const container of candidateContainers) {
      score += scoreContainerBoundaryHug(segment, container.rect);
      if (relatedContainerIds.has(container.id)) continue;
      const insideLength = segmentInsideRectLength(segment, container.rect);
      if (insideLength > 80) {
        score += (insideLength - 80) * 18;
      }
    }
  }

  const manhattan = Math.max(
    1,
    Math.abs(path[0].x - path[path.length - 1].x)
      + Math.abs(path[0].y - path[path.length - 1].y),
  );
  const ratio = length / manhattan;
  if (ratio > 2.5) score += (ratio - 2.5) * 1600;
  else if (ratio > 1.8) score += (ratio - 1.8) * 450;

  const bends = Math.max(0, path.length - 2);
  if (bends > 6) score += (bends - 6) * 300;
  score += Math.max(0, length - baseLength) * 0.04;
  return { score, scannedNodeCount };
}

function pathLength(points: EdgeRoutingPoint[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    total += Math.abs(points[index + 1].x - points[index].x)
      + Math.abs(points[index + 1].y - points[index].y);
  }
  return total;
}

function scorePathCandidate(
  path: EdgeRoutingPoint[],
  acceptedSegments: readonly EdgeRoutingSegment[][],
  originalSegments: readonly EdgeRoutingSegment[][],
  edge: Edge,
  visualContext: EdgeVisualContext,
  obstacleHits: number,
  baseLength: number,
  diagnostics?: EdgeWaypointRefinementDiagnostics,
  improvementCutoff?: number,
  acceptedSegmentIndex?: RoutingWaypointSegmentGroupIndex,
  originalSegmentIndex?: RoutingWaypointSegmentGroupIndex,
): number {
  const segments = toEdgeRoutingSegments(path);
  let scannedNodeCount = 0;
  let scannedSegmentCount = 0;
  let scannedEdgePairCount = 0;
  const cutoff = typeof improvementCutoff === 'number' && Number.isFinite(improvementCutoff)
    ? improvementCutoff
    : undefined;
  const finishScore = (score: number, rejectedAtLowerBound = false): number => {
    if (diagnostics) {
      diagnostics.evaluationCount += 1;
      diagnostics.scannedNodeCount += scannedNodeCount;
      diagnostics.scannedSegmentCount += scannedSegmentCount;
      diagnostics.scannedEdgePairCount += scannedEdgePairCount;
      if (rejectedAtLowerBound) diagnostics.lowerBoundRejectionCount += 1;
    }
    return score;
  };
  const rejectsAtLowerBound = (lowerBound: number): boolean => (
    cutoff !== undefined && lowerBound >= cutoff
  );
  const obstacleScore = obstacleHits * 120000;
  if (rejectsAtLowerBound(obstacleScore)) {
    return finishScore(cutoff ?? obstacleScore, true);
  }
  let crossingsAccepted = 0;
  let crossingsAll = 0;
  let overlap = 0;
  const acceptedQuery = acceptedSegmentIndex?.queryPotentialGroupIndexes(segments);
  const originalQuery = originalSegmentIndex?.queryPotentialGroupIndexes(segments);
  scannedSegmentCount += acceptedQuery?.scannedSegmentCount ?? 0;
  scannedSegmentCount += originalQuery?.scannedSegmentCount ?? 0;
  const relevantAcceptedSegments = acceptedQuery
    ? acceptedSegments.filter((_, index) => acceptedQuery.groupIndexes.has(index))
    : acceptedSegments;
  const relevantOriginalSegments = originalQuery
    ? originalSegments.filter((_, index) => originalQuery.groupIndexes.has(index))
    : originalSegments;
  for (const otherSegments of relevantAcceptedSegments) {
    scannedEdgePairCount += 1;
    scannedSegmentCount += segments.length * otherSegments.length;
    for (const first of segments) {
      for (const second of otherSegments) {
        const relation = edgeRoutingSegmentRelation(first, second);
        crossingsAccepted += relation.crossings;
        overlap += relation.overlap;
      }
    }
    if (rejectsAtLowerBound(obstacleScore + crossingsAccepted * 2600)) {
      return finishScore(cutoff ?? obstacleScore, true);
    }
  }
  for (const otherSegments of relevantOriginalSegments) {
    scannedEdgePairCount += 1;
    scannedSegmentCount += segments.length * otherSegments.length;
    for (const first of segments) {
      for (const second of otherSegments) {
        const relation = edgeRoutingSegmentRelation(first, second);
        crossingsAll += relation.crossings;
        overlap += relation.overlap * 0.25;
      }
    }
    if (rejectsAtLowerBound(
      obstacleScore + crossingsAccepted * 2600 + crossingsAll * 360,
    )) return finishScore(cutoff ?? obstacleScore, true);
  }

  const relationScore = obstacleScore
    + crossingsAccepted * 2600
    + crossingsAll * 360
    + overlap * 12;
  if (rejectsAtLowerBound(relationScore)) {
    return finishScore(cutoff ?? relationScore, true);
  }
  const length = pathLength(path);
  const visualResult = scoreVisualSoftConstraints(
    path,
    segments,
    edge,
    visualContext,
    baseLength,
    length,
  );
  scannedNodeCount += visualResult.scannedNodeCount;
  const visualScore = visualResult.score;
  if (rejectsAtLowerBound(relationScore + visualScore)) {
    return finishScore(cutoff ?? relationScore, true);
  }
  const bends = Math.max(0, path.length - 2);
  const detour = Math.max(0, length - baseLength);
  return finishScore(obstacleScore
    + crossingsAccepted * 2600
    + crossingsAll * 360
    + overlap * 12
    + visualScore
    + bends * 10
    + length * 0.015
    + detour * 0.08);
}

export function reduceEdgeCrossingsWithWaypoints(
  edges: Edge[],
  nodes: ReactFlowNode[],
  layoutDirection: string,
  options: {
    onlyNodeRiskEdges?: boolean;
    onlySoftRiskEdges?: boolean;
    maxCandidateEdges?: number;
    preferredAxes?: RoutingWaypointCandidateAxes;
    diagnostics?: EdgeWaypointRefinementDiagnostics;
    disableScoreLowerBoundPruning?: boolean;
    disableNodeVisualIndex?: boolean;
    disableSegmentIndex?: boolean;
  } = {},
): Edge[] {
  if (edges.length < 1) return edges;
  const obstacles = getRoutingObstacles(nodes);
  const originalPathsById = new Map<string, EdgeRoutingPoint[]>();
  for (const edge of edges) {
    const path = compactEdgeRoutingPath(getEdgePath(edge));
    if (path.length >= 2) originalPathsById.set(edge.id, path);
  }
  if (originalPathsById.size < 1) return edges;
  const originalSegmentsById = new Map(
    [...originalPathsById].map(([edgeId, path]) => (
      [edgeId, toEdgeRoutingSegments(path)] as const
    )),
  );
  const nodeVisualContext = buildNodeVisualContext(nodes, options.disableNodeVisualIndex);
  const buddyGroups = buildPipelineBuddyGroups(edges);
  const topologyStats = buildEdgeTopologyStats(edges);

  const edgeOrder = edges
    .map((edge, index) => ({ edge, index, path: originalPathsById.get(edge.id) }))
    .filter((entry): entry is { edge: Edge; index: number; path: EdgeRoutingPoint[] } => !!entry.path)
    .sort((first, second) => {
      const topologyDelta = edgeTopologyPriority(first.edge, topologyStats)
        - edgeTopologyPriority(second.edge, topologyStats);
      if (topologyDelta !== 0) return topologyDelta;
      if (edgeTopologyPriority(first.edge, topologyStats) === 0) {
        return pathLength(second.path) - pathLength(first.path);
      }
      return pathLength(first.path) - pathLength(second.path);
    });

  const acceptedSegments: EdgeRoutingSegment[][] = [];
  const chosenPaths = new Map<string, EdgeRoutingPoint[]>();
  let processedCandidateEdges = 0;

  for (const { edge, path } of edgeOrder) {
    const hasNodeRisk = pathHasNodeRoutingRisk(path, nodes, edge);
    const hasSoftRisk = pathHasVisualComplexityRisk(path);
    if (options.onlyNodeRiskEdges && !hasNodeRisk) {
      chosenPaths.set(edge.id, path);
      acceptedSegments.push(originalSegmentsById.get(edge.id) ?? toEdgeRoutingSegments(path));
      continue;
    }
    if (options.onlySoftRiskEdges && !hasNodeRisk && !hasSoftRisk) {
      chosenPaths.set(edge.id, path);
      acceptedSegments.push(originalSegmentsById.get(edge.id) ?? toEdgeRoutingSegments(path));
      continue;
    }
    if (options.maxCandidateEdges && processedCandidateEdges >= options.maxCandidateEdges) {
      chosenPaths.set(edge.id, path);
      acceptedSegments.push(originalSegmentsById.get(edge.id) ?? toEdgeRoutingSegments(path));
      continue;
    }
    processedCandidateEdges += 1;
    if (options.diagnostics) options.diagnostics.processedCandidateEdgeCount += 1;

    const otherSegments = Array.from(originalSegmentsById.entries())
      .filter(([id]) => id !== edge.id)
      .map(([, segments]) => segments);
    const acceptedSegmentIndex = options.disableSegmentIndex
      ? undefined
      : createRoutingWaypointSegmentGroupIndex(acceptedSegments);
    const originalSegmentIndex = options.disableSegmentIndex
      ? undefined
      : createRoutingWaypointSegmentGroupIndex(otherSegments);
    const baseLength = pathLength(path);
    const edgeVisualContext = createEdgeVisualContext(edge, nodeVisualContext);
    const obstacleEvaluation = createRoutingObstacleEvaluationContext(edge, obstacles);
    const candidates = generateWaypointCandidates(path, layoutDirection, nodes, edge, {
      includeNodeAwareLanes: hasSoftRisk,
      knownNodeRoutingRisk: hasNodeRisk,
      preferredAxes: options.preferredAxes,
    });
    const sharedTrunkContext = createSharedTrunkPreservationContext(
      path,
      edge,
      buddyGroups,
      obstacles,
    );
    if (options.diagnostics) options.diagnostics.generatedCandidateCount += candidates.length;
    let bestPath = path;
    let bestObstacleHits = obstacleEvaluation.countUnrelatedObstacleHits(path);
    let bestScore = scorePathCandidate(
      path,
      acceptedSegments,
      otherSegments,
      edge,
      edgeVisualContext,
      bestObstacleHits,
      baseLength,
      options.diagnostics,
      undefined,
      acceptedSegmentIndex,
      originalSegmentIndex,
    );
    for (const candidate of candidates.slice(1)) {
      if (!preservesSharedTrunkWithContext(candidate, sharedTrunkContext)) continue;
      const candidateObstacleHits = obstacleEvaluation.countUnrelatedObstacleHits(
        candidate,
        bestObstacleHits,
      );
      if (candidateObstacleHits > bestObstacleHits) continue;
      const score = scorePathCandidate(
        candidate,
        acceptedSegments,
        otherSegments,
        edge,
        edgeVisualContext,
        candidateObstacleHits,
        baseLength,
        options.diagnostics,
        options.disableScoreLowerBoundPruning ? undefined : bestScore - 5,
        acceptedSegmentIndex,
        originalSegmentIndex,
      );
      if (score < bestScore - 5) {
        bestScore = score;
        bestPath = candidate;
        bestObstacleHits = candidateObstacleHits;
      }
    }
    chosenPaths.set(edge.id, bestPath);
    acceptedSegments.push(
      bestPath === path
        ? originalSegmentsById.get(edge.id) ?? toEdgeRoutingSegments(bestPath)
        : toEdgeRoutingSegments(bestPath),
    );
    if (options.diagnostics) {
      const obstacleMetrics = obstacleEvaluation.readMetrics();
      options.diagnostics.scannedNodeCount += obstacleMetrics.scannedNodeCount;
      options.diagnostics.cacheHitCount += obstacleMetrics.cacheHitCount;
    }
  }

  const reduced = edges.map(edge => {
    const path = chosenPaths.get(edge.id);
    if (!path) return edge;
    const original = originalPathsById.get(edge.id);
    const changed = !original || path.length !== original.length
      || path.some((point, index) => (
        Math.abs(point.x - original[index]?.x) > 0.5
        || Math.abs(point.y - original[index]?.y) > 0.5
      ));
    if (!changed) return edge;
    return withComputedPath(edge, path, { crossingOptimized: true });
  });
  let repaired = repairSameNodeInOutCrossings(reduced, nodes);
  repaired = sanitizeComputedPaths(repaired);
  repaired = repairSharedTrunkAwareObstacles(repaired, nodes, 18);
  repaired = repairSharedTrunkAwareCrossings(repaired, nodes);
  repaired = sanitizeComputedPaths(repaired);
  return repaired;
}
