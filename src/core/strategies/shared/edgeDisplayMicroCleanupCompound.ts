import type { Edge } from '@xyflow/react';

import {
  type EdgePathQualityEvaluationContext,
  type EdgePathQualityEvaluationState,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';
import { calculateSingleEdgeQuality } from './edgePathQualityGeometry';
import {
  COMPOUND_CLEARANCES,
  EPS,
  buildShiftedSegmentPath,
  compactPath,
  getEdgePath,
  hasSameEndpoints,
  strictCrossingPairsForEdge,
  withComputedPath,
  type Point,
} from './edgeDisplayMicroCleanupGeometry';
import {
  displayMicroCleanupSafetyDoesNotRegress,
  type DisplayMicroCleanupSafetyContext,
  type DisplayMicroCleanupSafetyScore,
} from './edgeDisplayMicroCleanupTypes';

const qualityAllowsCompoundMicroCleanup = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => {
  if (candidate.nonOrthogonalSegments > baseline.nonOrthogonalSegments) return false;
  if (candidate.strictCrossings > baseline.strictCrossings) return false;
  if (candidate.reverseOverlap > baseline.reverseOverlap) return false;
  if (candidate.unrelatedOverlap > baseline.unrelatedOverlap) return false;
  if (candidate.unexplainedRelatedOverlap > baseline.unexplainedRelatedOverlap) return false;
  if (candidate.shortEndpointStubs > baseline.shortEndpointStubs) return false;
  if (candidate.tinyInteriorDoglegs > baseline.tinyInteriorDoglegs) return false;
  if (candidate.hairpins > baseline.hairpins) return false;
  return candidate.strictCrossings < baseline.strictCrossings
    || candidate.shortEndpointStubs < baseline.shortEndpointStubs
    || candidate.tinyInteriorDoglegs < baseline.tinyInteriorDoglegs
    || candidate.hairpins < baseline.hairpins
    || (
      candidate.bends < baseline.bends
      && candidate.totalLength <= baseline.totalLength + EPS
      && candidate.detourPenalty <= baseline.detourPenalty
    )
    || (
      candidate.bends <= baseline.bends
      && candidate.detourPenalty < baseline.detourPenalty
      && candidate.totalLength <= baseline.totalLength - 80
    );
};

export const compoundShiftCanMeetLocalQualityBounds = (
  baseline: EdgePathQualityScore,
  current: EdgePathQualityScore,
  currentPeerPath: Point[],
  shiftedPeerPath: Point[],
): boolean => {
  const before = calculateSingleEdgeQuality(currentPeerPath);
  const after = calculateSingleEdgeQuality(shiftedPeerPath);
  const boundedKeys = [
    'nonOrthogonalSegments',
    'shortEndpointStubs',
    'tinyInteriorDoglegs',
    'hairpins',
  ] as const;
  return boundedKeys.every(key => current[key] - before[key] + after[key] <= baseline[key]);
};

export const buildCompoundStrictCrossingCleanup = ({
  baselineQuality,
  baselineSafety,
  changedEdgeIndex,
  changedEdges,
  changedQuality,
  changedQualityState,
  changedSafety,
  cumulativeChangedIndexes = [changedEdgeIndex],
  qualityContext,
  safetyContext,
}: Readonly<{
  baselineQuality: EdgePathQualityScore;
  baselineSafety?: DisplayMicroCleanupSafetyScore;
  changedEdgeIndex: number;
  changedEdges: Edge[];
  changedQuality: EdgePathQualityScore;
  changedQualityState: EdgePathQualityEvaluationState;
  changedSafety?: DisplayMicroCleanupSafetyScore;
  cumulativeChangedIndexes?: readonly number[];
  qualityContext: EdgePathQualityEvaluationContext;
  safetyContext?: DisplayMicroCleanupSafetyContext;
}>): {
  edges: Edge[];
  quality: EdgePathQualityScore;
  safety?: DisplayMicroCleanupSafetyScore;
  changedIndexes: readonly number[];
} | null => {
  if (
    safetyContext
    && baselineSafety
    && (
      !changedSafety
      || !displayMicroCleanupSafetyDoesNotRegress(baselineSafety, changedSafety)
    )
  ) return null;
  if (qualityAllowsCompoundMicroCleanup(baselineQuality, changedQuality)) {
    return {
      edges: changedEdges,
      quality: changedQuality,
      safety: changedSafety,
      changedIndexes: cumulativeChangedIndexes,
    };
  }
  if (
    changedQuality.shortEndpointStubs >= baselineQuality.shortEndpointStubs
    && changedQuality.tinyInteriorDoglegs >= baselineQuality.tinyInteriorDoglegs
    && changedQuality.hairpins >= baselineQuality.hairpins
  ) return null;

  let beam: Array<{
    edges: Edge[];
    quality: EdgePathQualityScore;
    qualityState: EdgePathQualityEvaluationState;
    safety?: DisplayMicroCleanupSafetyScore;
    changedIndexes: readonly number[];
  }> = [{
    edges: changedEdges,
    quality: changedQuality,
    qualityState: changedQualityState,
    safety: changedSafety,
    changedIndexes: cumulativeChangedIndexes,
  }];

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const nextBeam: typeof beam = [];
    let progressed = false;
    for (const state of beam) {
      const crossings = strictCrossingPairsForEdge(state.edges, changedEdgeIndex).slice(0, 4);
      if (crossings.length === 0) {
        if (qualityAllowsCompoundMicroCleanup(baselineQuality, state.quality)) return state;
        nextBeam.push(state);
        continue;
      }

      const crossing = crossings[0];
      const changedSegment = crossing.changed;
      const otherSegment = crossing.other;
      const otherPath = compactPath(getEdgePath(state.edges[otherSegment.edgeIndex]));
      const lanes = changedSegment.axis === 'h'
        ? COMPOUND_CLEARANCES.flatMap(clearance => [
          Math.min(changedSegment.a.x, changedSegment.b.x) - clearance,
          Math.max(changedSegment.a.x, changedSegment.b.x) + clearance,
        ])
        : COMPOUND_CLEARANCES.flatMap(clearance => [
          Math.min(changedSegment.a.y, changedSegment.b.y) - clearance,
          Math.max(changedSegment.a.y, changedSegment.b.y) + clearance,
        ]);

      for (const lane of lanes) {
        const shiftedPath = buildShiftedSegmentPath(otherPath, otherSegment.segmentIndex, lane);
        if (!shiftedPath || !hasSameEndpoints(otherPath, shiftedPath)) continue;
        if (!compoundShiftCanMeetLocalQualityBounds(
          baselineQuality,
          state.quality,
          otherPath,
          shiftedPath,
        )) continue;
        const shiftedEdges = state.edges.map((edge, edgeIndex) => (
          edgeIndex === otherSegment.edgeIndex ? withComputedPath(edge, shiftedPath) : edge
        ));
        const shiftedQualityState = qualityContext.evaluateStateChanged(
          state.qualityState,
          shiftedEdges,
          [otherSegment.edgeIndex],
        );
        const shiftedQuality = shiftedQualityState.score;
        if (shiftedQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments) continue;
        if (shiftedQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs) continue;
        if (shiftedQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs) continue;
        if (shiftedQuality.hairpins > baselineQuality.hairpins) continue;
        const shiftedChangedIndexes = state.changedIndexes.includes(otherSegment.edgeIndex)
          ? state.changedIndexes
          : [...state.changedIndexes, otherSegment.edgeIndex];
        const shiftedSafety = safetyContext?.evaluate(shiftedEdges, shiftedChangedIndexes);
        if (
          safetyContext
          && baselineSafety
          && (
            !shiftedSafety
            || !displayMicroCleanupSafetyDoesNotRegress(baselineSafety, shiftedSafety)
          )
        ) continue;
        nextBeam.push({
          edges: shiftedEdges,
          quality: shiftedQuality,
          qualityState: shiftedQualityState,
          safety: shiftedSafety,
          changedIndexes: shiftedChangedIndexes,
        });
        progressed = true;
      }
    }

    beam = nextBeam
      .sort((first, second) => (
        first.quality.strictCrossings - second.quality.strictCrossings
        || first.quality.shortEndpointStubs - second.quality.shortEndpointStubs
        || first.quality.tinyInteriorDoglegs - second.quality.tinyInteriorDoglegs
        || first.quality.hairpins - second.quality.hairpins
        || first.quality.bends - second.quality.bends
        || first.quality.totalLength - second.quality.totalLength
      ))
      .slice(0, 8);
    const accepted = beam.find(state => (
      qualityAllowsCompoundMicroCleanup(baselineQuality, state.quality)
    ));
    if (accepted) return accepted;
    if (!progressed || beam.length === 0) break;
  }
  return null;
};
