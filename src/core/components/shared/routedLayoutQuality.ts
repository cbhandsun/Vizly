import type { Edge, Node } from '@xyflow/react';
import type { Point } from '../../types/routing';
import type { LaneRankDirection } from '../../types/domainLaneRank';
import type { PeerHemisphereFlowAxis } from '../../strategies/shared/edgeSharedTrunkSynthesisUtils';
import { RoutingCrossingScorer } from '../../algorithms/routingCrossingScorer';
import { evaluateLayoutGeometry } from '../../algorithms/layoutGeometryConstraints';
import { getSmartLabelPosition } from '../../algorithms/smartEdgeUtils';
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
  orthogonalRouteTravel: number;
  backwardTravel: number;
  labelLabelOverlap: number;
  labelNodeOverlap: number;
}>;

type QualityRect = Readonly<{ x: number; y: number; width: number; height: number }>;
type QualitySegment = Readonly<{ a: Point; b: Point; axis: 'h' | 'v' }>;
type ProjectedQualityNode = Node & {
  positionAbsolute?: Point;
  computed?: { positionAbsolute?: Point };
};

const PARALLEL_LANE_TOLERANCE = 4;
const EDGE_LABEL_GAP = 8;
const EDGE_LABEL_NODE_GAP = 10;
const EDGE_LABEL_MAX_WIDTH = 220;

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

const readEdgeLabelText = (edge: Edge): string => {
  const data = edge.data;
  if (data && typeof data === 'object' && 'label' in data && typeof data.label === 'string') {
    return data.label.trim();
  }
  return typeof edge.label === 'string' ? edge.label.trim() : '';
};

export const routedEdgesWithSourceLabelsForQuality = (sourceEdges: Edge[], routedEdges: Edge[]): Edge[] => {
  const sourceById = new Map(sourceEdges.map(edge => [edge.id, edge]));
  return routedEdges.map(edge => {
    if (readEdgeLabelText(edge)) return edge;
    const source = sourceById.get(edge.id);
    const label = source ? readEdgeLabelText(source) : '';
    return label ? { ...edge, data: { ...(edge.data ?? {}), label } } : edge;
  });
};

const estimateLabelSizeForQuality = (text: string): Readonly<{ width: number; height: number }> => {
  const lines = text.split(/\r\n|\r|\n/);
  let rows = 0;
  let width = 42;
  for (const line of lines) {
    let textWidth = 0;
    for (const glyph of line) textWidth += glyph.charCodeAt(0) < 128 ? 8 : 22;
    width = Math.max(width, Math.min(EDGE_LABEL_MAX_WIDTH, textWidth + 22));
    rows += Math.max(1, Math.ceil(textWidth / (EDGE_LABEL_MAX_WIDTH - 22)));
  }
  return { width, height: 26 + (rows - 1) * 22 };
};


const validQualityPoint = (point: Point): boolean => (
  Number.isFinite(point.x) && Number.isFinite(point.y)
  && Math.abs(point.x) <= 1_000_000 && Math.abs(point.y) <= 1_000_000
);

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const labelRectForQuality = (
  center: Point,
  size: Readonly<{ width: number; height: number }>,
): QualityRect => ({
  x: center.x - size.width / 2,
  y: center.y - size.height / 2,
  width: size.width,
  height: size.height,
});

const projectToSegment = (point: Point, a: Point, b: Point): Point => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t };
};

const dedupeQualityPoints = (points: readonly Point[]): Point[] => (
  [...new Map(points.filter(validQualityPoint).map(point => [`${point.x},${point.y}`, point])).values()]
);

