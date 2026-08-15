import type { Edge } from '@xyflow/react';

import {
  displayPathLength,
  getDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

const MAX_COMMERCIAL_EDGE_DETOUR_RATIO = 2.6;
const COMMERCIAL_EDGE_DETOUR_RATIO_REGRESSION_MARGIN = 0.25;
const COMMERCIAL_EDGE_DETOUR_LENGTH_REGRESSION_MARGIN = 96;

const edgeDetourMetrics = (edge: Edge): Readonly<{
  length: number;
  ratio: number;
}> | null => {
  const path = getDisplayComputedPath(edge);
  if (path.length < 2) return null;
  const first = path[0];
  const last = path[path.length - 1];
  const direct = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
  if (!Number.isFinite(direct) || direct <= 0) return null;
  const length = displayPathLength(path);
  return Number.isFinite(length) ? { length, ratio: length / direct } : null;
};

/**
 * A graph-level polish transaction must not make one edge absorb the entire
 * cost of improving another. Small bounded increases remain legal because
 * endpoint separation and obstacle skirts require routing slack.
 */
export const commercialEdgeDetoursDoNotRegress = (
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
  changedEdgeIndexes: readonly number[],
): boolean => changedEdgeIndexes.every((index) => {
  const baseline = baselineEdges[index];
  const candidate = candidateEdges[index];
  if (!baseline || !candidate || baseline.id !== candidate.id) return false;
  const baselineMetrics = edgeDetourMetrics(baseline);
  const candidateMetrics = edgeDetourMetrics(candidate);
  if (!baselineMetrics || !candidateMetrics) return true;
  const allowedRatio = Math.max(
    MAX_COMMERCIAL_EDGE_DETOUR_RATIO,
    baselineMetrics.ratio + COMMERCIAL_EDGE_DETOUR_RATIO_REGRESSION_MARGIN,
  );
  return candidateMetrics.ratio <= allowedRatio
    || candidateMetrics.length
      <= baselineMetrics.length + COMMERCIAL_EDGE_DETOUR_LENGTH_REGRESSION_MARGIN;
});
