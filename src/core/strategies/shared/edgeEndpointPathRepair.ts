import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import {
  ENDPOINT_SIDE_MATCH_TOLERANCE as SIDE_MATCH_TOLERANCE,
  clampEndpointValue as clamp,
  endpointNodeRect as nodeRect,
  endpointPointIsOnSide as pointOnSide,
  inferEndpointSide as inferSide,
  projectEndpointPointToSide as projectPointToSide,
  type EndpointPoint as Point,
  type EndpointRect as Rect,
  type EndpointSide as Side,
} from './edgeEndpointGeometry';
import {
  endpointSegmentHitsUnrelatedNode,
  pathHitsUnrelatedNode,
} from './edgeEndpointPathObstacle';

const EPS = 0.5;
const MIN_CONSTRAINED_STUB = 18;
const MIN_INTERIOR_BRIDGE_SEGMENT = 24;
const MIN_STUB = 32;
const MIN_PREFERRED_STUB = 48;
const MAX_STUB = 96;
const MAX_DETACHED_ENDPOINT_STUB = 144;
const MAX_SHARED_STUB_OVERLAP = 22;
const MIN_NEAR_ALIGNED_ENDPOINT_DELTA = 16;
const MAX_NEAR_ALIGNED_ENDPOINT_DELTA = 64;
const NEAR_ALIGNED_ENDPOINT_SIDE_RATIO = 0.18;

type EdgePathContext = {
  edge: Edge;
  edgeKey: string;
  path: Point[];
  detachedSourceEndpoint?: boolean;
  detachedTargetEndpoint?: boolean;
};
type EndpointKind = 'source' | 'target';
const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
type EndpointRepairContext = {
  edgeKey: string;
  endpoint: EndpointKind;
  source: string;
  target: string;
  anchor: Point;
  side: Side;
  desiredLength: number;
  forceShorten?: boolean;
  minLength?: number;
  maxLength?: number;
  bridgeTarget?: Point;
  detachedEndpoint?: boolean;
};

