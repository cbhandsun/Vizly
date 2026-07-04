import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Axis = 'h' | 'v';

const EPS = 0.5;
const MAX_LOCAL_DOGLEG_DEPTH = 72;
const MAX_BROAD_DOGLEG_DEPTH = 520;
const MAX_OPPOSITE_RETURN_DEPTH = MAX_BROAD_DOGLEG_DEPTH;
const MIN_LENGTH_SAVING = 8;
const MIN_CONTRACTED_OUTER_LANE = 48;
const MIN_TERMINAL_STUB = 56;
const MAX_TERMINAL_STUB_LENGTH_PENALTY = 24;
const OBSTACLE_PADDING = 8;
const OUTER_LANE_CLEARANCES = [12, 24, 36, 48, 64, 96];

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function getEdgePath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath || (edge.data as any)?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: any = { ...(edge.data || {}), computedPath: path, localDoglegRepaired: true };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return { ...edge, data };
}

function axisOf(a: Point, b: Point): Axis | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
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

function pathEquals(first: Point[], second: Point[]): boolean {
  return first.length === second.length
    && first.every((point, index) => (
      Math.abs(point.x - second[index]?.x) <= EPS && Math.abs(point.y - second[index]?.y) <= EPS
    ));
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.abs(points[index + 1].x - points[index].x) + Math.abs(points[index + 1].y - points[index].y);
  }
  return total;
}

function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function terminalStubScore(points: Point[]): number {
  if (points.length < 2) return 0;
  const firstAxis = axisOf(points[0], points[1]);
  const lastAxis = axisOf(points[points.length - 2], points[points.length - 1]);
  const firstLength = firstAxis ? segmentLength(points[0], points[1]) : 0;
  const lastLength = lastAxis ? segmentLength(points[points.length - 2], points[points.length - 1]) : 0;
  if (!firstAxis && !lastAxis) return 0;
  if (!firstAxis) return lastLength;
  if (!lastAxis) return firstLength;
  return Math.min(firstLength, lastLength);
}

function bendCount(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previousAxis = axisOf(points[index - 1], points[index]);
    const nextAxis = axisOf(points[index], points[index + 1]);
    if (previousAxis && nextAxis && previousAxis !== nextAxis) total += 1;
  }
  return total;
}

function toSegments(points: Point[]): Array<{ a: Point; b: Point }> {
  const segments: Array<{ a: Point; b: Point }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    if (axisOf(points[index], points[index + 1])) segments.push({ a: points[index], b: points[index + 1] });
  }
  return segments;
}

function nodeRect(node: ReactFlowNode): Rect | null {
  const position = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const width = num((node as any).measured?.width ?? node.width ?? (node.style as any)?.width, 0);
  const height = num((node as any).measured?.height ?? node.height ?? (node.style as any)?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: num((position as any).x, 0),
    y: num((position as any).y, 0),
    width,
    height,
  };
}

function getRoutingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']);
  const obstacles = new Map<string, Rect>();
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const rect = nodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  return obstacles;
}

function segmentIntersectsRect(a: Point, b: Point, rect: Rect, padding = OBSTACLE_PADDING): boolean {
  const axis = axisOf(a, b);
  if (!axis) return false;
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (axis === 'h') {
    const y = a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(a.x, b.x), x1) < Math.min(Math.max(a.x, b.x), x2);
  }
  const x = a.x;
  if (x < x1 || x > x2) return false;
  return Math.max(Math.min(a.y, b.y), y1) < Math.min(Math.max(a.y, b.y), y2);
}

function pathHitsUnrelatedObstacle(path: Point[], edge: Edge, obstacles: Map<string, Rect>): boolean {
  for (let index = 0; index < path.length - 1; index += 1) {
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge.source || nodeId === edge.target) continue;
      if (segmentIntersectsRect(path[index], path[index + 1], rect)) return true;
    }
  }
  return false;
}

function strictCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const firstAxis = axisOf(a1, a2);
  const secondAxis = axisOf(b1, b2);
  if (!firstAxis || !secondAxis || firstAxis === secondAxis) return false;
  const h1 = firstAxis === 'h' ? a1 : b1;
  const h2 = firstAxis === 'h' ? a2 : b2;
  const v1 = firstAxis === 'v' ? a1 : b1;
  const v2 = firstAxis === 'v' ? a2 : b2;
  const x = v1.x;
  const y = h1.y;
  return x > Math.min(h1.x, h2.x) + 1
    && x < Math.max(h1.x, h2.x) - 1
    && y > Math.min(v1.y, v2.y) + 1
    && y < Math.max(v1.y, v2.y) - 1;
}

function countCrossings(path: Point[], edgeKey: string, pathByEdgeKey: Map<string, Point[]>): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    for (const [otherKey, otherPath] of pathByEdgeKey) {
      if (otherKey === edgeKey) continue;
      for (let otherIndex = 0; otherIndex < otherPath.length - 1; otherIndex += 1) {
        if (strictCross(path[index], path[index + 1], otherPath[otherIndex], otherPath[otherIndex + 1])) {
          total += 1;
        }
      }
    }
  }
  return total;
}

function hasSameEndpoints(first: Point[], second: Point[]): boolean {
  const firstStart = first[0];
  const firstEnd = first[first.length - 1];
  const secondStart = second[0];
  const secondEnd = second[second.length - 1];
  return !!firstStart && !!firstEnd && !!secondStart && !!secondEnd
    && Math.abs(firstStart.x - secondStart.x) <= EPS
    && Math.abs(firstStart.y - secondStart.y) <= EPS
    && Math.abs(firstEnd.x - secondEnd.x) <= EPS
    && Math.abs(firstEnd.y - secondEnd.y) <= EPS;
}

function buildStepCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  if (!a || !b || !c || !d) return null;

  if (axisOf(a, b) === 'v' && axisOf(b, c) === 'h' && axisOf(c, d) === 'v') {
    const sameDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
    const depth = Math.abs(b.x - c.x);
    if (sameDirection && depth > EPS && depth <= MAX_LOCAL_DOGLEG_DEPTH) {
      return [
        ...points.slice(0, index + 1),
        { x: a.x, y: d.y },
        ...points.slice(index + 4),
      ];
    }
  }

  if (axisOf(a, b) === 'h' && axisOf(b, c) === 'v' && axisOf(c, d) === 'h') {
    const sameDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
    const depth = Math.abs(b.y - c.y);
    if (sameDirection && depth > EPS && depth <= MAX_LOCAL_DOGLEG_DEPTH) {
      return [
        ...points.slice(0, index + 1),
        { x: d.x, y: a.y },
        ...points.slice(index + 4),
      ];
    }
  }

  return null;
}

function buildReturnNotchCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && axisOf(d, e) === 'v'
    && Math.abs(a.y - e.y) <= EPS
  ) {
    const returnsToMainAxis = Math.sign(c.y - b.y) === -Math.sign(e.y - d.y);
    const depth = Math.max(Math.abs(c.y - b.y), Math.abs(e.y - d.y));
    const detourLength = Math.abs(b.x - a.x)
      + Math.abs(c.y - b.y)
      + Math.abs(d.x - c.x)
      + Math.abs(e.y - d.y);
    const directLength = Math.abs(e.x - a.x);
    if (returnsToMainAxis && depth > EPS && depth <= MAX_LOCAL_DOGLEG_DEPTH && detourLength - directLength >= MIN_LENGTH_SAVING) {
      return [
        ...points.slice(0, index + 1),
        { x: e.x, y: a.y },
        ...points.slice(index + 5),
      ];
    }
  }

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && axisOf(d, e) === 'h'
    && Math.abs(a.x - e.x) <= EPS
  ) {
    const returnsToMainAxis = Math.sign(c.x - b.x) === -Math.sign(e.x - d.x);
    const depth = Math.max(Math.abs(c.x - b.x), Math.abs(e.x - d.x));
    const detourLength = Math.abs(b.y - a.y)
      + Math.abs(c.x - b.x)
      + Math.abs(d.y - c.y)
      + Math.abs(e.x - d.x);
    const directLength = Math.abs(e.y - a.y);
    if (returnsToMainAxis && depth > EPS && depth <= MAX_LOCAL_DOGLEG_DEPTH && detourLength - directLength >= MIN_LENGTH_SAVING) {
      return [
        ...points.slice(0, index + 1),
        { x: a.x, y: e.y },
        ...points.slice(index + 5),
      ];
    }
  }

  return null;
}

function buildBroadReturnCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && axisOf(d, e) === 'h'
  ) {
    const sameDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
    const returnsTowardMainAxis = Math.sign(c.x - b.x) === -Math.sign(e.x - d.x);
    const depth = Math.abs(c.x - b.x);
    const detourLength = Math.abs(b.y - a.y)
      + Math.abs(c.x - b.x)
      + Math.abs(d.y - c.y)
      + Math.abs(e.x - d.x);
    const directLength = Math.abs(e.y - a.y) + Math.abs(e.x - a.x);
    if (
      sameDirection
      && returnsTowardMainAxis
      && depth > MAX_LOCAL_DOGLEG_DEPTH
      && depth <= MAX_BROAD_DOGLEG_DEPTH
      && detourLength - directLength >= MIN_LENGTH_SAVING
    ) {
      return [
        ...points.slice(0, index + 1),
        { x: a.x, y: e.y },
        e,
        ...points.slice(index + 5),
      ];
    }
  }

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && axisOf(d, e) === 'v'
  ) {
    const sameDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
    const returnsTowardMainAxis = Math.sign(c.y - b.y) === -Math.sign(e.y - d.y);
    const depth = Math.abs(c.y - b.y);
    const detourLength = Math.abs(b.x - a.x)
      + Math.abs(c.y - b.y)
      + Math.abs(d.x - c.x)
      + Math.abs(e.y - d.y);
    const directLength = Math.abs(e.x - a.x) + Math.abs(e.y - a.y);
    if (
      sameDirection
      && returnsTowardMainAxis
      && depth > MAX_LOCAL_DOGLEG_DEPTH
      && depth <= MAX_BROAD_DOGLEG_DEPTH
      && detourLength - directLength >= MIN_LENGTH_SAVING
    ) {
      return [
        ...points.slice(0, index + 1),
        { x: e.x, y: a.y },
        e,
        ...points.slice(index + 5),
      ];
    }
  }

  return null;
}

function buildOppositeReturnOffsetCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && axisOf(d, e) === 'h'
  ) {
    const turnsBack = Math.sign(b.y - a.y) === -Math.sign(d.y - c.y);
    const bridgeDepth = Math.abs(c.x - b.x);
    const detourLength = Math.abs(b.y - a.y)
      + Math.abs(c.x - b.x)
      + Math.abs(d.y - c.y)
      + Math.abs(e.x - d.x);
    const directLength = Math.abs(e.y - a.y) + Math.abs(e.x - a.x);
    if (
      turnsBack
      && bridgeDepth > EPS
      && bridgeDepth <= MAX_OPPOSITE_RETURN_DEPTH
      && detourLength - directLength >= MIN_LENGTH_SAVING
    ) {
      return [
        ...points.slice(0, index + 1),
        { x: a.x, y: e.y },
        e,
        ...points.slice(index + 5),
      ];
    }
  }

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && axisOf(d, e) === 'v'
  ) {
    const turnsBack = Math.sign(b.x - a.x) === -Math.sign(d.x - c.x);
    const bridgeDepth = Math.abs(c.y - b.y);
    const detourLength = Math.abs(b.x - a.x)
      + Math.abs(c.y - b.y)
      + Math.abs(d.x - c.x)
      + Math.abs(e.y - d.y);
    const directLength = Math.abs(e.x - a.x) + Math.abs(e.y - a.y);
    if (
      turnsBack
      && bridgeDepth > EPS
      && bridgeDepth <= MAX_OPPOSITE_RETURN_DEPTH
      && detourLength - directLength >= MIN_LENGTH_SAVING
    ) {
      return [
        ...points.slice(0, index + 1),
        { x: e.x, y: a.y },
        e,
        ...points.slice(index + 5),
      ];
    }
  }

  return null;
}

