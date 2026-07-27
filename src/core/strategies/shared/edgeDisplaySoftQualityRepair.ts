import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { buildPipelineBuddyGroups } from './edgeRoutingTopology';
import {
  countUnrelatedObstacleHits,
  generateWaypointCandidates,
  pathHasVisualComplexityRisk,
  pathHasNodeRoutingRisk,
  preservesSharedTrunk,
} from './edgeWaypointCandidateRepair';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
type Axis = 'h' | 'v';

const EPS = 0.5;
const SOFT_DETOUR_RATIO = 1.8;
const SEVERE_DETOUR_RATIO = 2.5;
const EXCESSIVE_BENDS = 6;
const TARGET_ENTRY_CLEARANCES = [48, 72, 96, 120, 144, 168, 192];
const CONTAINER_BOUNDARY_CLEARANCE = 96;
const CONTAINER_PARALLEL_MIN_SPAN = 48;
const DEFAULT_MAX_CANDIDATES_PER_EDGE = 1024;
const DEFAULT_MAX_QUALITY_EVALUATIONS = 1024;
const MAX_REPAIR_BUDGET = 100_000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function getEdgePath(edge: Edge): Point[] {
  const treeRouting = asRecord(edge.data?.treeRouting);
  const raw = edge.data?.computedPath || treeRouting.points || edge.data?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(point => {
      const candidate = asRecord(point);
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function compactPath(points: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ x: Math.round(point.x), y: Math.round(point.y) });
    }
  }
  if (deduped.length <= 2) return deduped;

  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(previous.x - current.x) <= EPS && Math.abs(current.x - next.x) <= EPS;
    const sameY = Math.abs(previous.y - current.y) <= EPS && Math.abs(current.y - next.y) <= EPS;
    if (!sameX && !sameY) result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

function pathLength(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.abs(path[index + 1].x - path[index].x) + Math.abs(path[index + 1].y - path[index].y);
  }
  return total;
}

function manhattanDistance(path: Point[]): number {
  if (path.length < 2) return 0;
  return Math.abs(path[path.length - 1].x - path[0].x) + Math.abs(path[path.length - 1].y - path[0].y);
}

function visualRiskScore(path: Point[]): number {
  if (path.length < 2) return 0;
  const direct = Math.max(1, manhattanDistance(path));
  const ratio = pathLength(path) / direct;
  const bends = Math.max(0, path.length - 2);
  let score = 0;
  if (ratio > SEVERE_DETOUR_RATIO) score += (ratio - SEVERE_DETOUR_RATIO) * 1600;
  else if (ratio > SOFT_DETOUR_RATIO) score += (ratio - SOFT_DETOUR_RATIO) * 450;
  if (bends > EXCESSIVE_BENDS) score += (bends - EXCESSIVE_BENDS) * 300;
  return score;
}

function axisOf(a: Point, b: Point): Axis | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

function direction(a: Point, b: Point, axis: Axis): number {
  const delta = axis === 'h' ? b.x - a.x : b.y - a.y;
  if (Math.abs(delta) <= EPS) return 0;
  return Math.sign(delta);
}

function hasCompatibleTerminalSegments(original: Point[], candidate: Point[]): boolean {
  if (original.length < 2 || candidate.length < 2) return false;
  const originalFirstAxis = axisOf(original[0], original[1]);
  const candidateFirstAxis = axisOf(candidate[0], candidate[1]);
  const originalLastAxis = axisOf(original[original.length - 2], original[original.length - 1]);
  const candidateLastAxis = axisOf(candidate[candidate.length - 2], candidate[candidate.length - 1]);
  if (!originalFirstAxis || !candidateFirstAxis || originalFirstAxis !== candidateFirstAxis) return false;
  if (!originalLastAxis || !candidateLastAxis || originalLastAxis !== candidateLastAxis) return false;
  return direction(original[0], original[1], originalFirstAxis) === direction(candidate[0], candidate[1], candidateFirstAxis)
    && direction(original[original.length - 2], original[original.length - 1], originalLastAxis)
      === direction(candidate[candidate.length - 2], candidate[candidate.length - 1], candidateLastAxis);
}

