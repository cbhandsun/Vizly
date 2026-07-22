import type { Edge, Node } from '@xyflow/react';

import { findStrictCrossings } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import { isFinitePoint } from './baseReactFlowDisplayEdgeCore';
import {
  candidateStrictCrossingsForEdge,
  displayAxisOf,
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import { buildInternalStrictLaneShiftCandidates } from './baseReactFlowDisplayLaneCandidates';
import { buildNodeBoundaryAdjacentLaneCandidates } from './baseReactFlowDisplayNodeBoundaryLaneCandidates';
import { buildStrictEndpointDetourCandidates } from './baseReactFlowDisplayStrictEndpointDetourCandidates';
import { buildTerminalCapDetourCandidates } from './baseReactFlowDisplayTerminalCapDetourCandidates';
import { buildStrictLoopShortcutCandidates } from './baseReactFlowDisplayStrictLoopShortcutCandidates';
import {
  repairDisplayObstacleHits,
  repairStrictBypassesIfNeeded,
} from './baseReactFlowDisplayObstacleRepair';
import {
  DISPLAY_STRICT_REPAIR_OVERLAP_SLACK,
  countDisplayStrictCrossings,
  createDisplayObstacleEvaluationContext,
  displayStrictRepairHardQualityIsAcceptable,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
  obstacleRepairScore,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { displayStrictCrossingsFromKnownQuality } from './baseReactFlowDisplayStrictCrossingCount';
import { buildCrossingCompanionOuterPortVariants } from './baseReactFlowDisplayTerminalPortRepair';
import {
  buildTerminalStrictStubPaths,
  repairTerminalEndpointStrictCrossingStubs,
} from './baseReactFlowDisplayStrictTerminalRepair';
import { repairBoundedMultiEdgeResidualStrictCrossings } from './baseReactFlowDisplayCrossingClusterRepair';
import {
  createDisplayTerminalValidationSnapshot,
  type DisplayTerminalValidationSnapshot,
} from './baseReactFlowTerminalAxisRepair';

const MIN_DISPLAY_ENDPOINT_STUB = 48;

const changedDisplayTerminalsRemainAnchored = (
  baseline: readonly Edge[],
  candidate: readonly Edge[],
  snapshot: DisplayTerminalValidationSnapshot,
): boolean => candidate.every((edge, index) => (
  edge === baseline[index] || snapshot.validateEdge(edge).anchored
));

export const repairInternalStrictCrossingLanes = <T extends Edge[]>(edges: T, nodes: Node[]): T => {
  let current = edges;
  for (let pass = 0; pass < 2; pass += 1) {
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineStrict = baselineQuality.strictCrossings;
    const baselineDisplayStrict = displayStrictCrossingsFromKnownQuality(current, baselineQuality);
    if (baselineStrict === 0 && baselineDisplayStrict === 0) break;
    const baselineObstacleHits = obstacleContext.evaluate(current);
    const paths = current.map(edge => getDisplayComputedPath(edge));
    const allSegments = extractDisplaySegments(current);
    const crossings = findStrictCrossings(paths, current).slice(0, 8);
    let best = current;
    let bestStrict = baselineStrict;
    let bestDisplayStrict = baselineDisplayStrict;
    let bestScore = obstacleRepairScore(baselineQuality, baselineObstacleHits);
    let relaxedBest: T | null = null;
    let relaxedBestStrict = baselineStrict;
    let relaxedBestDisplayStrict = baselineDisplayStrict;
    let relaxedBestScore = Number.POSITIVE_INFINITY;

    for (const crossing of crossings) {
      for (const [segment, other] of [[crossing.a, crossing.b], [crossing.b, crossing.a]] as const) {
        const path = paths[segment.edgeIndex];
        if (!path) continue;
        const otherSegments = allSegments.filter(item => item.edgeIndex !== segment.edgeIndex);
        const baselineEdgeStrict = candidateStrictCrossingsForEdge(
          segment.edgeIndex,
          path,
          otherSegments,
        );
        const candidatePaths = buildInternalStrictLaneShiftCandidates(
          path,
          segment,
          other,
          paths[other.edgeIndex],
          nodes,
        );
        for (const candidatePath of candidatePaths) {
          const candidateEdgeStrict = candidateStrictCrossingsForEdge(
            segment.edgeIndex,
            candidatePath,
            otherSegments,
          );
          const candidateStrict = baselineStrict - baselineEdgeStrict + candidateEdgeStrict;
          const candidateDisplayStrict = baselineDisplayStrict - baselineEdgeStrict + candidateEdgeStrict;
          const reducesBaselineStrict = candidateStrict < baselineStrict
            || candidateDisplayStrict < baselineDisplayStrict;
          if (!reducesBaselineStrict) continue;
          const candidateEdges = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [segment.edgeIndex]);
          const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [segment.edgeIndex]);
          const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
          if (
            candidateObstacleHits <= baselineObstacleHits
            && (
              candidateStrict < relaxedBestStrict
              || candidateDisplayStrict < relaxedBestDisplayStrict
              || (
                candidateStrict === relaxedBestStrict
                && candidateDisplayStrict === relaxedBestDisplayStrict
                && candidateScore < relaxedBestScore - 1
              )
            )
          ) {
            relaxedBest = candidateEdges;
            relaxedBestStrict = candidateStrict;
            relaxedBestDisplayStrict = candidateDisplayStrict;
            relaxedBestScore = candidateScore;
          }
          const hardAcceptable = candidateQuality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
            && candidateQuality.strictCrossings <= baselineQuality.strictCrossings
            && candidateQuality.reverseOverlap <= baselineQuality.reverseOverlap
            && candidateQuality.unrelatedOverlap <= baselineQuality.unrelatedOverlap
            && candidateQuality.unexplainedRelatedOverlap <= baselineQuality.unexplainedRelatedOverlap
            && candidateQuality.shortEndpointStubs <= baselineQuality.shortEndpointStubs
            && candidateQuality.tinyInteriorDoglegs <= baselineQuality.tinyInteriorDoglegs
            && candidateQuality.hairpins <= baselineQuality.hairpins + (reducesBaselineStrict ? 1 : 0);
          if (!hardAcceptable) continue;
          if (candidateObstacleHits > baselineObstacleHits) continue;
          if (candidateStrict >= bestStrict && candidateDisplayStrict >= bestDisplayStrict) continue;
          if (
            candidateStrict < bestStrict
            || candidateDisplayStrict < bestDisplayStrict
            || (
              candidateStrict === bestStrict
              && candidateDisplayStrict === bestDisplayStrict
              && candidateScore < bestScore - 1
            )
          ) {
            best = candidateEdges;
            bestStrict = candidateStrict;
            bestDisplayStrict = candidateDisplayStrict;
            bestScore = candidateScore;
          }
        }
      }
    }

    if (best === current && relaxedBest && (
      relaxedBestStrict < baselineStrict || relaxedBestDisplayStrict < baselineDisplayStrict
    )) {
      best = relaxedBest;
    }
    if (best === current) break;
    current = best;
  }
  return current;
};

