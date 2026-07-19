import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { findStrictCrossings } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { countRoutingObstacleHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  buildFacingPortPathCandidates,
  buildNearTerminalSideCandidates,
  buildSharedNodeTerminalSideCandidates,
} from './baseReactFlowSharedNodePortRoleRepair';
import { buildStrictCrossingZipperCandidates } from './baseReactFlowStrictCrossingZipperRepair';
import {
  anchorComputedDisplayEdgeEndpoints,
  compactOrthogonalPath,
} from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayAxisOf,
  displayPointsCoincide,
  extractDisplaySegments,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  OBSTACLE_REPAIR_NODE_PADDING,
  oppositeDisplayPortSide,
  RESIDUAL_PARALLEL_LANE_GAP,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
} from './baseReactFlowDisplayEvaluation';
import {
  buildDeclaredTerminalAxisStubCandidates,
  buildOppositeRoleSharedNodeCandidates,
  displayTerminalRoleNeedsDeclaredAxisRepair,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';
import {
  repairBoundedReverseParallelOverlapsWithCandidates,
} from './baseReactFlowDisplayOverlapRepair';
import {
  createDisplayTerminalValidationSnapshot,
} from './baseReactFlowTerminalAxisRepair';

export { repairTerminalHandleHemisphereHairpins } from './baseReactFlowDisplayHemisphereHairpinRepair';

export {
  buildCrossingCompanionOuterPortVariants,
  buildOppositeRoleSharedNodeCandidates,
  buildStrictCrossingCompanionShiftVariants,
  displayTerminalRoleNeedsDeclaredAxisRepair,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';

const MIN_DISPLAY_ENDPOINT_STUB = 48;
const MAX_TERMINAL_STUB_NUMERIC_DRIFT = 2;

const buildShortTerminalStaircaseTranslationCandidate = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint[] | null => {
  if (path.length < 4) return null;
  const oriented = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const terminal = oriented[0];
  const adjacent = oriented[1];
  if (!terminal || !adjacent) return null;
  const horizontalTerminal = side === 'left' || side === 'right';
  const expectedAxis = horizontalTerminal ? 'h' : 'v';
  if (displayAxisOf(terminal, adjacent) !== expectedAxis) return null;
  const outwardDirection = side === 'right' || side === 'bottom' ? 1 : -1;
  const axisCoordinate = (point: DisplayPoint): number => (
    horizontalTerminal ? point.x : point.y
  );
  const outwardSpan = (axisCoordinate(adjacent) - axisCoordinate(terminal)) * outwardDirection;
  const shortfall = MIN_DISPLAY_ENDPOINT_STUB - outwardSpan;
  if (outwardSpan <= 0 || shortfall <= 0 || shortfall > MAX_TERMINAL_STUB_NUMERIC_DRIFT) return null;

  let shiftedEndIndex = 1;
  while (shiftedEndIndex < oriented.length - 1) {
    const current = oriented[shiftedEndIndex];
    const next = oriented[shiftedEndIndex + 1];
    if (displayAxisOf(current, next) !== expectedAxis) {
      shiftedEndIndex += 1;
      continue;
    }
    const shiftedCurrentCoordinate = axisCoordinate(current) + outwardDirection * shortfall;
    const adjustedBoundaryLength = Math.abs(axisCoordinate(next) - shiftedCurrentCoordinate);
    if (adjustedBoundaryLength >= RESIDUAL_PARALLEL_LANE_GAP) break;
    shiftedEndIndex += 1;
  }
  if (shiftedEndIndex >= oriented.length - 1) return null;

  const translated = oriented.map((point, index) => {
    if (index < 1 || index > shiftedEndIndex) return point;
    return horizontalTerminal
      ? { x: point.x + outwardDirection * shortfall, y: point.y }
      : { x: point.x, y: point.y + outwardDirection * shortfall };
  });
  const candidate = compactOrthogonalPath(role === 'source' ? translated : [...translated].reverse());
  return candidate.length >= 2 ? candidate : null;
};

const adaptiveDetachedTerminalStub = (
  edges: Edge[],
  nodes: Node[],
  edgeIndex: number,
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
): number => {
  const oriented = role === 'target' ? path : [...path].reverse();
  const splice = oriented[Math.max(1, oriented.length - 5)];
  if (!splice) return MIN_DISPLAY_ENDPOINT_STUB;
  const endpoint = side === 'left'
    ? { x: rect.x, y: rect.y + rect.height / 2 }
    : side === 'right'
      ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
      : side === 'top'
        ? { x: rect.x + rect.width / 2, y: rect.y }
        : { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  const segments = extractDisplaySegments(edges).filter(segment => segment.edgeIndex !== edgeIndex);
  const obstacles = buildDisplayRoutingObstacles(nodes);
  const horizontalTerminal = side === 'left' || side === 'right';
  const boundary = side === 'left'
    ? rect.x
    : side === 'right'
      ? rect.x + rect.width
      : side === 'top'
        ? rect.y
        : rect.y + rect.height;
  let lane = side === 'left' || side === 'top'
    ? boundary - MIN_DISPLAY_ENDPOINT_STUB
    : boundary + MIN_DISPLAY_ENDPOINT_STUB;
  const spanStart = horizontalTerminal ? splice.y : splice.x;
  const spanEnd = horizontalTerminal ? endpoint.y : endpoint.x;
  const spanMin = Math.min(spanStart, spanEnd);
  const spanMax = Math.max(spanStart, spanEnd);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let nextLane = lane;
    for (const segment of segments) {
      if (horizontalTerminal && segment.axis === 'h') {
        if (segment.a.y <= spanMin + 1 || segment.a.y >= spanMax - 1) continue;
        const min = Math.min(segment.a.x, segment.b.x);
        const max = Math.max(segment.a.x, segment.b.x);
        if (lane <= min + 1 || lane >= max - 1) continue;
        nextLane = side === 'right'
          ? Math.max(nextLane, max + MIN_DISPLAY_ENDPOINT_STUB)
          : Math.min(nextLane, min - MIN_DISPLAY_ENDPOINT_STUB);
      }
      if (!horizontalTerminal && segment.axis === 'v') {
        if (segment.a.x <= spanMin + 1 || segment.a.x >= spanMax - 1) continue;
        const min = Math.min(segment.a.y, segment.b.y);
        const max = Math.max(segment.a.y, segment.b.y);
        if (lane <= min + 1 || lane >= max - 1) continue;
        nextLane = side === 'bottom'
          ? Math.max(nextLane, max + MIN_DISPLAY_ENDPOINT_STUB)
          : Math.min(nextLane, min - MIN_DISPLAY_ENDPOINT_STUB);
      }
    }
    for (const [nodeId, obstacle] of obstacles) {
      const edge = edges[edgeIndex];
      if (!edge || nodeId === edge.source || nodeId === edge.target) continue;
      if (horizontalTerminal) {
        if (obstacle.y + obstacle.height <= spanMin || obstacle.y >= spanMax) continue;
        const min = obstacle.x - OBSTACLE_REPAIR_NODE_PADDING;
        const max = obstacle.x + obstacle.width + OBSTACLE_REPAIR_NODE_PADDING;
        if (lane <= min || lane >= max) continue;
        nextLane = side === 'right'
          ? Math.max(nextLane, max + MIN_DISPLAY_ENDPOINT_STUB)
          : Math.min(nextLane, min - MIN_DISPLAY_ENDPOINT_STUB);
      } else {
        if (obstacle.x + obstacle.width <= spanMin || obstacle.x >= spanMax) continue;
        const min = obstacle.y - OBSTACLE_REPAIR_NODE_PADDING;
        const max = obstacle.y + obstacle.height + OBSTACLE_REPAIR_NODE_PADDING;
        if (lane <= min || lane >= max) continue;
        nextLane = side === 'bottom'
          ? Math.max(nextLane, max + MIN_DISPLAY_ENDPOINT_STUB)
          : Math.min(nextLane, min - MIN_DISPLAY_ENDPOINT_STUB);
      }
    }
    if (Math.abs(nextLane - lane) <= 0.5) break;
    lane = nextLane;
  }
  return Math.max(MIN_DISPLAY_ENDPOINT_STUB, Math.abs(lane - boundary));
};

const detachedTerminalConnectorLanes = (
  edge: Edge,
  nodes: Node[],
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
  stubLength: number,
): number[] => {
  const oriented = role === 'target' ? path : [...path].reverse();
  const splice = oriented[Math.max(1, oriented.length - 5)];
  if (!splice) return [];
  const horizontalTerminal = side === 'left' || side === 'right';
  const endpointCoordinate = horizontalTerminal
    ? rect.y + rect.height / 2
    : rect.x + rect.width / 2;
  const outerCoordinate = side === 'left'
    ? rect.x - stubLength
    : side === 'right'
      ? rect.x + rect.width + stubLength
      : side === 'top'
        ? rect.y - stubLength
        : rect.y + rect.height + stubLength;
  const directCoordinate = horizontalTerminal ? splice.y : splice.x;
  const mainStart = horizontalTerminal ? splice.x : splice.y;
  const mainMin = Math.min(mainStart, outerCoordinate);
  const mainMax = Math.max(mainStart, outerCoordinate);
  let before: number | null = null;
  let after: number | null = null;

  for (const [nodeId, obstacle] of buildDisplayRoutingObstacles(nodes)) {
    if (nodeId === edge.source || nodeId === edge.target) continue;
    if (horizontalTerminal) {
      if (
        directCoordinate <= obstacle.y - OBSTACLE_REPAIR_NODE_PADDING
        || directCoordinate >= obstacle.y + obstacle.height + OBSTACLE_REPAIR_NODE_PADDING
        || obstacle.x + obstacle.width <= mainMin
        || obstacle.x >= mainMax
      ) continue;
      const upper = obstacle.y - OBSTACLE_REPAIR_NODE_PADDING - MIN_DISPLAY_ENDPOINT_STUB;
      const lower = obstacle.y + obstacle.height + OBSTACLE_REPAIR_NODE_PADDING + MIN_DISPLAY_ENDPOINT_STUB;
      before = before === null ? upper : Math.min(before, upper);
      after = after === null ? lower : Math.max(after, lower);
    } else {
      if (
        directCoordinate <= obstacle.x - OBSTACLE_REPAIR_NODE_PADDING
        || directCoordinate >= obstacle.x + obstacle.width + OBSTACLE_REPAIR_NODE_PADDING
        || obstacle.y + obstacle.height <= mainMin
        || obstacle.y >= mainMax
      ) continue;
      const left = obstacle.x - OBSTACLE_REPAIR_NODE_PADDING - MIN_DISPLAY_ENDPOINT_STUB;
      const right = obstacle.x + obstacle.width + OBSTACLE_REPAIR_NODE_PADDING + MIN_DISPLAY_ENDPOINT_STUB;
      before = before === null ? left : Math.min(before, left);
      after = after === null ? right : Math.max(after, right);
    }
  }
  const towardEndpoint = Math.sign(endpointCoordinate - directCoordinate);
  return [before, after]
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((first, second) => {
      const firstToward = Math.sign(first - directCoordinate) === towardEndpoint ? 0 : 1;
      const secondToward = Math.sign(second - directCoordinate) === towardEndpoint ? 0 : 1;
      return firstToward - secondToward
        || Math.abs(first - directCoordinate) - Math.abs(second - directCoordinate);
    });
};

const buildDeclaredTerminalInsetNudgeCandidates = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint[][] => {
  if (path.length < 2) return [];
  const oriented = role === 'source' ? path : [...path].reverse();
  const terminal = oriented[0];
  const horizontalSide = side === 'left' || side === 'right';
  const tangentMinimum = horizontalSide ? rect.y : rect.x;
  const tangentMaximum = tangentMinimum + (horizontalSide ? rect.height : rect.width);
  const terminalTangent = horizontalSide ? terminal.y : terminal.x;
  const tangentValues = sortedUniqueNumbers([
    terminalTangent - 48,
    terminalTangent - 24,
    terminalTangent + 24,
    terminalTangent + 48,
    tangentMinimum + 24,
    tangentMinimum + 48,
    tangentMaximum - 48,
    tangentMaximum - 24,
  ], terminalTangent).filter(value => value >= tangentMinimum + 16 && value <= tangentMaximum - 16);
  if (tangentValues.length === 0) return [];

  const boundary = side === 'left'
    ? rect.x
    : side === 'right'
      ? rect.x + rect.width
      : side === 'top'
        ? rect.y
        : rect.y + rect.height;
  const outwardDirection = side === 'right' || side === 'bottom' ? 1 : -1;
  const axisCoordinate = (point: DisplayPoint): number => (horizontalSide ? point.x : point.y);
  let spliceIndex = oriented.slice(1, 5).findIndex(point => (
    (axisCoordinate(point) - boundary) * outwardDirection >= MIN_DISPLAY_ENDPOINT_STUB - 1
  ));
  spliceIndex = spliceIndex < 0 ? 1 : spliceIndex + 1;
  const splice = oriented[spliceIndex];
  if (!splice) return [];
  const spliceAxisCoordinate = axisCoordinate(splice);
  const outwardCoordinate = (spliceAxisCoordinate - boundary) * outwardDirection
    >= MIN_DISPLAY_ENDPOINT_STUB - 1
    ? spliceAxisCoordinate
    : boundary + outwardDirection * MIN_DISPLAY_ENDPOINT_STUB;

  return tangentValues.map((tangent): DisplayPoint[] => {
    const endpoint = horizontalSide
      ? { x: boundary, y: tangent }
      : { x: tangent, y: boundary };
    const stub = horizontalSide
      ? { x: outwardCoordinate, y: tangent }
      : { x: tangent, y: outwardCoordinate };
    const bridge = horizontalSide
      ? { x: outwardCoordinate, y: splice.y }
      : { x: splice.x, y: outwardCoordinate };
    const candidate = compactOrthogonalPath([
      endpoint,
      stub,
      bridge,
      splice,
      ...oriented.slice(spliceIndex + 1),
    ]);
    return role === 'source' ? candidate : [...candidate].reverse();
  });
};

const inferTerminalGeometrySide = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
): 'top' | 'bottom' | 'left' | 'right' | null => {
  if (path.length < 2) return null;
  const oriented = role === 'source' ? path : [...path].reverse();
  const [terminal, adjacent, next] = oriented;
  if (!terminal || !adjacent) return null;
  const candidates = (['top', 'bottom', 'left', 'right'] as const)
    .map((side) => {
      const horizontalSide = side === 'left' || side === 'right';
      const onBoundary = side === 'top'
        ? Math.abs(terminal.y - rect.y) <= 3
          && terminal.x >= rect.x - 3 && terminal.x <= rect.x + rect.width + 3
        : side === 'bottom'
          ? Math.abs(terminal.y - (rect.y + rect.height)) <= 3
            && terminal.x >= rect.x - 3 && terminal.x <= rect.x + rect.width + 3
          : side === 'left'
            ? Math.abs(terminal.x - rect.x) <= 3
              && terminal.y >= rect.y - 3 && terminal.y <= rect.y + rect.height + 3
            : Math.abs(terminal.x - (rect.x + rect.width)) <= 3
              && terminal.y >= rect.y - 3 && terminal.y <= rect.y + rect.height + 3;
      if (!onBoundary) return null;
      const expectedAxis = horizontalSide ? 'h' : 'v';
      const firstAxis = displayAxisOf(terminal, adjacent);
      const outward = (point: DisplayPoint): boolean => (
        side === 'left'
          ? point.x < terminal.x - 1
          : side === 'right'
            ? point.x > terminal.x + 1
            : side === 'top'
              ? point.y < terminal.y - 1
              : point.y > terminal.y + 1
      );
      if (firstAxis === expectedAxis && outward(adjacent)) return { side, score: 0 };
      if (!next || !firstAxis || firstAxis === expectedAxis) return null;
      const adjacentStaysOnBoundary = side === 'top'
        ? Math.abs(adjacent.y - rect.y) <= 3
        : side === 'bottom'
          ? Math.abs(adjacent.y - (rect.y + rect.height)) <= 3
          : side === 'left'
            ? Math.abs(adjacent.x - rect.x) <= 3
            : Math.abs(adjacent.x - (rect.x + rect.width)) <= 3;
      if (!adjacentStaysOnBoundary || displayAxisOf(adjacent, next) !== expectedAxis) return null;
      return outward(next) ? { side, score: 1 } : null;
    })
    .filter((candidate): candidate is {
      side: 'top' | 'bottom' | 'left' | 'right';
      score: number;
    } => Boolean(candidate))
    .sort((first, second) => first.score - second.score);
  return candidates[0]?.side ?? null;
};

const detachedTerminalQualityDoesNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

const buildSingleEdgeZipperCandidates = <T extends Edge[]>(
  edges: T,
  moverEdgeIndex: number,
  maxCandidates = 4,
): T[] => {
  const paths = edges.map(edge => getDisplayComputedPath(edge));
  const crossings = findStrictCrossings(paths, edges)
    .filter(crossing => (
      crossing.a.edgeIndex === moverEdgeIndex || crossing.b.edgeIndex === moverEdgeIndex
    ));
  const candidates: T[] = [];

  for (const crossing of crossings) {
    const segment = crossing.a.edgeIndex === moverEdgeIndex ? crossing.a : crossing.b;
    const other = crossing.a.edgeIndex === moverEdgeIndex ? crossing.b : crossing.a;
    const path = paths[moverEdgeIndex];
    if (
      !path
      || segment.axis === other.axis
      || segment.segIdx <= 0
      || segment.segIdx >= path.length - 2
    ) continue;
    const blockers = paths.flatMap((blockerPath, edgeIndex) => {
      if (edgeIndex === moverEdgeIndex || blockerPath.length < 2) return [];
      return blockerPath.slice(0, -1).flatMap((point, segmentIndex) => {
        const next = blockerPath[segmentIndex + 1];
        const axis = displayAxisOf(point, next);
        if (!axis || axis === segment.axis) return [];
        return [{
          path: blockerPath,
          segment: { segmentIndex, axis, a: point, b: next },
        }];
      });
    });
    for (const candidatePath of buildStrictCrossingZipperCandidates(
      path,
      {
        segmentIndex: segment.segIdx,
        axis: segment.axis,
        a: segment.a,
        b: segment.b,
      },
      blockers,
    )) {
      candidates.push(edges.map((edge, edgeIndex) => (
        edgeIndex === moverEdgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
      )) as T);
      if (candidates.length >= maxCandidates) return candidates;
    }
  }
  return candidates;
};

export const repairDetachedTerminalsWithBoundedPortRoles = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 12,
): T => {
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  if (edges.every(edge => terminalValidation.validateEdge(edge).attached)) return edges;
  let current = edges;
  let qualityEvaluations = 0;
  const skippedEdgeIds = new Set<string>();
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));

  for (let pass = 0; pass < edges.length && qualityEvaluations < maxQualityEvaluations; pass += 1) {
    const detachedEdgeIndex = current.findIndex(edge => (
      !skippedEdgeIds.has(edge.id)
      && !terminalValidation.validateEdge(edge).attached
    ));
    if (detachedEdgeIndex < 0) break;
    const edge = current[detachedEdgeIndex];
    const path = getDisplayComputedPath(edge);
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (path.length < 2 || !sourceRect || !targetRect) {
      skippedEdgeIds.add(edge.id);
      continue;
    }
    const anchoredEdge = anchorComputedDisplayEdgeEndpoints([edge], nodes)[0] ?? edge;
    const anchoredPath = getDisplayComputedPath(anchoredEdge);
    const sourceDetached = !displayPointsCoincide(path[0], anchoredPath[0]);
    const targetDetached = !displayPointsCoincide(path[path.length - 1], anchoredPath[anchoredPath.length - 1]);
    const anchoredCandidates: T[] = [];
    const attachedCandidates: T[] = [];
    const appendCandidate = (candidate: T) => {
      const validation = terminalValidation.validateEdge(candidate[detachedEdgeIndex]);
      if (!validation.attached) return;
      (validation.anchored ? anchoredCandidates : attachedCandidates).push(candidate);
    };
    const appendEdgeCandidate = (candidateEdge: Edge) => {
      appendCandidate(current.map((item, index) => (
        index === detachedEdgeIndex ? candidateEdge : item
      )) as T);
    };
    appendEdgeCandidate(anchoredEdge);

    const sourceCenter = {
      x: sourceRect.x + sourceRect.width / 2,
      y: sourceRect.y + sourceRect.height / 2,
    };
    const targetCenter = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height / 2,
    };
    const deltaX = targetCenter.x - sourceCenter.x;
    const deltaY = targetCenter.y - sourceCenter.y;
    const facingSourceSide: 'top' | 'bottom' | 'left' | 'right' = Math.abs(deltaX) >= Math.abs(deltaY)
      ? (deltaX >= 0 ? 'right' : 'left')
      : (deltaY >= 0 ? 'bottom' : 'top');
    const facingTargetSide: 'top' | 'bottom' | 'left' | 'right' = facingSourceSide === 'right'
      ? 'left'
      : facingSourceSide === 'left'
        ? 'right'
        : facingSourceSide === 'bottom'
          ? 'top'
          : 'bottom';
    if (
      displayTerminalSideCanSwitch(edge, 'source', facingSourceSide)
      && displayTerminalSideCanSwitch(edge, 'target', facingTargetSide)
    ) {
      for (const candidatePath of buildFacingPortPathCandidates(
        sourceRect,
        targetRect,
        facingSourceSide,
        facingTargetSide,
        MIN_DISPLAY_ENDPOINT_STUB,
      )) {
        appendEdgeCandidate(withDisplayPortBridge(
          edge,
          candidatePath,
          facingSourceSide,
          facingTargetSide,
        ));
      }
    }

    for (const role of ['source', 'target'] as const) {
      if ((role === 'source' && !sourceDetached) || (role === 'target' && !targetDetached)) continue;
      const currentSide = normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle);
      const otherSide = fullDisplayPortSide(normalizeHandle(role === 'source' ? edge.targetHandle : edge.sourceHandle));
      if (!currentSide || !otherSide) continue;
      const opposite = oppositeDisplayPortSide(currentSide);
      const sideOrder = [
        opposite,
        ...(currentSide === 'l' || currentSide === 'r'
          ? ['top', 'bottom'] as const
          : ['left', 'right'] as const),
      ];
      const rect = role === 'source' ? sourceRect : targetRect;
      for (const side of sideOrder) {
        if (!displayTerminalSideCanSwitch(edge, role, side)) continue;
        const adaptiveStub = adaptiveDetachedTerminalStub(
          current,
          nodes,
          detachedEdgeIndex,
          path,
          role,
          rect,
          side,
        );
        const stubLengths = adaptiveStub > MIN_DISPLAY_ENDPOINT_STUB + 0.5
          ? [adaptiveStub, MIN_DISPLAY_ENDPOINT_STUB]
          : [MIN_DISPLAY_ENDPOINT_STUB];
        for (const stubLength of stubLengths) {
          const connectorLanes = detachedTerminalConnectorLanes(
            edge,
            nodes,
            path,
            role,
            rect,
            side,
            stubLength,
          );
          for (const candidatePath of buildSharedNodeTerminalSideCandidates(
            path,
            role,
            rect,
            side,
            stubLength,
            2,
            connectorLanes,
          )) {
            const candidateEdge = role === 'source'
              ? withDisplayPortBridge(edge, candidatePath, side, otherSide)
              : withDisplayPortBridge(edge, candidatePath, otherSide, side);
            appendEdgeCandidate(candidateEdge);
          }
        }
      }
    }

    const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
    const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
    if (declaredSourceSide && declaredTargetSide) {
      for (const directPath of buildFacingPortPathCandidates(
        sourceRect,
        targetRect,
        declaredSourceSide,
        declaredTargetSide,
        MIN_DISPLAY_ENDPOINT_STUB,
      )) {
        const directEdge = withDisplayPortBridge(
          edge,
          directPath,
          declaredSourceSide,
          declaredTargetSide,
        );
        const directCandidate = current.map((item, index) => (
          index === detachedEdgeIndex ? directEdge : item
        )) as T;
        for (const zipperCandidate of buildSingleEdgeZipperCandidates(
          directCandidate,
          detachedEdgeIndex,
          2,
        )) {
          appendCandidate(zipperCandidate);
        }
        appendEdgeCandidate(directEdge);
      }
    }

    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = obstacleContext.evaluate(current);
    let accepted: T | null = null;
    for (const candidate of [...anchoredCandidates, ...attachedCandidates]) {
      if (qualityEvaluations >= maxQualityEvaluations) return current;
      qualityEvaluations += 1;
      const candidateQuality = qualityContext.evaluateChanged(candidate, [detachedEdgeIndex]);
      if (!detachedTerminalQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
      if (obstacleContext.evaluateKnownChanges(candidate, [detachedEdgeIndex]) > baselineObstacleHits) continue;
      accepted = candidate;
      break;
    }
    if (!accepted) {
      skippedEdgeIds.add(edge.id);
      continue;
    }
    current = accepted;
  }
  return current;
};

