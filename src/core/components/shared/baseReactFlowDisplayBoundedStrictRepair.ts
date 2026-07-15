import type { Edge, Node } from '@xyflow/react';

import { repairPairedTerminalApproachStrictCrossing } from './baseReactFlowPairedTerminalApproachRepair';
import { buildStrictCrossingZipperCandidates } from './baseReactFlowStrictCrossingZipperRepair';
import { findStrictCrossings } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import { synthesizeSharedEndpointTrunks } from '../../strategies/shared/edgeSharedTrunkSynthesis';
import {
  anchorComputedDisplayEdgeEndpoints,
  compactOrthogonalPath,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  getDisplayComputedPath,
  NEAR_PARALLEL_LANE_TOLERANCE,
  prioritizeLaneValues,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  buildStrictObstacleSideBridgeXs,
  buildStrictObstacleSideBridgeYs,
} from './baseReactFlowDisplayLaneCandidates';
import { buildCrossingCompanionOuterPortVariants } from './baseReactFlowDisplayTerminalPortRepair';
import {
  createDisplayObstacleEvaluationContext,
  displayStrictRepairHardQualityIsAcceptable,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
} from './baseReactFlowDisplayEvaluation';
import { displayEdgesHaveNodeAnchoredTerminals } from './baseReactFlowTerminalAxisRepair';

const MIN_DISPLAY_ENDPOINT_STUB = 48;