function getEdgePath(edge: Edge): Point[] {
  const raw = edge.data?.computedPath;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(point => {
      const candidate = asRecord(point);
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function withComputedPath(edge: Edge, path: Point[], extraData: Record<string, unknown> = {}): Edge {
  const data: Record<string, unknown> = {
    ...(edge.data || {}),
    ...extraData,
    computedPath: path,
    endpointOrthogonalRepaired: true,
  };
  const treeRouting = asRecord(data.treeRouting);
  if (Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
}

function normalizeEndpointAnchors(
  edge: Edge,
  path: Point[],
  nodeById: Map<string, ReactFlowNode>,
): Pick<EdgePathContext, 'path' | 'detachedSourceEndpoint' | 'detachedTargetEndpoint'> {
  if (path.length < 2) return { path };
  const data = (edge.data || {}) as Record<string, unknown>;
  const sourceRect = nodeRect(nodeById.get(edge.source));
  const targetRect = nodeRect(nodeById.get(edge.target));
  let next = path;
  let detachedSourceEndpoint = data.detachedSourceEndpointReanchored === true;
  let detachedTargetEndpoint = data.detachedTargetEndpointReanchored === true;

  if (sourceRect) {
    const sourceSide = sourceSideForPath(path, sourceRect, targetRect, edge.sourceHandle);
    if (sourceSide && !pointOnSide(path[0], sourceRect, sourceSide)) {
      next = [...next];
      next[0] = projectPointToSide(path[0], sourceRect, sourceSide);
      detachedSourceEndpoint = true;
    }
  }

  if (targetRect) {
    const end = next[next.length - 1];
    const targetSide = inferSide(end, targetRect, edge.targetHandle);
    if (targetSide && !pointOnSide(end, targetRect, targetSide)) {
      next = [...next];
      next[next.length - 1] = projectPointToSide(end, targetRect, targetSide);
      detachedTargetEndpoint = true;
    }
  }

  return { path: next, detachedSourceEndpoint, detachedTargetEndpoint };
}

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function sourceSideForPath(path: Point[], sourceRect: Rect, targetRect: Rect | null, handle: unknown): Side | null {
  const inferred = inferSide(path[0], sourceRect, handle);
  if (path.length < 2 || !targetRect) return inferred;
  const first = path[1];
  const horizontalFirst = Math.abs(first.y - path[0].y) <= EPS && Math.abs(first.x - path[0].x) > EPS;
  if (!horizontalFirst || inferred === 't' || inferred === 'b') return inferred;
  const sourceCenter = center(sourceRect);
  const targetCenter = center(targetRect);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  return Math.abs(dy) > Math.abs(dx) * 0.45 ? (dy > 0 ? 'b' : 't') : inferred;
}

function outwardPoint(point: Point, side: Side, length: number): Point {
  switch (side) {
    case 't': return { x: point.x, y: point.y - length };
    case 'b': return { x: point.x, y: point.y + length };
    case 'l': return { x: point.x - length, y: point.y };
    case 'r': return { x: point.x + length, y: point.y };
  }
}

function endpointDirectionOk(anchor: Point, adjacent: Point, side: Side): boolean {
  const dx = adjacent.x - anchor.x;
  const dy = adjacent.y - anchor.y;
  switch (side) {
    case 't': return Math.abs(dx) <= EPS && dy < -EPS;
    case 'b': return Math.abs(dx) <= EPS && dy > EPS;
    case 'l': return Math.abs(dy) <= EPS && dx < -EPS;
    case 'r': return Math.abs(dy) <= EPS && dx > EPS;
  }
}

function isTangentialEndpointSegment(anchor: Point, adjacent: Point, side: Side): boolean {
  const dx = Math.abs(adjacent.x - anchor.x);
  const dy = Math.abs(adjacent.y - anchor.y);
  return side === 't' || side === 'b'
    ? dy <= EPS && dx > EPS
    : dx <= EPS && dy > EPS;
}

function isOrthogonalSegment(anchor: Point, adjacent: Point): boolean {
  return Math.abs(adjacent.x - anchor.x) <= EPS || Math.abs(adjacent.y - anchor.y) <= EPS;
}

function shouldRepairEndpoint(anchor: Point, adjacent: Point, side: Side): boolean {
  if (endpointDirectionOk(anchor, adjacent, side)) return false;
  return isInwardSameAxisEndpointSegment(anchor, adjacent, side)
    || isTangentialEndpointSegment(anchor, adjacent, side)
    || !isOrthogonalSegment(anchor, adjacent);
}

function endpointStubLength(anchor: Point, adjacent: Point, side: Side): number {
  return endpointDirectionOk(anchor, adjacent, side)
    ? Math.max(0, projectedDistance(anchor, side, adjacent))
    : 0;
}

function shouldExtendEndpointStub(anchor: Point, adjacent: Point, side: Side, desiredLength: number): boolean {
  const currentLength = endpointStubLength(anchor, adjacent, side);
  return currentLength > EPS && currentLength + 4 < desiredLength;
}

function shouldAdjustEndpoint(anchor: Point, adjacent: Point, side: Side, desiredLength: number): boolean {
  return shouldRepairEndpoint(anchor, adjacent, side)
    || shouldExtendEndpointStub(anchor, adjacent, side, desiredLength);
}

function isInwardSameAxisEndpointSegment(anchor: Point, adjacent: Point, side: Side): boolean {
  if (!isOrthogonalSegment(anchor, adjacent)) return false;
  const verticalSide = side === 't' || side === 'b';
  if (verticalSide && Math.abs(anchor.x - adjacent.x) > EPS) return false;
  if (!verticalSide && Math.abs(anchor.y - adjacent.y) > EPS) return false;
  return projectedDistance(anchor, side, adjacent) < -EPS;
}

function preferredStubLength(path: Point[], endpointRect?: Rect | null): number {
  const start = path[0];
  const end = path[path.length - 1];
  const span = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
  const spanAwareLength = clamp(Math.round(span * 0.025), MIN_PREFERRED_STUB, MAX_STUB);
  if (!endpointRect) return spanAwareLength;

  const shortSide = Math.min(endpointRect.width, endpointRect.height);
  if (!Number.isFinite(shortSide) || shortSide <= 1) return spanAwareLength;

  const nodeAwareLength = clamp(Math.round(shortSide * 0.75), MIN_PREFERRED_STUB, MAX_STUB);
  return Math.max(spanAwareLength, nodeAwareLength);
}

function projectedDistance(anchor: Point, side: Side, point: Point): number {
  switch (side) {
    case 't': return anchor.y - point.y;
    case 'b': return point.y - anchor.y;
    case 'l': return anchor.x - point.x;
    case 'r': return point.x - anchor.x;
  }
}

function segmentProjectionRange(anchor: Point, side: Side, a: Point, b: Point): { from: number; to: number } | null {
  const verticalStub = side === 't' || side === 'b';
  if (verticalStub) {
    if (Math.abs(a.x - anchor.x) > EPS || Math.abs(b.x - anchor.x) > EPS) return null;
  } else if (Math.abs(a.y - anchor.y) > EPS || Math.abs(b.y - anchor.y) > EPS) {
    return null;
  }

  const first = projectedDistance(anchor, side, a);
  const second = projectedDistance(anchor, side, b);
  const from = Math.max(0, Math.min(first, second));
  const to = Math.max(first, second);
  return to > EPS ? { from, to } : null;
}

function pathSegments(path: Point[]): Array<{ a: Point; b: Point; axis: 'h' | 'v' | 'other' }> {
  const segments: Array<{ a: Point; b: Point; axis: 'h' | 'v' | 'other' }> = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const axis = Math.abs(a.y - b.y) <= EPS ? 'h' : (Math.abs(a.x - b.x) <= EPS ? 'v' : 'other');
    segments.push({ a, b, axis });
  }
  return segments;
}

function bridgeSegmentsForLength(
  context: EndpointRepairContext,
  length: number,
): Array<{ a: Point; b: Point; axis: 'h' | 'v' | 'other' }> {
  if (!context.bridgeTarget) return [];
  const stub = outwardPoint(context.anchor, context.side, length);
  const preferVerticalFirst = context.endpoint === 'source'
    ? context.side === 'l' || context.side === 'r'
    : context.side === 't' || context.side === 'b';
  const bridge = bridgePoints(stub, context.bridgeTarget, preferVerticalFirst);
  return pathSegments([stub, ...bridge]).filter(segment => (
    Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) > EPS
  ));
}

function strictSegmentCross(
  first: { a: Point; b: Point; axis: 'h' | 'v' | 'other' },
  second: { a: Point; b: Point; axis: 'h' | 'v' | 'other' },
): boolean {
  if (first.axis === second.axis || first.axis === 'other' || second.axis === 'other') return false;
  const horizontal = first.axis === 'h' ? first : second;
  const vertical = first.axis === 'v' ? first : second;
  const hx1 = Math.min(horizontal.a.x, horizontal.b.x);
  const hx2 = Math.max(horizontal.a.x, horizontal.b.x);
  const vy1 = Math.min(vertical.a.y, vertical.b.y);
  const vy2 = Math.max(vertical.a.y, vertical.b.y);
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x > hx1 + EPS && x < hx2 - EPS && y > vy1 + EPS && y < vy2 - EPS;
}

function nearParallelOverlap(
  first: { a: Point; b: Point; axis: 'h' | 'v' | 'other' },
  second: { a: Point; b: Point; axis: 'h' | 'v' | 'other' },
): number {
  if (first.axis !== second.axis || first.axis === 'other') return 0;
  if (first.axis === 'h') {
    const distance = Math.abs(first.a.y - second.a.y);
    if (distance > 10) return 0;
    const weight = (10 - distance) / 10;
    return Math.max(0, Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
      - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x))) * weight;
  }
  const distance = Math.abs(first.a.x - second.a.x);
  if (distance > 10) return 0;
  const weight = (10 - distance) / 10;
  return Math.max(0, Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
    - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y))) * weight;
}

