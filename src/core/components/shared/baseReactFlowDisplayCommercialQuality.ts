import type { Edge } from '@xyflow/react';

import {
  getDisplayComputedPath,
  segmentDisplayLength,
} from './baseReactFlowDisplayGeometry';

const MIN_COMMERCIAL_INTERIOR_SEGMENT = 12;
const MAX_COMMERCIAL_BEND_COUNT = 12;

export type DisplayCommercialQualityIssueKind =
  | 'invalid-path'
  | 'tiny-interior-segment'
  | 'excessive-bends';

export type DisplayCommercialQualityIssue = Readonly<{
  edgeId: string;
  kind: DisplayCommercialQualityIssueKind;
  value: number;
  limit: number;
}>;

/**
 * A trusted external candidate also needs a topology-independent structural
 * contract. Route length and endpoint-envelope overshoot are intentionally not
 * hard failures: a crossing-free orthogonal graph can require an outer lane
 * when existing trunks form a separator. Those metrics need a graph-aware
 * alternative candidate, while micro segments and pathological bend chains
 * are unambiguously rejectable from the path alone.
 */
export const auditBaseReactFlowDisplayCommercialQuality = (
  edges: readonly Edge[],
): DisplayCommercialQualityIssue[] => {
  const issues: DisplayCommercialQualityIssue[] = [];
  for (const edge of edges) {
    const path = getDisplayComputedPath(edge);
    if (path.length < 2) {
      issues.push({ edgeId: edge.id, kind: 'invalid-path', value: path.length, limit: 2 });
      continue;
    }

    const bendCount = Math.max(0, path.length - 2);
    if (bendCount > MAX_COMMERCIAL_BEND_COUNT) {
      issues.push({
        edgeId: edge.id,
        kind: 'excessive-bends',
        value: bendCount,
        limit: MAX_COMMERCIAL_BEND_COUNT,
      });
    }

    for (let segmentIndex = 1; segmentIndex < path.length - 2; segmentIndex += 1) {
      const length = segmentDisplayLength(path[segmentIndex], path[segmentIndex + 1]);
      if (length > 0.5 && length < MIN_COMMERCIAL_INTERIOR_SEGMENT) {
        issues.push({
          edgeId: edge.id,
          kind: 'tiny-interior-segment',
          value: length,
          limit: MIN_COMMERCIAL_INTERIOR_SEGMENT,
        });
      }
    }

  }
  return issues;
};

export const baseReactFlowDisplayCommercialQualityIsClean = (
  edges: readonly Edge[],
): boolean => auditBaseReactFlowDisplayCommercialQuality(edges).length === 0;