export const repairBoundedPortAndInternalStrictCrossings = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 8,
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const baselineQuality = qualityContext.evaluate(edges);
  if (baselineQuality.strictCrossings === 0) return edges;
  const baselineObstacleHits = obstacleContext.evaluate(edges);
  const paths = edges.map(edge => getDisplayComputedPath(edge));
  const crossings = findStrictCrossings(paths, edges).slice(0, 4);
  let best = edges;
  let bestQuality = baselineQuality;
  let evaluations = 0;

  const evaluateCandidate = (candidate: T): boolean => {
    if (evaluations >= maxQualityEvaluations) return false;
    evaluations += 1;
    const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, edges, candidate);
    if (candidateQuality.strictCrossings >= bestQuality.strictCrossings) return false;
    if (!displayStrictRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)) return false;
    const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, edges, candidate);
    if (candidateObstacleHits > baselineObstacleHits) return false;
    best = candidate;
    bestQuality = candidateQuality;
    return bestQuality.strictCrossings === 0;
  };

  const buildZipperCandidates = (
    segment: typeof crossings[number]['a'],
    other: typeof crossings[number]['a'],
  ): T[] => {
    if (edges.length > 24) return [];
    const path = paths[segment.edgeIndex];
    if (
      !path
      || segment.axis === other.axis
      || segment.segIdx <= 0
      || segment.segIdx >= path.length - 2
    ) return [];

    const crossingMain = segment.axis === 'h' ? other.a.x : other.a.y;
    const segmentStartMain = segment.axis === 'h' ? segment.a.x : segment.a.y;
    const segmentEndMain = segment.axis === 'h' ? segment.b.x : segment.b.y;
    if (Math.min(
      Math.abs(crossingMain - segmentStartMain),
      Math.abs(segmentEndMain - crossingMain),
    ) >= RESIDUAL_PARALLEL_LANE_GAP) return [];

    const blockers = paths.flatMap((blockerPath, edgeIndex) => {
      if (edgeIndex === segment.edgeIndex || blockerPath.length < 2) return [];
      return blockerPath.slice(0, -1).flatMap((point, segmentIndex) => {
        const next = blockerPath[segmentIndex + 1];
        const axis = displayAxisOf(point, next);
        if (!axis || axis === segment.axis) return [];
        return [{
          path: blockerPath,
          segment: {
            segmentIndex,
            axis,
            a: point,
            b: next,
          },
        }];
      });
    });
    if (blockers.length === 0) return [];

    const zipperPaths = buildStrictCrossingZipperCandidates(
      path,
      {
        segmentIndex: segment.segIdx,
        axis: segment.axis,
        a: segment.a,
        b: segment.b,
      },
      blockers,
    );
    const affectedEdgeIndexes = [...new Set([segment.edgeIndex, other.edgeIndex])];
    return zipperPaths.slice(0, 2).flatMap((candidatePath) => {
      const rawCandidate = edges.map((edge, edgeIndex) => (
        edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
      )) as T;
      const anchoredCandidate = rawCandidate.map((edge, edgeIndex) => (
        affectedEdgeIndexes.includes(edgeIndex)
          ? (anchorComputedDisplayEdgeEndpoints([edge], nodes)[0] ?? edge)
          : edge
      )) as T;
      const affectedEdges = affectedEdgeIndexes.map(edgeIndex => anchoredCandidate[edgeIndex]);
      return displayEdgesHaveNodeAnchoredTerminals(affectedEdges, nodes)
        ? [anchoredCandidate, rawCandidate]
        : [rawCandidate];
    });
  };

  const buildSimpleInternalLaneShiftCandidates = (
    segment: typeof crossings[number]['a'],
    other: typeof crossings[number]['a'],
  ): T[] => {
    const path = paths[segment.edgeIndex];
    if (
      !path
      || segment.axis === other.axis
      || segment.segIdx <= 0
      || segment.segIdx >= path.length - 2
    ) return [];
    const nearCoordinate = segment.axis === 'h'
      ? Math.min(other.a.y, other.b.y)
      : Math.min(other.a.x, other.b.x);
    const farCoordinate = segment.axis === 'h'
      ? Math.max(other.a.y, other.b.y)
      : Math.max(other.a.x, other.b.x);
    const currentCoordinate = segment.axis === 'h' ? segment.a.y : segment.a.x;
    const segmentEdge = edges[segment.edgeIndex];
    const otherEdge = edges[other.edgeIndex];
    const otherPath = paths[other.edgeIndex];
    const segmentMainMin = segment.axis === 'h'
      ? Math.min(segment.a.x, segment.b.x)
      : Math.min(segment.a.y, segment.b.y);
    const segmentMainMax = segment.axis === 'h'
      ? Math.max(segment.a.x, segment.b.x)
      : Math.max(segment.a.y, segment.b.y);
    const blockingLaneCoordinates: number[] = [];
    if (otherPath) {
      for (let index = 0; index < otherPath.length - 1; index += 1) {
        const blockerStart = otherPath[index];
        const blockerEnd = otherPath[index + 1];
        if (displayAxisOf(blockerStart, blockerEnd) !== other.axis) continue;
        const blockerMainCoordinate = segment.axis === 'h' ? blockerStart.x : blockerStart.y;
        if (
          blockerMainCoordinate <= segmentMainMin + 1
          || blockerMainCoordinate >= segmentMainMax - 1
        ) continue;
        blockingLaneCoordinates.push(
          segment.axis === 'h' ? blockerStart.y : blockerStart.x,
          segment.axis === 'h' ? blockerEnd.y : blockerEnd.x,
        );
      }
    }
    const blockerMinCoordinate = blockingLaneCoordinates.length > 0
      ? Math.min(...blockingLaneCoordinates)
      : nearCoordinate;
    const blockerMaxCoordinate = blockingLaneCoordinates.length > 0
      ? Math.max(...blockingLaneCoordinates)
      : farCoordinate;
    const precedingAxis = displayAxisOf(path[segment.segIdx - 1], path[segment.segIdx]);
    const precedingDirection = precedingAxis === 'v'
      ? Math.sign(path[segment.segIdx].y - path[segment.segIdx - 1].y)
      : precedingAxis === 'h'
        ? Math.sign(path[segment.segIdx].x - path[segment.segIdx - 1].x)
        : 0;
    const sharedSourceTrunkCoordinate = segmentEdge?.source === otherEdge?.source && otherPath
      ? otherPath.slice(0, Math.max(1, other.segIdx + 1)).reduce<number | null>((best, point, index) => {
        const next = otherPath[index + 1];
        if (!next || displayAxisOf(point, next) !== precedingAxis) return best;
        const direction = precedingAxis === 'v'
          ? Math.sign(next.y - point.y)
          : Math.sign(next.x - point.x);
        if (direction === 0 || direction !== precedingDirection) return best;
        const coordinate = precedingAxis === 'v' ? point.x : point.y;
        if (best === null) return coordinate;
        const preferred = precedingAxis === 'v' ? path[segment.segIdx].x : path[segment.segIdx].y;
        return Math.abs(coordinate - preferred) < Math.abs(best - preferred) ? coordinate : best;
      }, null)
      : null;
    const laneCoordinates = prioritizeLaneValues(
      currentCoordinate,
      [
        blockerMinCoordinate - MIN_DISPLAY_ENDPOINT_STUB,
        blockerMaxCoordinate + MIN_DISPLAY_ENDPOINT_STUB,
      ],
      [
        nearCoordinate - RESIDUAL_PARALLEL_LANE_GAP,
        nearCoordinate - RESIDUAL_PARALLEL_LANE_GAP - NEAR_PARALLEL_LANE_TOLERANCE,
        nearCoordinate - MIN_DISPLAY_ENDPOINT_STUB,
        farCoordinate + RESIDUAL_PARALLEL_LANE_GAP,
        farCoordinate + RESIDUAL_PARALLEL_LANE_GAP + NEAR_PARALLEL_LANE_TOLERANCE,
        farCoordinate + MIN_DISPLAY_ENDPOINT_STUB,
      ],
      8,
    );
    const candidates: T[] = [];
    for (const laneCoordinate of laneCoordinates) {
      if (sharedSourceTrunkCoordinate !== null && precedingAxis) {
        const alignedPath = path.map(point => ({ ...point }));
        if (segment.axis === 'h') {
          alignedPath[segment.segIdx - 1].x = sharedSourceTrunkCoordinate;
          alignedPath[segment.segIdx].x = sharedSourceTrunkCoordinate;
          alignedPath[segment.segIdx].y = laneCoordinate;
          alignedPath[segment.segIdx + 1].y = laneCoordinate;
        } else {
          alignedPath[segment.segIdx - 1].y = sharedSourceTrunkCoordinate;
          alignedPath[segment.segIdx].y = sharedSourceTrunkCoordinate;
          alignedPath[segment.segIdx].x = laneCoordinate;
          alignedPath[segment.segIdx + 1].x = laneCoordinate;
        }
        const compactAlignedPath = compactOrthogonalPath(alignedPath);
        candidates.push(edges.map((edge, edgeIndex) => (
          edgeIndex === segment.edgeIndex
            ? withDisplayComputedPath(edge, compactAlignedPath)
            : edge
        )) as T);
      }
      const shiftedPath = shiftDisplayInternalSegment(
        path,
        segment.segIdx,
        segment.axis,
        laneCoordinate,
      );
      if (!shiftedPath) continue;
      candidates.push(edges.map((edge, edgeIndex) => (
        edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, shiftedPath) : edge
      )) as T);
    }
    return candidates;
  };

  const buildTerminalApproachFanCandidate = (
    firstSegment: typeof crossings[number]['a'],
    secondSegment: typeof crossings[number]['a'],
  ): T | null => {
    const firstPath = paths[firstSegment.edgeIndex];
    const secondPath = paths[secondSegment.edgeIndex];
    if (!firstPath || !secondPath) return null;
    const repairedPaths = repairPairedTerminalApproachStrictCrossing(
      [firstPath, secondPath],
      [
        { ...firstSegment, edgeIndex: 0 },
        { ...secondSegment, edgeIndex: 1 },
      ],
    );
    if (!repairedPaths) return null;
    return edges.map((edge, edgeIndex) => {
      if (edgeIndex === firstSegment.edgeIndex) {
        return withDisplayComputedPath(edge, repairedPaths[0]);
      }
      if (edgeIndex === secondSegment.edgeIndex) {
        return withDisplayComputedPath(edge, repairedPaths[1]);
      }
      return edge;
    }) as T;
  };

  for (const crossing of crossings) {
    const zipperCandidates = [
      ...buildZipperCandidates(crossing.a, crossing.b),
      ...buildZipperCandidates(crossing.b, crossing.a),
    ];
    for (const candidate of zipperCandidates) {
      if (evaluations >= maxQualityEvaluations) return best;
      if (evaluateCandidate(candidate)) return best;
    }

    const simpleInternalCandidates = [
      ...buildSimpleInternalLaneShiftCandidates(crossing.a, crossing.b),
      ...buildSimpleInternalLaneShiftCandidates(crossing.b, crossing.a),
    ];
    for (const candidate of simpleInternalCandidates) {
      if (evaluations >= maxQualityEvaluations) return best;
      if (evaluateCandidate(candidate)) return best;
    }

    const terminalApproachFanCandidate = buildTerminalApproachFanCandidate(crossing.a, crossing.b);
    if (terminalApproachFanCandidate) {
      const sharedTrunkCandidate = synthesizeSharedEndpointTrunks(
        terminalApproachFanCandidate,
        { nodes },
      ) as T;
      for (const candidate of [sharedTrunkCandidate, terminalApproachFanCandidate]) {
        if (evaluations >= maxQualityEvaluations) return best;
        if (evaluateCandidate(candidate)) return best;
      }
    }

    for (const [segment, other] of [[crossing.a, crossing.b], [crossing.b, crossing.a]] as const) {
      const path = paths[segment.edgeIndex];
      if (
        !path
        || segment.segIdx <= 0
        || segment.segIdx >= path.length - 2
        || segment.axis === other.axis
      ) continue;
      const start = path[segment.segIdx];
      const end = path[segment.segIdx + 1];
      const next = path[segment.segIdx + 2];
      const localDetourPaths: DisplayPoint[][] = [];

      if (segment.axis === 'h') {
        const direction = Math.sign(end.x - start.x);
        const crossingX = other.a.x;
        const entryX = crossingX - direction * MIN_DISPLAY_ENDPOINT_STUB;
        const exitX = crossingX + direction * MIN_DISPLAY_ENDPOINT_STUB;
        const minSegmentX = Math.min(start.x, end.x);
        const maxSegmentX = Math.max(start.x, end.x);
        if (
          direction !== 0
          && entryX >= minSegmentX
          && entryX <= maxSegmentX
          && exitX >= minSegmentX
          && exitX <= maxSegmentX
        ) {
          const otherMinY = Math.min(other.a.y, other.b.y);
          const otherMaxY = Math.max(other.a.y, other.b.y);
          const continuationDirection = displayAxisOf(end, next) === 'v'
            ? Math.sign(next.y - end.y)
            : 0;
          if (continuationDirection !== 0) {
            const continuationY = continuationDirection > 0
              ? otherMaxY + MIN_DISPLAY_ENDPOINT_STUB
              : otherMinY - MIN_DISPLAY_ENDPOINT_STUB;
            const sortedContinuationYValues = sortedUniqueNumbers([
              continuationY,
              ...buildStrictObstacleSideBridgeYs(
                nodes,
                Math.min(entryX, end.x),
                Math.max(entryX, end.x),
              ),
            ], continuationY).filter(value => continuationDirection > 0
              ? value >= continuationY
              : value <= continuationY);
            const continuationYValues = [
              next.y,
              ...sortedContinuationYValues.filter(value => Math.abs(value - next.y) > 0.5),
            ].filter(value => continuationDirection > 0
              ? value >= continuationY
              : value <= continuationY);
            for (const laneY of continuationYValues.slice(0, 4)) {
              localDetourPaths.push(compactOrthogonalPath([
                ...path.slice(0, segment.segIdx + 1),
                { x: entryX, y: start.y },
                { x: entryX, y: laneY },
                { x: end.x, y: laneY },
                ...path.slice(segment.segIdx + 2),
              ]));
            }
          }
          const bypassYValues = sortedUniqueNumbers([
            otherMinY - RESIDUAL_PARALLEL_LANE_GAP,
            otherMaxY + RESIDUAL_PARALLEL_LANE_GAP,
            otherMinY - MIN_DISPLAY_ENDPOINT_STUB,
            otherMaxY + MIN_DISPLAY_ENDPOINT_STUB,
          ], start.y);
          for (const bypassY of bypassYValues.slice(0, 4)) {
            localDetourPaths.push(compactOrthogonalPath([
              ...path.slice(0, segment.segIdx + 1),
              { x: entryX, y: start.y },
              { x: entryX, y: bypassY },
              { x: exitX, y: bypassY },
              { x: exitX, y: end.y },
              ...path.slice(segment.segIdx + 1),
            ]));
          }
        }
      } else {
        const direction = Math.sign(end.y - start.y);
        const crossingY = other.a.y;
        const entryY = crossingY - direction * MIN_DISPLAY_ENDPOINT_STUB;
        const exitY = crossingY + direction * MIN_DISPLAY_ENDPOINT_STUB;
        const minSegmentY = Math.min(start.y, end.y);
        const maxSegmentY = Math.max(start.y, end.y);
        if (
          direction !== 0
          && entryY >= minSegmentY
          && entryY <= maxSegmentY
          && exitY >= minSegmentY
          && exitY <= maxSegmentY
        ) {
          const otherMinX = Math.min(other.a.x, other.b.x);
          const otherMaxX = Math.max(other.a.x, other.b.x);
          const continuationDirection = displayAxisOf(end, next) === 'h'
            ? Math.sign(next.x - end.x)
            : 0;
          if (continuationDirection !== 0) {
            const continuationX = continuationDirection > 0
              ? otherMaxX + MIN_DISPLAY_ENDPOINT_STUB
              : otherMinX - MIN_DISPLAY_ENDPOINT_STUB;
            const sortedContinuationXValues = sortedUniqueNumbers([
              continuationX,
              ...buildStrictObstacleSideBridgeXs(
                nodes,
                Math.min(entryY, end.y),
                Math.max(entryY, end.y),
              ),
            ], continuationX).filter(value => continuationDirection > 0
              ? value >= continuationX
              : value <= continuationX);
            const continuationXValues = [
              next.x,
              ...sortedContinuationXValues.filter(value => Math.abs(value - next.x) > 0.5),
            ].filter(value => continuationDirection > 0
              ? value >= continuationX
              : value <= continuationX);
            for (const laneX of continuationXValues.slice(0, 4)) {
              localDetourPaths.push(compactOrthogonalPath([
                ...path.slice(0, segment.segIdx + 1),
                { x: start.x, y: entryY },
                { x: laneX, y: entryY },
                { x: laneX, y: end.y },
                ...path.slice(segment.segIdx + 2),
              ]));
            }
          }
          const bypassXValues = sortedUniqueNumbers([
            otherMinX - RESIDUAL_PARALLEL_LANE_GAP,
            otherMaxX + RESIDUAL_PARALLEL_LANE_GAP,
            otherMinX - MIN_DISPLAY_ENDPOINT_STUB,
            otherMaxX + MIN_DISPLAY_ENDPOINT_STUB,
          ], start.x);
          for (const bypassX of bypassXValues.slice(0, 4)) {
            localDetourPaths.push(compactOrthogonalPath([
              ...path.slice(0, segment.segIdx + 1),
              { x: start.x, y: entryY },
              { x: bypassX, y: entryY },
              { x: bypassX, y: exitY },
              { x: end.x, y: exitY },
              ...path.slice(segment.segIdx + 1),
            ]));
          }
        }
      }

      for (const candidatePath of localDetourPaths) {
        if (evaluations >= maxQualityEvaluations) return best;
        const candidate = edges.map((edge, edgeIndex) => (
          edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
        )) as T;
        if (evaluateCandidate(candidate)) return best;
      }
    }

    const portVariants = [
      ...buildCrossingCompanionOuterPortVariants(edges, crossing.a, crossing.b, nodes),
      ...buildCrossingCompanionOuterPortVariants(edges, crossing.b, crossing.a, nodes),
    ].slice(0, 4);
    for (const candidate of portVariants) {
      if (evaluations >= maxQualityEvaluations) return best;
      if (evaluateCandidate(candidate)) return best;
    }
  }
  return best;
};