function scoreBridgeLength(
  context: EndpointRepairContext,
  length: number,
  edgePaths: EdgePathContext[],
): number {
  const bridgeSegments = bridgeSegmentsForLength(context, length);
  if (bridgeSegments.length === 0) return 0;
  let score = 0;
  for (const other of edgePaths) {
    if (other.edgeKey === context.edgeKey) continue;
    if (context.endpoint === 'source' && other.edge.source === context.source) continue;
    if (context.endpoint === 'target' && other.edge.target === context.target) continue;
    for (const candidate of bridgeSegments) {
      for (const existing of pathSegments(other.path)) {
        if (strictSegmentCross(candidate, existing)) score += 10000;
        const overlap = nearParallelOverlap(candidate, existing);
        if (overlap > 12) score += overlap * 2;
      }
    }
  }
  return score;
}

function chooseBridgeAwareLength(
  context: EndpointRepairContext,
  currentLength: number,
  minLength: number,
  maxLength: number,
  edgePaths: EdgePathContext[],
): number {
  if (!context.bridgeTarget || maxLength <= currentLength + EPS) return currentLength;
  let bestLength = currentLength;
  const scoreLength = (length: number): number => (
    scoreBridgeLength(context, length, edgePaths)
    + Math.abs(context.desiredLength - length) * 0.05
    + length * 0.001
  );
  let bestScore = scoreLength(currentLength);
  for (let candidate = minLength; candidate <= maxLength; candidate += 4) {
    const roundedCandidate = Math.round(candidate);
    const score = scoreLength(roundedCandidate);
    if (score + EPS < bestScore) {
      bestScore = score;
      bestLength = roundedCandidate;
    }
  }
  return bestLength;
}

