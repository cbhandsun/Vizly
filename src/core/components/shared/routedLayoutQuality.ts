import type { Edge, Node } from '@xyflow/react';
import type { Point } from '../../types/routing';
import type { LaneRankDirection } from '../../types/domainLaneRank';
import type { PeerHemisphereFlowAxis } from '../../strategies/shared/edgeSharedTrunkSynthesisUtils';
import { RoutingCrossingScorer } from '../../algorithms/routingCrossingScorer';
import { evaluateLayoutGeometry } from '../../algorithms/layoutGeometryConstraints';
import { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';
import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import {
  classifyDisplayPeerHemisphere,
  displayPeerHemispheresAreOpposite,
} from './baseReactFlowDisplayHemispherePeer';

export type RoutedLayoutQuality = Readonly<{
  width: number;
  height: number;
  pathLength: number;
  bends: number;
  crossings: number;
  sharedLaneOverlap: number;
  hemisphereSharedLaneOverlap: number;
  flowOrthogonalDrift: number;
  backwardTravel: number;
}>;

type QualityRect = Readonly<{ x: number; y: number; width: number; height: number }>;
type QualitySegment = Readonly<{ a: Point; b: Point; axis: 'h' | 'v' }>;
type ProjectedQualityNode = Node & {
  positionAbsolute?: Point;
  computed?: { positionAbsolute?: Point };
};

const PARALLEL_LANE_TOLERANCE = 4;

function qualitySegments(path: readonly Point[]): QualitySegment[] {
  const segments: QualitySegment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (Math.abs(a.y - b.y) <= 0.01 && Math.abs(a.x - b.x) > 0.01) {
      segments.push({ a, b, axis: 'h' });
    } else if (Math.abs(a.x - b.x) <= 0.01 && Math.abs(a.y - b.y) > 0.01) {
      segments.push({ a, b, axis: 'v' });
    }
  }
  return segments;
}

function rangeOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): number {
  return Math.max(0, Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd))
    - Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd)));
}

function parallelOverlap(first: QualitySegment, second: QualitySegment): number {
  if (first.axis !== second.axis) return 0;
  if (first.axis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > PARALLEL_LANE_TOLERANCE) return 0;
    return rangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
  }
  if (Math.abs(first.a.x - second.a.x) > PARALLEL_LANE_TOLERANCE) return 0;
  return rangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
}