const buildPairedTerminalStrictCandidates = <T extends Edge[]>(
  edges: T,
  terminalSegment: DisplaySegment,
  internalSegment: DisplaySegment,
): T[] => {
  const terminalPath = getDisplayComputedPath(edges[terminalSegment.edgeIndex]);
  const internalPath = getDisplayComputedPath(edges[internalSegment.edgeIndex]);
  if (terminalPath.length < 5 || internalPath.length < 4) return [];
  const terminalAtStart = terminalSegment.segmentIndex === 0;
  const terminalAtEnd = terminalSegment.segmentIndex === terminalPath.length - 2;
  if (!terminalAtStart && !terminalAtEnd) return [];
  if (
    internalSegment.segmentIndex <= 0
    || internalSegment.segmentIndex >= internalPath.length - 2
    || terminalSegment.axis === internalSegment.axis
  ) return [];

  const candidates: T[] = [];
  const appendCandidate = (nextTerminalPath: DisplayPoint[], nextInternalPath: DisplayPoint[]) => {
    const nextEdges = edges.map((edge, edgeIndex) => {
      if (edgeIndex === terminalSegment.edgeIndex) return withDisplayComputedPath(edge, nextTerminalPath);
      if (edgeIndex === internalSegment.edgeIndex) return withDisplayComputedPath(edge, nextInternalPath);
      return edge;
    }) as T;
    candidates.push(nextEdges);
  };

  if (terminalSegment.axis === 'v' && internalSegment.axis === 'h') {
    const internalEndYValues = [
      internalPath[internalPath.length - 1]?.y,
      internalPath[0]?.y,
      internalPath[internalSegment.segmentIndex + 2]?.y,
      internalPath[internalSegment.segmentIndex - 1]?.y,
    ].filter((value): value is number => Number.isFinite(value));
    const shiftedInternalPaths = sortedUniqueNumbers(internalEndYValues, internalSegment.a.y)
      .slice(0, 4)
      .map(laneY => shiftDisplayInternalSegment(internalPath, internalSegment.segmentIndex, 'h', laneY))
      .filter((path): path is DisplayPoint[] => path !== null);
    if (shiftedInternalPaths.length === 0) return [];

    const horizontalMinX = Math.min(internalSegment.a.x, internalSegment.b.x);
    const horizontalMaxX = Math.max(internalSegment.a.x, internalSegment.b.x);
    const terminalVerticalIndices = terminalPath
      .map((point, index) => ({ index, point }))
      .slice(0, -1)
      .filter(({ index }) => index > 0 && index < terminalPath.length - 2)
      .filter(({ index }) => displayAxisOf(terminalPath[index], terminalPath[index + 1]) === 'v')
      .map(({ index }) => index);
    const preferredTerminalIndex = terminalAtStart
      ? terminalVerticalIndices[0]
      : terminalVerticalIndices[terminalVerticalIndices.length - 1];
    if (preferredTerminalIndex === undefined) return [];
    const laneXValues = sortedUniqueNumbers([
      horizontalMinX - MIN_DISPLAY_ENDPOINT_STUB,
      horizontalMinX - RESIDUAL_PARALLEL_LANE_GAP,
      horizontalMinX - RESIDUAL_PARALLEL_LANE_GAP * 2,
      horizontalMaxX + MIN_DISPLAY_ENDPOINT_STUB,
      horizontalMaxX + RESIDUAL_PARALLEL_LANE_GAP,
      horizontalMaxX + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], terminalPath[preferredTerminalIndex].x);
    const shiftedTerminalPaths = laneXValues
      .slice(0, 8)
      .map(laneX => shiftDisplayInternalSegment(terminalPath, preferredTerminalIndex, 'v', laneX))
      .filter((path): path is DisplayPoint[] => path !== null);
    for (const nextInternalPath of shiftedInternalPaths) {
      for (const nextTerminalPath of shiftedTerminalPaths) {
        appendCandidate(nextTerminalPath, nextInternalPath);
      }
    }
    return candidates;
  }

  if (terminalSegment.axis === 'h' && internalSegment.axis === 'v') {
    const internalEndXValues = [
      internalPath[internalPath.length - 1]?.x,
      internalPath[0]?.x,
      internalPath[internalSegment.segmentIndex + 2]?.x,
      internalPath[internalSegment.segmentIndex - 1]?.x,
    ].filter((value): value is number => Number.isFinite(value));
    const shiftedInternalPaths = sortedUniqueNumbers(internalEndXValues, internalSegment.a.x)
      .slice(0, 4)
      .map(laneX => shiftDisplayInternalSegment(internalPath, internalSegment.segmentIndex, 'v', laneX))
      .filter((path): path is DisplayPoint[] => path !== null);
    if (shiftedInternalPaths.length === 0) return [];

    const verticalMinY = Math.min(internalSegment.a.y, internalSegment.b.y);
    const verticalMaxY = Math.max(internalSegment.a.y, internalSegment.b.y);
    const terminalHorizontalIndices = terminalPath
      .map((point, index) => ({ index, point }))
      .slice(0, -1)
      .filter(({ index }) => index > 0 && index < terminalPath.length - 2)
      .filter(({ index }) => displayAxisOf(terminalPath[index], terminalPath[index + 1]) === 'h')
      .map(({ index }) => index);
    const preferredTerminalIndex = terminalAtStart
      ? terminalHorizontalIndices[0]
      : terminalHorizontalIndices[terminalHorizontalIndices.length - 1];
    if (preferredTerminalIndex === undefined) return [];
    const laneYValues = sortedUniqueNumbers([
      verticalMinY - MIN_DISPLAY_ENDPOINT_STUB,
      verticalMinY - RESIDUAL_PARALLEL_LANE_GAP,
      verticalMinY - RESIDUAL_PARALLEL_LANE_GAP * 2,
      verticalMaxY + MIN_DISPLAY_ENDPOINT_STUB,
      verticalMaxY + RESIDUAL_PARALLEL_LANE_GAP,
      verticalMaxY + RESIDUAL_PARALLEL_LANE_GAP * 2,
    ], terminalPath[preferredTerminalIndex].y);
    const shiftedTerminalPaths = laneYValues
      .slice(0, 8)
      .map(laneY => shiftDisplayInternalSegment(terminalPath, preferredTerminalIndex, 'h', laneY))
      .filter((path): path is DisplayPoint[] => path !== null);
    for (const nextInternalPath of shiftedInternalPaths) {
      for (const nextTerminalPath of shiftedTerminalPaths) {
        appendCandidate(nextTerminalPath, nextInternalPath);
      }
    }
  }

  return candidates;
};