const qualityLabelCandidates = (
  path: readonly Point[],
  anchor: Point,
  preferredCenter: Point,
  size: Readonly<{ width: number; height: number }>,
  obstacles: readonly QualityRect[],
): Point[] => {
  const segments = path.slice(1).map((b, index) => {
    const a = path[index];
    return { a, b, near: projectToSegment(anchor, a, b) };
  }).sort((a, b) => distance(a.near, anchor) - distance(b.near, anchor)).slice(0, 8);
  const candidates: Point[] = [preferredCenter];
  for (const { a, b, near } of segments) {
    const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
    const halfCross = (vertical ? size.width : size.height) / 2;
    const halfAlong = (vertical ? size.height : size.width) / 2;
    const anchors = [near, projectToSegment({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, a, b), a, b];
    for (const obstacle of obstacles) {
      const start = vertical ? obstacle.y : obstacle.x;
      const end = start + (vertical ? obstacle.height : obstacle.width);
      anchors.push(...[start - halfAlong - 10, end + halfAlong + 10]
        .map(value => vertical ? { x: near.x, y: value } : { x: value, y: near.y })
        .filter(point => distance(point, projectToSegment(point, a, b)) <= 320));
    }
    for (const candidateAnchor of anchors) {
      for (const retreat of [0, 40, 100, 200, 320]) {
        for (const side of [1, -1]) {
          candidates.push(vertical
            ? { x: candidateAnchor.x + side * (halfCross + 10 + retreat), y: candidateAnchor.y }
            : { x: candidateAnchor.x, y: candidateAnchor.y + side * (halfCross + 10 + retreat) });
        }
      }
    }
  }
  return dedupeQualityPoints(candidates);
};

const arrangeLabelRectsForQuality = (
  labels: readonly { id: string; path: readonly Point[]; anchor: Point; size: Readonly<{ width: number; height: number }> }[],
  rectangles: readonly QualityRect[],
): QualityRect[] => {
  const placed: QualityRect[] = [];
  const sorted = [...labels].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const label of sorted) {
    let best = labelRectForQuality(label.anchor, label.size);
    let bestConflicts = Number.POSITIVE_INFINITY;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const center of qualityLabelCandidates(label.path, label.anchor, label.anchor, label.size, [...rectangles, ...placed])) {
      const rect = labelRectForQuality(center, label.size);
      const nodeConflicts = rectangles.filter(obstacle => rectsConflict(rect, obstacle, EDGE_LABEL_NODE_GAP)).length;
      const labelConflicts = placed.filter(other => rectsConflict(rect, other, EDGE_LABEL_GAP)).length;
      const conflicts = nodeConflicts + labelConflicts;
      const candidateDistance = distance(center, label.anchor);
      if (conflicts < bestConflicts || (conflicts === bestConflicts && candidateDistance < bestDistance)) {
        best = rect;
        bestConflicts = conflicts;
        bestDistance = candidateDistance;
        if (conflicts === 0 && candidateDistance < 0.01) break;
      }
    }
    placed.push(best);
  }
  return placed;
};

const rectsConflict = (a: QualityRect, b: QualityRect, gap: number): boolean => (
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
  && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
);

const labelCenterForPath = (edge: Edge, path: readonly Point[]): Point | null => {
  const text = readEdgeLabelText(edge);
  if (!text) return null;
  const center = getSmartLabelPosition([...path]);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  return center;
};

