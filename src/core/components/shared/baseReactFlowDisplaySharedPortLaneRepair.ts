import type { Edge, Node } from '@xyflow/react';

import { edgeTerminalPositionIsFixed } from '../../routing/utils/edgeTerminalPolicy';
import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';
import { createDisplayObstacleEvaluationContext } from './baseReactFlowDisplayEvaluation';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalAxisRepair';

type PortSide = 'top' | 'bottom' | 'left' | 'right';
type TerminalRole = 'source' | 'target';

const MIN_ENDPOINT_STUB = 48;
const MIN_INTERIOR_LANE = 24;
const MAX_NUMERIC_LANE_DRIFT = 2;
const NEAR_PARALLEL_TOLERANCE = 4;

type EdgeCandidate = {
  edgeIndex: number;
  edge: Edge;
};

export const buildBoundedSharedPortLaneSchedule = (
  tangentCandidates: readonly number[],
  bridgeCandidates: readonly number[],
  limit = 5,
): Array<{ tangent: number; bridge: number }> => {
  const scheduled: Array<{ tangent: number; bridge: number }> = [];
  if (limit <= 0) return scheduled;
  for (let bridgeIndex = 0; bridgeIndex < bridgeCandidates.length && scheduled.length < limit; bridgeIndex += 1) {
    for (const tangent of tangentCandidates) {
      scheduled.push({ tangent, bridge: bridgeCandidates[bridgeIndex] });
      if (scheduled.length >= limit) break;
    }
  }
  return scheduled;
};

export const interleaveBoundedRepairCandidates = <T>(
  preferred: readonly T[],
  secondary: readonly T[],
  limit: number,
): T[] => {
  const scheduled: T[] = [];
  if (limit <= 0) return scheduled;
  const length = Math.max(preferred.length, secondary.length);
  for (let index = 0; index < length && scheduled.length < limit; index += 1) {
    if (index < preferred.length) scheduled.push(preferred[index]);
    if (scheduled.length >= limit) break;
    if (index < secondary.length) scheduled.push(secondary[index]);
  }
  return scheduled;
};

const sideAxis = (side: PortSide): 'h' | 'v' => (
  side === 'left' || side === 'right' ? 'h' : 'v'
);

const sideDirection = (side: PortSide): number => (
  side === 'right' || side === 'bottom' ? 1 : -1
);

const axisCoordinate = (point: DisplayPoint, axis: 'h' | 'v'): number => (
  axis === 'h' ? point.x : point.y
);

const tangentCoordinate = (point: DisplayPoint, axis: 'h' | 'v'): number => (
  axis === 'h' ? point.y : point.x
);

const endpointForSide = (rect: DisplayRect, side: PortSide): DisplayPoint => {
  if (side === 'left') return { x: rect.x, y: rect.y + rect.height / 2 };
  if (side === 'right') return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  if (side === 'top') return { x: rect.x + rect.width / 2, y: rect.y };
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
};

const endpointForSideTangent = (
  rect: DisplayRect,
  side: PortSide,
  tangent: number,
): DisplayPoint => (
  side === 'left' || side === 'right'
    ? { x: side === 'left' ? rect.x : rect.x + rect.width, y: tangent }
    : { x: tangent, y: side === 'top' ? rect.y : rect.y + rect.height }
);

const boundaryCoordinate = (rect: DisplayRect, side: PortSide): number => {
  if (side === 'left') return rect.x;
  if (side === 'right') return rect.x + rect.width;
  if (side === 'top') return rect.y;
  return rect.y + rect.height;
};

const pointOnSideBoundary = (
  point: DisplayPoint,
  rect: DisplayRect,
  side: PortSide,
): boolean => {
  const axis = sideAxis(side);
  const tangent = tangentCoordinate(point, axis);
  const tangentMin = axis === 'h' ? rect.y : rect.x;
  const tangentMax = tangentMin + (axis === 'h' ? rect.height : rect.width);
  return Math.abs(axisCoordinate(point, axis) - boundaryCoordinate(rect, side)) <= 3
    && tangent >= tangentMin - 3
    && tangent <= tangentMax + 3;
};

const hardQualityDoesNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
  allowTransientStrictCrossing: boolean,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings + (allowTransientStrictCrossing ? 1 : 0)
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