export const repairFinalResidualStrictCrossings = <T extends Edge[]>(edges: T, nodes: Node[]): T => {
  let current = edges;
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  for (let pass = 0; pass < 4; pass += 1) {
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineDisplayStrict = displayStrictCrossingsFromKnownQuality(current, baselineQuality);
    if (baselineDisplayStrict === 0 && baselineQuality.strictCrossings === 0) break;
    const baselineObstacleHits = obstacleContext.evaluate(current);
    const terminalStubCleaned = repairTerminalEndpointStrictCrossingStubs(current, nodes) as T;
    if (
      terminalStubCleaned !== current
      && changedDisplayTerminalsRemainAnchored(current, terminalStubCleaned, terminalValidation)
    ) {
      const terminalQuality = evaluateDisplayQualityCandidate(qualityContext, current, terminalStubCleaned);
      const terminalDisplayStrict = countDisplayStrictCrossings(terminalStubCleaned);
      const terminalObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, current, terminalStubCleaned);
      if (
        terminalObstacleHits <= baselineObstacleHits
        && displayStrictRepairHardQualityIsAcceptable(baselineQuality, terminalQuality)
        && (
          terminalQuality.strictCrossings < baselineQuality.strictCrossings
          || terminalDisplayStrict < baselineDisplayStrict
        )
      ) {
        current = terminalStubCleaned;
        continue;
      }
    }
    const hits = findDisplayStrictCrossingHits(current).slice(0, 6);
    if (hits.length === 0) break;

    let best = current;
    let bestQuality = baselineQuality;
    let bestDisplayStrict = baselineDisplayStrict;
    let bestObstacleHits = baselineObstacleHits;
    let bestScore = obstacleRepairScore(baselineQuality, baselineObstacleHits);
    let transientObstacleCandidate: T | null = null;
    let transientObstacleHits = Number.POSITIVE_INFINITY;
    let transientObstacleScore = Number.POSITIVE_INFINITY;
    const considerTransientObstacleCandidate = (
      candidateEdges: T,
      candidateQuality: ReturnType<typeof qualityContext.evaluate>,
      candidateDisplayStrict: number,
      candidateObstacleHits: number,
    ) => {
      if (candidateQuality.strictCrossings !== 0 || candidateDisplayStrict !== 0) return;
      if (candidateObstacleHits !== baselineObstacleHits + 1) return;
      if (!visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)) return;
      const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
      if (
        candidateObstacleHits < transientObstacleHits
        || (
          candidateObstacleHits === transientObstacleHits
          && candidateScore < transientObstacleScore - 1
        )
      ) {
        transientObstacleCandidate = candidateEdges;
        transientObstacleHits = candidateObstacleHits;
        transientObstacleScore = candidateScore;
      }
    };
    const currentSegments = extractDisplaySegments(current);
    for (const hit of hits) {
      for (const [segment, other] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
        const path = getDisplayComputedPath(current[segment.edgeIndex]);
        if (path.length < 4) continue;
        const terminalCandidatePaths = buildTerminalStrictStubPaths(
          path,
          { ...segment, segIdx: segment.segmentIndex },
          other,
          current[segment.edgeIndex],
          currentSegments.filter(item => item.edgeIndex !== segment.edgeIndex),
        );
        for (const candidatePath of terminalCandidatePaths) {
          const candidateEdges = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          if (!changedDisplayTerminalsRemainAnchored(current, candidateEdges, terminalValidation)) continue;
          const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [segment.edgeIndex]);
          const candidateDisplayStrict = displayStrictCrossingsFromKnownQuality(
            candidateEdges,
            candidateQuality,
          );
          const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [segment.edgeIndex]);
          if (
            candidateQuality.strictCrossings >= bestQuality.strictCrossings
            && candidateDisplayStrict >= bestDisplayStrict
          ) continue;
          if (!displayStrictRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)) continue;
          if (candidateObstacleHits > baselineObstacleHits) continue;
          const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
          if (
            candidateQuality.strictCrossings < bestQuality.strictCrossings
            || candidateDisplayStrict < bestDisplayStrict
            || candidateObstacleHits < bestObstacleHits
            || candidateScore < bestScore - 1
          ) {
            best = candidateEdges;
            bestQuality = candidateQuality;
            bestDisplayStrict = candidateDisplayStrict;
            bestObstacleHits = candidateObstacleHits;
            bestScore = candidateScore;
          }
        }
      }

      const pairedCandidates = [
        ...buildPairedTerminalStrictCandidates(current, hit.a, hit.b),
        ...buildPairedTerminalStrictCandidates(current, hit.b, hit.a),
        ...buildCrossingCompanionOuterPortVariants(current, hit.a, hit.b, nodes),
        ...buildCrossingCompanionOuterPortVariants(current, hit.b, hit.a, nodes),
      ];
      for (const candidateEdges of pairedCandidates) {
        if (!changedDisplayTerminalsRemainAnchored(current, candidateEdges, terminalValidation)) continue;
        const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, current, candidateEdges);
        const candidateDisplayStrict = countDisplayStrictCrossings(candidateEdges);
        const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, current, candidateEdges);
        if (
          candidateQuality.strictCrossings >= bestQuality.strictCrossings
          && candidateDisplayStrict >= bestDisplayStrict
        ) continue;
        if (!displayStrictRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)) continue;
        if (candidateObstacleHits > baselineObstacleHits) {
          considerTransientObstacleCandidate(
            candidateEdges,
            candidateQuality,
            candidateDisplayStrict,
            candidateObstacleHits,
          );
          continue;
        }
        const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
        if (
          candidateQuality.strictCrossings < bestQuality.strictCrossings
          || candidateDisplayStrict < bestDisplayStrict
          || candidateObstacleHits < bestObstacleHits
          || candidateScore < bestScore - 1
        ) {
          best = candidateEdges;
          bestQuality = candidateQuality;
          bestDisplayStrict = candidateDisplayStrict;
          bestObstacleHits = candidateObstacleHits;
          bestScore = candidateScore;
        }
      }

      for (const [segment, other] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
        const path = getDisplayComputedPath(current[segment.edgeIndex]);
        if (path.length < 4) continue;
        if (segment.segmentIndex <= 0 || segment.segmentIndex >= path.length - 2) continue;
        const otherPath = getDisplayComputedPath(current[other.edgeIndex]);
        const otherAdjacentHorizontalXValues = [other.segmentIndex - 1, other.segmentIndex + 1]
          .flatMap((index) => {
            const start = otherPath[index];
            const end = otherPath[index + 1];
            return start && end && displayAxisOf(start, end) === 'h' ? [start.x, end.x] : [];
          });
        const otherAdjacentVerticalYValues = [other.segmentIndex - 1, other.segmentIndex + 1]
          .flatMap((index) => {
            const start = otherPath[index];
            const end = otherPath[index + 1];
            return start && end && displayAxisOf(start, end) === 'v' ? [start.y, end.y] : [];
          });
        const previousAxis = displayAxisOf(path[segment.segmentIndex - 1], path[segment.segmentIndex]);
        const nextAxis = displayAxisOf(path[segment.segmentIndex + 1], path[segment.segmentIndex + 2]);
        const terminalAnchorLaneValues = segment.axis === 'h'
          ? [
            ...(previousAxis === 'v' && segment.segmentIndex <= 2 ? [path[0]?.x] : []),
            ...(nextAxis === 'v' && segment.segmentIndex >= path.length - 3 ? [path[path.length - 1]?.x] : []),
          ].filter((value): value is number => Number.isFinite(value))
          : [
            ...(previousAxis === 'h' && segment.segmentIndex <= 2 ? [path[0]?.y] : []),
            ...(nextAxis === 'h' && segment.segmentIndex >= path.length - 3 ? [path[path.length - 1]?.y] : []),
          ].filter((value): value is number => Number.isFinite(value));
        const fallbackAdjacentLaneValues = segment.axis === 'h'
          ? [
            ...terminalAnchorLaneValues,
            other.a.x + MIN_DISPLAY_ENDPOINT_STUB,
            other.a.x + RESIDUAL_PARALLEL_LANE_GAP,
            other.a.x + RESIDUAL_PARALLEL_LANE_GAP * 2,
            other.a.x - MIN_DISPLAY_ENDPOINT_STUB,
            other.a.x - RESIDUAL_PARALLEL_LANE_GAP,
            other.a.x - RESIDUAL_PARALLEL_LANE_GAP * 2,
            ...(otherAdjacentHorizontalXValues.length > 0 ? [
              Math.min(...otherAdjacentHorizontalXValues) - MIN_DISPLAY_ENDPOINT_STUB,
              Math.max(...otherAdjacentHorizontalXValues) + MIN_DISPLAY_ENDPOINT_STUB,
              Math.min(...otherAdjacentHorizontalXValues) - RESIDUAL_PARALLEL_LANE_GAP * 2,
              Math.max(...otherAdjacentHorizontalXValues) + RESIDUAL_PARALLEL_LANE_GAP * 2,
            ] : []),
          ]
          : [
            ...terminalAnchorLaneValues,
            other.a.y + MIN_DISPLAY_ENDPOINT_STUB,
            other.a.y + RESIDUAL_PARALLEL_LANE_GAP,
            other.a.y + RESIDUAL_PARALLEL_LANE_GAP * 2,
            other.a.y - MIN_DISPLAY_ENDPOINT_STUB,
            other.a.y - RESIDUAL_PARALLEL_LANE_GAP,
            other.a.y - RESIDUAL_PARALLEL_LANE_GAP * 2,
            ...(otherAdjacentVerticalYValues.length > 0 ? [
              Math.min(...otherAdjacentVerticalYValues) - MIN_DISPLAY_ENDPOINT_STUB,
              Math.max(...otherAdjacentVerticalYValues) + MIN_DISPLAY_ENDPOINT_STUB,
              Math.min(...otherAdjacentVerticalYValues) - RESIDUAL_PARALLEL_LANE_GAP * 2,
              Math.max(...otherAdjacentVerticalYValues) + RESIDUAL_PARALLEL_LANE_GAP * 2,
            ] : []),
          ];
        const adjacentCandidates = [
          ...buildTerminalCapDetourCandidates(
            path,
            segment,
            otherPath,
            other,
            current[other.edgeIndex],
            nodes,
          ),
          ...buildStrictEndpointDetourCandidates(path, segment, other),
          ...buildNodeBoundaryAdjacentLaneCandidates(
            path,
            segment.segmentIndex,
            segment.axis,
            nodes,
            other.axis === 'v' ? other.a.x : other.a.y,
            fallbackAdjacentLaneValues,
          ),
        ];
        for (const candidatePath of adjacentCandidates) {
          if (candidatePath.length < 2 || !candidatePath.every(isFinitePoint)) continue;
          const candidateEdges = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          if (!changedDisplayTerminalsRemainAnchored(current, candidateEdges, terminalValidation)) continue;
          const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [segment.edgeIndex]);
          const candidateDisplayStrict = displayStrictCrossingsFromKnownQuality(
            candidateEdges,
            candidateQuality,
          );
          if (
            candidateQuality.strictCrossings >= bestQuality.strictCrossings
            && candidateDisplayStrict >= bestDisplayStrict
          ) continue;
          if (!visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
          const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [segment.edgeIndex]);
          if (candidateObstacleHits > baselineObstacleHits) {
            considerTransientObstacleCandidate(
              candidateEdges,
              candidateQuality,
              candidateDisplayStrict,
              candidateObstacleHits,
            );
            continue;
          }
          const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
          if (
            candidateQuality.strictCrossings < bestQuality.strictCrossings
            || candidateDisplayStrict < bestDisplayStrict
            || candidateObstacleHits < bestObstacleHits
            || candidateScore < bestScore - 1
          ) {
            best = candidateEdges;
            bestQuality = candidateQuality;
            bestDisplayStrict = candidateDisplayStrict;
            bestObstacleHits = candidateObstacleHits;
            bestScore = candidateScore;
          }
        }
        const laneValues = segment.axis === 'h'
          ? sortedUniqueNumbers([
            Math.max(other.a.y, other.b.y) + OBSTACLE_REPAIR_NODE_PADDING,
            Math.max(other.a.y, other.b.y) + RESIDUAL_PARALLEL_LANE_GAP,
            Math.min(other.a.y, other.b.y) - OBSTACLE_REPAIR_NODE_PADDING,
            Math.min(other.a.y, other.b.y) - RESIDUAL_PARALLEL_LANE_GAP,
            Math.max(other.a.y, other.b.y) + MIN_DISPLAY_ENDPOINT_STUB,
            Math.min(other.a.y, other.b.y) - MIN_DISPLAY_ENDPOINT_STUB,
          ], segment.a.y)
          : sortedUniqueNumbers([
            Math.max(other.a.x, other.b.x) + OBSTACLE_REPAIR_NODE_PADDING,
            Math.max(other.a.x, other.b.x) + RESIDUAL_PARALLEL_LANE_GAP,
            Math.min(other.a.x, other.b.x) - OBSTACLE_REPAIR_NODE_PADDING,
            Math.min(other.a.x, other.b.x) - RESIDUAL_PARALLEL_LANE_GAP,
            Math.max(other.a.x, other.b.x) + MIN_DISPLAY_ENDPOINT_STUB,
            Math.min(other.a.x, other.b.x) - MIN_DISPLAY_ENDPOINT_STUB,
          ], segment.a.x);

        for (const laneValue of laneValues.slice(0, 8)) {
          const candidatePath = shiftDisplayInternalSegment(
            path,
            segment.segmentIndex,
            segment.axis,
            laneValue,
          );
          if (!candidatePath) continue;
          const candidateEdges = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          if (!changedDisplayTerminalsRemainAnchored(current, candidateEdges, terminalValidation)) continue;
          const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [segment.edgeIndex]);
          const candidateDisplayStrict = displayStrictCrossingsFromKnownQuality(
            candidateEdges,
            candidateQuality,
          );
          if (
            candidateQuality.strictCrossings >= bestQuality.strictCrossings
            && candidateDisplayStrict >= bestDisplayStrict
          ) continue;
          if (candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments) continue;
          if (candidateQuality.reverseOverlap > baselineQuality.reverseOverlap + DISPLAY_STRICT_REPAIR_OVERLAP_SLACK) continue;
          if (candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap + DISPLAY_STRICT_REPAIR_OVERLAP_SLACK) continue;
          if (candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap + DISPLAY_STRICT_REPAIR_OVERLAP_SLACK) continue;
          if (candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs) continue;
          if (candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs + 1) continue;
          if (candidateQuality.hairpins > baselineQuality.hairpins + 1) continue;
          const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [segment.edgeIndex]);
          if (candidateObstacleHits > baselineObstacleHits) continue;
          const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
          if (
            candidateQuality.strictCrossings < bestQuality.strictCrossings
            || candidateDisplayStrict < bestDisplayStrict
            || candidateObstacleHits < bestObstacleHits
            || candidateScore < bestScore - 1
          ) {
            best = candidateEdges;
            bestQuality = candidateQuality;
            bestDisplayStrict = candidateDisplayStrict;
            bestObstacleHits = candidateObstacleHits;
            bestScore = candidateScore;
          }
        }
      }
    }

    if (best === current) {
      const loopEdgeIndexes = [...new Set(hits.flatMap(hit => [hit.a.edgeIndex, hit.b.edgeIndex]))]
        .slice(0, 4);
      let loopEvaluations = 0;
      for (const edgeIndex of loopEdgeIndexes) {
        const path = getDisplayComputedPath(current[edgeIndex]);
        for (const candidatePath of buildStrictLoopShortcutCandidates(path, 12)) {
          if (loopEvaluations >= 32) break;
          loopEvaluations += 1;
          const candidateEdges = current.map((edge, index) => (
            index === edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          if (!changedDisplayTerminalsRemainAnchored(current, candidateEdges, terminalValidation)) continue;
          const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
          const candidateDisplayStrict = displayStrictCrossingsFromKnownQuality(
            candidateEdges,
            candidateQuality,
          );
          if (
            candidateQuality.strictCrossings >= bestQuality.strictCrossings
            && candidateDisplayStrict >= bestDisplayStrict
          ) continue;
          if (!visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
          const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [edgeIndex]);
          if (candidateObstacleHits > baselineObstacleHits) {
            considerTransientObstacleCandidate(
              candidateEdges,
              candidateQuality,
              candidateDisplayStrict,
              candidateObstacleHits,
            );
            continue;
          }
          const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
          if (
            candidateQuality.strictCrossings < bestQuality.strictCrossings
            || candidateDisplayStrict < bestDisplayStrict
            || candidateObstacleHits < bestObstacleHits
            || candidateScore < bestScore - 1
          ) {
            best = candidateEdges;
            bestQuality = candidateQuality;
            bestDisplayStrict = candidateDisplayStrict;
            bestObstacleHits = candidateObstacleHits;
            bestScore = candidateScore;
          }
        }
      }
    }

    if (best === current && transientObstacleCandidate) {
      const obstacleCleaned = repairDisplayObstacleHits(
        transientObstacleCandidate,
        nodes,
        String((current[0]?.data as any)?.layoutDirection || 'TB'),
        {
          maxEdges: 1,
          maxCandidatesPerEdge: 40,
          maxQualityEvaluations: 56,
          skipOuterFallback: true,
        },
      ) as T;
      if (
        obstacleCleaned !== transientObstacleCandidate
        && changedDisplayTerminalsRemainAnchored(current, obstacleCleaned, terminalValidation)
      ) {
        const obstacleCleanedQuality = evaluateDisplayQualityCandidate(
          qualityContext,
          current,
          obstacleCleaned,
        );
        const obstacleCleanedDisplayStrict = countDisplayStrictCrossings(obstacleCleaned);
        const obstacleCleanedHits = evaluateDisplayObstacleCandidate(
          obstacleContext,
          current,
          obstacleCleaned,
        );
        if (
          obstacleCleanedHits <= baselineObstacleHits
          && obstacleCleanedQuality.strictCrossings < baselineQuality.strictCrossings
          && obstacleCleanedDisplayStrict < baselineDisplayStrict
          && visualPolishHardQualityDoesNotRegress(baselineQuality, obstacleCleanedQuality)
        ) {
          best = obstacleCleaned;
        }
      }
    }

    if (best === current) {
      const strictBypassCandidate = repairEndpointOrthogonalPaths(
        repairStrictBypassesIfNeeded(current, nodes),
        nodes,
      ) as T;
      const strictBypassQuality = evaluateDisplayQualityCandidate(qualityContext, current, strictBypassCandidate);
      const strictBypassDisplayStrict = countDisplayStrictCrossings(strictBypassCandidate);
      const strictBypassObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, current, strictBypassCandidate);
      if (
        changedDisplayTerminalsRemainAnchored(current, strictBypassCandidate, terminalValidation)
        &&
        strictBypassObstacleHits <= baselineObstacleHits
        && displayStrictRepairHardQualityIsAcceptable(baselineQuality, strictBypassQuality)
        && (
          strictBypassQuality.strictCrossings < baselineQuality.strictCrossings
          || strictBypassDisplayStrict < baselineDisplayStrict
        )
      ) {
        best = strictBypassCandidate;
      }
    }

    if (best === current && current.length <= 24 && baselineQuality.strictCrossings > 0) {
      const clusterCandidate = repairBoundedMultiEdgeResidualStrictCrossings(current, nodes) as T;
      if (
        clusterCandidate !== current
        && changedDisplayTerminalsRemainAnchored(current, clusterCandidate, terminalValidation)
      ) {
        const clusterQuality = evaluateDisplayQualityCandidate(qualityContext, current, clusterCandidate);
        const clusterObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, current, clusterCandidate);
        if (
          clusterQuality.strictCrossings < baselineQuality.strictCrossings
          && clusterObstacleHits <= baselineObstacleHits
          && displayStrictRepairHardQualityIsAcceptable(baselineQuality, clusterQuality)
        ) {
          best = clusterCandidate;
        }
      }
    }

    if (best === current) break;
    current = best;
  }
  return current;
};