function isContainerNode(node: ReactFlowNode): boolean {
  return new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])
    .has(String(node.type ?? ''));
}

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function nodeRect(node: ReactFlowNode): Rect | null {
  const pos = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = num(node.measured?.width ?? node.width ?? node.style?.width, 0);
  const height = num(node.measured?.height ?? node.height ?? node.style?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return { x: num(pos.x, 0), y: num(pos.y, 0), width, height };
}

function routingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const obstacles = new Map<string, Rect>();
  for (const node of nodes) {
    if (isContainerNode(node)) continue;
    const rect = nodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  return obstacles;
}

function containerRects(nodes: ReactFlowNode[]): Rect[] {
  return nodes.flatMap(node => {
    if (!isContainerNode(node)) return [];
    const rect = nodeRect(node);
    return rect ? [rect] : [];
  });
}

function overlapLength(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(
    0,
    Math.min(Math.max(a1, a2), Math.max(b1, b2))
      - Math.max(Math.min(a1, a2), Math.min(b1, b2)),
  );
}

function containerBoundaryClearanceRisk(path: Point[], containers: Rect[]): number {
  let risk = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const axis = axisOf(start, end);
    if (!axis) continue;

    for (const rect of containers) {
      let gap = Number.POSITIVE_INFINITY;
      const parallelSpan = axis === 'v'
        ? overlapLength(start.y, end.y, rect.y, rect.y + rect.height)
        : overlapLength(start.x, end.x, rect.x, rect.x + rect.width);
      if (axis === 'v') {
        if (start.x < rect.x - EPS) gap = rect.x - start.x;
        else if (start.x > rect.x + rect.width + EPS) gap = start.x - (rect.x + rect.width);
      } else {
        if (start.y < rect.y - EPS) gap = rect.y - start.y;
        else if (start.y > rect.y + rect.height + EPS) gap = start.y - (rect.y + rect.height);
      }
      if (
        parallelSpan >= CONTAINER_PARALLEL_MIN_SPAN
        && gap > EPS
        && gap < CONTAINER_BOUNDARY_CLEARANCE
      ) {
        risk += (CONTAINER_BOUNDARY_CLEARANCE - gap) * parallelSpan;
      }
    }
  }
  return risk;
}

function containerBoundaryClearanceVariants(
  path: Point[],
  containers: Rect[],
  options: { includeCorridorCentering?: boolean } = {},
): Point[][] {
  if (path.length < 4 || containers.length === 0) return [];
  const variants: Point[][] = [];

  for (let index = 1; index < path.length - 2; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const axis = axisOf(start, end);
    if (!axis) continue;

    const parallelContainers = containers.filter(rect => (
      axis === 'v'
        ? overlapLength(start.y, end.y, rect.y, rect.y + rect.height)
          >= CONTAINER_PARALLEL_MIN_SPAN
        : overlapLength(start.x, end.x, rect.x, rect.x + rect.width)
          >= CONTAINER_PARALLEL_MIN_SPAN
    ));
    const lowerBoundaries = parallelContainers
      .map(rect => axis === 'v' ? rect.x + rect.width : rect.y + rect.height)
      .filter(boundary => boundary < (axis === 'v' ? start.x : start.y) - EPS)
      .sort((first, second) => second - first);
    const upperBoundaries = parallelContainers
      .map(rect => axis === 'v' ? rect.x : rect.y)
      .filter(boundary => boundary > (axis === 'v' ? start.x : start.y) + EPS)
      .sort((first, second) => first - second);
    const lowerBoundary = lowerBoundaries[0];
    const upperBoundary = upperBoundaries[0];
    if (
      options.includeCorridorCentering === true
      &&
      Number.isFinite(lowerBoundary)
      && Number.isFinite(upperBoundary)
      && upperBoundary - lowerBoundary < CONTAINER_BOUNDARY_CLEARANCE * 2
    ) {
      const centered = path.map(point => ({ ...point }));
      const centeredLane = (lowerBoundary + upperBoundary) / 2;
      if (axis === 'v') {
        centered[index].x = centeredLane;
        centered[index + 1].x = centeredLane;
      } else {
        centered[index].y = centeredLane;
        centered[index + 1].y = centeredLane;
      }
      variants.push(compactPath(centered));
    }

    for (const rect of containers) {
      let lane: number | null = null;
      if (axis === 'v') {
        const parallelSpan = overlapLength(start.y, end.y, rect.y, rect.y + rect.height);
        if (parallelSpan < CONTAINER_PARALLEL_MIN_SPAN) continue;
        if (
          start.x < rect.x - EPS
          && rect.x - start.x < CONTAINER_BOUNDARY_CLEARANCE
        ) {
          lane = rect.x - CONTAINER_BOUNDARY_CLEARANCE;
        } else if (
          start.x > rect.x + rect.width + EPS
          && start.x - (rect.x + rect.width) < CONTAINER_BOUNDARY_CLEARANCE
        ) {
          lane = rect.x + rect.width + CONTAINER_BOUNDARY_CLEARANCE;
        }
      } else {
        const parallelSpan = overlapLength(start.x, end.x, rect.x, rect.x + rect.width);
        if (parallelSpan < CONTAINER_PARALLEL_MIN_SPAN) continue;
        if (
          start.y < rect.y - EPS
          && rect.y - start.y < CONTAINER_BOUNDARY_CLEARANCE
        ) {
          lane = rect.y - CONTAINER_BOUNDARY_CLEARANCE;
        } else if (
          start.y > rect.y + rect.height + EPS
          && start.y - (rect.y + rect.height) < CONTAINER_BOUNDARY_CLEARANCE
        ) {
          lane = rect.y + rect.height + CONTAINER_BOUNDARY_CLEARANCE;
        }
      }
      if (lane === null || !Number.isFinite(lane)) continue;

      const shifted = path.map(point => ({ ...point }));
      if (axis === 'v') {
        shifted[index].x = lane;
        shifted[index + 1].x = lane;
      } else {
        shifted[index].y = lane;
        shifted[index + 1].y = lane;
      }
      variants.push(compactPath(shifted));
    }
  }

  return variants;
}