const hardQualityImproves = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.reverseOverlap < baseline.reverseOverlap
  || candidate.unrelatedOverlap < baseline.unrelatedOverlap
  || candidate.unexplainedRelatedOverlap < baseline.unexplainedRelatedOverlap
  || candidate.shortEndpointStubs < baseline.shortEndpointStubs
  || candidate.tinyInteriorDoglegs < baseline.tinyInteriorDoglegs
  || candidate.hairpins < baseline.hairpins
);

const withNormalizedPath = (edge: Edge, path: DisplayPoint[], reason: string): Edge => {
  const candidate = withDisplayComputedPath(edge, path);
  return {
    ...candidate,
    data: {
      ...(candidate.data || {}),
      sharedPortLaneNormalized: reason,
    },
  };
};

const boundarySlideDescriptor = (
  edge: Edge,
  rect: DisplayRect,
): {
  candidatePathForLane: (tangent: number, bridgeCoordinate: number) => DisplayPoint[];
  boundary: number;
  outwardCoordinate: number;
  terminalTangent: number;
  side: PortSide;
  outwardSegment: [DisplayPoint, DisplayPoint];
} | null => {
  const path = getDisplayComputedPath(edge);
  const side = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
  if (!side || path.length < 4) return null;
  const oriented = [...path].reverse();
  const [terminal, adjacent, outward] = oriented;
  const axis = sideAxis(side);
  if (
    !terminal
    || !adjacent
    || !outward
    || !pointOnSideBoundary(terminal, rect, side)
    || !pointOnSideBoundary(adjacent, rect, side)
    || displayAxisOf(terminal, adjacent) === axis
    || displayAxisOf(adjacent, outward) !== axis
    || (axisCoordinate(outward, axis) - axisCoordinate(adjacent, axis)) * sideDirection(side) < MIN_ENDPOINT_STUB
  ) return null;

  const boundary = boundaryCoordinate(rect, side);
  return {
    candidatePathForLane: (tangent, bridgeCoordinate) => {
      const endpoint = endpointForSideTangent(rect, side, tangent);
      const stub = axis === 'h'
        ? { x: bridgeCoordinate, y: endpoint.y }
        : { x: endpoint.x, y: bridgeCoordinate };
      const bridge = axis === 'h'
        ? { x: bridgeCoordinate, y: outward.y }
        : { x: outward.x, y: bridgeCoordinate };
      return [...compactOrthogonalPath([
        endpoint,
        stub,
        bridge,
        outward,
        ...oriented.slice(3),
      ])].reverse();
    },
    boundary,
    outwardCoordinate: axisCoordinate(outward, axis),
    terminalTangent: tangentCoordinate(terminal, axis),
    side,
    outwardSegment: [outward, adjacent],
  };
};

const nearReverseOverlap = (
  first: [DisplayPoint, DisplayPoint],
  second: [DisplayPoint, DisplayPoint],
): number => {
  const axis = displayAxisOf(first[0], first[1]);
  if (!axis || displayAxisOf(second[0], second[1]) !== axis) return 0;
  if (Math.abs(tangentCoordinate(first[0], axis) - tangentCoordinate(second[0], axis)) > NEAR_PARALLEL_TOLERANCE) {
    return 0;
  }
  const firstDirection = Math.sign(axisCoordinate(first[1], axis) - axisCoordinate(first[0], axis));
  const secondDirection = Math.sign(axisCoordinate(second[1], axis) - axisCoordinate(second[0], axis));
  if (firstDirection === 0 || firstDirection !== -secondDirection) return 0;
  const firstMin = Math.min(axisCoordinate(first[0], axis), axisCoordinate(first[1], axis));
  const firstMax = Math.max(axisCoordinate(first[0], axis), axisCoordinate(first[1], axis));
  const secondMin = Math.min(axisCoordinate(second[0], axis), axisCoordinate(second[1], axis));
  const secondMax = Math.max(axisCoordinate(second[0], axis), axisCoordinate(second[1], axis));
  return Math.max(0, Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin));
};