export const repairAxisMismatchedTerminalsWithBoundedPortRoles = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 16,
): T => {
  let current = edges;
  let qualityEvaluations = 0;
  const skippedEdgeIds = new Set<string>();
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const routingObstacles = buildDisplayRoutingObstacles(nodes);
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  for (let pass = 0; pass < edges.length && qualityEvaluations < maxQualityEvaluations; pass += 1) {
    const edgeIndex = current
      .map((edge, index) => {
        if (skippedEdgeIds.has(edge.id)) return null;
        const path = getDisplayComputedPath(edge);
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
        const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
        const sourceAxisMismatch = Boolean(
          sourceRect
          && displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'source', sourceRect)
        );
        const targetAxisMismatch = Boolean(
          targetRect
          && displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'target', targetRect)
        );
        const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
        const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
        const numericalStaircaseTranslations = Number(Boolean(
          declaredSourceSide
          && buildShortTerminalStaircaseTranslationCandidate(
            path,
            'source',
            declaredSourceSide,
          )
        )) + Number(Boolean(
          declaredTargetSide
          && buildShortTerminalStaircaseTranslationCandidate(
            path,
            'target',
            declaredTargetSide,
          )
        ));
        const needsRepair = !terminalValidation.validateEdge(edge).anchored
          || !sourceRect
          || !targetRect
          || sourceAxisMismatch
          || targetAxisMismatch;
        if (!needsRepair) return null;
        return {
          index,
          nodeAnchorMismatches: Number(!terminalValidation.validateEdge(edge).anchored),
          numericalStaircaseTranslations,
          declaredAxisMismatches: Number(sourceAxisMismatch) + Number(targetAxisMismatch),
          obstacleHits: path.length >= 2
            ? countRoutingObstacleHits(path, edge, routingObstacles)
            : 0,
        };
      })
      .filter((entry): entry is {
        index: number;
        nodeAnchorMismatches: number;
        numericalStaircaseTranslations: number;
        declaredAxisMismatches: number;
        obstacleHits: number;
      } => Boolean(entry))
      .sort((first, second) => (
        second.nodeAnchorMismatches - first.nodeAnchorMismatches
        || second.numericalStaircaseTranslations - first.numericalStaircaseTranslations
        || second.declaredAxisMismatches - first.declaredAxisMismatches
        || second.obstacleHits - first.obstacleHits
        || first.index - second.index
      ))[0]?.index
      ?? -1;
    if (edgeIndex < 0) break;
    const edge = current[edgeIndex];
    const path = getDisplayComputedPath(edge);
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (path.length < 2 || !sourceRect || !targetRect) {
      skippedEdgeIds.add(edge.id);
      continue;
    }

    const candidateEdges: Edge[] = [];
    const handleOnlyCandidateEdges: Edge[] = [];
    const insetNudgeCandidateEdges: Edge[] = [];
    const appendCandidate = (candidateEdge: Edge) => {
      if (!terminalValidation.validateEdge(candidateEdge).anchored) return;
      candidateEdges.push(candidateEdge);
    };
    const appendPriorityCandidate = (candidateEdge: Edge) => {
      if (!terminalValidation.validateEdge(candidateEdge).anchored) return;
      handleOnlyCandidateEdges.push(candidateEdge);
    };
    const appendInsetNudgeCandidate = (candidateEdge: Edge) => {
      if (!terminalValidation.validateEdge(candidateEdge).anchored) return;
      insetNudgeCandidateEdges.push(candidateEdge);
    };
    appendCandidate(anchorComputedDisplayEdgeEndpoints([edge], nodes)[0] ?? edge);
    const geometrySourceSide = inferTerminalGeometrySide(path, 'source', sourceRect);
    const geometryTargetSide = inferTerminalGeometrySide(path, 'target', targetRect);
    if (
      geometrySourceSide
      && geometryTargetSide
      && displayTerminalSideCanSwitch(edge, 'source', geometrySourceSide)
      && displayTerminalSideCanSwitch(edge, 'target', geometryTargetSide)
    ) {
      appendPriorityCandidate(withDisplayPortBridge(
        edge,
        path,
        geometrySourceSide,
        geometryTargetSide,
      ));
    }

    const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
    const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
    if (declaredSourceSide && declaredTargetSide) {
      const sourceStaircaseCandidate = buildShortTerminalStaircaseTranslationCandidate(
        path,
        'source',
        declaredSourceSide,
      );
      if (sourceStaircaseCandidate) {
        appendPriorityCandidate(withDisplayPortBridge(
          edge,
          sourceStaircaseCandidate,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
      const targetStaircaseCandidate = buildShortTerminalStaircaseTranslationCandidate(
        path,
        'target',
        declaredTargetSide,
      );
      if (targetStaircaseCandidate) {
        appendPriorityCandidate(withDisplayPortBridge(
          edge,
          targetStaircaseCandidate,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
      if (countRoutingObstacleHits(path, edge, routingObstacles) === 0) {
        for (const candidatePath of buildDeclaredTerminalAxisStubCandidates(
          path,
          'source',
          sourceRect,
          declaredSourceSide,
        )) {
          appendPriorityCandidate(withDisplayPortBridge(
            edge,
            candidatePath,
            declaredSourceSide,
            declaredTargetSide,
          ));
        }
        for (const candidatePath of buildDeclaredTerminalAxisStubCandidates(
          path,
          'target',
          targetRect,
          declaredTargetSide,
        )) {
          appendPriorityCandidate(withDisplayPortBridge(
            edge,
            candidatePath,
            declaredSourceSide,
            declaredTargetSide,
          ));
        }
      }
      for (const candidatePath of buildFacingPortPathCandidates(
        sourceRect,
        targetRect,
        declaredSourceSide,
        declaredTargetSide,
        MIN_DISPLAY_ENDPOINT_STUB,
      )) {
        appendCandidate(withDisplayPortBridge(
          edge,
          candidatePath,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
    }

    const roles = (['source', 'target'] as const).filter(role => (
      displayTerminalRoleNeedsDeclaredAxisRepair(
        edge,
        path,
        role,
        role === 'source' ? sourceRect : targetRect,
      )
    ));
    for (const role of roles.length > 0 ? roles : (['source', 'target'] as const)) {
      const rect = role === 'source' ? sourceRect : targetRect;
      const neighbor = role === 'source' ? path[1] : path[path.length - 2];
      const otherSide = fullDisplayPortSide(normalizeHandle(
        role === 'source' ? edge.targetHandle : edge.sourceHandle,
      ));
      if (!neighbor || !otherSide) continue;
      const sides = (['top', 'bottom', 'left', 'right'] as const)
        .filter(side => displayTerminalSideCanSwitch(edge, role, side))
        .sort((first, second) => {
          const endpoint = (side: typeof first): DisplayPoint => (
            side === 'left'
              ? { x: rect.x, y: rect.y + rect.height / 2 }
              : side === 'right'
                ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
                : side === 'top'
                  ? { x: rect.x + rect.width / 2, y: rect.y }
                  : { x: rect.x + rect.width / 2, y: rect.y + rect.height }
          );
          const firstEndpoint = endpoint(first);
          const secondEndpoint = endpoint(second);
          return Math.abs(firstEndpoint.x - neighbor.x) + Math.abs(firstEndpoint.y - neighbor.y)
            - Math.abs(secondEndpoint.x - neighbor.x) - Math.abs(secondEndpoint.y - neighbor.y);
        });
      for (const side of sides) {
        const endpoint = side === 'left'
          ? { x: rect.x, y: rect.y + rect.height / 2 }
          : side === 'right'
            ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
            : side === 'top'
              ? { x: rect.x + rect.width / 2, y: rect.y }
              : { x: rect.x + rect.width / 2, y: rect.y + rect.height };
        const directBoundaryPath = role === 'source'
          ? [{ ...endpoint }, ...path.slice(1)]
          : [...path.slice(0, -1), { ...endpoint }];
        appendCandidate(role === 'source'
          ? withDisplayPortBridge(edge, directBoundaryPath, side, otherSide)
          : withDisplayPortBridge(edge, directBoundaryPath, otherSide, side));
        const currentGeometrySide = role === 'source' ? geometrySourceSide : geometryTargetSide;
        if (!currentGeometrySide) {
          for (const candidatePath of buildNearTerminalSideCandidates(
            path,
            role,
            rect,
            side,
            MIN_DISPLAY_ENDPOINT_STUB,
            2,
          )) {
            appendCandidate(role === 'source'
              ? withDisplayPortBridge(edge, candidatePath, side, otherSide)
              : withDisplayPortBridge(edge, candidatePath, otherSide, side));
          }
        }
        const connectorLanes = detachedTerminalConnectorLanes(
          edge,
          nodes,
          path,
          role,
          rect,
          side,
          MIN_DISPLAY_ENDPOINT_STUB,
        );
        for (const candidatePath of buildSharedNodeTerminalSideCandidates(
          path,
          role,
          rect,
          side,
          MIN_DISPLAY_ENDPOINT_STUB,
          2,
          connectorLanes,
        )) {
          appendCandidate(role === 'source'
            ? withDisplayPortBridge(edge, candidatePath, side, otherSide)
            : withDisplayPortBridge(edge, candidatePath, otherSide, side));
        }
      }
    }

    if (declaredSourceSide && declaredTargetSide) {
      for (const candidatePath of buildDeclaredTerminalInsetNudgeCandidates(
        path,
        'source',
        sourceRect,
        declaredSourceSide,
      )) {
        appendInsetNudgeCandidate(withDisplayPortBridge(
          edge,
          candidatePath,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
      for (const candidatePath of buildDeclaredTerminalInsetNudgeCandidates(
        path,
        'target',
        targetRect,
        declaredTargetSide,
      )) {
        appendInsetNudgeCandidate(withDisplayPortBridge(
          edge,
          candidatePath,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
    }

    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = obstacleContext.evaluate(current);
    let accepted: T | null = null;
    let acceptedObstacleHits = Number.POSITIVE_INFINITY;
    const rankCandidateEdges = (edgesToRank: Edge[]) => edgesToRank
      .map((candidateEdge, order) => ({
        candidateEdge,
        order,
        obstacleHits: countRoutingObstacleHits(
          getDisplayComputedPath(candidateEdge),
          candidateEdge,
          routingObstacles,
        ),
      }))
      .sort((first, second) => first.obstacleHits - second.obstacleHits || first.order - second.order);
    const rankedCandidateEdges = baselineObstacleHits === 0
      ? [
        ...rankCandidateEdges(handleOnlyCandidateEdges),
        ...rankCandidateEdges(insetNudgeCandidateEdges),
        ...rankCandidateEdges(candidateEdges),
      ]
      : [
        ...rankCandidateEdges(handleOnlyCandidateEdges),
        ...rankCandidateEdges(candidateEdges),
        ...rankCandidateEdges(insetNudgeCandidateEdges),
      ];
    for (const { candidateEdge } of rankedCandidateEdges) {
      if (qualityEvaluations >= maxQualityEvaluations) break;
      qualityEvaluations += 1;
      const candidate = current.map((item, index) => (
        index === edgeIndex ? candidateEdge : item
      )) as T;
      const candidateQuality = qualityContext.evaluateChanged(candidate, [edgeIndex]);
      if (!detachedTerminalQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
      const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidate, [edgeIndex]);
      if (candidateObstacleHits > baselineObstacleHits) continue;
      if (accepted && candidateObstacleHits >= acceptedObstacleHits) continue;
      accepted = candidate;
      acceptedObstacleHits = candidateObstacleHits;
      if (candidateObstacleHits === 0) break;
    }
    if (!accepted) {
      skippedEdgeIds.add(edge.id);
      continue;
    }
    current = accepted;
  }
  return current;
};

export const repairBoundedReverseParallelOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 8,
): T => repairBoundedReverseParallelOverlapsWithCandidates(
  edges,
  nodes,
  maxQualityEvaluations,
  buildOppositeRoleSharedNodeCandidates,
);