function pointsNear(first: Point, second: Point): boolean {
  return Math.abs(first.x - second.x) <= EPS && Math.abs(first.y - second.y) <= EPS;
}

function endpointTrunksShareGeometry(
  first: Point[],
  second: Point[],
  endpoint: 'source' | 'target',
): boolean {
  if (first.length < 2 || second.length < 2) return false;
  const firstAnchor = endpoint === 'source' ? first[0] : first[first.length - 1];
  const firstJoin = endpoint === 'source' ? first[1] : first[first.length - 2];
  const secondAnchor = endpoint === 'source' ? second[0] : second[second.length - 1];
  const secondJoin = endpoint === 'source' ? second[1] : second[second.length - 2];
  if (!pointsNear(firstAnchor, secondAnchor)) return false;

  const firstAxis = axisOf(firstAnchor, firstJoin);
  const secondAxis = axisOf(secondAnchor, secondJoin);
  if (!firstAxis || firstAxis !== secondAxis) return false;
  return direction(firstAnchor, firstJoin, firstAxis)
    === direction(secondAnchor, secondJoin, secondAxis);
}

function edgeHasExplicitSharedTrunkIntent(edge: Edge): boolean {
  const data = asRecord(edge.data);
  return data.isTreeBus === true;
}

function edgeRequiresSharedTrunkPreservation(
  edge: Edge,
  path: Point[],
  edges: Edge[],
): boolean {
  if (edgeHasExplicitSharedTrunkIntent(edge)) return true;
  return edges.some(peer => {
    if (peer.id === edge.id) return false;
    const peerPath = compactPath(getEdgePath(peer));
    return (
      peer.source === edge.source
      && endpointTrunksShareGeometry(path, peerPath, 'source')
    ) || (
      peer.target === edge.target
      && endpointTrunksShareGeometry(path, peerPath, 'target')
    );
  });
}