const buildSharedPortBoundarySlideCandidates = (
  edges: Edge[],
  nodes: Node[],
): EdgeCandidate[] => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const candidates: EdgeCandidate[] = [];
  edges.forEach((incoming, edgeIndex) => {
    const targetNode = nodeById.get(incoming.target);
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (!targetRect) return;
    const descriptor = boundarySlideDescriptor(incoming, targetRect);
    if (!descriptor) return;
    const outgoingStubTangents: number[] = [];
    const outgoingContinuationCoordinates: number[] = [];
    let hasOpposingSourceStub = false;
    edges.forEach((outgoing, outgoingIndex) => {
      if (outgoingIndex === edgeIndex || outgoing.source !== incoming.target) return;
      const outgoingSide = fullDisplayPortSide(normalizeHandle(outgoing.sourceHandle));
      const outgoingPath = getDisplayComputedPath(outgoing);
      if (outgoingSide !== descriptor.side || outgoingPath.length < 2) return;
      const outgoingAxis = sideAxis(outgoingSide);
      if (
        displayAxisOf(outgoingPath[0], outgoingPath[1]) !== outgoingAxis
        || (axisCoordinate(outgoingPath[1], outgoingAxis) - axisCoordinate(outgoingPath[0], outgoingAxis))
          * sideDirection(outgoingSide) <= 0
      ) return;
      outgoingStubTangents.push(tangentCoordinate(outgoingPath[0], outgoingAxis));
      outgoingPath.slice(1, 5).forEach(point => {
        outgoingContinuationCoordinates.push(axisCoordinate(point, outgoingAxis));
      });
      if (nearReverseOverlap(
        descriptor.outwardSegment,
        [outgoingPath[0], outgoingPath[1]],
      ) >= MIN_INTERIOR_LANE) hasOpposingSourceStub = true;
    });
    if (!hasOpposingSourceStub) return;
    const axis = sideAxis(descriptor.side);
    const tangentMin = axis === 'h' ? targetRect.y : targetRect.x;
    const tangentMax = tangentMin + (axis === 'h' ? targetRect.height : targetRect.width);
    const positionLocked = edgeTerminalPositionIsFixed(incoming, 'target');
    const interiorTangent = tangentCoordinate(descriptor.outwardSegment[0], axis);
    const exactInteriorTangents = [
      interiorTangent - MIN_INTERIOR_LANE,
      interiorTangent + MIN_INTERIOR_LANE,
    ];
    const freeTangents = [
      ...exactInteriorTangents,
      tangentMin + MIN_INTERIOR_LANE,
      tangentMax - MIN_INTERIOR_LANE,
      ...outgoingStubTangents.flatMap(tangent => [
        tangent - MIN_INTERIOR_LANE,
        tangent + MIN_INTERIOR_LANE,
      ]),
      tangentCoordinate(endpointForSide(targetRect, descriptor.side), axis),
      descriptor.terminalTangent,
    ]
      .filter(tangent => tangent >= tangentMin + 16 && tangent <= tangentMax - 16)
      .filter((tangent, index, values) => values.findIndex(value => Math.abs(value - tangent) <= 0.1) === index)
      .sort((first, second) => {
        const clearance = (tangent: number): number => outgoingStubTangents.length > 0
          ? Math.min(...outgoingStubTangents.map(outgoing => Math.abs(outgoing - tangent)))
          : 0;
        const centerTangent = tangentCoordinate(endpointForSide(targetRect, descriptor.side), axis);
        const clearanceClass = (tangent: number): number => (
          clearance(tangent) >= MIN_INTERIOR_LANE ? 0 : 1
        );
        const interiorClass = (tangent: number): number => (
          exactInteriorTangents.some(candidate => Math.abs(candidate - tangent) <= 0.1) ? 0 : 1
        );
        return interiorClass(first) - interiorClass(second)
          || clearanceClass(first) - clearanceClass(second)
          || Math.abs(first - centerTangent) - Math.abs(second - centerTangent)
          || Math.abs(first - descriptor.terminalTangent) - Math.abs(second - descriptor.terminalTangent)
          || clearance(second) - clearance(first);
      });
    const tangentCandidates = positionLocked ? [descriptor.terminalTangent] : freeTangents.slice(0, 4);
    const direction = sideDirection(descriptor.side);
    const bridgeMin = descriptor.boundary + direction * MIN_ENDPOINT_STUB;
    const bridgeWithinExteriorSpan = (coordinate: number): boolean => {
      const outwardDistance = (coordinate - descriptor.boundary) * direction;
      const continuationDistance = (descriptor.outwardCoordinate - descriptor.boundary) * direction;
      return outwardDistance >= MIN_ENDPOINT_STUB - 0.1
        && outwardDistance <= continuationDistance + 0.1;
    };
    const bridgeSeeds = [
      bridgeMin,
      ...outgoingContinuationCoordinates,
      descriptor.outwardCoordinate,
    ];
    const discoveredBridgeCandidates = bridgeSeeds
      .flatMap(coordinate => [
        coordinate,
        coordinate - direction * MIN_INTERIOR_LANE,
        coordinate + direction * MIN_INTERIOR_LANE,
        coordinate - direction * MIN_ENDPOINT_STUB,
        coordinate + direction * MIN_ENDPOINT_STUB,
      ])
      .filter(bridgeWithinExteriorSpan)
      .filter((coordinate, index, values) => (
        values.findIndex(value => Math.abs(value - coordinate) <= 0.1) === index
      ))
      .sort((first, second) => {
        const occupied = (coordinate: number): number => (
          outgoingContinuationCoordinates.some(outgoing => Math.abs(outgoing - coordinate) <= 0.1) ? 1 : 0
        );
        return occupied(first) - occupied(second)
          || Math.abs(first - bridgeMin) - Math.abs(second - bridgeMin);
      });
    const bridgeCandidates = [
      bridgeMin,
      ...discoveredBridgeCandidates.filter(coordinate => Math.abs(coordinate - bridgeMin) > 0.1),
    ];
    const laneCandidates = buildBoundedSharedPortLaneSchedule(tangentCandidates, bridgeCandidates, 5);
    for (const { tangent, bridge } of laneCandidates) {
      candidates.push({
        edgeIndex,
        edge: withNormalizedPath(
          incoming,
          descriptor.candidatePathForLane(tangent, bridge),
          'opposite-flow-boundary-slide',
        ),
      });
    }
  });
  return candidates;
};

