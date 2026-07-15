import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { countRoutingObstacleHits } from './edgeWaypointCandidateRepair';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Axis = 'h' | 'v';

const EPS = 0.5;
const HAIRPIN_BRIDGE = 140;
const BRIDGE_CLEARANCES = [140, 160, 192];
const MAX_REPAIRED_EDGES = 2;

const CONTAINER_NODE_TYPES = new Set([
  'titleGroup',
  'subGroup',
  'group',
  'domain',
  'subDomain',
  'swimlane',
]);

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getPath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath
    || (edge.data as any)?.treeRouting?.points
    || (edge.data as any)?.elkPath
    || [];
  if (!Array.isArray(raw)) return [];
  return compactPath(raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
}

function axisOf(first: Point, second: Point): Axis | null {
  if (Math.abs(first.y - second.y) <= EPS && Math.abs(first.x - second.x) > EPS) return 'h';
  if (Math.abs(first.x - second.x) <= EPS && Math.abs(first.y - second.y) > EPS) return 'v';
  return null;
}

function directionOf(first: Point, second: Point, axis: Axis): -1 | 0 | 1 {
  return Math.sign(axis === 'h' ? second.x - first.x : second.y - first.y) as -1 | 0 | 1;
}

function segmentLength(first: Point, second: Point): number {
  return Math.abs(second.x - first.x) + Math.abs(second.y - first.y);
}

function compactPath(path: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of path) {
    const previous = deduped.at(-1);
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ ...point });
    }
  }
  if (deduped.length <= 2) return deduped;
  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result.at(-1)!;
    const current = deduped[index];
    const next = deduped[index + 1];
    const collinearX = Math.abs(previous.x - current.x) <= EPS
      && Math.abs(current.x - next.x) <= EPS;
    const collinearY = Math.abs(previous.y - current.y) <= EPS
      && Math.abs(current.y - next.y) <= EPS;
    if (!collinearX && !collinearY) result.push(current);
  }
  result.push(deduped.at(-1)!);
  return result;
}

function allSegmentsOrthogonal(path: Point[]): boolean {
  return path.length >= 2 && path.slice(1).every((point, index) => Boolean(axisOf(path[index], point)));
}

function nodeRect(node: ReactFlowNode): Rect | null {
  const position = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const width = finiteNumber((node as any).measured?.width ?? node.width ?? (node.style as any)?.width);
  const height = finiteNumber((node as any).measured?.height ?? node.height ?? (node.style as any)?.height);
  if (width <= 1 || height <= 1) return null;
  return {
    x: finiteNumber((position as any).x),
    y: finiteNumber((position as any).y),
    width,
    height,
  };
}

function routingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const obstacles = new Map<string, Rect>();
  for (const node of nodes) {
    if (CONTAINER_NODE_TYPES.has(String(node.type ?? ''))) continue;
    const rect = nodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  return obstacles;
}

function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data = { ...(edge.data || {}), computedPath: path, hairpinBridgeWidened: true } as any;
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return { ...edge, data };
}

function isHairpinAt(path: Point[], index: number): boolean {
  const a = path[index];
  const b = path[index + 1];
  const c = path[index + 2];
  const d = path[index + 3];
  if (!a || !b || !c || !d) return false;
  const firstAxis = axisOf(a, b);
  const bridgeAxis = axisOf(b, c);
  const lastAxis = axisOf(c, d);
  if (!firstAxis || !bridgeAxis || !lastAxis || firstAxis !== lastAxis || firstAxis === bridgeAxis) {
    return false;
  }
  const firstDirection = directionOf(a, b, firstAxis);
  const lastDirection = directionOf(c, d, lastAxis);
  return firstDirection !== 0
    && firstDirection === -lastDirection
    && segmentLength(b, c) < HAIRPIN_BRIDGE - EPS;
}

function buildBridgeWidenCandidate(path: Point[], index: number, clearance: number): Point[] | null {
  const b = path[index + 1];
  const c = path[index + 2];
  const d = path[index + 3];
  const continuation = path[index + 4];
  if (!b || !c || !d || !continuation || !isHairpinAt(path, index)) return null;
  const bridgeAxis = axisOf(b, c);
  if (!bridgeAxis) return null;
  const bridgeDirection = directionOf(b, c, bridgeAxis);
  if (bridgeDirection === 0) return null;
  const movedC = bridgeAxis === 'v'
    ? { x: c.x, y: b.y + bridgeDirection * clearance }
    : { x: b.x + bridgeDirection * clearance, y: c.y };
  const movedD = bridgeAxis === 'v'
    ? { x: d.x, y: movedC.y }
    : { x: movedC.x, y: d.y };
  const candidate = compactPath([
    ...path.slice(0, index + 2),
    movedC,
    movedD,
    ...path.slice(index + 4),
  ]);
  if (
    !allSegmentsOrthogonal(candidate)
    || Math.abs(candidate[0].x - path[0].x) > EPS
    || Math.abs(candidate[0].y - path[0].y) > EPS
    || Math.abs(candidate.at(-1)!.x - path.at(-1)!.x) > EPS
    || Math.abs(candidate.at(-1)!.y - path.at(-1)!.y) > EPS
  ) return null;
  return candidate;
}

function hardQualityDoesNotRegress(
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean {
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.strictCrossings <= baseline.strictCrossings
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins < baseline.hairpins
    && candidate.backtrackPenalty <= baseline.backtrackPenalty;
}

/**
 * Widens a residual internal U-turn bridge only after the ordinary collapse cleanup has failed.
 * Endpoints and handles stay unchanged; every candidate is checked against the whole graph.
 */
export function repairResidualHairpinBridges(
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: { maxEdges?: number } = {},
): Edge[] {
  if (edges.length === 0) return edges;
  const obstacles = routingObstacles(nodes);
  const maxEdges = Math.max(0, Math.floor(options.maxEdges ?? MAX_REPAIRED_EDGES));
  if (maxEdges === 0) return edges;
  let current = edges;
  let repairedCount = 0;

  for (let edgeIndex = 0; edgeIndex < current.length && repairedCount < maxEdges; edgeIndex += 1) {
    const edge = current[edgeIndex];
    const path = getPath(edge);
    const hairpinIndexes = path
      .slice(0, -3)
      .map((_, index) => (isHairpinAt(path, index) ? index : -1))
      .filter(index => index >= 0);
    if (hairpinIndexes.length === 0) continue;
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = countRoutingObstacleHits(path, edge, obstacles);
    let accepted: Edge[] | null = null;

    for (const hairpinIndex of hairpinIndexes) {
      for (const clearance of BRIDGE_CLEARANCES) {
        const candidatePath = buildBridgeWidenCandidate(path, hairpinIndex, clearance);
        if (!candidatePath) continue;
        const candidateEdge = withComputedPath(edge, candidatePath);
        if (countRoutingObstacleHits(candidatePath, candidateEdge, obstacles) > baselineObstacleHits) continue;
        const candidateEdges = current.map((item, index) => (
          index === edgeIndex ? candidateEdge : item
        ));
        const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
        if (!hardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
        accepted = candidateEdges;
        break;
      }
      if (accepted) break;
    }

    if (accepted) {
      current = accepted;
      repairedCount += 1;
    }
  }
  return current;
}
