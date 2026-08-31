import type { Edge, Node } from '@xyflow/react';
import { createDisplayStrictCrossingCounter } from './baseReactFlowDisplayStrictCrossingCounter';

import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import { anchorForHandle, getNodeRect } from './baseReactFlowDisplayEdgeGeometry';
import {
  buildDisplayRoutingObstacles,
  collectPathHitObstacleRects,
  getDisplayComputedPath,
  shiftDisplayInternalSegment,
  withDisplayComputedPath,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import { buildObstacleOuterEscapeCandidates } from './baseReactFlowDisplayObstacleCandidates';
import {
  displayTerminalSideCanSwitch,
  resolveDisplayTerminalHandleForSide,
  type DisplayTerminalRole,
} from './baseReactFlowDisplayTerminalPolicy';
import {
  blockerEscapeLanesForCrossedSpine,
  crossedSpinePerpendicularBlockers,
  crossedSpinePathLength,
  crossedSpineTerminalStubPoint,
  OUTER_SKIRT_TERMINAL_STUB,
} from './baseReactFlowDisplayCrossedSpineSkirtGeometry';

const MAX_ATOMIC_PAIR_EVALUATIONS = 36;
const MAX_ATOMIC_CANDIDATES_PER_EDGE = 2;

export type SkirtCandidate = Readonly<{
  edgeIndex: number;
  edge: Edge;
  pathLength: number;
  obstacleHits: number;
  strictCrossings: number;
  topologyPriority: number;
}>;

export type AtomicSkirtPair<T extends Edge[]> = Readonly<{
  edges: T;
  changedIndexes: readonly [number, number];
  rank: number;
}>;

export const buildBoundedIndependentSkirtPairs = <T extends Edge[]>(
  edges: T,
  candidates: SkirtCandidate[],
): AtomicSkirtPair<T>[] => {
  const countByEdge = new Map<number, number>();
  const bounded = candidates.filter(candidate => {
    const count = countByEdge.get(candidate.edgeIndex) ?? 0;
    if (count >= MAX_ATOMIC_CANDIDATES_PER_EDGE) return false;
    countByEdge.set(candidate.edgeIndex, count + 1);
    return true;
  }).slice(0, 12);
  const pairs: AtomicSkirtPair<T>[] = [];
  for (let firstIndex = 0; firstIndex < bounded.length; firstIndex += 1) {
    const first = bounded[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < bounded.length; secondIndex += 1) {
      const second = bounded[secondIndex];
      if (first.edgeIndex === second.edgeIndex) continue;
      pairs.push({
        edges: edges.map((edge, edgeIndex) => {
          if (edgeIndex === first.edgeIndex) return first.edge;
          if (edgeIndex === second.edgeIndex) return second.edge;
          return edge;
        }) as T,
        changedIndexes: [first.edgeIndex, second.edgeIndex],
        rank: first.strictCrossings + second.strictCrossings
          + first.obstacleHits + second.obstacleHits
          + (first.pathLength + second.pathLength) / 100_000,
      });
    }
  }
  return pairs
    .sort((first, second) => first.rank - second.rank)
    .slice(0, MAX_ATOMIC_PAIR_EVALUATIONS);
};

/**
 * Moves only the crossed internal lane outside the aggregate blocker bundle.
 * Keeping both terminal stubs untouched preserves true source/target trunks;
 * this is the preferred transaction for reverse-flow lanes that cross a
 * fan-in/fan-out wall between their endpoints.
 */
export const buildCrossedSpineInternalLaneCandidates = (
  edge: Edge,
  edgeIndex: number,
  spine: DisplaySegment,
  nodes: Node[],
  otherSegments: DisplaySegment[],
): SkirtCandidate[] => {
  const path = getDisplayComputedPath(edge);
  const lanes = blockerEscapeLanesForCrossedSpine(spine, otherSegments);
  if (path.length < 4 || lanes.length === 0) return [];
  const countStrictCrossings = createDisplayStrictCrossingCounter(otherSegments);
  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);

  return lanes.flatMap(lane => {
    const candidatePath = shiftDisplayInternalSegment(
      path,
      spine.segmentIndex,
      spine.axis,
      lane,
    );
    if (!candidatePath) return [];
    return [{
      edgeIndex,
      edge: withDisplayComputedPath(edge, candidatePath),
      obstacleHits: collectPathHitObstacleRects(candidatePath, obstacles).length,
      pathLength: crossedSpinePathLength(candidatePath),
      strictCrossings: countStrictCrossings(candidatePath),
      topologyPriority: -3,
    }];
  });
};

