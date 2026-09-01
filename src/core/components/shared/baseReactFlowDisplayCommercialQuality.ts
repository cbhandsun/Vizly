import type { Edge } from '@xyflow/react';

import {
  getDisplayComputedPath,
  segmentDisplayLength,
} from './baseReactFlowDisplayGeometry';

const MIN_COMMERCIAL_INTERIOR_SEGMENT = 24;
export const MAX_COMMERCIAL_BEND_COUNT = 6;
const COMMERCIAL_LENGTH_BUDGET_PER_REMOVED_BEND = 32;

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
    if (bendCount > MAX_COMMERCIAL_BEND_COUNT && edge.data?.sharedTrunkSynthesized !== true) {
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

export const baseReactFlowDisplayCommercialQualityDoesNotRegress = (
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
): boolean => {
  const unmatchedBaselineIssues = [...auditBaseReactFlowDisplayCommercialQuality(baselineEdges)];
  for (const candidate of auditBaseReactFlowDisplayCommercialQuality(candidateEdges)) {
    const matchingIndex = unmatchedBaselineIssues.findIndex(baseline => (
      baseline.edgeId === candidate.edgeId
      && baseline.kind === candidate.kind
      && candidate.value <= baseline.value
    ));
    if (matchingIndex < 0) return false;
    unmatchedBaselineIssues.splice(matchingIndex, 1);
  }
  return true;
};

/**
 * Keep a separately named candidate contract at the Worker trust boundary so
 * future candidate-only rules cannot silently diverge from final promotion.
 */
export const baseReactFlowDisplayCandidateCommercialQualityIsClean = (
  edges: readonly Edge[],
): boolean => baseReactFlowDisplayCommercialQualityIsClean(edges.map(edge => (
  edge.data?.sharedTrunkSynthesized === true
    ? { ...edge, data: { ...edge.data, sharedTrunkSynthesized: undefined } }
    : edge
)));

/**
 * An exact hard-clean route that also satisfies the external candidate
 * contract is already a stable Worker commit. Re-entering the complete
 * endpoint/commercial pipeline cannot make it more eligible for reuse: the
 * next request would accept this exact geometry at the candidate boundary.
 */
export const canCommitBaseReactFlowDisplayCandidateWithoutStabilization = (
  hardClean: boolean,
  edges: readonly Edge[] | undefined,
): boolean => Boolean(
  hardClean
  && edges
  && baseReactFlowDisplayCandidateCommercialQualityIsClean(edges)
);

/**
 * A hard-clean route may need a modest outer detour to replace a pathological
 * bend chain. The allowance scales only with bends actually removed and is
 * available only when the replacement satisfies the complete structural
 * commercial contract.
 */
export const commercialBendSimplificationLengthBudget = (
  baseline: Edge,
  candidate: Edge,
): number => {
  if (
    baseline.id !== candidate.id
    || baseline.source !== candidate.source
    || baseline.target !== candidate.target
  ) return 0;
  const baselineBends = Math.max(0, getDisplayComputedPath(baseline).length - 2);
  const candidateBends = Math.max(0, getDisplayComputedPath(candidate).length - 2);
  if (
    baselineBends <= MAX_COMMERCIAL_BEND_COUNT
    || candidateBends > MAX_COMMERCIAL_BEND_COUNT
    || candidateBends >= baselineBends
    || !baseReactFlowDisplayCommercialQualityIsClean([candidate])
  ) return 0;
  return (baselineBends - candidateBends) * COMMERCIAL_LENGTH_BUDGET_PER_REMOVED_BEND;
};