function constrainStubLengthForSegment(length: number, anchor: Point, side: Side, a: Point, b: Point): number {
  const range = segmentProjectionRange(anchor, side, a, b);
  if (!range) return length;
  const overlapStart = Math.max(0, range.from);
  const overlapEnd = Math.min(length, range.to);
  if (overlapEnd - overlapStart <= MAX_SHARED_STUB_OVERLAP) return length;
  return Math.min(length, overlapStart + MAX_SHARED_STUB_OVERLAP);
}

function resolveAdaptiveStubLength(
  context: EndpointRepairContext,
  edgePaths: EdgePathContext[],
  endpointContexts: EndpointRepairContext[],
): number {
  let length = context.desiredLength;
  let constrained = false;

  for (const other of edgePaths) {
    if (other.edgeKey === context.edgeKey) continue;
    if (context.endpoint === 'source' && other.edge.source === context.source) continue;
    if (context.endpoint === 'target' && other.edge.target === context.target) continue;
    for (let index = 0; index < other.path.length - 1; index += 1) {
      const nextLength = constrainStubLengthForSegment(
        length,
        context.anchor,
        context.side,
        other.path[index],
        other.path[index + 1],
      );
      if (nextLength + EPS < length) constrained = true;
      length = nextLength;
    }
  }

  for (const other of endpointContexts) {
    if (other.edgeKey === context.edgeKey && other.endpoint === context.endpoint) continue;
    if (context.endpoint === 'source' && other.endpoint === 'source' && other.source === context.source) continue;
    if (context.endpoint === 'target' && other.endpoint === 'target' && other.target === context.target) continue;
    const otherStub = outwardPoint(other.anchor, other.side, other.desiredLength);
    const nextLength = constrainStubLengthForSegment(length, context.anchor, context.side, other.anchor, otherStub);
    if (nextLength + EPS < length) constrained = true;
    length = nextLength;
  }

  const minLength = Math.max(constrained ? MIN_CONSTRAINED_STUB : MIN_STUB, context.minLength ?? 0);
  const maxLength = context.maxLength ?? MAX_STUB;
  const clampedLength = clamp(length, minLength, maxLength);
  return Math.round(chooseBridgeAwareLength(context, clampedLength, minLength, maxLength, edgePaths));
}

