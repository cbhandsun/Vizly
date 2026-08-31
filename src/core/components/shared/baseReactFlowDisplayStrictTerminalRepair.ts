import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { findStrictCrossings } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  OBSTACLE_REPAIR_NODE_PADDING,
  rangesOverlapWithMargin,
  RESIDUAL_PARALLEL_LANE_GAP,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
  displayStrictRepairHardQualityIsAcceptable,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
} from './baseReactFlowDisplayEvaluation';
import { buildCrossingCompanionOuterPortVariants } from './baseReactFlowDisplayTerminalPortRepair';
import { createDisplayStrictCrossingCounter } from './baseReactFlowDisplayStrictCrossingCounter';

const MIN_DISPLAY_ENDPOINT_STUB = 48;

export const buildTerminalStrictStubPaths = (
  path: DisplayPoint[],
  segment: { axis: 'h' | 'v'; segIdx: number; a: DisplayPoint; b: DisplayPoint; edgeIndex?: number },
  other: { axis: 'h' | 'v'; a: DisplayPoint; b: DisplayPoint },
  edge?: Edge,
  blockers: DisplaySegment[] = [],
): DisplayPoint[][] => {
  const terminalAtStart = segment.segIdx === 0;
  const terminalAtEnd = segment.segIdx === path.length - 2;
  if (!terminalAtStart && !terminalAtEnd) return [];
  if (segment.axis === other.axis) return [];

  if (path.length === 3) {
    const source = path[0];
    const target = path[2];
    const sourceSide = normalizeHandle(edge?.sourceHandle)
      ?? (segment.axis === 'h'
        ? (target.y >= source.y ? 'b' : 't')
        : (target.x >= source.x ? 'r' : 'l'));
    const targetSide = normalizeHandle(edge?.targetHandle)
      ?? (segment.axis === 'h'
        ? (target.y >= source.y ? 't' : 'b')
        : (target.x >= source.x ? 'l' : 'r'));
    const candidates: DisplayPoint[][] = [];
    if (segment.axis === 'h' && other.axis === 'v') {
      const values = sortedUniqueNumbers([
        Math.min(other.a.y, other.b.y) - OBSTACLE_REPAIR_NODE_PADDING,
        Math.min(other.a.y, other.b.y) - RESIDUAL_PARALLEL_LANE_GAP,
        Math.min(other.a.y, other.b.y) - MIN_DISPLAY_ENDPOINT_STUB,
        Math.max(other.a.y, other.b.y) + OBSTACLE_REPAIR_NODE_PADDING,
        Math.max(other.a.y, other.b.y) + RESIDUAL_PARALLEL_LANE_GAP,
        Math.max(other.a.y, other.b.y) + MIN_DISPLAY_ENDPOINT_STUB,
        (source.y + target.y) / 2,
      ], path[1].y);
      for (const laneY of values) {
        const sourceOutward = sourceSide === 'b'
          ? laneY >= source.y + MIN_DISPLAY_ENDPOINT_STUB
          : sourceSide === 't' && laneY <= source.y - MIN_DISPLAY_ENDPOINT_STUB;
        const targetOutward = targetSide === 't'
          ? laneY <= target.y - MIN_DISPLAY_ENDPOINT_STUB
          : targetSide === 'b' && laneY >= target.y + MIN_DISPLAY_ENDPOINT_STUB;
        if (!sourceOutward || !targetOutward) continue;
        candidates.push(compactOrthogonalPath([
          source,
          { x: source.x, y: laneY },
          { x: target.x, y: laneY },
          target,
        ]));
      }
    }
    if (segment.axis === 'v' && other.axis === 'h') {
      const values = sortedUniqueNumbers([
        Math.min(other.a.x, other.b.x) - OBSTACLE_REPAIR_NODE_PADDING,
        Math.min(other.a.x, other.b.x) - RESIDUAL_PARALLEL_LANE_GAP,
        Math.min(other.a.x, other.b.x) - MIN_DISPLAY_ENDPOINT_STUB,
        Math.max(other.a.x, other.b.x) + OBSTACLE_REPAIR_NODE_PADDING,
        Math.max(other.a.x, other.b.x) + RESIDUAL_PARALLEL_LANE_GAP,
        Math.max(other.a.x, other.b.x) + MIN_DISPLAY_ENDPOINT_STUB,
        (source.x + target.x) / 2,
      ], path[1].x);
      for (const laneX of values) {
        const sourceOutward = sourceSide === 'r'
          ? laneX >= source.x + MIN_DISPLAY_ENDPOINT_STUB
          : sourceSide === 'l' && laneX <= source.x - MIN_DISPLAY_ENDPOINT_STUB;
        const targetOutward = targetSide === 'l'
          ? laneX <= target.x - MIN_DISPLAY_ENDPOINT_STUB
          : targetSide === 'r' && laneX >= target.x + MIN_DISPLAY_ENDPOINT_STUB;
        if (!sourceOutward || !targetOutward) continue;
        candidates.push(compactOrthogonalPath([
          source,
          { x: laneX, y: source.y },
          { x: laneX, y: target.y },
          target,
        ]));
      }
    }
    return candidates.filter(candidate => candidate.length >= 4 && candidate.every(isFinitePoint));
  }

  if (path.length < 4) return [];

  const endpoint = terminalAtStart ? path[0] : path[path.length - 1];
  const neighbor = terminalAtStart ? path[1] : path[path.length - 2];
  const next = terminalAtStart ? path[2] : path[path.length - 3];
  if (!endpoint || !neighbor || !next) return [];
  const neighborAxis = terminalAtStart
    ? displayAxisOf(neighbor, next)
    : displayAxisOf(next, neighbor);
  if (!neighborAxis || neighborAxis === segment.axis) return [];
  const handleSide = normalizeHandle(String(
    terminalAtStart ? edge?.sourceHandle ?? '' : edge?.targetHandle ?? '',
  )) ?? (segment.axis === 'h'
    ? (neighbor.x >= endpoint.x ? 'r' : 'l')
    : (neighbor.y >= endpoint.y ? 'b' : 't'));

  const compactCandidates = (candidates: DisplayPoint[][]): DisplayPoint[][] => {
    const seen = new Set<string>();
    const countStrictCrossings = createDisplayStrictCrossingCounter(blockers);
    return candidates
      .map(candidate => compactOrthogonalPath(candidate))
      .filter(candidate => candidate.length >= 2 && candidate.every(isFinitePoint))
      .filter((candidate) => {
        const key = candidate.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(path => ({ path, crossings: countStrictCrossings(path) }))
      .sort((first, second) => first.crossings - second.crossings)
      .map(candidate => candidate.path);
  };

  if (segment.axis === 'h') {
    const otherMinY = Math.min(other.a.y, other.b.y);
    const otherMaxY = Math.max(other.a.y, other.b.y);
    const laneValues = sortedUniqueNumbers([
      endpoint.y - MIN_DISPLAY_ENDPOINT_STUB,
      endpoint.y + MIN_DISPLAY_ENDPOINT_STUB,
      otherMinY - MIN_DISPLAY_ENDPOINT_STUB,
      otherMaxY + MIN_DISPLAY_ENDPOINT_STUB,
      otherMinY - MIN_DISPLAY_ENDPOINT_STUB - RESIDUAL_PARALLEL_LANE_GAP,
      otherMaxY + MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP,
      otherMinY - RESIDUAL_PARALLEL_LANE_GAP,
      otherMaxY + RESIDUAL_PARALLEL_LANE_GAP,
      otherMinY - RESIDUAL_PARALLEL_LANE_GAP * 2,
      otherMaxY + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], next.y);
    const perpendicularHandleCandidates = handleSide === 't' || handleSide === 'b'
      ? laneValues
        .filter(laneY => handleSide === 'b'
          ? laneY >= endpoint.y + MIN_DISPLAY_ENDPOINT_STUB
          : laneY <= endpoint.y - MIN_DISPLAY_ENDPOINT_STUB)
        .slice(0, 6)
        .map(laneY => terminalAtStart
          ? [
            endpoint,
            { x: endpoint.x, y: laneY },
            { x: next.x, y: laneY },
            ...path.slice(2),
          ]
          : [
            ...path.slice(0, -2),
            { x: next.x, y: laneY },
            { x: endpoint.x, y: laneY },
            endpoint,
          ])
      : [];
    const handleHemisphereCandidates = handleSide === 'l' || handleSide === 'r'
      ? (() => {
        const approachX = endpoint.x + (handleSide === 'r' ? 1 : -1) * MIN_DISPLAY_ENDPOINT_STUB;
        const candidates: DisplayPoint[][] = [terminalAtStart
          ? [
            endpoint,
            { x: approachX, y: endpoint.y },
            { x: approachX, y: next.y },
            ...path.slice(3),
          ]
          : [
            ...path.slice(0, -3),
            { x: approachX, y: next.y },
            { x: approachX, y: endpoint.y },
            endpoint,
          ]];
        const outerLaneYs = [
          ...laneValues
            .filter(laneY => laneY <= otherMinY - RESIDUAL_PARALLEL_LANE_GAP)
            .slice(0, 2),
          ...laneValues
            .filter(laneY => laneY >= otherMaxY + RESIDUAL_PARALLEL_LANE_GAP)
            .slice(0, 2),
        ];
        const handleDirection = handleSide === 'r' ? 1 : -1;
        const approachXValues = sortedUniqueNumbers([
          approachX,
          other.a.x - handleDirection * RESIDUAL_PARALLEL_LANE_GAP,
          other.a.x - handleDirection * MIN_DISPLAY_ENDPOINT_STUB,
        ], approachX).filter(candidateX => (
          handleDirection * (candidateX - endpoint.x) >= MIN_DISPLAY_ENDPOINT_STUB
          && handleDirection * (other.a.x - candidateX) >= RESIDUAL_PARALLEL_LANE_GAP
        ));
        for (const laneY of outerLaneYs) {
          for (const bridgeX of approachXValues) {
            candidates.push(terminalAtStart
              ? [
                endpoint,
                { x: bridgeX, y: endpoint.y },
                { x: bridgeX, y: laneY },
                { x: next.x, y: laneY },
                next,
                ...path.slice(3),
              ]
              : [
                ...path.slice(0, -2),
                { x: next.x, y: laneY },
                { x: bridgeX, y: laneY },
                { x: bridgeX, y: endpoint.y },
                endpoint,
              ]);
          }
        }
        return candidates;
      })()
      : [];
    return compactCandidates([
      ...perpendicularHandleCandidates,
      ...handleHemisphereCandidates,
      ...laneValues.slice(0, 6).map((bridgeY) => {
        const lanePoint = { x: next.x, y: bridgeY };
        const endpointLanePoint = { x: endpoint.x, y: bridgeY };
        return terminalAtStart
          ? [endpoint, endpointLanePoint, lanePoint, ...path.slice(2)]
          : [...path.slice(0, -2), lanePoint, endpointLanePoint, endpoint];
      }),
    ]);
  }

  const otherMinX = Math.min(other.a.x, other.b.x);
  const otherMaxX = Math.max(other.a.x, other.b.x);
  const blockerXValues = blockers
    .filter(blocker => blocker.axis === 'h')
    .filter(blocker => rangesOverlapWithMargin(segment.a.y, segment.b.y, blocker.a.y, blocker.b.y, 1))
    .flatMap(blocker => [blocker.a.x, blocker.b.x]);
  const laneValues = sortedUniqueNumbers([
    endpoint.x - MIN_DISPLAY_ENDPOINT_STUB,
    endpoint.x + MIN_DISPLAY_ENDPOINT_STUB,
    otherMinX - MIN_DISPLAY_ENDPOINT_STUB,
    otherMaxX + MIN_DISPLAY_ENDPOINT_STUB,
    otherMinX - MIN_DISPLAY_ENDPOINT_STUB - RESIDUAL_PARALLEL_LANE_GAP,
    otherMaxX + MIN_DISPLAY_ENDPOINT_STUB + RESIDUAL_PARALLEL_LANE_GAP,
    otherMinX - RESIDUAL_PARALLEL_LANE_GAP,
    otherMaxX + RESIDUAL_PARALLEL_LANE_GAP,
    otherMinX - RESIDUAL_PARALLEL_LANE_GAP * 2,
    otherMaxX + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ...(blockerXValues.length > 0 ? [
      Math.min(...blockerXValues) - MIN_DISPLAY_ENDPOINT_STUB,
      Math.max(...blockerXValues) + MIN_DISPLAY_ENDPOINT_STUB,
      Math.min(...blockerXValues) - RESIDUAL_PARALLEL_LANE_GAP * 2,
      Math.max(...blockerXValues) + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ] : []),
  ], next.x);
  const perpendicularHandleCandidates = handleSide === 'l' || handleSide === 'r'
    ? laneValues
      .filter(laneX => handleSide === 'r'
        ? laneX >= endpoint.x + MIN_DISPLAY_ENDPOINT_STUB
        : laneX <= endpoint.x - MIN_DISPLAY_ENDPOINT_STUB)
      .slice(0, 6)
      .map(laneX => terminalAtStart
        ? [
          endpoint,
          { x: laneX, y: endpoint.y },
          { x: laneX, y: next.y },
          ...path.slice(2),
        ]
        : [
          ...path.slice(0, -2),
          { x: laneX, y: next.y },
          { x: laneX, y: endpoint.y },
          endpoint,
        ])
    : [];
  const handleHemisphereCandidates = handleSide === 't' || handleSide === 'b'
    ? (() => {
      const approachY = endpoint.y + (handleSide === 'b' ? 1 : -1) * MIN_DISPLAY_ENDPOINT_STUB;
      const candidates: DisplayPoint[][] = [terminalAtStart
        ? [
          endpoint,
          { x: endpoint.x, y: approachY },
          { x: next.x, y: approachY },
          ...path.slice(3),
        ]
        : [
          ...path.slice(0, -3),
          { x: next.x, y: approachY },
          { x: endpoint.x, y: approachY },
          endpoint,
        ]];
      const outerLaneXs = [
        ...laneValues
          .filter(laneX => laneX <= otherMinX - RESIDUAL_PARALLEL_LANE_GAP)
          .slice(0, 2),
        ...laneValues
          .filter(laneX => laneX >= otherMaxX + RESIDUAL_PARALLEL_LANE_GAP)
          .slice(0, 2),
      ];
      const handleDirection = handleSide === 'b' ? 1 : -1;
      const approachYValues = sortedUniqueNumbers([
        approachY,
        other.a.y - handleDirection * RESIDUAL_PARALLEL_LANE_GAP,
        other.a.y - handleDirection * MIN_DISPLAY_ENDPOINT_STUB,
      ], approachY).filter(candidateY => (
        handleDirection * (candidateY - endpoint.y) >= MIN_DISPLAY_ENDPOINT_STUB
        && handleDirection * (other.a.y - candidateY) >= RESIDUAL_PARALLEL_LANE_GAP
      ));
      for (const laneX of outerLaneXs) {
        for (const bridgeY of approachYValues) {
          candidates.push(terminalAtStart
            ? [
              endpoint,
              { x: endpoint.x, y: bridgeY },
              { x: laneX, y: bridgeY },
              { x: laneX, y: next.y },
              next,
              ...path.slice(3),
            ]
            : [
              ...path.slice(0, -2),
              { x: laneX, y: next.y },
              { x: laneX, y: bridgeY },
              { x: endpoint.x, y: bridgeY },
              endpoint,
            ]);
        }
      }
      return candidates;
    })()
    : [];
  return compactCandidates([
    ...perpendicularHandleCandidates,
    ...handleHemisphereCandidates,
    ...laneValues.slice(0, 6).map((bridgeX) => {
      const lanePoint = { x: bridgeX, y: next.y };
      const endpointLanePoint = { x: bridgeX, y: endpoint.y };
      return terminalAtStart
        ? [endpoint, endpointLanePoint, lanePoint, ...path.slice(2)]
        : [...path.slice(0, -2), lanePoint, endpointLanePoint, endpoint];
    }),
  ]);
};

export const repairAnchoredTerminalCrossingCluster = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  let current = edges;
  let evaluations = 0;
  for (let pass = 0; pass < 3 && evaluations < 12; pass += 1) {
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    if (baselineQuality.strictCrossings === 0) break;
    const baselineObstacleHits = obstacleContext.evaluate(current);
    const segments = extractDisplaySegments(current);
    const hits = findDisplayStrictCrossingHits(current).slice(0, 4);
    let best = current;
    let bestQuality = baselineQuality;
    let bestObstacleHits = baselineObstacleHits;

    const evaluateCandidate = (candidate: T): boolean => {
      if (evaluations >= 12) return false;
      evaluations += 1;
      const quality = evaluateDisplayQualityCandidate(qualityContext, current, candidate);
      if (quality.strictCrossings >= bestQuality.strictCrossings) return false;
      if (
        quality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
        || quality.reverseOverlap > baselineQuality.reverseOverlap
        || quality.unrelatedOverlap > baselineQuality.unrelatedOverlap
        || quality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
        || quality.shortEndpointStubs > baselineQuality.shortEndpointStubs
        || quality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
        || quality.hairpins > baselineQuality.hairpins
      ) return false;
      const obstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, current, candidate);
      if (obstacleHits > baselineObstacleHits) return false;
      best = candidate;
      bestQuality = quality;
      bestObstacleHits = obstacleHits;
      return true;
    };

    let solved = false;
    for (const hit of hits) {
      for (const [segment, other] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
        const path = getDisplayComputedPath(current[segment.edgeIndex]);
        const candidatePaths = buildTerminalStrictStubPaths(
          path,
          { ...segment, segIdx: segment.segmentIndex },
          other,
          current[segment.edgeIndex],
          segments.filter(candidate => candidate.edgeIndex !== segment.edgeIndex),
        ).slice(0, 8);
        for (const candidatePath of candidatePaths) {
          const candidate = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          if (evaluateCandidate(candidate)) {
            solved = true;
            break;
          }
        }
        if (solved || evaluations >= 12) break;
      }
      if (!solved && evaluations < 12) {
        const portVariants = [
          ...buildCrossingCompanionOuterPortVariants(current, hit.a, hit.b, nodes),
          ...buildCrossingCompanionOuterPortVariants(current, hit.b, hit.a, nodes),
        ];
        for (const candidate of portVariants) {
          if (evaluateCandidate(candidate)) {
            solved = true;
            break;
          }
        }
      }
      if (solved || evaluations >= 12) break;
    }

    if (best === current) break;
    current = best;
    if (bestQuality.strictCrossings === 0 && bestObstacleHits === 0) break;
  }
  return current;
};

