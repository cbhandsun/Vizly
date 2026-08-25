import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import type { BuddyGroup } from '../../algorithms/globalChannelRouting';
import {
  segmentIntersectsClearanceRect,
  segmentToClearanceRectDistance,
} from './edgeNodeClearanceGeometry';
import { createRoutingWaypointSegmentMemo } from './edgeRoutingWaypointSegmentMemo';
import { createRoutingWaypointVisualRectIndex } from './edgeRoutingWaypointVisualRectIndex';
export {
  countEndpointNodeTraversalHits,
  countRoutingObstacleHits,
  countUnrelatedObstacleHits,
  createRoutingObstacleEvaluationContext,
} from './edgeRoutingObstacleEvaluation';
export type {
  RoutingObstacleEvaluationContext,
  RoutingObstacleHitEvaluation,
} from './edgeRoutingObstacleEvaluation';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };
type Segment = { a: Point; b: Point };

export type NodeClearanceEvaluationContext = Readonly<{
  score: (path: Point[], minimumClearance?: number) => number;
  scorePair: (
    path: Point[],
    firstMinimumClearance: number,
    secondMinimumClearance: number,
  ) => readonly [number, number];
}>;

export type NodeClearanceGraphEvaluationContext = Readonly<{
  score: (path: Point[], edge: Edge, minimumClearance?: number) => number;
  scorePair: (
    path: Point[],
    edge: Edge,
    firstMinimumClearance: number,
    secondMinimumClearance: number,
  ) => readonly [number, number];
  readMetrics: () => Readonly<{ cacheHitCount: number; scannedNodeCount: number }>;
}>;

export type RoutingWaypointCandidateAxes = Readonly<{
  x: readonly number[];
  y: readonly number[];
}>;

export const BUSINESS_NODE_CLEARANCE = 28;

const EPS = 0.5;
const FLEXIBLE_SHARED_TRUNK_MIN = 24;
const SEVERE_DETOUR_RATIO = 2.5;
const SOFT_DETOUR_RATIO = 1.8;
const EXCESSIVE_BENDS = 6;
const MAX_CLEARANCE_SEGMENT_MEMOS_PER_EDGE = 16;
const CONTAINER_NODE_TYPES = new Set([
  'titleGroup',
  'subGroup',
  'group',
  'domain',
  'subDomain',
  'swimlane',
]);

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function axisOf(a: Point, b: Point): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

function pointNear(p: Point, q: Point, tolerance = 2): boolean {
  return Math.abs(p.x - q.x) <= tolerance && Math.abs(p.y - q.y) <= tolerance;
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

function toSegments(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS) segments.push({ a, b });
  }
  return segments;
}