function withComputedPath(edge: Edge, path: Point[]): Edge {
  const sourceData = isRecord(edge.data) ? edge.data : {};
  const data: Record<string, unknown> = {
    ...sourceData,
    computedPath: path,
    displaySoftQualityRepaired: true,
  };
  const treeRouting = isRecord(data.treeRouting) ? data.treeRouting : null;
  if (treeRouting && Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
}

function hardQualityDoesNotRegress(
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
  options: { allowStrictCrossingRegression?: boolean } = {},
): boolean {
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && (options.allowStrictCrossingRegression || candidate.strictCrossings <= baseline.strictCrossings)
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
}

function candidateImprovesVisualRisk(current: Point[], candidate: Point[]): boolean {
  const currentRisk = visualRiskScore(current);
  const candidateRisk = visualRiskScore(candidate);
  if (candidateRisk < currentRisk - 1) return true;
  return pathLength(candidate) < pathLength(current) - 64
    && Math.max(0, candidate.length - 2) <= Math.max(0, current.length - 2);
}

function terminalClearanceVariants(original: Point[], candidate: Point[]): Point[][] {
  if (original.length < 4 || candidate.length < 4) return [];
  const start = candidate[0];
  const sourceJoin = candidate[1];
  const end = candidate[candidate.length - 1];
  const originalLastAxis = axisOf(original[original.length - 2], original[original.length - 1]);
  if (!originalLastAxis) return [];
  const originalLastDirection = direction(
    original[original.length - 2],
    original[original.length - 1],
    originalLastAxis,
  );
  if (originalLastDirection === 0) return [];

  const variants: Point[][] = [];
  if (originalLastAxis === 'v') {
    const laneX = candidate[2]?.x;
    if (!Number.isFinite(laneX) || Math.abs(laneX - end.x) <= 8) return [];
    for (const clearance of TARGET_ENTRY_CLEARANCES) {
      const targetJoin = { x: end.x, y: end.y - originalLastDirection * clearance };
      variants.push(compactPath([
        start,
        sourceJoin,
        { x: laneX, y: sourceJoin.y },
        { x: laneX, y: targetJoin.y },
        targetJoin,
        end,
      ]));
    }
  } else {
    const laneY = candidate[2]?.y;
    if (!Number.isFinite(laneY) || Math.abs(laneY - end.y) <= 8) return [];
    for (const clearance of TARGET_ENTRY_CLEARANCES) {
      const targetJoin = { x: end.x - originalLastDirection * clearance, y: end.y };
      variants.push(compactPath([
        start,
        sourceJoin,
        { x: sourceJoin.x, y: laneY },
        { x: targetJoin.x, y: laneY },
        targetJoin,
        end,
      ]));
    }
  }

  return variants.filter(variant => variant.length >= 2);
}

function buildSoftQualityCandidates(
  path: Point[],
  layoutDirection: string,
  nodes: ReactFlowNode[],
  containers: Rect[],
  edge: Edge,
  options: { maxCandidates?: number } = {},
): Point[][] {
  const maxCandidates = boundedInteger(
    options.maxCandidates,
    DEFAULT_MAX_CANDIDATES_PER_EDGE,
    1,
    MAX_REPAIR_BUDGET,
  );
  const baseCandidates = generateWaypointCandidates(path, layoutDirection, nodes, edge, {
    includeNodeAwareLanes: true,
  });
  const variantSourceCount = Math.max(12, Math.min(baseCandidates.length - 1, 120));
  const variants = baseCandidates
    .slice(1, 1 + variantSourceCount)
    .flatMap(candidate => terminalClearanceVariants(path, candidate));
  const containerVariants = containerBoundaryClearanceVariants(path, containers);
  const seen = new Set<string>();
  const uniqueCandidates = [
    baseCandidates[0],
    ...containerVariants,
    ...baseCandidates.slice(1),
    ...variants,
  ].filter(candidate => {
    const key = candidate.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const [original, ...rest] = uniqueCandidates;
  return [
    original,
    ...rest.slice(0, maxCandidates - 1),
  ].filter(Boolean);
}

export function repairDisplayContainerBoundaryClearanceRisks(
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: {
    maxEdges?: number;
    maxQualityEvaluations?: number;
    eligibleEdgeIds?: ReadonlySet<string>;
  } = {},
): Edge[] {
  if (edges.length === 0 || nodes.length === 0) return edges;

  const containers = containerRects(nodes);
  if (containers.length === 0) return edges;

  const obstacles = routingObstacles(nodes);
  const buddyGroups = buildPipelineBuddyGroups(edges);
  const maxEdges = boundedInteger(options.maxEdges, 4, 0, MAX_REPAIR_BUDGET);
  const maxQualityEvaluations = boundedInteger(
    options.maxQualityEvaluations,
    16,
    0,
    MAX_REPAIR_BUDGET,
  );
  if (maxEdges === 0 || maxQualityEvaluations === 0) return edges;

  const riskEntries = edges
    .map((edge, edgeIndex) => {
      const path = compactPath(getEdgePath(edge));
      return {
        edge,
        edgeIndex,
        risk: containerBoundaryClearanceRisk(path, containers),
      };
    })
    .filter(entry => (
      entry.risk > 0
      && (!options.eligibleEdgeIds || options.eligibleEdgeIds.has(entry.edge.id))
    ))
    .sort((first, second) => second.risk - first.risk)
    .slice(0, maxEdges);

  let currentEdges = edges;
  let qualityEvaluations = 0;
  for (const { edgeIndex } of riskEntries) {
    if (qualityEvaluations >= maxQualityEvaluations) break;
    const edge = currentEdges[edgeIndex];
    if (!edge) continue;
    const path = compactPath(getEdgePath(edge));
    const baselineContainerRisk = containerBoundaryClearanceRisk(path, containers);
    if (baselineContainerRisk <= 0) continue;

    const baselineObstacleHits = countUnrelatedObstacleHits(path, edge, obstacles);
    const qualityContext = createEdgePathQualityEvaluationContext(currentEdges);
    const baselineQuality = qualityContext.evaluate(currentEdges);
    const requiresSharedTrunkPreservation = edgeRequiresSharedTrunkPreservation(
      edge,
      path,
      currentEdges,
    );
    let bestEdges = currentEdges;
    let bestPath = path;
    let bestContainerRisk = baselineContainerRisk;

    for (const candidate of containerBoundaryClearanceVariants(path, containers, {
      includeCorridorCentering: true,
    })) {
      if (qualityEvaluations >= maxQualityEvaluations) break;
      const compacted = compactPath(candidate);
      const candidateContainerRisk = containerBoundaryClearanceRisk(compacted, containers);
      if (candidateContainerRisk >= bestContainerRisk - 1) continue;
      if (!hasCompatibleTerminalSegments(path, compacted)) continue;
      if (
        requiresSharedTrunkPreservation
        && !preservesSharedTrunk(compacted, path, edge, buddyGroups, obstacles)
      ) continue;
      if (countUnrelatedObstacleHits(compacted, edge, obstacles) > baselineObstacleHits) continue;

      const candidateEdges = currentEdges.slice();
      candidateEdges[edgeIndex] = withComputedPath(edge, compacted);
      const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
      qualityEvaluations += 1;
      if (!hardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;

      if (
        candidateContainerRisk < bestContainerRisk - 1
        || (
          Math.abs(candidateContainerRisk - bestContainerRisk) <= 1
          && pathLength(compacted) < pathLength(bestPath)
        )
      ) {
        bestEdges = candidateEdges;
        bestPath = compacted;
        bestContainerRisk = candidateContainerRisk;
      }
    }

    if (bestEdges !== currentEdges) currentEdges = bestEdges;
  }

  return currentEdges;
}

export function repairDisplaySoftQualityRisks(
  edges: Edge[],
  nodes: ReactFlowNode[],
  layoutDirection: string,
  options: {
    maxEdges?: number;
    allowStrictCrossingRegression?: boolean;
    maxCandidatesPerEdge?: number;
    maxQualityEvaluations?: number;
  } = {},
): Edge[] {
  if (edges.length === 0) return edges;

  const obstacles = routingObstacles(nodes);
  const containers = containerRects(nodes);
  const buddyGroups = buildPipelineBuddyGroups(edges);
  let currentEdges = edges;
  let processed = 0;
  const maxEdges = boundedInteger(options.maxEdges, 8, 0, MAX_REPAIR_BUDGET);
  const maxCandidatesPerEdge = boundedInteger(
    options.maxCandidatesPerEdge,
    DEFAULT_MAX_CANDIDATES_PER_EDGE,
    1,
    MAX_REPAIR_BUDGET,
  );
  const maxQualityEvaluations = boundedInteger(
    options.maxQualityEvaluations,
    DEFAULT_MAX_QUALITY_EVALUATIONS,
    0,
    MAX_REPAIR_BUDGET,
  );
  let qualityEvaluations = 0;

  const riskEntries = edges
    .map((edge, edgeIndex) => {
      const path = compactPath(getEdgePath(edge));
      const obstacleHits = countUnrelatedObstacleHits(path, edge, obstacles);
      const containerRisk = containerBoundaryClearanceRisk(path, containers);
      return {
        edge,
        edgeIndex,
        path,
        obstacleHits,
        containerRisk,
        risk: visualRiskScore(path),
      };
    })
    .filter(entry => (
      entry.path.length >= 2
      && (
        entry.obstacleHits > 0
        || entry.containerRisk > 0
        || pathHasNodeRoutingRisk(entry.path, nodes, entry.edge)
        || entry.risk > 0
        || pathHasVisualComplexityRisk(entry.path)
      )
    ))
    .sort((first, second) => (
      second.obstacleHits - first.obstacleHits
      || second.containerRisk - first.containerRisk
      || second.risk - first.risk
    ));

  for (const { edgeIndex } of riskEntries) {
    if (processed >= maxEdges) break;
    if (qualityEvaluations >= maxQualityEvaluations) break;
    const edge = currentEdges[edgeIndex];
    if (!edge) continue;
    const path = compactPath(getEdgePath(edge));
    if (path.length < 2) continue;
    const initialObstacleHits = countUnrelatedObstacleHits(path, edge, obstacles);
    const initialContainerRisk = containerBoundaryClearanceRisk(path, containers);
    if (
      initialObstacleHits === 0
      && initialContainerRisk === 0
      && !pathHasVisualComplexityRisk(path)
    ) continue;
    processed += 1;

    const qualityContext = createEdgePathQualityEvaluationContext(currentEdges);
    const baselineQuality = qualityContext.evaluate(currentEdges);
    const baselineObstacleHits = initialObstacleHits;
    let bestEdges = currentEdges;
    let bestPath = path;
    let bestQuality = baselineQuality;
    let bestObstacleHits = baselineObstacleHits;
    let bestContainerRisk = initialContainerRisk;

    const candidates = buildSoftQualityCandidates(path, layoutDirection, nodes, containers, edge, {
      maxCandidates: maxCandidatesPerEdge,
    });
    const rankedCandidates = baselineObstacleHits > 0
      ? [
        candidates[0],
        ...candidates.slice(1).sort((first, second) => (
          countUnrelatedObstacleHits(first, edge, obstacles) - countUnrelatedObstacleHits(second, edge, obstacles)
          || pathLength(first) - pathLength(second)
        )),
      ].filter(Boolean)
      : candidates;

    for (const candidate of rankedCandidates.slice(1)) {
      if (qualityEvaluations >= maxQualityEvaluations) break;
      const compacted = compactPath(candidate);
      const candidateObstacleHits = countUnrelatedObstacleHits(compacted, edge, obstacles);
      const candidateContainerRisk = containerBoundaryClearanceRisk(compacted, containers);
      const reducesObstacleHits = candidateObstacleHits < bestObstacleHits;
      const reducesContainerRisk = candidateContainerRisk < bestContainerRisk - 1;
      if (
        !reducesObstacleHits
        && !reducesContainerRisk
        && !candidateImprovesVisualRisk(bestPath, compacted)
      ) continue;
      if (!hasCompatibleTerminalSegments(path, compacted)) continue;
      if (!preservesSharedTrunk(compacted, path, edge, buddyGroups, obstacles)) continue;
      if (candidateObstacleHits > baselineObstacleHits) continue;
      if (candidateContainerRisk > initialContainerRisk + 1) continue;

      const candidateEdges = currentEdges.slice();
      candidateEdges[edgeIndex] = withComputedPath(edge, compacted);
      const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
      qualityEvaluations += 1;
      if (!hardQualityDoesNotRegress(baselineQuality, candidateQuality, options)) continue;
      const candidateRisk = visualRiskScore(compacted);
      const bestRisk = visualRiskScore(bestPath);
      if (
        reducesObstacleHits
        || reducesContainerRisk
        || candidateRisk < bestRisk - 1
        || (Math.abs(candidateRisk - bestRisk) <= 1 && pathLength(compacted) < pathLength(bestPath) - 24)
      ) {
        bestEdges = candidateEdges;
        bestPath = compacted;
        bestQuality = candidateQuality;
        bestObstacleHits = candidateObstacleHits;
        bestContainerRisk = candidateContainerRisk;
      }
    }

    if (bestEdges !== currentEdges && hardQualityDoesNotRegress(baselineQuality, bestQuality, options)) {
      currentEdges = bestEdges;
    }
  }

  return currentEdges;
}