function buildTerminalStubCandidate(points: Point[], atStart: boolean): Point[] | null {
  if (points.length < 3) return null;

  const endpointIndex = atStart ? 0 : points.length - 1;
  const bendIndex = atStart ? 1 : points.length - 2;
  const bridgeIndex = atStart ? 2 : points.length - 3;
  const endpoint = points[endpointIndex];
  const bend = points[bendIndex];
  const bridge = points[bridgeIndex];
  if (!endpoint || !bend || !bridge) return null;

  const stubAxis = axisOf(endpoint, bend);
  const bridgeAxis = axisOf(bend, bridge);
  if (!stubAxis || !bridgeAxis || stubAxis === bridgeAxis) return null;

  const currentLength = segmentLength(endpoint, bend);
  if (currentLength <= EPS || currentLength >= MIN_TERMINAL_STUB) return null;

  const delta = MIN_TERMINAL_STUB - currentLength;
  const next = points.map(point => ({ ...point }));

  if (stubAxis === 'v') {
    const direction = Math.sign(bend.y - endpoint.y);
    if (direction === 0) return null;
    const y = bend.y + direction * delta;
    next[bendIndex] = { ...next[bendIndex], y };
    next[bridgeIndex] = { ...next[bridgeIndex], y };
  } else {
    const direction = Math.sign(bend.x - endpoint.x);
    if (direction === 0) return null;
    const x = bend.x + direction * delta;
    next[bendIndex] = { ...next[bendIndex], x };
    next[bridgeIndex] = { ...next[bridgeIndex], x };
  }

  return next;
}

function addOuterLaneCandidate(
  values: Set<number>,
  value: number,
  laneValue: number,
  mainMin: number,
  mainMax: number,
): void {
  if (!Number.isFinite(value)) return;
  const rounded = Math.round(value);
  const leftOuter = laneValue < mainMin - EPS;
  const rightOuter = laneValue > mainMax + EPS;
  const outsideMainBand = rounded <= mainMin - MIN_CONTRACTED_OUTER_LANE
    || rounded >= mainMax + MIN_CONTRACTED_OUTER_LANE;
  if (leftOuter && rounded > laneValue + EPS && outsideMainBand) {
    values.add(rounded);
  }
  if (rightOuter && rounded < laneValue - EPS && outsideMainBand) {
    values.add(rounded);
  }
}

function overlapsRange(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.max(Math.min(a1, a2), Math.min(b1, b2)) < Math.min(Math.max(a1, a2), Math.max(b1, b2)) - EPS;
}

function addInteriorAxisValue(values: Set<number>, value: number, first: number, second: number): void {
  if (!Number.isFinite(value)) return;
  const rounded = Math.round(value);
  const min = Math.min(first, second);
  const max = Math.max(first, second);
  if (rounded > min + MIN_CONTRACTED_OUTER_LANE && rounded < max - MIN_CONTRACTED_OUTER_LANE) {
    values.add(rounded);
  }
}