function nodeRect(node: ReactFlowNode): Rect | null {
  const pos = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = num(node.measured?.width ?? node.width ?? node.style?.width, 0);
  const height = num(node.measured?.height ?? node.height ?? node.style?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return { x: num(pos.x, 0), y: num(pos.y, 0), width, height };
}

function isContainerNode(node: ReactFlowNode): boolean {
  return CONTAINER_NODE_TYPES.has(String(node.type ?? ''));
}

const normalizeNodeClearance = (minimumClearance: number): number => (
  Number.isFinite(minimumClearance)
    ? Math.max(0, minimumClearance)
    : BUSINESS_NODE_CLEARANCE
);

export function createNodeClearanceEvaluationContext(
  nodes: ReactFlowNode[],
  edge: Edge,
): NodeClearanceEvaluationContext {
  const nodeRects = businessRects(nodes)
    .filter(node => node.id !== edge.source && node.id !== edge.target)
    .map(node => node.rect);

  return Object.freeze({
    score(path: Point[], minimumClearance = BUSINESS_NODE_CLEARANCE): number {
      if (nodeRects.length === 0) return 0;
      const requiredClearance = normalizeNodeClearance(minimumClearance);
      let risk = 0;
      for (const segment of toSegments(path)) {
        for (const rect of nodeRects) {
          const clearance = segmentToClearanceRectDistance(segment, rect);
          risk += Math.max(0, requiredClearance - clearance);
        }
      }
      return risk;
    },
    scorePair(
      path: Point[],
      firstMinimumClearance: number,
      secondMinimumClearance: number,
    ): readonly [number, number] {
      if (nodeRects.length === 0) return [0, 0];
      const firstRequiredClearance = normalizeNodeClearance(firstMinimumClearance);
      const secondRequiredClearance = normalizeNodeClearance(secondMinimumClearance);
      let firstRisk = 0;
      let secondRisk = 0;
      for (const segment of toSegments(path)) {
        for (const rect of nodeRects) {
          const clearance = segmentToClearanceRectDistance(segment, rect);
          firstRisk += Math.max(0, firstRequiredClearance - clearance);
          secondRisk += Math.max(0, secondRequiredClearance - clearance);
        }
      }
      return [firstRisk, secondRisk];
    },
  });
}

/** Builds business-node geometry once for whole-graph clearance audits. */
export function createNodeClearanceGraphEvaluationContext(
  nodes: ReactFlowNode[],
  options: Readonly<{
    disableSegmentMemo?: boolean;
    disableSpatialIndex?: boolean;
  }> = {},
): NodeClearanceGraphEvaluationContext {
  const nodeRects = businessRects(nodes);
  const spatialIndex = options.disableSpatialIndex
    ? undefined
    : createRoutingWaypointVisualRectIndex(nodeRects);
  const nearbyNodes = (
    segment: Segment,
    clearance: number,
  ): readonly (typeof nodeRects)[number][] => {
    return spatialIndex?.queryPotentialEntries(segment, clearance).entries ?? nodeRects;
  };
  let scannedNodeCount = 0;
  let cacheHitCount = 0;
  type SegmentClearanceScore = Readonly<{
    firstRisk: number;
    scannedNodeCount: number;
    secondRisk: number;
  }>;
  type EdgeClearanceMemoContext = {
    memoByClearance: Map<
      string,
      ReturnType<typeof createRoutingWaypointSegmentMemo<SegmentClearanceScore>>
    >;
    sourceId: string;
    targetId: string;
  };
  const memoByEdge = new WeakMap<Edge, EdgeClearanceMemoContext>();
  const scoreSegments = (
    path: Point[],
    edge: Edge,
    firstRequiredClearance: number,
    secondRequiredClearance: number,
  ): readonly [number, number] => {
    let firstRisk = 0;
    let secondRisk = 0;
    let memoContext = memoByEdge.get(edge);
    if (
      !memoContext
      || memoContext.sourceId !== edge.source
      || memoContext.targetId !== edge.target
    ) {
      memoContext = {
        memoByClearance: new Map(),
        sourceId: edge.source,
        targetId: edge.target,
      };
      memoByEdge.set(edge, memoContext);
    }
    const { memoByClearance } = memoContext;
    const clearanceKey = `${firstRequiredClearance},${secondRequiredClearance}`;
    let segmentMemo = memoByClearance.get(clearanceKey);
    if (!segmentMemo) {
      segmentMemo = createRoutingWaypointSegmentMemo<SegmentClearanceScore>();
      if (memoByClearance.size < MAX_CLEARANCE_SEGMENT_MEMOS_PER_EDGE) {
        memoByClearance.set(clearanceKey, segmentMemo);
      }
    }
    for (const segment of toSegments(path)) {
      const calculate = (): SegmentClearanceScore => {
        let segmentFirstRisk = 0;
        let segmentSecondRisk = 0;
        let segmentScannedNodeCount = 0;
        for (const node of nearbyNodes(
          segment,
          Math.max(firstRequiredClearance, secondRequiredClearance),
        )) {
          segmentScannedNodeCount += 1;
          if (node.id === edge.source || node.id === edge.target) continue;
          const clearance = segmentToClearanceRectDistance(segment, node.rect);
          segmentFirstRisk += Math.max(0, firstRequiredClearance - clearance);
          segmentSecondRisk += Math.max(0, secondRequiredClearance - clearance);
        }
        return {
          firstRisk: segmentFirstRisk,
          secondRisk: segmentSecondRisk,
          scannedNodeCount: segmentScannedNodeCount,
        };
      };
      const result = options.disableSegmentMemo
        ? { value: calculate(), cacheHit: false }
        : segmentMemo.getOrCreate(segment, calculate);
      firstRisk += result.value.firstRisk;
      secondRisk += result.value.secondRisk;
      if (result.cacheHit) cacheHitCount += 1;
      else scannedNodeCount += result.value.scannedNodeCount;
    }
    return [firstRisk, secondRisk];
  };
  return Object.freeze({
    score(path: Point[], edge: Edge, minimumClearance = BUSINESS_NODE_CLEARANCE): number {
      if (nodeRects.length === 0) return 0;
      const requiredClearance = normalizeNodeClearance(minimumClearance);
      return scoreSegments(path, edge, requiredClearance, requiredClearance)[0];
    },
    scorePair(
      path: Point[],
      edge: Edge,
      firstMinimumClearance: number,
      secondMinimumClearance: number,
    ): readonly [number, number] {
      if (nodeRects.length === 0) return [0, 0];
      const firstRequiredClearance = normalizeNodeClearance(firstMinimumClearance);
      const secondRequiredClearance = normalizeNodeClearance(secondMinimumClearance);
      return scoreSegments(path, edge, firstRequiredClearance, secondRequiredClearance);
    },
    readMetrics: () => ({ cacheHitCount, scannedNodeCount }),
  });
}

function businessRects(nodes: ReactFlowNode[]): Array<{ id: string; rect: Rect }> {
  return nodes.flatMap(node => {
    if (isContainerNode(node)) return [];
    const rect = nodeRect(node);
    return rect ? [{ id: node.id, rect }] : [];
  });
}

function addLaneValue(values: Set<number>, value: number): void {
  if (Number.isFinite(value)) values.add(Math.round(value));
}

const selectPreferredAxisValues = (
  values: readonly number[] | undefined,
  minimum: number,
  maximum: number,
): number[] => {
  if (!values || values.length === 0) return [];
  const center = (minimum + maximum) / 2;
  const lowerBound = minimum - 320;
  const upperBound = maximum + 320;
  return [...new Set(values
    .filter(value => Number.isFinite(value) && value >= lowerBound && value <= upperBound)
    .map(value => Math.round(value)))]
    .sort((left, right) => Math.abs(left - center) - Math.abs(right - center) || left - right)
    .slice(0, 8);
};

function rectIntersectsExpandedBounds(rect: Rect, bounds: Rect, padding: number): boolean {
  return rect.x + rect.width >= bounds.x - padding
    && rect.x <= bounds.x + bounds.width + padding
    && rect.y + rect.height >= bounds.y - padding
    && rect.y <= bounds.y + bounds.height + padding;
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.abs(points[index + 1].x - points[index].x) + Math.abs(points[index + 1].y - points[index].y);
  }
  return total;
}