const translateFollowingShortLane = (
  path: DisplayPoint[],
  segmentIndex: number,
): DisplayPoint[] | null => {
  const start = path[segmentIndex];
  const end = path[segmentIndex + 1];
  const axis = start && end ? displayAxisOf(start, end) : null;
  if (!start || !end || !axis) return null;
  const length = Math.abs(axisCoordinate(end, axis) - axisCoordinate(start, axis));
  const shortfall = MIN_INTERIOR_LANE - length;
  if (shortfall <= 0 || shortfall > MAX_NUMERIC_LANE_DRIFT) return null;
  const direction = Math.sign(axisCoordinate(end, axis) - axisCoordinate(start, axis));
  if (direction === 0) return null;

  let shiftedEndIndex = segmentIndex + 1;
  while (shiftedEndIndex < path.length - 1) {
    const current = path[shiftedEndIndex];
    const next = path[shiftedEndIndex + 1];
    if (displayAxisOf(current, next) !== axis) {
      shiftedEndIndex += 1;
      continue;
    }
    const shiftedCoordinate = axisCoordinate(current, axis) + direction * shortfall;
    if (Math.abs(axisCoordinate(next, axis) - shiftedCoordinate) >= MIN_INTERIOR_LANE) break;
    shiftedEndIndex += 1;
  }
  if (shiftedEndIndex >= path.length - 1) return null;

  return compactOrthogonalPath(path.map((point, index) => {
    if (index <= segmentIndex || index > shiftedEndIndex) return { ...point };
    return axis === 'h'
      ? { x: point.x + direction * shortfall, y: point.y }
      : { x: point.x, y: point.y + direction * shortfall };
  }));
};

const buildFloatingLaneGapCandidates = (edges: Edge[]): EdgeCandidate[] => {
  const candidates: EdgeCandidate[] = [];
  edges.forEach((edge, edgeIndex) => {
    const path = getDisplayComputedPath(edge);
    for (let segmentIndex = 1; segmentIndex < path.length - 2; segmentIndex += 1) {
      const candidatePath = translateFollowingShortLane(path, segmentIndex);
      if (candidatePath) {
        candidates.push({
          edgeIndex,
          edge: withNormalizedPath(edge, candidatePath, 'floating-24px-lane'),
        });
        break;
      }
      const reversed = [...path].reverse();
      const reversedIndex = path.length - 2 - segmentIndex;
      const reversedCandidate = translateFollowingShortLane(reversed, reversedIndex);
      if (!reversedCandidate) continue;
      candidates.push({
        edgeIndex,
        edge: withNormalizedPath(edge, [...reversedCandidate].reverse(), 'floating-24px-lane'),
      });
      break;
    }
  });
  return candidates;
};