export const buildCrossedSpineLocalWallCandidates = (
  edge: Edge,
  edgeIndex: number,
  spine: DisplaySegment,
  nodes: Node[],
  otherSegments: DisplaySegment[],
): SkirtCandidate[] => {
  const path = getDisplayComputedPath(edge);
  const blockers = crossedSpinePerpendicularBlockers(spine, otherSegments);
  const lanes = blockerEscapeLanesForCrossedSpine(spine, otherSegments);
  const start = path[spine.segmentIndex];
  const end = path[spine.segmentIndex + 1];
  if (!start || !end || blockers.length === 0 || lanes.length === 0) return [];
  const countStrictCrossings = createDisplayStrictCrossingCounter(otherSegments);
  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  const blockerCoordinates = blockers.flatMap(segment => (
    spine.axis === 'h'
      ? [segment.a.x, segment.b.x]
      : [segment.a.y, segment.b.y]
  ));
  const direction = spine.axis === 'h'
    ? Math.sign(end.x - start.x)
    : Math.sign(end.y - start.y);
  if (direction === 0) return [];
  const segmentMin = spine.axis === 'h'
    ? Math.min(start.x, end.x)
    : Math.min(start.y, end.y);
  const segmentMax = spine.axis === 'h'
    ? Math.max(start.x, end.x)
    : Math.max(start.y, end.y);

  return lanes.flatMap(lane => {
    let wallMin = Math.min(...blockerCoordinates);
    let wallMax = Math.max(...blockerCoordinates);
    const spineLane = spine.axis === 'h' ? start.y : start.x;
    const corridorMin = Math.min(spineLane, lane);
    const corridorMax = Math.max(spineLane, lane);
    const connectedParallelSegments = otherSegments.filter(segment => {
      if (segment.axis !== spine.axis) return false;
      const segmentLane = spine.axis === 'h' ? segment.a.y : segment.a.x;
      return segmentLane > corridorMin && segmentLane < corridorMax;
    });
    // Expand only through segments that touch the current wall projection.
    // This closes compound T/L walls without treating every remote lane in the
    // same coordinate band as part of the local obstacle.
    for (let pass = 0; pass < connectedParallelSegments.length; pass += 1) {
      let expanded = false;
      for (const segment of connectedParallelSegments) {
        const alongMin = spine.axis === 'h'
          ? Math.min(segment.a.x, segment.b.x)
          : Math.min(segment.a.y, segment.b.y);
        const alongMax = spine.axis === 'h'
          ? Math.max(segment.a.x, segment.b.x)
          : Math.max(segment.a.y, segment.b.y);
        if (alongMax < wallMin - 0.5 || alongMin > wallMax + 0.5) continue;
        const nextMin = Math.min(wallMin, alongMin);
        const nextMax = Math.max(wallMax, alongMax);
        if (nextMin === wallMin && nextMax === wallMax) continue;
        wallMin = nextMin;
        wallMax = nextMax;
        expanded = true;
      }
      if (!expanded) break;
    }
    const firstAlong = direction > 0
      ? wallMin - OUTER_SKIRT_TERMINAL_STUB
      : wallMax + OUTER_SKIRT_TERMINAL_STUB;
    const secondAlong = direction > 0
      ? wallMax + OUTER_SKIRT_TERMINAL_STUB
      : wallMin - OUTER_SKIRT_TERMINAL_STUB;
    if (
      firstAlong < segmentMin || firstAlong > segmentMax
      || secondAlong < segmentMin || secondAlong > segmentMax
    ) return [];
    const detour = spine.axis === 'h'
      ? [
        { x: firstAlong, y: start.y },
        { x: firstAlong, y: lane },
        { x: secondAlong, y: lane },
        { x: secondAlong, y: end.y },
      ]
      : [
        { x: start.x, y: firstAlong },
        { x: lane, y: firstAlong },
        { x: lane, y: secondAlong },
        { x: end.x, y: secondAlong },
      ];
    const candidatePath = compactOrthogonalPath([
      ...path.slice(0, spine.segmentIndex + 1),
      ...detour,
      ...path.slice(spine.segmentIndex + 1),
    ]);
    const strictCrossings = countStrictCrossings(candidatePath);
    return [{
      edgeIndex,
      edge: withDisplayComputedPath(edge, candidatePath),
      obstacleHits: collectPathHitObstacleRects(candidatePath, obstacles).length,
      pathLength: crossedSpinePathLength(candidatePath),
      strictCrossings,
      topologyPriority: -4,
    }];
  });
};

