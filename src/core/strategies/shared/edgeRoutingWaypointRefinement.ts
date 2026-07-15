import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

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
  countUnrelatedObstacleHits,
  generateWaypointCandidates,
  pathHasNodeRoutingRisk,
  pathHasVisualComplexityRisk,
  preservesSharedTrunk,
} from './edgeWaypointCandidateRepair';

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

  return inputEdges.map(edge => {
    const path = repaired.get(edge.id);
    const original = edgePaths.get(edge.id);
    if (!path || !original || edgeRoutingPathsEqual(path, original)) return edge;
    const originalAgainstRepaired = new Map(repairedPaths);
    originalAgainstRepaired.set(edge.id, original);
    if (
      strictCrossingCountForEdgePath(path, edge, repairedPaths, edgesById)
      > strictCrossingCountForEdgePath(original, edge, originalAgainstRepaired, edgesById)
    ) {
      return edge;
    }
    return withComputedPath(edge, path, { crossingOptimized: true, sharedTrunkAware: true });
  });
}

function strictCrossingCountForEdgePath(
  path: EdgeRoutingPoint[],
  edge: Edge,
  paths: Map<string, EdgeRoutingPoint[]>,
  edgesById: Map<string, Edge>,
): number {
  const segments = toEdgeRoutingSegments(path);
  let crossings = 0;
  for (const [otherId, otherPath] of paths) {
    if (otherId === edge.id) continue;
    const other = edgesById.get(otherId);
    if (!other || other.source === edge.source || other.target === edge.target) continue;
    for (const first of segments) {
      for (const second of toEdgeRoutingSegments(otherPath)) {
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
  const position = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const width = finiteNumberOrFallback(
    (node as any).measured?.width ?? node.width ?? (node.style as any)?.width,
    0,
  );
  const height = finiteNumberOrFallback(
    (node as any).measured?.height ?? node.height ?? (node.style as any)?.height,
    0,
  );
  if (width <= 1 || height <= 1) return null;
  return {
    x: finiteNumberOrFallback((position as any).x, 0),
    y: finiteNumberOrFallback((position as any).y, 0),
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

function buildNodeVisualContext(nodes: ReactFlowNode[]): {
  business: Array<{ id: string; rect: EdgeRoutingRect }>;
  containers: Array<{ id: string; rect: EdgeRoutingRect }>;
} {
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
  return { business, containers };
}

function scoreVisualSoftConstraints(
  path: EdgeRoutingPoint[],
  edge: Edge,
  nodes: ReactFlowNode[],
  baseLength: number,
): number {
  const { business, containers } = buildNodeVisualContext(nodes);
  const segments = toEdgeRoutingSegments(path);
  const sourceRect = business.find(node => node.id === edge.source)?.rect;
  const targetRect = business.find(node => node.id === edge.target)?.rect;
  const relatedContainerIds = new Set<string>();
  for (const container of containers) {
    if ((sourceRect && pointInRect(rectCenter(sourceRect), container.rect))
      || (targetRect && pointInRect(rectCenter(targetRect), container.rect))) {
      relatedContainerIds.add(container.id);
    }
  }

  let score = 0;
  for (const segment of segments) {
    for (const node of business) {
      if (node.id === edge.source || node.id === edge.target) continue;
      const distance = segmentToRectDistance(segment, node.rect);
      if (distance < 12) {
        score += (12 - distance) * 120;
      } else if (distance < 28) {
        score += (28 - distance) * 18;
      }
    }

    for (const container of containers) {
      score += scoreContainerBoundaryHug(segment, container.rect);
      if (relatedContainerIds.has(container.id)) continue;
      const insideLength = segmentInsideRectLength(segment, container.rect);
      if (insideLength > 80) {
        score += (insideLength - 80) * 18;
      }
    }
  }

  const length = pathLength(path);
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
  return score;
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
  acceptedPaths: EdgeRoutingPoint[][],
  originalPaths: EdgeRoutingPoint[][],
  edge: Edge,
  nodes: ReactFlowNode[],
  obstacles: Map<string, EdgeRoutingRect>,
  baseLength: number,
): number {
  const segments = toEdgeRoutingSegments(path);
  let crossingsAccepted = 0;
  let crossingsAll = 0;
  let overlap = 0;
  for (const otherPath of acceptedPaths) {
    for (const first of segments) {
      for (const second of toEdgeRoutingSegments(otherPath)) {
        const relation = edgeRoutingSegmentRelation(first, second);
        crossingsAccepted += relation.crossings;
        overlap += relation.overlap;
      }
    }
  }
  for (const otherPath of originalPaths) {
    for (const first of segments) {
      for (const second of toEdgeRoutingSegments(otherPath)) {
        const relation = edgeRoutingSegmentRelation(first, second);
        crossingsAll += relation.crossings;
        overlap += relation.overlap * 0.25;
      }
    }
  }

  const obstacleHits = countUnrelatedObstacleHits(path, edge, obstacles);

  const length = pathLength(path);
  const bends = Math.max(0, path.length - 2);
  const detour = Math.max(0, length - baseLength);
  return obstacleHits * 120000
    + crossingsAccepted * 2600
    + crossingsAll * 360
    + overlap * 12
    + scoreVisualSoftConstraints(path, edge, nodes, baseLength)
    + bends * 10
    + length * 0.015
    + detour * 0.08;
}

export function reduceEdgeCrossingsWithWaypoints(
  edges: Edge[],
  nodes: ReactFlowNode[],
  layoutDirection: string,
  options: {
    onlyNodeRiskEdges?: boolean;
    onlySoftRiskEdges?: boolean;
    maxCandidateEdges?: number;
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

  const acceptedPaths: EdgeRoutingPoint[][] = [];
  const chosenPaths = new Map<string, EdgeRoutingPoint[]>();
  let processedCandidateEdges = 0;

  for (const { edge, path } of edgeOrder) {
    const hasNodeRisk = pathHasNodeRoutingRisk(path, nodes, edge);
    const hasSoftRisk = pathHasVisualComplexityRisk(path);
    if (options.onlyNodeRiskEdges && !hasNodeRisk) {
      chosenPaths.set(edge.id, path);
      acceptedPaths.push(path);
      continue;
    }
    if (options.onlySoftRiskEdges && !hasNodeRisk && !hasSoftRisk) {
      chosenPaths.set(edge.id, path);
      acceptedPaths.push(path);
      continue;
    }
    if (options.maxCandidateEdges && processedCandidateEdges >= options.maxCandidateEdges) {
      chosenPaths.set(edge.id, path);
      acceptedPaths.push(path);
      continue;
    }
    processedCandidateEdges += 1;

    const others = Array.from(originalPathsById.entries())
      .filter(([id]) => id !== edge.id)
      .map(([, otherPath]) => otherPath);
    const baseLength = pathLength(path);
    const candidates = generateWaypointCandidates(path, layoutDirection, nodes, edge, {
      includeNodeAwareLanes: hasSoftRisk,
    });
    let bestPath = path;
    let bestScore = scorePathCandidate(
      path,
      acceptedPaths,
      others,
      edge,
      nodes,
      obstacles,
      baseLength,
    );
    let bestObstacleHits = countUnrelatedObstacleHits(path, edge, obstacles);
    for (const candidate of candidates.slice(1)) {
      if (!preservesSharedTrunk(candidate, path, edge, buddyGroups, obstacles)) continue;
      const candidateObstacleHits = countUnrelatedObstacleHits(candidate, edge, obstacles);
      if (candidateObstacleHits > bestObstacleHits) continue;
      const score = scorePathCandidate(
        candidate,
        acceptedPaths,
        others,
        edge,
        nodes,
        obstacles,
        baseLength,
      );
      if (score < bestScore - 5) {
        bestScore = score;
        bestPath = candidate;
        bestObstacleHits = candidateObstacleHits;
      }
    }
    chosenPaths.set(edge.id, bestPath);
    acceptedPaths.push(bestPath);
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