function buildHorizontalBridgeYValues(
  points: Point[],
  index: number,
  laneX: number,
  pathByEdgeKey: Map<string, Point[]>,
  edgeKey: string,
): number[] {
  const previous = points[index - 1];
  const a = points[index];
  const c = points[index + 2];
  if (!previous || !a || !c || axisOf(previous, a) !== 'v') return [a?.y].filter(Number.isFinite);

  const values = new Set<number>();
  let mustMoveBridge = false;
  const bridgeMinX = Math.min(a.x, laneX);
  const bridgeMaxX = Math.max(a.x, laneX);
  for (const [otherKey, otherPath] of pathByEdgeKey) {
    if (otherKey === edgeKey) continue;
    for (const segment of toSegments(otherPath)) {
      const segmentAxis = axisOf(segment.a, segment.b);
      if (segmentAxis === 'v') {
        const x = segment.a.x;
        if (x <= bridgeMinX + EPS || x >= bridgeMaxX - EPS) continue;
        if (a.y <= Math.min(segment.a.y, segment.b.y) + EPS || a.y >= Math.max(segment.a.y, segment.b.y) - EPS) continue;
        mustMoveBridge = true;
        const minY = Math.min(segment.a.y, segment.b.y);
        const maxY = Math.max(segment.a.y, segment.b.y);
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addInteriorAxisValue(values, c.y >= a.y ? maxY + clearance : minY - clearance, previous.y, c.y);
        }
      }
      if (segmentAxis === 'h') {
        const y = segment.a.y;
        if (laneX <= Math.min(segment.a.x, segment.b.x) + EPS || laneX >= Math.max(segment.a.x, segment.b.x) - EPS) continue;
        if (y <= Math.min(a.y, c.y) + EPS || y >= Math.max(a.y, c.y) - EPS) continue;
        mustMoveBridge = true;
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addInteriorAxisValue(values, c.y >= a.y ? y + clearance : y - clearance, previous.y, c.y);
        }
      }
    }
  }
  if (!mustMoveBridge) values.add(Math.round(a.y));
  return [...values];
}

function buildVerticalBridgeXValues(
  points: Point[],
  index: number,
  laneY: number,
  pathByEdgeKey: Map<string, Point[]>,
  edgeKey: string,
): number[] {
  const previous = points[index - 1];
  const a = points[index];
  const c = points[index + 2];
  if (!previous || !a || !c || axisOf(previous, a) !== 'h') return [a?.x].filter(Number.isFinite);

  const values = new Set<number>();
  let mustMoveBridge = false;
  const bridgeMinY = Math.min(a.y, laneY);
  const bridgeMaxY = Math.max(a.y, laneY);
  for (const [otherKey, otherPath] of pathByEdgeKey) {
    if (otherKey === edgeKey) continue;
    for (const segment of toSegments(otherPath)) {
      const segmentAxis = axisOf(segment.a, segment.b);
      if (segmentAxis === 'h') {
        const y = segment.a.y;
        if (y <= bridgeMinY + EPS || y >= bridgeMaxY - EPS) continue;
        if (a.x <= Math.min(segment.a.x, segment.b.x) + EPS || a.x >= Math.max(segment.a.x, segment.b.x) - EPS) continue;
        mustMoveBridge = true;
        const minX = Math.min(segment.a.x, segment.b.x);
        const maxX = Math.max(segment.a.x, segment.b.x);
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addInteriorAxisValue(values, c.x >= a.x ? maxX + clearance : minX - clearance, previous.x, c.x);
        }
      }
      if (segmentAxis === 'v') {
        const x = segment.a.x;
        if (laneY <= Math.min(segment.a.y, segment.b.y) + EPS || laneY >= Math.max(segment.a.y, segment.b.y) - EPS) continue;
        if (x <= Math.min(a.x, c.x) + EPS || x >= Math.max(a.x, c.x) - EPS) continue;
        mustMoveBridge = true;
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addInteriorAxisValue(values, c.x >= a.x ? x + clearance : x - clearance, previous.x, c.x);
        }
      }
    }
  }
  if (!mustMoveBridge) values.add(Math.round(a.x));
  return [...values];
}

