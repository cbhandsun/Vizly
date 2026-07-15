import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  edgeTerminalSideCanSwitch,
  readEdgeTerminalPolicy,
  resolveEdgeTerminalHandleForSide,
  type EdgeTerminalRole,
} from '../../routing/utils/edgeTerminalPolicy';
import { normalizeHandle } from '../../routing/utils/handleUtils';
import { repairDisplayMicroArtifacts } from './edgeDisplayMicroCleanup';
import { getRoutingObstacles } from './edgeRoutingPathGeometry';
import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
} from './edgeStrictCrossingGuard';
import { createRoutingObstacleEvaluationContext } from './edgeWaypointCandidateRepair';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Side = 'top' | 'bottom' | 'left' | 'right';

const EPS = 0.5;
const MAX_RESTORE_CANDIDATES = 8;
const MAX_SIDE_BYPASS_CANDIDATES = 12;

function getEdgePath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath || (edge.data as any)?.treeRouting?.points || (edge.data as any)?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
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
    total += Math.abs(path[index].x - path[index + 1].x) + Math.abs(path[index].y - path[index + 1].y);
  }
  return total;
}

function restoreSeverity(currentPath: Point[], rawPath: Point[]): number {
  const currentLength = pathLength(currentPath);
  const rawLength = Math.max(1, pathLength(rawPath));
  const ratioBonus = currentLength / rawLength;
  const pointBonus = Math.max(0, currentPath.length - rawPath.length) * 0.25;
  return ratioBonus + pointBonus;
}

function pathEquals(first: Point[], second: Point[]): boolean {
  return first.length === second.length
    && first.every((point, index) => (
      Math.abs(point.x - second[index]?.x) <= EPS && Math.abs(point.y - second[index]?.y) <= EPS
    ));
}

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function getNodeRect(node: ReactFlowNode | undefined): Rect | null {
  if (!node) return null;
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

function allSegmentsOrthogonal(path: Point[]): boolean {
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const horizontal = Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS;
    const vertical = Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS;
    if (!horizontal && !vertical) return false;
  }
  return true;
}

function sourceSideFromPath(path: Point[], rect: Rect): Side | null {
  if (path.length < 2) return null;
  const start = path[0];
  const next = path[1];
  const vertical = Math.abs(start.x - next.x) <= EPS && Math.abs(start.y - next.y) > EPS;
  const horizontal = Math.abs(start.y - next.y) <= EPS && Math.abs(start.x - next.x) > EPS;
  if (vertical && Math.abs(start.y - rect.y) <= 2 && next.y < start.y) return 'top';
  if (vertical && Math.abs(start.y - (rect.y + rect.height)) <= 2 && next.y > start.y) return 'bottom';
  if (horizontal && Math.abs(start.x - rect.x) <= 2 && next.x < start.x) return 'left';
  if (horizontal && Math.abs(start.x - (rect.x + rect.width)) <= 2 && next.x > start.x) return 'right';
  return null;
}

function handleSide(handle: string | null | undefined): Side | null {
  const side = normalizeHandle(handle);
  if (side === 't') return 'top';
  if (side === 'b') return 'bottom';
  if (side === 'l') return 'left';
  if (side === 'r') return 'right';
  return null;
}

function endpointLiesOnSide(point: Point, rect: Rect, side: Side): boolean {
  const withinX = point.x >= rect.x - 2 && point.x <= rect.x + rect.width + 2;
  const withinY = point.y >= rect.y - 2 && point.y <= rect.y + rect.height + 2;
  if (side === 'top') return withinX && Math.abs(point.y - rect.y) <= 2;
  if (side === 'bottom') return withinX && Math.abs(point.y - (rect.y + rect.height)) <= 2;
  if (side === 'left') return withinY && Math.abs(point.x - rect.x) <= 2;
  return withinY && Math.abs(point.x - (rect.x + rect.width)) <= 2;
}