function measureFlowOrthogonalDrift(
  nodes: readonly Node[],
  edges: readonly Edge[],
  horizontal: boolean,
): number | null {
  const centers = new Map<string, Point>();
  for (const node of nodes) {
    if (node.hidden) continue;
    const projectedNode = node as ProjectedQualityNode;
    const positionAbsolute = projectedNode.positionAbsolute ?? projectedNode.computed?.positionAbsolute;
    const width = node.measured?.width ?? node.width;
    const height = node.measured?.height ?? node.height;
    if (!positionAbsolute || typeof width !== 'number' || typeof height !== 'number') return null;
    if (!Number.isFinite(positionAbsolute.x) || !Number.isFinite(positionAbsolute.y)
      || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    centers.set(node.id, { x: positionAbsolute.x + width / 2, y: positionAbsolute.y + height / 2 });
  }
  let drift = 0;
  for (const edge of edges) {
    if (edge.hidden) continue;
    const source = centers.get(edge.source), target = centers.get(edge.target);
    if (!source || !target) return null;
    drift += Math.abs(horizontal ? target.y - source.y : target.x - source.x);
  }
  return Math.round(drift);
}

function measureHemisphereSharedLaneOverlap(
  nodes: readonly Node[],
  edges: readonly Edge[],
  paths: ReadonlyMap<string, readonly Point[]>,
  flowAxis: PeerHemisphereFlowAxis,
): number {
  const rectByNodeId = new Map<string, QualityRect>();
  for (const node of nodes) {
    if (node.hidden) continue;
    const projectedNode = node as ProjectedQualityNode;
    const positionAbsolute = projectedNode.positionAbsolute ?? projectedNode.computed?.positionAbsolute;
    const width = node.measured?.width ?? node.width;
    const height = node.measured?.height ?? node.height;
    if (!positionAbsolute || typeof width !== 'number' || typeof height !== 'number') continue;
    if (!Number.isFinite(positionAbsolute.x) || !Number.isFinite(positionAbsolute.y)
      || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    rectByNodeId.set(node.id, { x: positionAbsolute.x, y: positionAbsolute.y, width, height });
  }

  const visibleEdges = edges.filter(edge => !edge.hidden && paths.has(edge.id));
  const segmentsByEdgeId = new Map<string, QualitySegment[]>();
  for (const edge of visibleEdges) {
    segmentsByEdgeId.set(edge.id, qualitySegments(paths.get(edge.id) ?? []));
  }

  let overlap = 0;
  for (let firstIndex = 0; firstIndex < visibleEdges.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < visibleEdges.length; secondIndex += 1) {
      const first = visibleEdges[firstIndex];
      const second = visibleEdges[secondIndex];
      const sharedSource = first.source === second.source;
      const sharedTarget = first.target === second.target;
      if (!sharedSource && !sharedTarget) continue;
      const hubId = sharedSource ? first.source : first.target;
      const firstPeerId = sharedSource ? first.target : first.source;
      const secondPeerId = sharedSource ? second.target : second.source;
      const hubRect = rectByNodeId.get(hubId);
      const firstPeerRect = rectByNodeId.get(firstPeerId);
      const secondPeerRect = rectByNodeId.get(secondPeerId);
      if (!hubRect || !firstPeerRect || !secondPeerRect) continue;
      if (!displayPeerHemispheresAreOpposite(
        classifyDisplayPeerHemisphere(hubRect, firstPeerRect, { flowAxis }),
        classifyDisplayPeerHemisphere(hubRect, secondPeerRect, { flowAxis }),
      )) continue;
      const firstSegments = segmentsByEdgeId.get(first.id) ?? [];
      const secondSegments = segmentsByEdgeId.get(second.id) ?? [];
      for (const firstSegment of firstSegments) {
        for (const secondSegment of secondSegments) {
          overlap += parallelOverlap(firstSegment, secondSegment);
        }
      }
    }
  }
  return Math.round(overlap);
}

/** These are routed paths, never straight-line estimates between node centers.
 * Oversized/incomplete measurements are ineligible for optional optimization. */
export function measureRoutedLayoutQuality(
  nodes: Node[], edges: Edge[], direction: LaneRankDirection = 'TB',
): RoutedLayoutQuality | null {
  if (nodes.length === 0 || nodes.length > 128 || edges.length === 0 || edges.length > 128) return null;
  if (!evaluateLayoutGeometry(nodes).clean) return null;
  const projected = projectBaseReactFlowDisplayWorkerInput({ nodes, edges });
  const visible = projected.nodes.filter(node => !node.hidden);
  if (!visible.length) return null;
  const rectangles = visible.map(node => ({ x: node.positionAbsolute.x, y: node.positionAbsolute.y,
    width: node.measured?.width ?? node.width, height: node.measured?.height ?? node.height }));
  if (rectangles.some(rect => !Number.isFinite(rect.x) || !Number.isFinite(rect.y)
    || typeof rect.width !== 'number' || !Number.isFinite(rect.width) || rect.width <= 0
    || typeof rect.height !== 'number' || !Number.isFinite(rect.height) || rect.height <= 0)) return null;
  const paths = new Map<string, ReturnType<typeof getDisplayComputedPath>>();
  let minX = Math.min(...rectangles.map(rect => rect.x)), minY = Math.min(...rectangles.map(rect => rect.y));
  let maxX = Math.max(...rectangles.map(rect => rect.x + (rect.width ?? 0)));
  let maxY = Math.max(...rectangles.map(rect => rect.y + (rect.height ?? 0)));
  let pathLength = 0, segments = 0, backwardTravel = 0;
  const horizontal = direction === 'LR' || direction === 'RL';
  const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
  for (const edge of edges) {
    if (edge.hidden) continue;
    if (paths.has(edge.id)) return null;
    const path = getDisplayComputedPath(edge);
    if (path.length < 2 || path.length > 128) return null;
    segments += path.length - 1;
    if (segments > 1024) return null;
    for (let index = 0; index < path.length; index++) {
      const point = path[index];
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
        || Math.abs(point.x) > 1_000_000 || Math.abs(point.y) > 1_000_000) return null;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      if (index === 0) continue;
      const previous = path[index - 1];
      const dx = Math.abs(point.x - previous.x), dy = Math.abs(point.y - previous.y);
      if (dx > 0.01 && dy > 0.01) return null;
      pathLength += Math.hypot(dx, dy);
      backwardTravel += Math.max(0, -sign * (horizontal ? point.x - previous.x : point.y - previous.y));
    }
    paths.set(edge.id, path);
  }
  if (!paths.size) return null;
  const scored = new RoutingCrossingScorer().score(paths);
  const hemisphereSharedLaneOverlap = measureHemisphereSharedLaneOverlap(
    projected.nodes,
    edges,
    paths,
    horizontal ? 'horizontal' : 'vertical',
  );
  const flowOrthogonalDrift = measureFlowOrthogonalDrift(projected.nodes, edges, horizontal);
  if (flowOrthogonalDrift === null) return null;
  return {
    width: maxX - minX, height: maxY - minY,
    pathLength, backwardTravel, bends: scored.bends, crossings: scored.hardCrossings + scored.buddyCrossings,
    sharedLaneOverlap: scored.parallelOverlaps, hemisphereSharedLaneOverlap, flowOrthogonalDrift,
  };
}

/** Strict improvement without sacrificing any measured readability dimension.
 * Keep the baseline on ties, incomplete evidence, or conflicting objectives. */
export function routedLayoutDominates(baseline: RoutedLayoutQuality | null, candidate: RoutedLayoutQuality | null): boolean {
  if (!baseline || !candidate) return false;
  const fields = ['width', 'height', 'pathLength', 'bends', 'crossings', 'sharedLaneOverlap', 'hemisphereSharedLaneOverlap', 'flowOrthogonalDrift', 'backwardTravel'] as const;
  if (fields.some(key => !Number.isFinite(baseline[key]) || !Number.isFinite(candidate[key])
    || baseline[key] < 0 || candidate[key] < 0)) return false;
  return fields.every(key => candidate[key] <= baseline[key] + 0.01)
    && fields.some(key => candidate[key] < baseline[key] - 0.01);
}