function buildOuterLaneContractionCandidates(
  points: Point[],
  index: number,
  edge: Edge,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
  obstacles: Map<string, Rect>,
): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  if (!a || !b || !c || !d) return [];

  const candidates: Point[][] = [];

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && Math.sign(b.x - a.x) === -Math.sign(d.x - c.x)
  ) {
    const laneX = b.x;
    const mainMin = Math.min(a.x, d.x);
    const mainMax = Math.max(a.x, d.x);
    if (laneX < mainMin - EPS || laneX > mainMax + EPS) {
      const values = new Set<number>();
      for (const [nodeId, rect] of obstacles) {
        if (nodeId === edge.source || nodeId === edge.target) continue;
        if (!overlapsRange(b.y, c.y, rect.y, rect.y + rect.height)) continue;
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addOuterLaneCandidate(values, rect.x - clearance, laneX, mainMin, mainMax);
          addOuterLaneCandidate(values, rect.x + rect.width + clearance, laneX, mainMin, mainMax);
        }
      }
      for (const [otherKey, otherPath] of pathByEdgeKey) {
        if (otherKey === edgeKey) continue;
        for (const segment of toSegments(otherPath)) {
          if (axisOf(segment.a, segment.b) !== 'h') continue;
          if (segment.a.y <= Math.min(b.y, c.y) + EPS || segment.a.y >= Math.max(b.y, c.y) - EPS) continue;
          const minX = Math.min(segment.a.x, segment.b.x);
          const maxX = Math.max(segment.a.x, segment.b.x);
          for (const clearance of OUTER_LANE_CLEARANCES) {
            addOuterLaneCandidate(values, minX - clearance, laneX, mainMin, mainMax);
            addOuterLaneCandidate(values, maxX + clearance, laneX, mainMin, mainMax);
          }
        }
      }
      for (const value of values) {
        for (const entryY of buildHorizontalBridgeYValues(points, index, value, pathByEdgeKey, edgeKey)) {
          const shifted = points.map(point => ({ ...point }));
          shifted[index].y = entryY;
          shifted[index + 1] = { x: value, y: entryY };
          shifted[index + 2].x = value;
          candidates.push(shifted);
        }
      }
    }
  }

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && Math.sign(b.y - a.y) === -Math.sign(d.y - c.y)
  ) {
    const laneY = b.y;
    const mainMin = Math.min(a.y, d.y);
    const mainMax = Math.max(a.y, d.y);
    if (laneY < mainMin - EPS || laneY > mainMax + EPS) {
      const values = new Set<number>();
      for (const [nodeId, rect] of obstacles) {
        if (nodeId === edge.source || nodeId === edge.target) continue;
        if (!overlapsRange(b.x, c.x, rect.x, rect.x + rect.width)) continue;
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addOuterLaneCandidate(values, rect.y - clearance, laneY, mainMin, mainMax);
          addOuterLaneCandidate(values, rect.y + rect.height + clearance, laneY, mainMin, mainMax);
        }
      }
      for (const [otherKey, otherPath] of pathByEdgeKey) {
        if (otherKey === edgeKey) continue;
        for (const segment of toSegments(otherPath)) {
          if (axisOf(segment.a, segment.b) !== 'v') continue;
          if (segment.a.x <= Math.min(b.x, c.x) + EPS || segment.a.x >= Math.max(b.x, c.x) - EPS) continue;
          const minY = Math.min(segment.a.y, segment.b.y);
          const maxY = Math.max(segment.a.y, segment.b.y);
          for (const clearance of OUTER_LANE_CLEARANCES) {
            addOuterLaneCandidate(values, minY - clearance, laneY, mainMin, mainMax);
            addOuterLaneCandidate(values, maxY + clearance, laneY, mainMin, mainMax);
          }
        }
      }
      for (const value of values) {
        for (const entryX of buildVerticalBridgeXValues(points, index, value, pathByEdgeKey, edgeKey)) {
          const shifted = points.map(point => ({ ...point }));
          shifted[index].x = entryX;
          shifted[index + 1] = { x: entryX, y: value };
          shifted[index + 2].y = value;
          candidates.push(shifted);
        }
      }
    }
  }

  return candidates;
}

