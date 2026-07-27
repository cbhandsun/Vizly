import type { Edge, Node } from '@xyflow/react';

import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import {
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  shiftDisplayInternalSegment,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  obstacleRepairScore,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { repairFastDisplayHardSafety } from './baseReactFlowFastEdgeSafety';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { buildStrictEndpointDetourCandidates } from './baseReactFlowDisplayStrictEndpointDetourCandidates';

const MAX_STRICT_EXPANSION_EVALUATIONS = 192;
const STRICT_EXPANSION_GAPS = [24, 48, 72] as const;

export type BaseReactFlowDisplayStrictExpansionOutcome = Readonly<{
  edges: Edge[];
  changedEdgeIds: string[];
}> | null;

type StrictExpansionArguments = Readonly<{
  edges: Edge[];
  nodes: Node[];
  initialChangedEdgeIds: readonly string[];
  mutableEdgeIds: readonly string[];
  onRejectedReport?: (report: BaseDisplayBoundedCandidateReport) => void;
}>;

const pathSignature = (path: readonly DisplayPoint[]): string => (
  path.map(point => `${point.x}:${point.y}`).join('|')
);

const edgeSetPathSignature = (edges: readonly Edge[]): string => (
  edges.map(edge => `${edge.id}=${pathSignature(getDisplayComputedPath(edge))}`).join(';')
);

const shiftedInternalCandidates = (
  path: readonly DisplayPoint[],
  segment: DisplaySegment,
  other: DisplaySegment,
): DisplayPoint[][] => {
  const otherMinimum = segment.axis === 'h'
    ? Math.min(other.a.y, other.b.y)
    : Math.min(other.a.x, other.b.x);
  const otherMaximum = segment.axis === 'h'
    ? Math.max(other.a.y, other.b.y)
    : Math.max(other.a.x, other.b.x);
  return STRICT_EXPANSION_GAPS.flatMap(gap => (
    [otherMinimum - gap, otherMaximum + gap]
      .map(lane => shiftDisplayInternalSegment(
        [...path],
        segment.segmentIndex,
        segment.axis,
        lane,
      ))
      .filter((candidate): candidate is DisplayPoint[] => Boolean(candidate))
  ));
};

/**
 * Expands a failed incident-only reconnect by at most one strict-crossing
 * participant at a time. It commits only an exact whole-graph hard-clean
 * candidate, so the expansion cannot weaken routing quality.
 */
const searchStrictCrossingClosure = ({
  edges,
  nodes,
  initialChangedEdgeIds,
  mutableEdgeIds,
  onRejectedReport,
  remainingExpansionDepth,
}: StrictExpansionArguments & {
  remainingExpansionDepth: number;
}): BaseReactFlowDisplayStrictExpansionOutcome => {
  let evaluations = 0;
  let bestRejected: { report: BaseDisplayBoundedCandidateReport; score: number } | null = null;
  const repairedSeeds: Array<{
    edges: Edge[];
    changedEdgeIds: string[];
    score: number;
  }> = [];
  const repairedSeedSignatures = new Set<string>();
  const mutableIds = new Set(mutableEdgeIds);
  for (const hit of findDisplayStrictCrossingHits(edges).slice(0, 6)) {
    for (const [segment, other] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
      const edge = edges[segment.edgeIndex];
      if (!edge || !mutableIds.has(edge.id)) continue;
      const path = getDisplayComputedPath(edge);
      const candidates = [
        ...STRICT_EXPANSION_GAPS.flatMap(gap => (
          buildStrictEndpointDetourCandidates(path, segment, other, gap)
        )),
        ...shiftedInternalCandidates(path, segment, other),
      ];
      const seen = new Set<string>();
      for (const candidatePath of candidates) {
        if (evaluations >= MAX_STRICT_EXPANSION_EVALUATIONS) return null;
        const signature = pathSignature(candidatePath);
        if (seen.has(signature)) continue;
        seen.add(signature);
        evaluations += 1;
        const candidateEdge = withDisplayComputedPath(edge, candidatePath);
        const candidateEdges = edges.map((item, edgeIndex) => (
          edgeIndex === segment.edgeIndex ? candidateEdge : item
        ));
        const report = getDisplayHardQualityGateReport(
          candidateEdges,
          nodes,
          'polished',
        );
        if (
          !report.hardClean
          && report.obstacleHits > 0
          && report.terminalsAnchored
          && report.quality.nonOrthogonalSegments === 0
          && report.quality.strictCrossings === 0
          && report.quality.reverseOverlap === 0
          && report.quality.unrelatedOverlap === 0
          && report.quality.unexplainedRelatedOverlap === 0
          && report.quality.shortEndpointStubs === 0
          && report.quality.tinyInteriorDoglegs === 0
          && report.quality.hairpins === 0
        ) {
          const repairedEdge = repairFastDisplayHardSafety(
            [candidateEdge],
            nodes,
          )[0];
          if (repairedEdge) {
            const hairpinRepairedEdge = repairResidualHairpinBridges(
              [repairedEdge],
              nodes,
              { maxEdges: 1 },
            )[0] ?? repairedEdge;
            const repairedEdges = edges.map((item, edgeIndex) => (
              edgeIndex === segment.edgeIndex ? hairpinRepairedEdge : item
            ));
            const repairedReport = getDisplayHardQualityGateReport(
              repairedEdges,
              nodes,
              'polished',
            );
            if (repairedReport.hardClean) {
              return {
                edges: repairedEdges,
                changedEdgeIds: [...new Set([...initialChangedEdgeIds, edge.id])],
              };
            }
            const repairedScore = obstacleRepairScore(
              repairedReport.quality,
              repairedReport.obstacleHits,
            ) + (repairedReport.terminalsAnchored ? 0 : 1_000_000_000_000);
            if (!bestRejected || repairedScore < bestRejected.score) {
              bestRejected = {
                report: repairedReport,
                score: repairedScore,
              };
            }
            if (
              remainingExpansionDepth > 0
              && repairedReport.obstacleHits === 0
              && repairedReport.terminalsAnchored
              && repairedReport.quality.nonOrthogonalSegments === 0
              && repairedReport.quality.strictCrossings > 0
              && repairedReport.quality.reverseOverlap === 0
              && repairedReport.quality.unrelatedOverlap === 0
              && repairedReport.quality.unexplainedRelatedOverlap === 0
              && repairedReport.quality.shortEndpointStubs === 0
              && repairedReport.quality.tinyInteriorDoglegs === 0
              && repairedReport.quality.hairpins === 0
            ) {
              const repairedSignature = edgeSetPathSignature(repairedEdges);
              if (!repairedSeedSignatures.has(repairedSignature)) {
                repairedSeedSignatures.add(repairedSignature);
                repairedSeeds.push({
                  edges: repairedEdges,
                  changedEdgeIds: [
                    ...new Set([...initialChangedEdgeIds, edge.id]),
                  ],
                  score: repairedScore,
                });
              }
            }
          }
        }
        if (!report.hardClean) {
          const score = obstacleRepairScore(report.quality, report.obstacleHits)
            + (report.terminalsAnchored ? 0 : 1_000_000_000_000);
          if (!bestRejected || score < bestRejected.score) {
            bestRejected = { report, score };
          }
          continue;
        }
        return {
          edges: candidateEdges,
          changedEdgeIds: [...new Set([...initialChangedEdgeIds, edge.id])],
        };
      }
    }
  }
  for (const repairedSeed of repairedSeeds
    .sort((first, second) => first.score - second.score)
    .slice(0, 2)) {
    const expanded = searchStrictCrossingClosure({
      edges: repairedSeed.edges,
      nodes,
      initialChangedEdgeIds: repairedSeed.changedEdgeIds,
      mutableEdgeIds,
      onRejectedReport,
      remainingExpansionDepth: remainingExpansionDepth - 1,
    });
    if (expanded) return expanded;
  }
  if (bestRejected) onRejectedReport?.(bestRejected.report);
  return null;
};

export const expandBaseReactFlowStrictCrossingClosure = (
  args: StrictExpansionArguments,
): BaseReactFlowDisplayStrictExpansionOutcome => searchStrictCrossingClosure({
  ...args,
  remainingExpansionDepth: 1,
});