export const buildChangedTerminalCandidates = (
  edge: Edge,
  edgeIndex: number,
  spine: DisplaySegment,
  nodes: Node[],
  otherSegments: DisplaySegment[],
  role: DisplayTerminalRole,
): SkirtCandidate[] => {
  const path = getDisplayComputedPath(edge);
  if (path.length < 5) return [];
  const orientedPath = role === 'target' ? path : [...path].reverse();
  const orientedSegmentIndex = role === 'target'
    ? spine.segmentIndex
    : path.length - 2 - spine.segmentIndex;
  const spliceIndex = orientedSegmentIndex;
  if (spliceIndex < 1 || spliceIndex >= orientedPath.length - 2) return [];

  const terminalNodeId = role === 'target' ? edge.target : edge.source;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const terminalRect = getNodeRect(nodeById.get(terminalNodeId), nodeById);
  if (!terminalRect || terminalRect.width <= 1 || terminalRect.height <= 1) return [];
  const splice = orientedPath[spliceIndex];
  const stablePrefix = orientedPath.slice(0, spliceIndex);
  const candidates: SkirtCandidate[] = [];
  const seen = new Set<string>();
  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  const blockerEscapeLanes = blockerEscapeLanesForCrossedSpine(spine, otherSegments);
  const countStrictCrossings = createDisplayStrictCrossingCounter(otherSegments);

  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    if (!displayTerminalSideCanSwitch(edge, role, side)) continue;
    const nextHandle = resolveDisplayTerminalHandleForSide(edge, role, side);
    const anchor = anchorForHandle(terminalRect, nextHandle);
    const stub = crossedSpineTerminalStubPoint(anchor, side);
    const directRoutes = [
      [splice, { x: stub.x, y: splice.y }, stub],
      [splice, { x: splice.x, y: stub.y }, stub],
      ...blockerEscapeLanes.map(lane => (
        spine.axis === 'v'
          ? [splice, { x: lane, y: splice.y }, { x: lane, y: stub.y }, stub]
          : [splice, { x: splice.x, y: lane }, { x: stub.x, y: lane }, stub]
      )),
    ];
    const routes = [
      ...directRoutes,
      ...buildObstacleOuterEscapeCandidates([splice, stub], nodes, edge),
    ];
    for (const route of routes) {
      const orientedCandidate = compactOrthogonalPath([...stablePrefix, ...route, anchor]);
      const candidatePath = role === 'target'
        ? orientedCandidate
        : [...orientedCandidate].reverse();
      if (candidatePath.length < 4) continue;
      const strictCrossings = countStrictCrossings(candidatePath);
      const key = `${String(nextHandle)}:${candidatePath.map(point => `${point.x}:${point.y}`).join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pathEdge = withDisplayComputedPath(edge, candidatePath);
      candidates.push({
        edgeIndex,
        edge: role === 'target'
          ? { ...pathEdge, targetHandle: nextHandle }
          : { ...pathEdge, sourceHandle: nextHandle },
        obstacleHits: collectPathHitObstacleRects(candidatePath, obstacles).length,
        pathLength: crossedSpinePathLength(candidatePath),
        strictCrossings,
        topologyPriority: 1,
      });
    }
  }
  return candidates;
};

/**
 * Keeps the opposite endpoint trunk byte-for-byte while moving one free
 * terminal onto a graph-exterior ring. This closes the case where a local
 * lane shift merely transfers a crossing from one side of a connected wall
 * to the other. Explicitly declared terminal sides remain immutable through
 * displayTerminalSideCanSwitch.
 */
export const buildSingleTerminalOuterRingCandidates = (
  edge: Edge,
  edgeIndex: number,
  nodes: Node[],
  otherSegments: DisplaySegment[],
  role: DisplayTerminalRole,
): SkirtCandidate[] => {
  const path = getDisplayComputedPath(edge);
  if (path.length < 4) return [];
  const orientedPath = role === 'target' ? path : [...path].reverse();
  const fixedAnchor = orientedPath[0];
  const fixedStub = orientedPath[1];
  if (!fixedAnchor || !fixedStub) return [];

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const changedNodeId = role === 'target' ? edge.target : edge.source;
  const changedRect = getNodeRect(nodeById.get(changedNodeId), nodeById);
  if (!changedRect || changedRect.width <= 1 || changedRect.height <= 1) return [];
  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  if (obstacles.length === 0) return [];
  const countStrictCrossings = createDisplayStrictCrossingCounter(otherSegments);
  const segmentXs = otherSegments.flatMap(segment => [segment.a.x, segment.b.x]);
  const segmentYs = otherSegments.flatMap(segment => [segment.a.y, segment.b.y]);
  const outerXLanes = [
    Math.min(...obstacles.map(rect => rect.x), ...segmentXs) - OUTER_SKIRT_TERMINAL_STUB,
    Math.max(...obstacles.map(rect => rect.x + rect.width), ...segmentXs) + OUTER_SKIRT_TERMINAL_STUB,
  ];
  const outerYLanes = [
    Math.min(...obstacles.map(rect => rect.y), ...segmentYs) - OUTER_SKIRT_TERMINAL_STUB,
    Math.max(...obstacles.map(rect => rect.y + rect.height), ...segmentYs) + OUTER_SKIRT_TERMINAL_STUB,
  ];
  const candidates: SkirtCandidate[] = [];
  const seen = new Set<string>();

  for (const changedSide of ['left', 'right', 'top', 'bottom'] as const) {
    if (!displayTerminalSideCanSwitch(edge, role, changedSide)) continue;
    const changedHandle = resolveDisplayTerminalHandleForSide(edge, role, changedSide);
    const changedAnchor = anchorForHandle(changedRect, changedHandle);
    const changedStub = crossedSpineTerminalStubPoint(changedAnchor, changedSide);
    const routes = [
      ...outerXLanes.map(outerX => [
        fixedStub,
        { x: outerX, y: fixedStub.y },
        { x: outerX, y: changedStub.y },
        changedStub,
      ]),
      ...outerYLanes.map(outerY => [
        fixedStub,
        { x: fixedStub.x, y: outerY },
        { x: changedStub.x, y: outerY },
        changedStub,
      ]),
      ...outerXLanes.flatMap(outerX => outerYLanes.flatMap(outerY => [[
        fixedStub,
        { x: fixedStub.x, y: outerY },
        { x: outerX, y: outerY },
        { x: outerX, y: changedStub.y },
        changedStub,
      ], [
        fixedStub,
        { x: outerX, y: fixedStub.y },
        { x: outerX, y: outerY },
        { x: changedStub.x, y: outerY },
        changedStub,
      ]])),
    ];
    for (const route of routes) {
      const orientedCandidate = compactOrthogonalPath([
        fixedAnchor,
        ...route,
        changedAnchor,
      ]);
      const candidatePath = role === 'target'
        ? orientedCandidate
        : [...orientedCandidate].reverse();
      if (candidatePath.length < 4) continue;
      const key = `${String(changedHandle)}:${candidatePath
        .map(point => `${point.x}:${point.y}`).join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pathEdge = withDisplayComputedPath(edge, candidatePath);
      candidates.push({
        edgeIndex,
        edge: role === 'target'
          ? { ...pathEdge, targetHandle: changedHandle }
          : { ...pathEdge, sourceHandle: changedHandle },
        obstacleHits: collectPathHitObstacleRects(candidatePath, obstacles).length,
        pathLength: crossedSpinePathLength(candidatePath),
        strictCrossings: countStrictCrossings(candidatePath),
        topologyPriority: -5,
      });
    }
  }
  return candidates;
};