function manhattanDistance(points: Point[]): number {
  if (points.length < 2) return 0;
  const start = points[0];
  const end = points[points.length - 1];
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

function pathVisualComplexityRisk(points: Point[]): number {
  if (points.length < 2) return 0;
  const direct = Math.max(1, manhattanDistance(points));
  const ratio = pathLength(points) / direct;
  const bends = Math.max(0, points.length - 2);
  let risk = 0;
  if (ratio > SEVERE_DETOUR_RATIO) risk += (ratio - SEVERE_DETOUR_RATIO) * 1600;
  else if (ratio > SOFT_DETOUR_RATIO) risk += (ratio - SOFT_DETOUR_RATIO) * 450;
  if (bends > EXCESSIVE_BENDS) risk += (bends - EXCESSIVE_BENDS) * 300;
  return risk;
}

export function pathHasVisualComplexityRisk(points: Point[]): boolean {
  return pathVisualComplexityRisk(compactPath(points)) > 0;
}

function pathBounds(points: Point[]): Rect {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function buildNodeAwareWaypointLanes(base: Point[], nodes: ReactFlowNode[] | undefined, edge: Edge | undefined): { x: number[]; y: number[] } {
  if (!nodes || nodes.length === 0) return { x: [], y: [] };
  const candidates = businessRects(nodes).filter(node => node.id !== edge?.source && node.id !== edge?.target);
  if (candidates.length === 0) return { x: [], y: [] };

  const bounds = pathBounds(base);
  const relevant = candidates.filter(node => rectIntersectsExpandedBounds(node.rect, bounds, 320));
  const laneRects = relevant.length > 0 ? relevant : candidates;
  const x = new Set<number>();
  const y = new Set<number>();
  for (const { rect } of laneRects) {
    for (const clearance of [36, 64, 96]) {
      addLaneValue(x, rect.x - clearance);
      addLaneValue(x, rect.x + rect.width + clearance);
      addLaneValue(y, rect.y - clearance);
      addLaneValue(y, rect.y + rect.height + clearance);
    }
  }
  const minX = Math.min(...laneRects.map(({ rect }) => rect.x));
  const maxX = Math.max(...laneRects.map(({ rect }) => rect.x + rect.width));
  const minY = Math.min(...laneRects.map(({ rect }) => rect.y));
  const maxY = Math.max(...laneRects.map(({ rect }) => rect.y + rect.height));
  for (const clearance of [72, 120]) {
    addLaneValue(x, minX - clearance);
    addLaneValue(x, maxX + clearance);
    addLaneValue(y, minY - clearance);
    addLaneValue(y, maxY + clearance);
  }
  return {
    x: [...x].sort((a, b) => Math.abs(a - bounds.x) - Math.abs(b - bounds.x)),
    y: [...y].sort((a, b) => Math.abs(a - bounds.y) - Math.abs(b - bounds.y)),
  };
}

function endpointStubPoint(anchor: Point, adjacent: Point | undefined, length: number): Point | null {
  if (!adjacent) return null;
  const axis = axisOf(anchor, adjacent);
  if (!axis) return null;
  if (axis === 'h') {
    const direction = Math.sign(adjacent.x - anchor.x);
    return direction === 0 ? null : { x: anchor.x + direction * length, y: anchor.y };
  }
  const direction = Math.sign(adjacent.y - anchor.y);
  return direction === 0 ? null : { x: anchor.x, y: anchor.y + direction * length };
}

export function scoreNodeClearanceRisk(
  path: Point[],
  nodes: ReactFlowNode[] | undefined,
  edge: Edge | undefined,
  minimumClearance = BUSINESS_NODE_CLEARANCE,
): number {
  if (!nodes || nodes.length === 0 || !edge) return 0;
  return createNodeClearanceEvaluationContext(nodes, edge).score(path, minimumClearance);
}

export function pathHasNodeRoutingRisk(path: Point[], nodes: ReactFlowNode[] | undefined, edge: Edge | undefined): boolean {
  if (!nodes || nodes.length === 0 || !edge) return false;
  const nodeRects = businessRects(nodes);
  for (const segment of toSegments(path)) {
    for (const node of nodeRects) {
      if (node.id === edge.source || node.id === edge.target) {
        if (segmentIntersectsClearanceRect(segment, node.rect, 0)) return true;
        continue;
      }
      if (
        segmentIntersectsClearanceRect(segment, node.rect, 8)
        || segmentToClearanceRectDistance(segment, node.rect) < 16
      ) return true;
    }
  }
  return false;
}

export function generateWaypointCandidates(
  basePath: Point[],
  layoutDirection: string,
  nodes?: ReactFlowNode[],
  edge?: Edge,
  options: {
    includeNodeAwareLanes?: boolean;
    knownNodeRoutingRisk?: boolean;
    preferredAxes?: RoutingWaypointCandidateAxes;
  } = {},
): Point[][] {
  const base = compactPath(basePath);
  if (base.length < 2) return [base];

  const candidates: Point[][] = [base];
  const start = base[0];
  const end = base[base.length - 1];
  const offsets = [-240, -180, -120, -84, -56, -28, 28, 56, 84, 120, 180, 240];
  const isHorizontalLayout = String(layoutDirection).toUpperCase().includes('LR');
  const internal = base.slice(1, -1);
  const xLanes = new Set<number>([
    ...internal.map(p => Math.round(p.x)),
    Math.round((start.x + end.x) / 2),
    ...offsets.map(o => Math.round(start.x + o)),
    ...offsets.map(o => Math.round(end.x + o)),
  ]);
  const yLanes = new Set<number>([
    ...internal.map(p => Math.round(p.y)),
    Math.round((start.y + end.y) / 2),
    ...offsets.map(o => Math.round(start.y + o)),
    ...offsets.map(o => Math.round(end.y + o)),
  ]);
  const bounds = pathBounds(base);
  const preferredX = selectPreferredAxisValues(
    options.preferredAxes?.x,
    bounds.x,
    bounds.x + bounds.width,
  );
  const preferredY = selectPreferredAxisValues(
    options.preferredAxes?.y,
    bounds.y,
    bounds.y + bounds.height,
  );
  for (const x of preferredX) xLanes.add(x);
  for (const y of preferredY) yLanes.add(y);
  const hasNodeRoutingRisk = typeof options.knownNodeRoutingRisk === 'boolean'
    ? options.knownNodeRoutingRisk
    : pathHasNodeRoutingRisk(base, nodes, edge);
  if (hasNodeRoutingRisk || options.includeNodeAwareLanes) {
    const nodeAwareLanes = buildNodeAwareWaypointLanes(base, nodes, edge);
    for (const x of nodeAwareLanes.x) xLanes.add(x);
    for (const y of nodeAwareLanes.y) yLanes.add(y);
  }

  candidates.push(compactPath([start, { x: start.x, y: end.y }, end]));
  candidates.push(compactPath([start, { x: end.x, y: start.y }, end]));
  if (base.length >= 4) {
    const sourceExit = base[1];
    const targetEntry = base[base.length - 2];
    for (const y of yLanes) {
      if (Math.abs(y - sourceExit.y) >= 8 && Math.abs(y - targetEntry.y) >= 8) {
        candidates.push(compactPath([start, sourceExit, { x: sourceExit.x, y }, { x: targetEntry.x, y }, targetEntry, end]));
      }
    }
    for (const x of xLanes) {
      if (Math.abs(x - sourceExit.x) >= 8 && Math.abs(x - targetEntry.x) >= 8) {
        candidates.push(compactPath([start, sourceExit, { x, y: sourceExit.y }, { x, y: targetEntry.y }, targetEntry, end]));
      }
    }
  }
  for (const x of xLanes) {
    if (Math.abs(x - start.x) >= 8 && Math.abs(x - end.x) >= 8) candidates.push(compactPath([start, { x, y: start.y }, { x, y: end.y }, end]));
  }
  for (const y of yLanes) {
    if (Math.abs(y - start.y) >= 8 && Math.abs(y - end.y) >= 8) candidates.push(compactPath([start, { x: start.x, y }, { x: end.x, y }, end]));
  }
  for (let i = 1; i < base.length - 2; i += 1) {
    const a = base[i];
    const b = base[i + 1];
    const vertical = Math.abs(a.x - b.x) < EPS;
    const horizontal = Math.abs(a.y - b.y) < EPS;
    if (!vertical && !horizontal) continue;
    for (const delta of [-42, -24, 24, 42]) {
      const shifted = base.map(p => ({ ...p }));
      if (vertical) {
        shifted[i].x += delta;
        shifted[i + 1].x += delta;
      } else {
        shifted[i].y += delta;
        shifted[i + 1].y += delta;
      }
      candidates.push(compactPath(shifted));
    }
  }

  const sourceStub = endpointStubPoint(start, base[1], Math.max(FLEXIBLE_SHARED_TRUNK_MIN, 48));
  const targetStub = endpointStubPoint(end, base[base.length - 2], Math.max(FLEXIBLE_SHARED_TRUNK_MIN, 48));
  if (sourceStub && targetStub) {
    for (const x of xLanes) {
      if (Math.abs(x - sourceStub.x) >= 8 && Math.abs(x - targetStub.x) >= 8) {
        candidates.push(compactPath([start, sourceStub, { x, y: sourceStub.y }, { x, y: targetStub.y }, targetStub, end]));
      }
    }
    for (const y of yLanes) {
      if (Math.abs(y - sourceStub.y) >= 8 && Math.abs(y - targetStub.y) >= 8) {
        candidates.push(compactPath([start, sourceStub, { x: sourceStub.x, y }, { x: targetStub.x, y }, targetStub, end]));
      }
    }
  }

  const seen = new Set<string>();
  return candidates
    .map(compactPath)
    .filter(path => {
      if (path.length < 2) return false;
      const key = path.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (isHorizontalLayout
      ? Math.abs((a[1]?.y ?? start.y) - start.y) - Math.abs((b[1]?.y ?? start.y) - start.y)
      : Math.abs((a[1]?.x ?? start.x) - start.x) - Math.abs((b[1]?.x ?? start.x) - start.x)))
    .slice(0, options.includeNodeAwareLanes ? 260 : 140);
}

function edgeHasBuddyType(
  edgeId: string,
  groups: readonly BuddyGroup[],
  type: BuddyGroup['type'],
): boolean {
  return groups.some(group => group.type === type && group.edgeIds.has(edgeId));
}

function preservesEndpointTrunk(anchor: Point, originalJoin: Point, candidateJoin: Point, allowShorter: boolean): boolean {
  const originalAxis = axisOf(anchor, originalJoin);
  const candidateAxis = axisOf(anchor, candidateJoin);
  if (!originalAxis || originalAxis !== candidateAxis) return false;
  const originalDelta = originalAxis === 'h' ? originalJoin.x - anchor.x : originalJoin.y - anchor.y;
  const candidateDelta = originalAxis === 'h' ? candidateJoin.x - anchor.x : candidateJoin.y - anchor.y;
  if (Math.sign(originalDelta) !== Math.sign(candidateDelta)) return false;
  const minLength = allowShorter ? FLEXIBLE_SHARED_TRUNK_MIN : Math.abs(originalDelta);
  return Math.abs(candidateDelta) + 1 >= minLength;
}

function endpointTrunkHitsUnrelatedObstacle(anchor: Point, join: Point, edge: Edge, obstacles: Map<string, Rect>): boolean {
  const axis = axisOf(anchor, join);
  if (!axis) return false;
  const segment = { a: anchor, b: join };
  for (const [nodeId, rect] of obstacles) {
    if (
      nodeId !== edge.source
      && nodeId !== edge.target
      && segmentIntersectsClearanceRect(segment, rect, 12)
    ) return true;
  }
  return false;
}

export type SharedTrunkPreservationContext = Readonly<{
  allowShortSourceStub: boolean;
  allowShortTargetStub: boolean;
  hasSourceFanOut: boolean;
  hasTargetFanIn: boolean;
  original: Point[];
}>;

export const createSharedTrunkPreservationContext = (
  original: Point[],
  edge: Edge,
  groups: readonly BuddyGroup[],
  obstacles: Map<string, Rect>,
): SharedTrunkPreservationContext => {
  const hasSourceFanOut = edgeHasBuddyType(edge.id, groups, 'o2m');
  const hasTargetFanIn = edgeHasBuddyType(edge.id, groups, 'm2o');
  const allowShortBridgeStub = hasSourceFanOut && hasTargetFanIn;
  return {
    allowShortSourceStub: allowShortBridgeStub || (
      hasSourceFanOut
      && original.length >= 3
      && endpointTrunkHitsUnrelatedObstacle(original[0], original[1], edge, obstacles)
    ),
    allowShortTargetStub: allowShortBridgeStub || (
      hasTargetFanIn
      && original.length >= 3
      && endpointTrunkHitsUnrelatedObstacle(
        original[original.length - 1],
        original[original.length - 2],
        edge,
        obstacles,
      )
    ),
    hasSourceFanOut,
    hasTargetFanIn,
    original,
  };
};

export const preservesSharedTrunkWithContext = (
  candidate: Point[],
  context: SharedTrunkPreservationContext,
): boolean => {
  const {
    allowShortSourceStub,
    allowShortTargetStub,
    hasSourceFanOut,
    hasTargetFanIn,
    original,
  } = context;
  if (original.length < 3 || candidate.length < 3) return true;
  if (hasSourceFanOut) {
    if (!pointNear(candidate[0], original[0], 1)) return false;
    if (!preservesEndpointTrunk(
      original[0],
      original[1],
      candidate[1],
      allowShortSourceStub,
    )) return false;
  }
  if (hasTargetFanIn) {
    const originalEnd = original[original.length - 1];
    const candidateEnd = candidate[candidate.length - 1];
    if (!pointNear(candidateEnd, originalEnd, 1)) return false;
    if (!preservesEndpointTrunk(
      originalEnd,
      original[original.length - 2],
      candidate[candidate.length - 2],
      allowShortTargetStub,
    )) return false;
  }
  return true;
};

export function preservesSharedTrunk(
  candidate: Point[],
  original: Point[],
  edge: Edge,
  groups: BuddyGroup[],
  obstacles: Map<string, Rect>,
): boolean {
  return preservesSharedTrunkWithContext(
    candidate,
    createSharedTrunkPreservationContext(original, edge, groups, obstacles),
  );
}
