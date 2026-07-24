import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Side = 'top' | 'bottom' | 'left' | 'right';
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const EPS = 0.5;
const MIN_READABLE_ENDPOINT_STUB = 48;

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function getEdgePath(edge: Edge): Point[] {
  const raw = edge.data?.computedPath || edge.data?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(point => {
      const candidate = asRecord(point);
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function axisOf(a: Point, b: Point): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) > EPS) return 'v';
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
    const sameX = Math.abs(previous.x - current.x) < EPS && Math.abs(current.x - next.x) < EPS;
    const sameY = Math.abs(previous.y - current.y) < EPS && Math.abs(current.y - next.y) < EPS;
    if (!sameX && !sameY) result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

function pathEquals(a: Point[], b: Point[]): boolean {
  return a.length === b.length
    && a.every((point, index) => (
      Math.abs(point.x - b[index]?.x) <= EPS && Math.abs(point.y - b[index]?.y) <= EPS
    ));
}

function withComputedPath(edge: Edge, path: Point[], flags: Record<string, unknown> = {}): Edge {
  const data: Record<string, unknown> = { ...(edge.data || {}), ...flags, computedPath: path };
  const treeRouting = asRecord(data.treeRouting);
  if (Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
}

function getNodeRect(node: ReactFlowNode): Rect | null {
  const position = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = num(node.measured?.width ?? node.width ?? node.style?.width, 0);
  const height = num(node.measured?.height ?? node.height ?? node.style?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: num(position.x, 0),
    y: num(position.y, 0),
    width,
    height,
  };
}

function getRoutingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const result = new Map<string, Rect>();
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain']);
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const rect = getNodeRect(node);
    if (rect) result.set(node.id, rect);
  }
  return result;
}

function toSegments(points: Point[]): Array<{ a: Point; b: Point }> {
  const segments: Array<{ a: Point; b: Point }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS) segments.push({ a, b });
  }
  return segments;
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2))
    - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function pointNear(point: Point, other: Point, tolerance = 2): boolean {
  return Math.abs(point.x - other.x) <= tolerance && Math.abs(point.y - other.y) <= tolerance;
}

function segmentRelation(s1: { a: Point; b: Point }, s2: { a: Point; b: Point }): { crossings: number; overlap: number } {
  const s1H = Math.abs(s1.a.y - s1.b.y) < EPS;
  const s1V = Math.abs(s1.a.x - s1.b.x) < EPS;
  const s2H = Math.abs(s2.a.y - s2.b.y) < EPS;
  const s2V = Math.abs(s2.a.x - s2.b.x) < EPS;

  if (s1H && s2V) {
    const x = s2.a.x;
    const y = s1.a.y;
    const crosses = x > Math.min(s1.a.x, s1.b.x) + 1
      && x < Math.max(s1.a.x, s1.b.x) - 1
      && y > Math.min(s2.a.y, s2.b.y) + 1
      && y < Math.max(s2.a.y, s2.b.y) - 1;
    if (!crosses) return { crossings: 0, overlap: 0 };
    const point = { x, y };
    const endpointTouch = [s1.a, s1.b].some(a => pointNear(a, point))
      || [s2.a, s2.b].some(a => pointNear(a, point));
    return { crossings: endpointTouch ? 0 : 1, overlap: 0 };
  }
  if (s1V && s2H) return segmentRelation(s2, s1);
  if (s1H && s2H && Math.abs(s1.a.y - s2.a.y) < 2) {
    return { crossings: 0, overlap: rangeOverlap(s1.a.x, s1.b.x, s2.a.x, s2.b.x) };
  }
  if (s1V && s2V && Math.abs(s1.a.x - s2.a.x) < 2) {
    return { crossings: 0, overlap: rangeOverlap(s1.a.y, s1.b.y, s2.a.y, s2.b.y) };
  }
  return { crossings: 0, overlap: 0 };
}

function segmentIntersectsRect(segment: { a: Point; b: Point }, rect: Rect, padding = 10): boolean {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (Math.abs(segment.a.y - segment.b.y) < EPS) {
    const y = segment.a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1) < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  if (Math.abs(segment.a.x - segment.b.x) < EPS) {
    const x = segment.a.x;
    if (x < x1 || x > x2) return false;
    return Math.max(Math.min(segment.a.y, segment.b.y), y1) < Math.min(Math.max(segment.a.y, segment.b.y), y2);
  }
  return false;
}

function pathIntersectsAnyRect(path: Point[], rects: Rect[]): boolean {
  return toSegments(path).some(segment => rects.some(rect => segmentIntersectsRect(segment, rect, 0)));
}