function bridgePoints(from: Point, to: Point, preferVerticalFirst: boolean): Point[] {
  if (Math.abs(from.x - to.x) <= EPS || Math.abs(from.y - to.y) <= EPS) return [to];
  const bend = preferVerticalFirst
    ? { x: from.x, y: to.y }
    : { x: to.x, y: from.y };
  return [bend, to];
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

function samePath(first: Point[], second: Point[]): boolean {
  return first.length === second.length
    && first.every((point, index) => (
      Math.abs(point.x - second[index]?.x) <= EPS && Math.abs(point.y - second[index]?.y) <= EPS
    ));
}

function avoidTinyEndpointBridgeRemainder(
  path: Point[],
  side: Side,
  requestedLength: number,
  endpoint: EndpointKind,
): number {
  if (path.length < 3) return requestedLength;
  const anchor = endpoint === 'source' ? path[0] : path[path.length - 1];
  const adjacent = endpoint === 'source' ? path[1] : path[path.length - 2];
  const nextTurn = endpoint === 'source' ? path[2] : path[path.length - 3];
  if (!isTangentialEndpointSegment(anchor, adjacent, side)) return requestedLength;
  const availableLength = projectedDistance(anchor, side, nextTurn);
  const remainder = availableLength - requestedLength;
  if (
    availableLength < MIN_CONSTRAINED_STUB + MIN_INTERIOR_BRIDGE_SEGMENT
    || remainder <= EPS
    || remainder >= MIN_INTERIOR_BRIDGE_SEGMENT
  ) return requestedLength;
  return Math.max(
    MIN_CONSTRAINED_STUB,
    Math.floor((availableLength - MIN_INTERIOR_BRIDGE_SEGMENT) * 100) / 100,
  );
}

function repairStart(path: Point[], side: Side, stubLength: number): Point[] {
  if (path.length < 2) return path;
  const safeStubLength = avoidTinyEndpointBridgeRemainder(path, side, stubLength, 'source');
  const stub = outwardPoint(path[0], side, safeStubLength);
  const preferVerticalFirst = side === 'l' || side === 'r';

  if (endpointDirectionOk(path[0], path[1], side)) {
    if (!shouldExtendEndpointStub(path[0], path[1], side, stubLength)) return path;
    if (path.length === 2) return path;
    return compactPath([path[0], stub, ...bridgePoints(stub, path[2], preferVerticalFirst), ...path.slice(3)]);
  }

  if (!shouldRepairEndpoint(path[0], path[1], side)) return path;
  if (path.length >= 3 && isInwardSameAxisEndpointSegment(path[0], path[1], side)) {
    return compactPath([path[0], stub, ...bridgePoints(stub, path[2], preferVerticalFirst), ...path.slice(3)]);
  }
  return compactPath([path[0], stub, ...bridgePoints(stub, path[1], preferVerticalFirst), ...path.slice(2)]);
}

function repairStartWithContext(path: Point[], side: Side, stubLength: number, forceShorten: boolean): Point[] {
  if (!forceShorten) return repairStart(path, side, stubLength);
  if (path.length < 3) return repairStart(path, side, stubLength);
  const safeStubLength = avoidTinyEndpointBridgeRemainder(path, side, stubLength, 'source');
  const stub = outwardPoint(path[0], side, safeStubLength);
  const preferVerticalFirst = side === 'l' || side === 'r';
  return compactPath([path[0], stub, ...bridgePoints(stub, path[2], preferVerticalFirst), ...path.slice(3)]);
}

function repairEnd(path: Point[], side: Side, stubLength: number): Point[] {
  if (path.length < 2) return path;
  const end = path[path.length - 1];
  const previous = path[path.length - 2];
  const safeStubLength = avoidTinyEndpointBridgeRemainder(path, side, stubLength, 'target');
  const stub = outwardPoint(end, side, safeStubLength);
  const preferVerticalFirst = side === 't' || side === 'b';

  if (endpointDirectionOk(end, previous, side)) {
    if (!shouldExtendEndpointStub(end, previous, side, stubLength)) return path;
    if (path.length === 2) return path;
    const beforePrevious = path[path.length - 3];
    return compactPath([
      ...path.slice(0, -3),
      beforePrevious,
      ...bridgePoints(beforePrevious, stub, preferVerticalFirst),
      stub,
      end,
    ]);
  }

  if (!shouldRepairEndpoint(end, previous, side)) return path;
  if (path.length >= 3 && isInwardSameAxisEndpointSegment(end, previous, side)) {
    const beforePrevious = path[path.length - 3];
    return compactPath([
      ...path.slice(0, -3),
      beforePrevious,
      ...bridgePoints(beforePrevious, stub, preferVerticalFirst),
      stub,
      end,
    ]);
  }
  return compactPath([...path.slice(0, -2), previous, ...bridgePoints(previous, stub, preferVerticalFirst), stub, end]);
}

function repairEndWithContext(path: Point[], side: Side, stubLength: number, forceShorten: boolean): Point[] {
  if (!forceShorten) return repairEnd(path, side, stubLength);
  if (path.length < 3) return repairEnd(path, side, stubLength);
  const end = path[path.length - 1];
  const safeStubLength = avoidTinyEndpointBridgeRemainder(path, side, stubLength, 'target');
  const stub = outwardPoint(end, side, safeStubLength);
  const beforePrevious = path[path.length - 3];
  const preferVerticalFirst = side === 't' || side === 'b';
  return compactPath([
    ...path.slice(0, -3),
    beforePrevious,
    ...bridgePoints(beforePrevious, stub, preferVerticalFirst),
    stub,
    end,
  ]);
}

function countPathCrossingsAgainstOthers(path: Point[], edgeKey: string, edgePaths: EdgePathContext[]): number {
  const candidateSegments = pathSegments(path);
  let total = 0;
  for (const other of edgePaths) {
    if (other.edgeKey === edgeKey) continue;
    for (const candidate of candidateSegments) {
      for (const existing of pathSegments(other.path)) {
        if (strictSegmentCross(candidate, existing)) total += 1;
      }
    }
  }
  return total;
}

function slidePointOnSide(rect: Rect, side: Side, mainValue: number): Point | null {
  if (side === 't' || side === 'b') {
    if (mainValue < rect.x - SIDE_MATCH_TOLERANCE || mainValue > rect.x + rect.width + SIDE_MATCH_TOLERANCE) {
      return null;
    }
    return { x: clamp(mainValue, rect.x, rect.x + rect.width), y: side === 't' ? rect.y : rect.y + rect.height };
  }
  if (mainValue < rect.y - SIDE_MATCH_TOLERANCE || mainValue > rect.y + rect.height + SIDE_MATCH_TOLERANCE) {
    return null;
  }
  return { x: side === 'l' ? rect.x : rect.x + rect.width, y: clamp(mainValue, rect.y, rect.y + rect.height) };
}

function sideSpan(rect: Rect, side: Side): number {
  return side === 't' || side === 'b' ? rect.width : rect.height;
}

function nearAlignedEndpointDelta(sourceRect: Rect, targetRect: Rect, sourceSide: Side, targetSide: Side): number {
  const availableSpan = Math.min(sideSpan(sourceRect, sourceSide), sideSpan(targetRect, targetSide));
  if (!Number.isFinite(availableSpan) || availableSpan <= 0) return MIN_NEAR_ALIGNED_ENDPOINT_DELTA;
  return clamp(
    Math.round(availableSpan * NEAR_ALIGNED_ENDPOINT_SIDE_RATIO),
    MIN_NEAR_ALIGNED_ENDPOINT_DELTA,
    MAX_NEAR_ALIGNED_ENDPOINT_DELTA,
  );
}

function straightenNearlyAlignedEndpointPath(
  path: Point[],
  edge: Edge,
  edgeKey: string,
  nodeById: Map<string, ReactFlowNode>,
  edgePaths: EdgePathContext[],
): Point[] | null {
  if (path.length < 3) return null;
  if (edge.data?.sharedTrunkSynthesized === true) return null;
  const sourceRect = nodeRect(nodeById.get(edge.source));
  const targetRect = nodeRect(nodeById.get(edge.target));
  if (!sourceRect || !targetRect) return null;

  const start = path[0];
  const end = path[path.length - 1];
  const sourceSide = sourceSideForPath(path, sourceRect, targetRect, edge.sourceHandle);
  const targetSide = inferSide(end, targetRect, edge.targetHandle);
  if (!sourceSide || !targetSide) return null;
  const alignmentDelta = nearAlignedEndpointDelta(sourceRect, targetRect, sourceSide, targetSide);

  let candidate: Point[] | null = null;
  if (
    (sourceSide === 't' || sourceSide === 'b')
    && (targetSide === 't' || targetSide === 'b')
    && Math.abs(start.x - end.x) <= alignmentDelta
    && Math.abs(start.y - end.y) >= MIN_PREFERRED_STUB
  ) {
    const adjustedEnd = slidePointOnSide(targetRect, targetSide, start.x);
    if (adjustedEnd && Math.abs(adjustedEnd.x - end.x) <= alignmentDelta) {
      candidate = [start, adjustedEnd];
    }
  }

  if (
    !candidate
    && (sourceSide === 'l' || sourceSide === 'r')
    && (targetSide === 'l' || targetSide === 'r')
    && Math.abs(start.y - end.y) <= alignmentDelta
    && Math.abs(start.x - end.x) >= MIN_PREFERRED_STUB
  ) {
    const adjustedEnd = slidePointOnSide(targetRect, targetSide, start.y);
    if (adjustedEnd && Math.abs(adjustedEnd.y - end.y) <= alignmentDelta) {
      candidate = [start, adjustedEnd];
    }
  }

  if (!candidate || pathHitsUnrelatedNode(edge, candidate, nodeById)) return null;
  const currentCrossings = countPathCrossingsAgainstOthers(path, edgeKey, edgePaths);
  if (countPathCrossingsAgainstOthers(candidate, edgeKey, edgePaths) > currentCrossings) return null;
  return candidate;
}

export function repairEndpointOrthogonalPaths(edges: Edge[], nodes: ReactFlowNode[]): Edge[] {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const edgePaths = edges.map((edge, index) => {
    const normalized = normalizeEndpointAnchors(edge, getEdgePath(edge), nodeById);
    return {
      edge,
      edgeKey: edge.id || `edge-${index}`,
      ...normalized,
    };
  });
  const endpointContexts = new Map<string, EndpointRepairContext>();

  for (const { edge, edgeKey, path, detachedSourceEndpoint, detachedTargetEndpoint } of edgePaths) {
    if (path.length < 2) continue;

    const sourceRect = nodeRect(nodeById.get(edge.source));
    const targetRect = nodeRect(nodeById.get(edge.target));
    if (sourceRect) {
      const desiredLength = preferredStubLength(path, sourceRect);
      const sourceSide = sourceSideForPath(path, sourceRect, targetRect, edge.sourceHandle);
      const sourceStubLength = sourceSide ? endpointStubLength(path[0], path[1], sourceSide) : 0;
      const forceShorten = !!sourceSide
        && sourceStubLength > desiredLength + 16
        && endpointDirectionOk(path[0], path[1], sourceSide)
        && endpointSegmentHitsUnrelatedNode(edge, path[0], path[1], nodeById);
      const sourceBridgeTarget = sourceSide && detachedSourceEndpoint && endpointDirectionOk(path[0], path[1], sourceSide)
        ? path[2]
        : (detachedSourceEndpoint ? path[1] : path[2]);
      const sourceBridgeCrosses = !!sourceSide
        && !!sourceBridgeTarget
        && scoreBridgeLength({
          edgeKey,
          endpoint: 'source',
          source: edge.source,
          target: edge.target,
          anchor: path[0],
          side: sourceSide,
          desiredLength,
          bridgeTarget: sourceBridgeTarget,
        }, Math.max(sourceStubLength, MIN_STUB), edgePaths) > 0;
      if (
        sourceSide
        && (forceShorten || sourceBridgeCrosses || shouldAdjustEndpoint(path[0], path[1], sourceSide, desiredLength))
      ) {
        endpointContexts.set(`${edgeKey}:source`, {
          edgeKey,
          endpoint: 'source',
          source: edge.source,
          target: edge.target,
          anchor: path[0],
          side: sourceSide,
          desiredLength,
          forceShorten,
          minLength: isInwardSameAxisEndpointSegment(path[0], path[1], sourceSide) ? MIN_PREFERRED_STUB : undefined,
          maxLength: detachedSourceEndpoint || sourceBridgeCrosses ? MAX_DETACHED_ENDPOINT_STUB : undefined,
          bridgeTarget: detachedSourceEndpoint || sourceBridgeCrosses ? sourceBridgeTarget : undefined,
          detachedEndpoint: detachedSourceEndpoint,
        });
      }
    }
    if (targetRect) {
      const desiredLength = preferredStubLength(path, targetRect);
      const end = path[path.length - 1];
      const previous = path[path.length - 2];
      const targetSide = inferSide(end, targetRect, edge.targetHandle);
      const targetStubLength = targetSide ? endpointStubLength(end, previous, targetSide) : 0;
      const forceShorten = !!targetSide
        && targetStubLength > desiredLength + 16
        && endpointDirectionOk(end, previous, targetSide)
        && endpointSegmentHitsUnrelatedNode(edge, end, previous, nodeById);
      const targetBridgeTarget = targetSide && detachedTargetEndpoint && endpointDirectionOk(end, previous, targetSide)
        ? path[path.length - 3]
        : (detachedTargetEndpoint ? previous : path[path.length - 3]);
      const targetBridgeCrosses = !!targetSide
        && !!targetBridgeTarget
        && scoreBridgeLength({
          edgeKey,
          endpoint: 'target',
          source: edge.source,
          target: edge.target,
          anchor: end,
          side: targetSide,
          desiredLength,
          bridgeTarget: targetBridgeTarget,
        }, Math.max(targetStubLength, MIN_STUB), edgePaths) > 0;
      if (
        targetSide
        && (forceShorten || targetBridgeCrosses || shouldAdjustEndpoint(end, previous, targetSide, desiredLength))
      ) {
        endpointContexts.set(`${edgeKey}:target`, {
          edgeKey,
          endpoint: 'target',
          source: edge.source,
          target: edge.target,
          anchor: end,
          side: targetSide,
          desiredLength,
          forceShorten,
          minLength: isInwardSameAxisEndpointSegment(end, previous, targetSide) ? MIN_PREFERRED_STUB : undefined,
          maxLength: detachedTargetEndpoint || targetBridgeCrosses ? MAX_DETACHED_ENDPOINT_STUB : undefined,
          bridgeTarget: detachedTargetEndpoint || targetBridgeCrosses ? targetBridgeTarget : undefined,
          detachedEndpoint: detachedTargetEndpoint,
        });
      }
    }
  }

  const endpointContextList = Array.from(endpointContexts.values());

  let changed = false;
  const repairedEdges = edgePaths.map(({ edge, edgeKey, path }) => {
    if (path.length < 2) return edge;

    let repaired = path;
    const sourceContext = endpointContexts.get(`${edgeKey}:source`);
    if (sourceContext) {
      const stubLength = resolveAdaptiveStubLength(sourceContext, edgePaths, endpointContextList);
      repaired = repairStartWithContext(repaired, sourceContext.side, stubLength, sourceContext.forceShorten === true);
    }
    const targetContext = endpointContexts.get(`${edgeKey}:target`);
    if (targetContext) {
      const stubLength = resolveAdaptiveStubLength(targetContext, edgePaths, endpointContextList);
      repaired = repairEndWithContext(repaired, targetContext.side, stubLength, targetContext.forceShorten === true);
    }
    repaired = straightenNearlyAlignedEndpointPath(repaired, edge, edgeKey, nodeById, edgePaths) ?? repaired;
    if (samePath(path, repaired)) return edge;
    changed = true;
    return withComputedPath(edge, repaired, {
      detachedSourceEndpointReanchored: sourceContext?.detachedEndpoint === true
        || edge.data?.detachedSourceEndpointReanchored === true,
      detachedTargetEndpointReanchored: targetContext?.detachedEndpoint === true
        || edge.data?.detachedTargetEndpointReanchored === true,
    });
  });
  return changed ? repairedEdges : edges;
}