const terminalMicroStaircaseCandidate = (
  path: DisplayPoint[],
  role: TerminalRole,
  side: PortSide,
): DisplayPoint[] | null => {
  if (path.length < 5) return null;
  const oriented = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, first, second, third, continuation] = oriented;
  const terminalAxis = sideAxis(side);
  const perpendicularAxis = terminalAxis === 'h' ? 'v' : 'h';
  if (
    displayAxisOf(terminal, first) !== terminalAxis
    || displayAxisOf(first, second) !== perpendicularAxis
    || displayAxisOf(second, third) !== terminalAxis
    || displayAxisOf(third, continuation) !== perpendicularAxis
  ) return null;
  const firstDirection = Math.sign(axisCoordinate(first, terminalAxis) - axisCoordinate(terminal, terminalAxis));
  const microDirection = Math.sign(axisCoordinate(third, terminalAxis) - axisCoordinate(second, terminalAxis));
  const firstPerpendicularDirection = Math.sign(
    axisCoordinate(second, perpendicularAxis) - axisCoordinate(first, perpendicularAxis),
  );
  const nextPerpendicularDirection = Math.sign(
    axisCoordinate(continuation, perpendicularAxis) - axisCoordinate(third, perpendicularAxis),
  );
  const microLength = Math.abs(axisCoordinate(third, terminalAxis) - axisCoordinate(second, terminalAxis));
  const combinedStub = Math.abs(axisCoordinate(third, terminalAxis) - axisCoordinate(terminal, terminalAxis));
  if (
    firstDirection !== sideDirection(side)
    || microDirection !== firstDirection
    || firstPerpendicularDirection === 0
    || firstPerpendicularDirection !== nextPerpendicularDirection
    || microLength > MIN_INTERIOR_LANE
    || combinedStub < MIN_ENDPOINT_STUB
  ) return null;

  const bridge = terminalAxis === 'h'
    ? { x: third.x, y: terminal.y }
    : { x: terminal.x, y: third.y };
  const repairedOriented = compactOrthogonalPath([
    terminal,
    bridge,
    third,
    ...oriented.slice(4),
  ]);
  return role === 'source' ? repairedOriented : [...repairedOriented].reverse();
};

const terminalNearReturnHairpinCandidate = (
  edge: Edge,
  path: DisplayPoint[],
  role: TerminalRole,
  side: PortSide,
  rect: DisplayRect,
): DisplayPoint[] | null => {
  if (path.length < 5 || edgeTerminalPositionIsFixed(edge, role)) return null;
  const oriented = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, first, second, third, continuation] = oriented;
  const terminalAxis = sideAxis(side);
  const perpendicularAxis = terminalAxis === 'h' ? 'v' : 'h';
  if (
    displayAxisOf(terminal, first) !== terminalAxis
    || displayAxisOf(first, second) !== perpendicularAxis
    || displayAxisOf(second, third) !== terminalAxis
    || displayAxisOf(third, continuation) !== perpendicularAxis
  ) return null;
  const firstDirection = Math.sign(axisCoordinate(first, terminalAxis) - axisCoordinate(terminal, terminalAxis));
  const returnDirection = Math.sign(axisCoordinate(third, terminalAxis) - axisCoordinate(second, terminalAxis));
  const firstPerpendicularDirection = Math.sign(
    axisCoordinate(second, perpendicularAxis) - axisCoordinate(first, perpendicularAxis),
  );
  const nextPerpendicularDirection = Math.sign(
    axisCoordinate(continuation, perpendicularAxis) - axisCoordinate(third, perpendicularAxis),
  );
  const bridgeLength = Math.abs(
    axisCoordinate(second, perpendicularAxis) - axisCoordinate(first, perpendicularAxis),
  );
  const collapsedStubLength = Math.abs(
    axisCoordinate(third, terminalAxis) - axisCoordinate(terminal, terminalAxis),
  );
  if (
    firstDirection !== sideDirection(side)
    || returnDirection !== -firstDirection
    || firstPerpendicularDirection === 0
    || firstPerpendicularDirection !== nextPerpendicularDirection
    || bridgeLength >= MIN_INTERIOR_LANE
    || collapsedStubLength < MIN_ENDPOINT_STUB
  ) return null;

  const shiftedTangent = axisCoordinate(second, perpendicularAxis)
    + nextPerpendicularDirection * MIN_INTERIOR_LANE;
  const tangentMinimum = terminalAxis === 'h' ? rect.y : rect.x;
  const tangentMaximum = tangentMinimum + (terminalAxis === 'h' ? rect.height : rect.width);
  if (shiftedTangent < tangentMinimum || shiftedTangent > tangentMaximum) return null;
  const shiftedTerminal = terminalAxis === 'h'
    ? { x: terminal.x, y: shiftedTangent }
    : { x: shiftedTangent, y: terminal.y };
  const bridge = terminalAxis === 'h'
    ? { x: third.x, y: shiftedTangent }
    : { x: shiftedTangent, y: third.y };
  const repairedOriented = compactOrthogonalPath([
    shiftedTerminal,
    bridge,
    continuation,
    ...oriented.slice(5),
  ]);
  return role === 'source' ? repairedOriented : [...repairedOriented].reverse();
};