export const buildDualTerminalOuterLaneCandidates = (
  edge: Edge,
  edgeIndex: number,
  spine: DisplaySegment,
  nodes: Node[],
  otherSegments: DisplaySegment[],
): SkirtCandidate[] => {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect) return [];
  const lanes = blockerEscapeLanesForCrossedSpine(spine, otherSegments);
  if (lanes.length === 0) return [];
  const countStrictCrossings = createDisplayStrictCrossingCounter(otherSegments);
  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  const candidates: SkirtCandidate[] = [];
  const seen = new Set<string>();
  const segmentXs = otherSegments.flatMap(segment => [segment.a.x, segment.b.x]);
  const segmentYs = otherSegments.flatMap(segment => [segment.a.y, segment.b.y]);
  const outerXLanes = obstacles.length > 0 ? [
    Math.min(...obstacles.map(rect => rect.x), ...segmentXs) - OUTER_SKIRT_TERMINAL_STUB,
    Math.max(...obstacles.map(rect => rect.x + rect.width), ...segmentXs) + OUTER_SKIRT_TERMINAL_STUB,
  ] : [];
  const outerYLanes = obstacles.length > 0 ? [
    Math.min(...obstacles.map(rect => rect.y), ...segmentYs) - OUTER_SKIRT_TERMINAL_STUB,
    Math.max(...obstacles.map(rect => rect.y + rect.height), ...segmentYs) + OUTER_SKIRT_TERMINAL_STUB,
  ] : [];

  for (const sourceSide of ['left', 'right', 'top', 'bottom'] as const) {
    if (!displayTerminalSideCanSwitch(edge, 'source', sourceSide)) continue;
    const sourceHandle = resolveDisplayTerminalHandleForSide(edge, 'source', sourceSide);
    const sourceAnchor = anchorForHandle(sourceRect, sourceHandle);
    const sourceStub = crossedSpineTerminalStubPoint(sourceAnchor, sourceSide);
    for (const targetSide of ['left', 'right', 'top', 'bottom'] as const) {
      if (!displayTerminalSideCanSwitch(edge, 'target', targetSide)) continue;
      const targetHandle = resolveDisplayTerminalHandleForSide(edge, 'target', targetSide);
      const targetAnchor = anchorForHandle(targetRect, targetHandle);
      const targetStub = crossedSpineTerminalStubPoint(targetAnchor, targetSide);
      const lanePaths = lanes.map(lane => compactOrthogonalPath(spine.axis === 'v'
        ? [
          sourceAnchor,
          sourceStub,
          { x: lane, y: sourceStub.y },
          { x: lane, y: targetStub.y },
          targetStub,
          targetAnchor,
        ]
        : [
          sourceAnchor,
          sourceStub,
          { x: sourceStub.x, y: lane },
          { x: targetStub.x, y: lane },
          targetStub,
          targetAnchor,
        ]));
      const outerRingPaths = outerXLanes.flatMap(outerX => outerYLanes.map(outerY => (
        compactOrthogonalPath([
          sourceAnchor,
          sourceStub,
          { x: outerX, y: sourceStub.y },
          { x: outerX, y: outerY },
          { x: targetStub.x, y: outerY },
          targetStub,
          targetAnchor,
        ])
      )));
      const outerAxisPaths = [
        ...outerXLanes.map(outerX => compactOrthogonalPath([
          sourceAnchor,
          sourceStub,
          { x: outerX, y: sourceStub.y },
          { x: outerX, y: targetStub.y },
          targetStub,
          targetAnchor,
        ])),
        ...outerYLanes.map(outerY => compactOrthogonalPath([
          sourceAnchor,
          sourceStub,
          { x: sourceStub.x, y: outerY },
          { x: targetStub.x, y: outerY },
          targetStub,
          targetAnchor,
        ])),
      ];
      for (const candidatePath of [...lanePaths, ...outerAxisPaths, ...outerRingPaths]) {
        if (candidatePath.length < 4) continue;
        const key = `${String(sourceHandle)}:${String(targetHandle)}:${candidatePath
          .map(point => `${point.x}:${point.y}`).join('|')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const strictCrossings = countStrictCrossings(candidatePath);
        const pathEdge = withDisplayComputedPath(edge, candidatePath);
        candidates.push({
          edgeIndex,
          edge: {
            ...pathEdge,
            sourceHandle,
            targetHandle,
          },
          obstacleHits: collectPathHitObstacleRects(candidatePath, obstacles).length,
          pathLength: crossedSpinePathLength(candidatePath),
          strictCrossings,
          topologyPriority: 0,
        });
      }
    }
  }
  return candidates;
};