function findBestLocalDoglegCandidate(
  path: Point[],
  edge: Edge,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
  obstacles: Map<string, Rect>,
): Point[] | null {
  const currentLength = pathLength(path);
  const currentBends = bendCount(path);
  const currentCrossings = countCrossings(path, edgeKey, pathByEdgeKey);
  let bestPath: Point[] | null = null;
  let bestLength = currentLength;
  let bestBends = currentBends;
  let bestCrossings = currentCrossings;
  let bestTerminalStubScore = terminalStubScore(path);

  const tryCandidate = (candidate: Point[] | null) => {
    if (!candidate) return;
    const normalized = compactPath(candidate);
    if (normalized.length < 2 || !hasSameEndpoints(path, normalized)) return;
    if (pathHitsUnrelatedObstacle(normalized, edge, obstacles)) return;

    const length = pathLength(normalized);
    const bends = bendCount(normalized);
    const crossings = countCrossings(normalized, edgeKey, pathByEdgeKey);
    if (crossings > currentCrossings || crossings > bestCrossings) return;

    const stubScore = terminalStubScore(normalized);
    const fewerCrossings = crossings < bestCrossings;
    const shorter = length < bestLength - MIN_LENGTH_SAVING;
    const simpler = bends < bestBends && length <= bestLength + MIN_LENGTH_SAVING;
    const betterTerminalStub = bestTerminalStubScore < MIN_TERMINAL_STUB
      && stubScore > bestTerminalStubScore + MIN_LENGTH_SAVING
      && length <= bestLength + MAX_TERMINAL_STUB_LENGTH_PENALTY;
    if (!fewerCrossings && !shorter && !simpler && !betterTerminalStub) return;

    bestPath = normalized;
    bestLength = length;
    bestBends = bends;
    bestCrossings = crossings;
    bestTerminalStubScore = stubScore;
  };

  tryCandidate(buildTerminalStubCandidate(path, true));
  tryCandidate(buildTerminalStubCandidate(path, false));

  for (let index = 1; index + 3 < path.length - 1; index += 1) {
    tryCandidate(buildStepCandidate(path, index));
    for (const candidate of buildOuterLaneContractionCandidates(path, index, edge, edgeKey, pathByEdgeKey, obstacles)) {
      tryCandidate(candidate);
    }
  }
  for (let index = 1; index + 4 < path.length - 1; index += 1) {
    tryCandidate(buildReturnNotchCandidate(path, index));
    tryCandidate(buildBroadReturnCandidate(path, index));
    tryCandidate(buildOppositeReturnOffsetCandidate(path, index));
  }

  return bestPath;
}

function repairPath(
  path: Point[],
  edge: Edge,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
  obstacles: Map<string, Rect>,
): Point[] {
  let current = compactPath(path);
  for (let pass = 0; pass < 6; pass += 1) {
    const candidate = findBestLocalDoglegCandidate(current, edge, edgeKey, pathByEdgeKey, obstacles);
    if (!candidate || pathEquals(candidate, current)) break;
    current = candidate;
    pathByEdgeKey.set(edgeKey, current);
  }
  return current;
}

export function repairLocalDoglegArtifacts(edges: Edge[], nodes: ReactFlowNode[]): Edge[] {
  if (edges.length === 0) return edges;

  const pathByEdgeKey = new Map<string, Point[]>();
  const edgeKeys = edges.map((edge, index) => edge.id || `${edge.source}->${edge.target}#${index}`);
  edges.forEach((edge, index) => {
    const path = compactPath(getEdgePath(edge));
    if (path.length >= 2) pathByEdgeKey.set(edgeKeys[index], path);
  });
  if (pathByEdgeKey.size === 0) return edges;

  const obstacles = getRoutingObstacles(nodes);
  return edges.map((edge, index) => {
    const edgeKey = edgeKeys[index];
    const path = pathByEdgeKey.get(edgeKey);
    if (!path || path.length < 4) return edge;
    const repaired = repairPath(path, edge, edgeKey, pathByEdgeKey, obstacles);
    if (pathEquals(path, repaired)) return edge;
    pathByEdgeKey.set(edgeKey, repaired);
    return withComputedPath(edge, repaired);
  });
}