function terminalEscapesOutward(
  orderedPath: Point[],
  rect: Rect | null,
  declaredHandle: string | null | undefined,
): boolean {
  if (!rect) return true;
  const [endpoint, adjacent] = orderedPath;
  if (!endpoint || !adjacent) return false;
  const declaredSide = handleSide(declaredHandle);
  const geometricSide = sourceSideFromPath(orderedPath, rect);
  const side = declaredSide ?? geometricSide;
  if (!side || !endpointLiesOnSide(endpoint, rect, side)) return false;
  if (side === 'top') return Math.abs(endpoint.x - adjacent.x) <= EPS && adjacent.y < endpoint.y - EPS;
  if (side === 'bottom') return Math.abs(endpoint.x - adjacent.x) <= EPS && adjacent.y > endpoint.y + EPS;
  if (side === 'left') return Math.abs(endpoint.y - adjacent.y) <= EPS && adjacent.x < endpoint.x - EPS;
  return Math.abs(endpoint.y - adjacent.y) <= EPS && adjacent.x > endpoint.x + EPS;
}

function edgeTerminalGeometryIsClean(
  edge: Edge,
  path: Point[],
  nodeById: Map<string, ReactFlowNode>,
): boolean {
  const sourceRect = getNodeRect(nodeById.get(edge.source));
  const targetRect = getNodeRect(nodeById.get(edge.target));
  return terminalEscapesOutward(path, sourceRect, edge.sourceHandle)
    && terminalEscapesOutward([...path].reverse(), targetRect, edge.targetHandle);
}