const buildTerminalMicroStaircaseCandidates = (
  edges: Edge[],
  nodes: Node[],
): EdgeCandidate[] => {
  const candidates: EdgeCandidate[] = [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  edges.forEach((edge, edgeIndex) => {
    const path = getDisplayComputedPath(edge);
    for (const role of ['source', 'target'] as const) {
      const side = fullDisplayPortSide(normalizeHandle(
        role === 'source' ? edge.sourceHandle : edge.targetHandle,
      ));
      if (!side) continue;
      const terminalNode = nodeById.get(role === 'source' ? edge.source : edge.target);
      const terminalRect = terminalNode ? getDisplayNodeRect(terminalNode) : null;
      const candidatePath = terminalMicroStaircaseCandidate(path, role, side)
        ?? (terminalRect
          ? terminalNearReturnHairpinCandidate(edge, path, role, side, terminalRect)
          : null);
      if (!candidatePath) continue;
      candidates.push({
        edgeIndex,
        edge: withNormalizedPath(edge, candidatePath, 'micro-terminal-staircase'),
      });
    }
  });
  return candidates;
};

export const repairSharedPortAndTinyTerminalLanes = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 8,
  options: Readonly<{ allowTransientStrictCrossing?: boolean }> = {},
): T => {
  let current = edges;
  let qualityEvaluations = 0;
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  for (let pass = 0; pass < 4 && qualityEvaluations < maxQualityEvaluations; pass += 1) {
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = obstacleContext.evaluate(current);
    const baselineTerminals = getDisplayTerminalValidationReport(current, terminalValidation);
    const numericCandidates = [
      ...buildTerminalMicroStaircaseCandidates(current, nodes),
      ...buildFloatingLaneGapCandidates(current),
    ];
    const sharedPortCandidates = buildSharedPortBoundarySlideCandidates(current, nodes);
    const remainingEvaluationBudget = maxQualityEvaluations - qualityEvaluations;
    const candidates = baselineQuality.tinyInteriorDoglegs > 0
      || baselineQuality.hairpins > 0
      ? [...numericCandidates, ...sharedPortCandidates].slice(0, remainingEvaluationBudget)
      : interleaveBoundedRepairCandidates(
        sharedPortCandidates,
        numericCandidates,
        remainingEvaluationBudget,
      );
    let accepted: T | null = null;

    for (const candidateEntry of candidates) {
      if (qualityEvaluations >= maxQualityEvaluations) break;
      qualityEvaluations += 1;
      const candidate = current.map((edge, edgeIndex) => (
        edgeIndex === candidateEntry.edgeIndex ? candidateEntry.edge : edge
      )) as T;
      const candidateQuality = qualityContext.evaluateChanged(candidate, [candidateEntry.edgeIndex]);
      if (
        !hardQualityDoesNotRegress(
          baselineQuality,
          candidateQuality,
          options.allowTransientStrictCrossing === true,
        )
        || !hardQualityImproves(baselineQuality, candidateQuality)
        || obstacleContext.evaluateKnownChanges(candidate, [candidateEntry.edgeIndex]) > baselineObstacleHits
      ) continue;
      const candidateTerminals = getDisplayTerminalValidationReport(candidate, terminalValidation);
      if (
        !candidateTerminals.allAttached
        || candidateTerminals.unanchoredEdgeIndexes.length > baselineTerminals.unanchoredEdgeIndexes.length
      ) continue;
      accepted = candidate;
      break;
    }
    if (!accepted) break;
    current = accepted;
  }
  return current;
};
