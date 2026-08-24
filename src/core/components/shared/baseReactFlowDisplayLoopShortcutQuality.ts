import type { Edge } from '@xyflow/react';

import type { EdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  displayPathLength,
  getDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

export type DisplayLoopShortcutRepairDiagnostics = {
  candidateEdgeCount: number;
  qualityEvaluationCount: number;
};

export const createDisplayLoopShortcutRepairDiagnostics = (
): DisplayLoopShortcutRepairDiagnostics => ({
  candidateEdgeCount: 0,
  qualityEvaluationCount: 0,
});

export const hardLoopDefectsDoNotRegress = (
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

const commercialDetourDefectScore = (edges: readonly Edge[]): number => edges.reduce(
  (score, edge) => {
    const path = getDisplayComputedPath(edge);
    if (path.length < 4) return score;
    const first = path[0];
    const last = path[path.length - 1];
    const direct = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
    const length = displayPathLength(path);
    if (direct <= 0 || length - direct < 96 || length / direct <= 1.25) return score;
    return score + 1_000_000 + Math.max(0, length - direct * 1.25) * 100;
  },
  0,
);

export const hasCommerciallyExcessiveDetour = (edges: readonly Edge[]): boolean => edges.some((edge) => {
  const path = getDisplayComputedPath(edge);
  if (path.length < 4) return false;
  const first = path[0];
  const last = path[path.length - 1];
  const direct = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
  const length = displayPathLength(path);
  return direct > 0 && length - direct >= 96 && length / direct > 1.25;
});

export const loopDefectScore = (
  quality: EdgePathQualityScore,
  edges: readonly Edge[],
): number => (
  quality.nonOrthogonalSegments * 1_000_000_000
  + quality.strictCrossings * 100_000_000
  + quality.hairpins * 10_000_000
  + quality.reverseOverlap * 10_000
  + quality.unrelatedOverlap * 10_000
  + quality.unexplainedRelatedOverlap * 10_000
  + quality.shortEndpointStubs * 1_000_000
  + quality.tinyInteriorDoglegs * 500_000
  + commercialDetourDefectScore(edges)
  + quality.detourPenalty * 10
  + quality.totalLength * 0.01
);