function pathLength(path: Point[]): number {
  let length = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    length += Math.abs(path[index].x - path[index + 1].x) + Math.abs(path[index].y - path[index + 1].y);
  }
  return length;
}

function shiftedSameSideStarts(start: Point, axis: 'h' | 'v', nodeRect?: Rect): Point[] {
  if (!nodeRect) return [start];
  const result: Point[] = [start];
  if (axis === 'v') {
    const onHorizontalSide = Math.abs(start.y - nodeRect.y) < 2
      || Math.abs(start.y - (nodeRect.y + nodeRect.height)) < 2;
    if (onHorizontalSide && nodeRect.width > 80) {
      for (const fraction of [0.2, 0.35, 0.65, 0.8]) {
        const x = Math.round(nodeRect.x + nodeRect.width * fraction);
        if (Math.abs(x - start.x) > 8) result.push({ x, y: start.y });
      }
    }
  } else {
    const onVerticalSide = Math.abs(start.x - nodeRect.x) < 2
      || Math.abs(start.x - (nodeRect.x + nodeRect.width)) < 2;
    if (onVerticalSide && nodeRect.height > 80) {
      for (const fraction of [0.2, 0.35, 0.65, 0.8]) {
        const y = Math.round(nodeRect.y + nodeRect.height * fraction);
        if (Math.abs(y - start.y) > 8) result.push({ x: start.x, y });
      }
    }
  }
  const seen = new Set<string>();
  return result.filter(point => {
    const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateTwoPointDoglegCandidates(path: Point[], nodeRect?: Rect): Point[][] {
  if (path.length !== 2) return [];
  const [start, end] = path;
  const axis = axisOf(start, end);
  if (!axis) return [];

  const length = pathLength(path);
  const stub = Math.max(24, Math.min(48, length / 4));
  if (length < stub * 2 + 24) return [];

  const candidates: Point[][] = [];
  if (axis === 'v') {
    const direction = Math.sign(end.y - start.y);
    if (direction === 0) return [];
    for (const candidateStart of shiftedSameSideStarts(start, 'v', nodeRect)) {
      for (const x of [candidateStart.x - 140, candidateStart.x - 96, candidateStart.x - 56, candidateStart.x + 56, candidateStart.x + 96, candidateStart.x + 140]) {
        if (Math.abs(x - candidateStart.x) < 8) continue;
        candidates.push(compactPath([
          candidateStart,
          { x: candidateStart.x, y: candidateStart.y + direction * stub },
          { x, y: candidateStart.y + direction * stub },
          { x, y: end.y - direction * stub },
          { x: end.x, y: end.y - direction * stub },
          end,
        ]));
      }
    }
  } else {
    const direction = Math.sign(end.x - start.x);
    if (direction === 0) return [];
    for (const candidateStart of shiftedSameSideStarts(start, 'h', nodeRect)) {
      for (const y of [candidateStart.y - 140, candidateStart.y - 96, candidateStart.y - 56, candidateStart.y + 56, candidateStart.y + 96, candidateStart.y + 140]) {
        if (Math.abs(y - candidateStart.y) < 8) continue;
        candidates.push(compactPath([
          candidateStart,
          { x: candidateStart.x + direction * stub, y: candidateStart.y },
          { x: candidateStart.x + direction * stub, y },
          { x: end.x - direction * stub, y },
          { x: end.x - direction * stub, y: end.y },
          end,
        ]));
      }
    }
  }
  return candidates;
}

function generatePreservedEndpointCorridorCandidates(path: Point[], nodeRect?: Rect): Point[][] {
  const base = compactPath(path);
  if (base.length === 2) return generateTwoPointDoglegCandidates(base, nodeRect);
  if (base.length < 4) return [];
  const start = base[0];
  const sourceExit = base[1];
  const targetEntry = base[base.length - 2];
  const end = base[base.length - 1];
  const candidates: Point[][] = [];
  for (const y of [sourceExit.y - 96, sourceExit.y - 56, sourceExit.y + 56, sourceExit.y + 96, targetEntry.y - 96, targetEntry.y + 96]) {
    if (Math.abs(y - sourceExit.y) < 8 || Math.abs(y - targetEntry.y) < 8) continue;
    candidates.push(compactPath([start, sourceExit, { x: sourceExit.x, y }, { x: targetEntry.x, y }, targetEntry, end]));
  }
  for (const x of [sourceExit.x - 96, sourceExit.x - 56, sourceExit.x + 56, sourceExit.x + 96, targetEntry.x - 96, targetEntry.x + 96]) {
    if (Math.abs(x - sourceExit.x) < 8 || Math.abs(x - targetEntry.x) < 8) continue;
    candidates.push(compactPath([start, sourceExit, { x, y: sourceExit.y }, { x, y: targetEntry.y }, targetEntry, end]));
  }
  return candidates;
}

function sourceSideFromPath(path: Point[], nodeRect?: Rect): Side | null {
  if (!nodeRect || path.length < 2) return null;
  const start = path[0];
  const next = path[1];
  if (Math.abs(start.y - nodeRect.y) < 2 && axisOf(start, next) === 'v' && next.y < start.y) return 'top';
  if (Math.abs(start.y - (nodeRect.y + nodeRect.height)) < 2 && axisOf(start, next) === 'v' && next.y > start.y) return 'bottom';
  if (Math.abs(start.x - nodeRect.x) < 2 && axisOf(start, next) === 'h' && next.x < start.x) return 'left';
  if (Math.abs(start.x - (nodeRect.x + nodeRect.width)) < 2 && axisOf(start, next) === 'h' && next.x > start.x) return 'right';
  return null;
}

function pointLeavesSide(start: Point, point: Point, side: Side): boolean {
  if (side === 'top') return Math.abs(start.x - point.x) < EPS && point.y < start.y - EPS;
  if (side === 'bottom') return Math.abs(start.x - point.x) < EPS && point.y > start.y + EPS;
  if (side === 'left') return Math.abs(start.y - point.y) < EPS && point.x < start.x - EPS;
  return Math.abs(start.y - point.y) < EPS && point.x > start.x + EPS;
}

function findFirstSourceBranch(path: Point[], side: Side): { index: number; a: Point; b: Point } | null {
  const sourceAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  for (let index = 1; index < path.length - 1; index += 1) {
    const branchAxis = axisOf(path[index], path[index + 1]);
    if (!branchAxis || branchAxis === sourceAxis) continue;
    if (Math.abs(path[index].x - path[index + 1].x) + Math.abs(path[index].y - path[index + 1].y) < 24) continue;
    return { index, a: path[index], b: path[index + 1] };
  }
  return null;
}

function generateSameSideSourceSplitCandidates(path: Point[], nodeRect?: Rect): Point[][] {
  const base = compactPath(path);
  const side = sourceSideFromPath(base, nodeRect);
  if (!nodeRect || !side) return [];
  const branch = findFirstSourceBranch(base, side);
  if (!branch) return [];

  const candidates: Point[][] = [];
  const startAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  for (const candidateStart of shiftedSameSideStarts(base[0], startAxis, nodeRect).slice(1)) {
    if (side === 'top' || side === 'bottom') {
      const sourceExit = { x: candidateStart.x, y: branch.a.y };
      if (!pointLeavesSide(candidateStart, sourceExit, side)) continue;
      candidates.push(compactPath([
        candidateStart,
        sourceExit,
        { x: branch.b.x, y: branch.a.y },
        ...base.slice(branch.index + 2),
      ]));
    } else {
      const sourceExit = { x: branch.a.x, y: candidateStart.y };
      if (!pointLeavesSide(candidateStart, sourceExit, side)) continue;
      candidates.push(compactPath([
        candidateStart,
        sourceExit,
        { x: branch.a.x, y: branch.b.y },
        ...base.slice(branch.index + 2),
      ]));
    }
  }

  return candidates;
}

function generateSourceBranchLiftCandidates(path: Point[], nodeRect?: Rect): Point[][] {
  const base = compactPath(path);
  const side = sourceSideFromPath(base, nodeRect);
  if (!nodeRect || !side) return [];

  const branch = findFirstSourceBranch(base, side);
  if (!branch) return [];

  const candidates: Point[][] = [];
  if (side === 'top' || side === 'bottom') {
    const direction = side === 'top' ? -1 : 1;
    const minReadableY = base[0].y + direction * MIN_READABLE_ENDPOINT_STUB;
    const values = new Set<number>([
      branch.a.y + direction * 32,
      branch.a.y + direction * 56,
      branch.a.y + direction * 96,
      minReadableY,
    ].map(Math.round));

    for (const y of values) {
      if (direction * (y - base[0].y) <= 0) continue;
      if (Math.abs(y - branch.a.y) < 8) continue;
      candidates.push(compactPath([
        base[0],
        { x: base[0].x, y },
        { x: branch.b.x, y },
        ...base.slice(branch.index + 2),
      ]));
    }
  } else {
    const direction = side === 'left' ? -1 : 1;
    const minReadableX = base[0].x + direction * MIN_READABLE_ENDPOINT_STUB;
    const values = new Set<number>([
      branch.a.x + direction * 32,
      branch.a.x + direction * 56,
      branch.a.x + direction * 96,
      minReadableX,
    ].map(Math.round));

    for (const x of values) {
      if (direction * (x - base[0].x) <= 0) continue;
      if (Math.abs(x - branch.a.x) < 8) continue;
      candidates.push(compactPath([
        base[0],
        { x, y: base[0].y },
        { x, y: branch.b.y },
        ...base.slice(branch.index + 2),
      ]));
    }
  }

  return candidates;
}

function pathRelationSummary(path: Point[], otherPaths: Point[][]): { crossings: number; overlap: number } {
  const segments = toSegments(path);
  let crossings = 0;
  let overlap = 0;
  for (const otherPath of otherPaths) {
    for (const s1 of segments) {
      for (const s2 of toSegments(otherPath)) {
        const rel = segmentRelation(s1, s2);
        crossings += rel.crossings;
        overlap += rel.overlap;
      }
    }
  }
  return { crossings, overlap };
}

function hasSameNodeInOutConflict(incomingPath: Point[], outgoingPath: Point[]): boolean {
  const relation = pathRelationSummary(outgoingPath, [incomingPath]);
  return relation.crossings > 0 || relation.overlap >= 24;
}

function scoreSameNodeInOutCandidate(path: Point[], otherPaths: Point[][], baseLength: number): number {
  const relation = pathRelationSummary(path, otherPaths);
  const length = pathLength(path);
  const detour = Math.max(0, length - baseLength);
  const bends = Math.max(0, path.length - 2);
  return relation.crossings * 10000 + relation.overlap * 120 + detour * 0.12 + bends * 16 + length * 0.02;
}

export function repairSameNodeInOutCrossings(edges: Edge[], nodes: ReactFlowNode[]): Edge[] {
  const paths = new Map<string, Point[]>();
  for (const edge of edges) {
    const path = compactPath(getEdgePath(edge));
    if (path.length >= 2) paths.set(edge.id, path);
  }
  if (paths.size < 2) return edges;

  const obstacles = getRoutingObstacles(nodes);
  const nodeRects = new Map<string, Rect>();
  for (const node of nodes) {
    const rect = getNodeRect(node);
    if (rect) nodeRects.set(node.id, rect);
  }

  const repaired = new Map(paths);
  for (const incoming of edges) {
    const incomingPath = repaired.get(incoming.id);
    if (!incomingPath) continue;
    for (const outgoing of edges) {
      if (incoming.id === outgoing.id || incoming.target !== outgoing.source) continue;
      const outgoingPath = repaired.get(outgoing.id);
      if (!outgoingPath || !hasSameNodeInOutConflict(incomingPath, outgoingPath)) continue;

      const ignored = new Set([outgoing.source, outgoing.target]);
      const obstacleRects = Array.from(obstacles.entries())
        .filter(([nodeId]) => !ignored.has(nodeId))
        .map(([, rect]) => rect);
      const otherPaths = Array.from(repaired.entries())
        .filter(([edgeId]) => edgeId !== outgoing.id)
        .map(([, path]) => path);
      const baseLength = pathLength(outgoingPath);
      const currentRelation = pathRelationSummary(outgoingPath, otherPaths);
      const currentScore = scoreSameNodeInOutCandidate(outgoingPath, otherPaths, baseLength);
      const sourceRect = nodeRects.get(outgoing.source);
      const sourceStubLength = outgoingPath.length >= 2 ? pathLength(outgoingPath.slice(0, 2)) : Number.POSITIVE_INFINITY;
      const candidates = [
        ...(sourceStubLength < MIN_READABLE_ENDPOINT_STUB
          ? generateSameSideSourceSplitCandidates(outgoingPath, sourceRect)
          : []),
        ...generateSourceBranchLiftCandidates(outgoingPath, sourceRect),
        ...generatePreservedEndpointCorridorCandidates(outgoingPath, sourceRect),
      ]
        .filter(candidate => !sourceRect || sourceSideFromPath(compactPath(candidate), sourceRect) !== null)
        .filter(candidate => !pathIntersectsAnyRect(candidate, obstacleRects))
        .map(candidate => ({
          path: candidate,
          relation: pathRelationSummary(candidate, otherPaths),
          score: scoreSameNodeInOutCandidate(candidate, otherPaths, baseLength),
        }))
        .filter(candidate => candidate.relation.crossings <= currentRelation.crossings)
        .filter(candidate => candidate.score < currentScore - 5)
        .sort((a, b) => a.score - b.score);
      if (candidates[0]) repaired.set(outgoing.id, candidates[0].path);
    }
  }

  return edges.map(edge => {
    const path = repaired.get(edge.id);
    const original = paths.get(edge.id);
    if (!path || !original || pathEquals(path, original)) return edge;
    return withComputedPath(edge, path, { sameNodeInOutCrossingRepaired: true });
  });
}