function shiftedSameSideStarts(start: Point, rect: Rect, side: Side): Point[] {
  const candidates: Point[] = [];
  if (side === 'top' || side === 'bottom') {
    const y = side === 'top' ? rect.y : rect.y + rect.height;
    for (const fraction of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      candidates.push({ x: Math.round(rect.x + rect.width * fraction), y: Math.round(y) });
    }
  } else {
    const x = side === 'left' ? rect.x : rect.x + rect.width;
    for (const fraction of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      candidates.push({ x: Math.round(x), y: Math.round(rect.y + rect.height * fraction) });
    }
  }

  const seen = new Set<string>();
  return candidates.filter(point => {
    if (Math.abs(point.x - start.x) <= 8 && Math.abs(point.y - start.y) <= 8) return false;
    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type PathCandidate = { path: Point[]; sourceHandle?: Side };

function shiftedSourceSideCandidates(path: Point[], sourceRect: Rect | null): PathCandidate[] {
  if (!sourceRect || path.length < 3) return [];
  const side = sourceSideFromPath(path, sourceRect);
  if (!side) return [];
  const start = path[0];
  return shiftedSameSideStarts(start, sourceRect, side)
    .map((candidateStart) => {
      if (side === 'top' || side === 'bottom') {
        return compactPath([
          candidateStart,
          { x: candidateStart.x, y: path[1].y },
          ...path.slice(2),
        ]);
      }
      return compactPath([
        candidateStart,
        { x: path[1].x, y: candidateStart.y },
        ...path.slice(2),
      ]);
    })
    .filter(candidate => (
      candidate.length >= 2
      && !pathEquals(candidate, path)
      && allSegmentsOrthogonal(candidate)
      && pathLength(candidate) <= pathLength(path) + Math.max(24, pathLength(path) * 0.08)
    ))
    .map(candidate => ({ path: candidate, sourceHandle: side }));
}

function sideAnchorCandidates(rect: Rect, side: Side): Point[] {
  if (side === 'right' || side === 'left') {
    const x = side === 'right' ? rect.x + rect.width : rect.x;
    return [0.35, 0.5, 0.65].map(fraction => ({ x: Math.round(x), y: Math.round(rect.y + rect.height * fraction) }));
  }
  const y = side === 'bottom' ? rect.y + rect.height : rect.y;
  return [0.35, 0.5, 0.65].map(fraction => ({ x: Math.round(rect.x + rect.width * fraction), y: Math.round(y) }));
}

function sourceSideBypassCandidates(path: Point[], sourceRect: Rect | null): PathCandidate[] {
  if (!sourceRect || path.length < 3) return [];
  const targetEntry = path[path.length - 2];
  const end = path[path.length - 1];
  if (!targetEntry || !end) return [];

  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const preferredSide: Side = targetEntry.x >= sourceCenterX ? 'right' : 'left';
  const sides: Side[] = preferredSide === 'right' ? ['right', 'left'] : ['left', 'right'];
  const candidates: PathCandidate[] = [];

  for (const side of sides) {
    const outward = side === 'right' ? 1 : -1;
    const sideX = side === 'right' ? sourceRect.x + sourceRect.width : sourceRect.x;
    const laneBase = side === 'right'
      ? Math.max(sideX, targetEntry.x)
      : Math.min(sideX, targetEntry.x);
    const laneXs = [64, 128, 192, 256, 320, 480].map(offset => Math.round(laneBase + outward * offset));
    for (const start of sideAnchorCandidates(sourceRect, side)) {
      for (const laneX of laneXs) {
        const candidate = compactPath([
          start,
          { x: laneX, y: start.y },
          { x: laneX, y: targetEntry.y },
          targetEntry,
          end,
        ]);
        if (candidate.length < 2 || !allSegmentsOrthogonal(candidate)) continue;
        if (pathLength(candidate) > pathLength(path) + Math.max(96, pathLength(path) * 0.35)) continue;
        candidates.push({ path: candidate, sourceHandle: side });
      }
    }
  }

  return candidates;
}

function terminalHandle(edge: Edge, role: EdgeTerminalRole): string | null | undefined {
  return role === 'source' ? edge.sourceHandle : edge.targetHandle;
}

function terminalSideCanBeUsed(
  edge: Edge,
  rawEdge: Edge,
  role: EdgeTerminalRole,
  side: Side,
): boolean {
  return edgeTerminalSideCanSwitch(edge, role, side)
    && edgeTerminalSideCanSwitch(rawEdge, role, side);
}

function isCompoundHandle(handle: string | null | undefined, side: Side): boolean {
  if (typeof handle !== 'string' || handleSide(handle) !== side) return false;
  const normalized = handle.toLowerCase();
  return normalized !== side && normalized !== side[0];
}

function resolveRestoredTerminalHandleForSide(
  edge: Edge,
  rawEdge: Edge,
  role: EdgeTerminalRole,
  side: Side,
): string | null | undefined {
  const currentPolicy = readEdgeTerminalPolicy(edge, role);
  const rawPolicy = readEdgeTerminalPolicy(rawEdge, role);
  const currentHandle = terminalHandle(edge, role);
  const rawHandle = terminalHandle(rawEdge, role);

  if (currentPolicy.sourceExactFixed) {
    return resolveEdgeTerminalHandleForSide(edge, role, side);
  }
  if (rawPolicy.sourceExactFixed) {
    return resolveEdgeTerminalHandleForSide(rawEdge, role, side);
  }
  if (currentPolicy.sideFixed) {
    return resolveEdgeTerminalHandleForSide(edge, role, side);
  }
  if (rawPolicy.sideFixed) {
    return resolveEdgeTerminalHandleForSide(rawEdge, role, side);
  }
  if (isCompoundHandle(currentHandle, side)) {
    return resolveEdgeTerminalHandleForSide(edge, role, side);
  }
  if (isCompoundHandle(rawHandle, side)) {
    return resolveEdgeTerminalHandleForSide(rawEdge, role, side);
  }
  if (handleSide(currentHandle) === side) {
    return resolveEdgeTerminalHandleForSide(edge, role, side);
  }
  return resolveEdgeTerminalHandleForSide(rawEdge, role, side);
}

function resolveRawTerminalHandle(
  edge: Edge,
  rawEdge: Edge,
  role: EdgeTerminalRole,
): string | null | undefined {
  const rawHandle = terminalHandle(rawEdge, role);
  const rawSide = handleSide(rawHandle);
  if (!rawSide) {
    return readEdgeTerminalPolicy(edge, role).sideFixed
      ? terminalHandle(edge, role)
      : rawHandle;
  }
  if (!terminalSideCanBeUsed(edge, rawEdge, role, rawSide)) {
    return terminalHandle(edge, role);
  }
  return resolveRestoredTerminalHandleForSide(edge, rawEdge, role, rawSide);
}

function withRawPathCandidate(edge: Edge, rawEdge: Edge, path: Point[], sourceHandle?: Side): Edge {
  const data: any = {
    ...(edge.data || {}),
    computedPath: path,
    readableRawPathRestored: true,
    runtimeHandleLock: (rawEdge.data as any)?.runtimeHandleLock,
  };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  if (data.runtimeHandleLock === undefined) delete data.runtimeHandleLock;
  return {
    ...edge,
    sourceHandle: sourceHandle
      ? resolveRestoredTerminalHandleForSide(edge, rawEdge, 'source', sourceHandle)
      : resolveRawTerminalHandle(edge, rawEdge, 'source'),
    targetHandle: resolveRawTerminalHandle(edge, rawEdge, 'target'),
    data,
  };
}

function hardQualityDoesNotRegress(
  baseline: ReturnType<typeof calculateEdgePathQualityScore>,
  candidate: ReturnType<typeof calculateEdgePathQualityScore>,
): boolean {
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.strictCrossings <= baseline.strictCrossings
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
}

function readableQualityImproves(
  baseline: ReturnType<typeof calculateEdgePathQualityScore>,
  candidate: ReturnType<typeof calculateEdgePathQualityScore>,
): boolean {
  return candidate.detourPenalty < baseline.detourPenalty
    || candidate.bends < baseline.bends
    || candidate.totalLength < baseline.totalLength - 24;
}

function acceptableCandidate(
  baseline: ReturnType<typeof calculateEdgePathQualityScore>,
  candidate: ReturnType<typeof calculateEdgePathQualityScore>,
): boolean {
  return hardQualityDoesNotRegress(baseline, candidate)
    && readableQualityImproves(baseline, candidate)
    && candidate.totalLength <= baseline.totalLength + EPS;
}

export function restoreReadableRawLockedPaths(
  edges: Edge[],
  rawEdges: Edge[],
  nodes: ReactFlowNode[] = [],
): Edge[] {
  if (edges.length === 0 || rawEdges.length === 0) return edges;

  let currentEdges = edges;
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const routingObstacles = getRoutingObstacles(nodes);
  const obstacleContexts = currentEdges.map(edge => (
    createRoutingObstacleEvaluationContext(edge, routingObstacles)
  ));
  const restorable = currentEdges
    .map((edge, edgeIndex) => {
      const rawEdge = rawEdges[edgeIndex];
      if (!edge || !rawEdge || edge.id !== rawEdge.id || edge.source !== rawEdge.source || edge.target !== rawEdge.target) {
        return null;
      }

      const currentPath = compactPath(getEdgePath(edge));
      const rawPath = compactPath(getEdgePath(rawEdge));
      if (currentPath.length < 2 || rawPath.length < 2 || pathEquals(currentPath, rawPath)) return null;
      if (!allSegmentsOrthogonal(rawPath)) return null;
      if (pathLength(currentPath) <= pathLength(rawPath) * 1.6 && currentPath.length <= rawPath.length + 2) return null;
      if (pathLength(rawPath) >= pathLength(currentPath) - 24 && rawPath.length >= currentPath.length) return null;

      return {
        edgeIndex,
        currentPath,
        rawPath,
        severity: restoreSeverity(currentPath, rawPath),
      };
    })
    .filter((item): item is {
      edgeIndex: number;
      currentPath: Point[];
      rawPath: Point[];
      severity: number;
    } => item !== null)
    .sort((first, second) => second.severity - first.severity)
    .slice(0, MAX_RESTORE_CANDIDATES);

  for (const item of restorable) {
    const { edgeIndex, rawPath } = item;
    const edge = currentEdges[edgeIndex];
    const rawEdge = rawEdges[edgeIndex];
    if (!edge || !rawEdge) continue;

    const qualityContext = createEdgePathQualityEvaluationContext(currentEdges);
    const baselineQuality = qualityContext.evaluate(currentEdges);
    const rawCandidateEdges = currentEdges.map((candidateEdge, candidateIndex) => (
      candidateIndex === edgeIndex ? withRawPathCandidate(candidateEdge, rawEdge, rawPath) : candidateEdge
    ));
    const polishedCandidateEdges = repairDisplayMicroArtifacts(rawCandidateEdges);
    const polishedPath = compactPath(getEdgePath(polishedCandidateEdges[edgeIndex]));
    const sourceRect = getNodeRect(nodeById.get(edge.source));
    const sourcePositionIsFixed = readEdgeTerminalPolicy(edge, 'source').positionFixed
      || readEdgeTerminalPolicy(rawEdge, 'source').positionFixed;
    let bestEdges: Edge[] | null = null;
    let bestQuality = baselineQuality;

    const consider = (
      candidateEdges: Edge[],
      changedIndexes?: readonly number[],
    ): boolean => {
      const geometryChangedIndexes = changedIndexes ?? candidateEdges
        .map((candidateEdge, candidateIndex) => {
          const currentEdge = currentEdges[candidateIndex];
          if (!currentEdge) return candidateIndex;
          return candidateEdge.sourceHandle !== currentEdge.sourceHandle
            || candidateEdge.targetHandle !== currentEdge.targetHandle
            || !pathEquals(getEdgePath(candidateEdge), getEdgePath(currentEdge))
            ? candidateIndex
            : -1;
        })
        .filter(candidateIndex => candidateIndex >= 0);
      for (const candidateIndex of geometryChangedIndexes) {
        const candidateEdge = candidateEdges[candidateIndex];
        if (!candidateEdge) return false;
        const candidatePath = getEdgePath(candidateEdge);
        if (
          obstacleContexts[candidateIndex]?.countPathHits(candidatePath) !== 0
          || !edgeTerminalGeometryIsClean(candidateEdge, candidatePath, nodeById)
        ) {
          return false;
        }
      }
      const candidateQuality = changedIndexes
        ? qualityContext.evaluateChanged(candidateEdges, changedIndexes)
        : qualityContext.evaluate(candidateEdges);
      if (!acceptableCandidate(baselineQuality, candidateQuality)) return false;
      if (
        candidateQuality.detourPenalty < bestQuality.detourPenalty
        || candidateQuality.bends < bestQuality.bends
        || candidateQuality.totalLength < bestQuality.totalLength
      ) {
        bestEdges = candidateEdges;
        bestQuality = candidateQuality;
      }
      return true;
    };

    consider(polishedCandidateEdges);

    if (!bestEdges && !sourcePositionIsFixed) {
      for (const candidate of shiftedSourceSideCandidates(polishedPath, sourceRect)
        .filter(item => !item.sourceHandle
          || terminalSideCanBeUsed(edge, rawEdge, 'source', item.sourceHandle))) {
        consider(
          currentEdges.map((candidateEdge, candidateIndex) => (
            candidateIndex === edgeIndex
              ? withRawPathCandidate(candidateEdge, rawEdge, candidate.path, candidate.sourceHandle)
              : candidateEdge
          )),
          [edgeIndex],
        );
      }
    }

    if (!bestEdges && !sourcePositionIsFixed) {
      for (const candidate of sourceSideBypassCandidates(polishedPath, sourceRect)
        .filter(item => !item.sourceHandle
          || terminalSideCanBeUsed(edge, rawEdge, 'source', item.sourceHandle))
        .slice(0, MAX_SIDE_BYPASS_CANDIDATES)) {
        consider(
          currentEdges.map((candidateEdge, candidateIndex) => (
            candidateIndex === edgeIndex
              ? withRawPathCandidate(candidateEdge, rawEdge, candidate.path, candidate.sourceHandle)
              : candidateEdge
          )),
          [edgeIndex],
        );
        if (bestEdges) break;
      }
    }

    if (bestEdges) currentEdges = bestEdges;
  }

  return currentEdges;
}