function measureLabelOverlap(
  edges: readonly Edge[],
  paths: ReadonlyMap<string, readonly Point[]>,
  rectangles: readonly QualityRect[],
): Pick<RoutedLayoutQuality, 'labelLabelOverlap' | 'labelNodeOverlap'> {
  const labels = arrangeLabelRectsForQuality(edges.flatMap(edge => {
    if (edge.hidden) return [];
    const path = paths.get(edge.id);
    if (!path) return [];
    const text = readEdgeLabelText(edge);
    const anchor = labelCenterForPath(edge, path);
    return text && anchor ? [{ id: edge.id, path, anchor, size: estimateLabelSizeForQuality(text) }] : [];
  }), rectangles);
  let labelLabelOverlap = 0;
  for (let firstIndex = 0; firstIndex < labels.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < labels.length; secondIndex += 1) {
      if (rectsConflict(labels[firstIndex], labels[secondIndex], EDGE_LABEL_GAP)) labelLabelOverlap += 1;
    }
  }
  const labelNodeOverlap = labels.reduce((total, label) => (
    total + rectangles.filter(rectangle => rectsConflict(label, rectangle, EDGE_LABEL_NODE_GAP)).length
  ), 0);
  return { labelLabelOverlap, labelNodeOverlap };
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
  const rectangles: QualityRect[] = [];
  for (const node of visible) {
    const width = node.measured?.width ?? node.width;
    const height = node.measured?.height ?? node.height;
    if (!Number.isFinite(node.positionAbsolute.x) || !Number.isFinite(node.positionAbsolute.y)
      || typeof width !== 'number' || !Number.isFinite(width) || width <= 0
      || typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return null;
    rectangles.push({ x: node.positionAbsolute.x, y: node.positionAbsolute.y, width, height });
  }
  const paths = new Map<string, ReturnType<typeof getDisplayComputedPath>>();
  let minX = Math.min(...rectangles.map(rect => rect.x)), minY = Math.min(...rectangles.map(rect => rect.y));
  let maxX = Math.max(...rectangles.map(rect => rect.x + (rect.width ?? 0)));
  let maxY = Math.max(...rectangles.map(rect => rect.y + (rect.height ?? 0)));
  let pathLength = 0, segments = 0, backwardTravel = 0, orthogonalRouteTravel = 0;
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
      const segmentLength = Math.hypot(dx, dy);
      pathLength += segmentLength;
      orthogonalRouteTravel += horizontal ? dy : dx;
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
  const labelOverlap = measureLabelOverlap(edges, paths, rectangles);
  return {
    width: maxX - minX, height: maxY - minY,
    pathLength, backwardTravel, bends: scored.bends, crossings: scored.hardCrossings + scored.buddyCrossings,
    sharedLaneOverlap: scored.parallelOverlaps, hemisphereSharedLaneOverlap, flowOrthogonalDrift,
    orthogonalRouteTravel: Math.round(orthogonalRouteTravel),
    ...labelOverlap,
  };
}

const routedLayoutQualityFields = ['width', 'height', 'pathLength', 'bends', 'crossings',
  'sharedLaneOverlap', 'hemisphereSharedLaneOverlap', 'flowOrthogonalDrift',
  'orthogonalRouteTravel', 'backwardTravel', 'labelLabelOverlap', 'labelNodeOverlap'] as const;

function routedLayoutEvidenceIsFinite(
  baseline: RoutedLayoutQuality | null,
  candidate: RoutedLayoutQuality | null,
): boolean {
  if (!baseline || !candidate) return false;
  return routedLayoutQualityFields.every(key => (
    Number.isFinite(baseline[key]) && Number.isFinite(candidate[key])
    && baseline[key] >= 0 && candidate[key] >= 0
  ));
}

/** Strict improvement without sacrificing any measured readability dimension.
 * Keep the baseline on ties, incomplete evidence, or conflicting objectives. */
export function routedLayoutDominates(baseline: RoutedLayoutQuality | null, candidate: RoutedLayoutQuality | null): boolean {
  if (!baseline || !candidate || !routedLayoutEvidenceIsFinite(baseline, candidate)) return false;
  return routedLayoutQualityFields.every(key => candidate[key] <= baseline[key] + 0.01)
    && routedLayoutQualityFields.some(key => candidate[key] < baseline[key] - 0.01);
}

/** Prefer clearer trunking only after hard layout dimensions and route costs stay
 * within the current candidate. This lets an equal-size alternative win when it
 * separates opposite-hemisphere fan-in/fan-out lanes, without buying that with
 * extra crossings, bends, detours, or backward travel. */
export function routedLayoutImprovesReadableFlow(
  baseline: RoutedLayoutQuality | null,
  candidate: RoutedLayoutQuality | null,
): boolean {
  if (!baseline || !candidate || !routedLayoutEvidenceIsFinite(baseline, candidate)) return false;
  const protectedFields = ['width', 'height', 'pathLength', 'bends', 'crossings',
    'sharedLaneOverlap', 'flowOrthogonalDrift', 'orthogonalRouteTravel', 'backwardTravel',
    'labelLabelOverlap', 'labelNodeOverlap'] as const;
  const readabilityFields = ['hemisphereSharedLaneOverlap', 'sharedLaneOverlap',
    'flowOrthogonalDrift', 'orthogonalRouteTravel', 'backwardTravel'] as const;
  return protectedFields.every(key => candidate[key] <= baseline[key] + 0.01)
    && readabilityFields.some(key => candidate[key] < baseline[key] - 0.01);
}