export const repairTerminalEndpointStrictCrossingStubs = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = Number.POSITIVE_INFINITY,
): T => {
  let current = edges;
  let qualityEvaluations = 0;
  for (
    let pass = 0;
    pass < 2 && qualityEvaluations < maxQualityEvaluations;
    pass += 1
  ) {
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineStrict = baselineQuality.strictCrossings;
    if (baselineStrict === 0) break;
    const baselineObstacleHits = obstacleContext.evaluate(current);
    const paths = current.map(edge => getDisplayComputedPath(edge));
    const allSegments = extractDisplaySegments(current);
    const crossings = findStrictCrossings(paths, current).slice(0, 6);
    let best = current;
    let bestStrict = baselineStrict;

    for (const crossing of crossings) {
      for (const [segment, other] of [[crossing.a, crossing.b], [crossing.b, crossing.a]] as const) {
        const path = paths[segment.edgeIndex];
        if (!path) continue;
        const candidatePaths = buildTerminalStrictStubPaths(
          path,
          segment,
          other,
          current[segment.edgeIndex],
          allSegments.filter(item => item.edgeIndex !== segment.edgeIndex),
        );
        for (const candidatePath of candidatePaths.slice(
          0,
          Math.max(0, maxQualityEvaluations - qualityEvaluations),
        )) {
          qualityEvaluations += 1;
          const candidateEdges = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [segment.edgeIndex]);
          const candidateStrict = candidateQuality.strictCrossings;
          if (candidateStrict >= bestStrict) continue;
          if (!displayStrictRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)) continue;
          const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [segment.edgeIndex]);
          if (candidateObstacleHits > baselineObstacleHits) continue;
          best = candidateEdges;
          bestStrict = candidateStrict;
          if (bestStrict === 0) break;
        }
        if (bestStrict === 0) break;
      }
      if (bestStrict === 0) break;
    }

    if (best === current) break;
    current = best;
  }
  return current;
};
