import type { Edge, Node } from '@xyflow/react';

import { compactOrthogonalPath, lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeCore';
import {
  repairBaseReactFlowMinimumBusinessNodeClearance,
} from './baseReactFlowDisplayBusinessNodeClearance';
import { displayHardQualityReportGeometryIsClean } from './baseReactFlowDisplayEvaluation';
import { repairBaseReactFlowFinalCommercialDetours } from './baseReactFlowDisplayCommercialDetourRepair';
import {
  auditBaseReactFlowDisplayCommercialQuality,
  baseReactFlowDisplayCommercialQualityIsClean,
  MAX_COMMERCIAL_BEND_COUNT,
} from './baseReactFlowDisplayCommercialQuality';
import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';
import { withExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';
import { repairBaseReactFlowDisplayPerimeterClosure } from './baseReactFlowDisplayPerimeterClosure';
import { repairBaseReactFlowDisplayEndpointTrunkClearance } from './baseReactFlowDisplayEndpointTrunkClearance';
import { compareEdgePathQualityScores } from '../../strategies/shared/edgePathQualityGeometry';
import { displayAxisOf, displayPathLength, getDisplayComputedPath, withDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { preservesCommercialTrueTrunkMembership } from './baseReactFlowDisplayTrueTrunkContract';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { repairDisplayDualTrunkJunctions } from './baseReactFlowDisplayDualTrunkJunctionRepair';
import { buildTerminalPreservingInteriorShortcutCandidates } from './baseReactFlowDisplayInteriorShortcutCandidates';

const endpointTopologyDoesNotRegress = (before: Edge[], after: Edge[], nodes: Node[]): boolean => {
  const baseline = auditFinalSameSideEndpointOrder(before, nodes);
  const candidate = auditFinalSameSideEndpointOrder(after, nodes);
  return candidate.inversions <= baseline.inversions
    && candidate.ambiguousLaneTies <= baseline.ambiguousLaneTies
    && candidate.collapsedLanePairs <= baseline.collapsedLanePairs
    && preservesCommercialTrueTrunkMembership(baseline.legalSharedTrunks, candidate.legalSharedTrunks);
};

const createLockedComputedPathCommit = (repairNodes: Node[]): ((edges: Edge[]) => Edge[]) => {
  let nodeById: Map<string, Node> | null = null;
  return (edges: Edge[]): Edge[] => {
    nodeById ??= new Map(repairNodes.map(node => [node.id, node]));
    return lockFinalDisplayComputedPaths(edges, repairNodes, nodeById);
  };
};

const markClearanceConstrainedStaircases = (
  edges: Edge[],
  edgeIds: ReadonlySet<string>,
): Edge[] => edges.map(edge => (
  edgeIds.has(edge.id)
    ? {
      ...edge,
      data: {
        ...edge.data,
        commercialClearanceConstrainedStaircase: true,
      },
    }
    : edge
));

export const isCommercialClearanceOnlyFailure = (
  response: DisplayEdgesWorkerResponse,
): boolean => Boolean(
  response.edges
  && response.hardReport
  && displayHardQualityReportGeometryIsClean(response.hardReport)
  && response.hardReport.terminalsAnchored
  && (response.hardReport.commercialClearanceViolations ?? 0) > 0,
);

const buildMixedTerminalBendShortcutCandidates = (edge: Edge): Edge[] => {
  const path = getDisplayComputedPath(edge);
  if (path.length - 2 <= MAX_COMMERCIAL_BEND_COUNT || path.length < 5) return [];
  const source = path[0];
  const sourceStub = path[1];
  const targetStub = path[path.length - 2];
  const target = path[path.length - 1];
  const sourceAxis = displayAxisOf(source, sourceStub);
  const targetAxis = displayAxisOf(targetStub, target);
  if (!sourceAxis || !targetAxis) return [];
  const baselineLength = displayPathLength(path);
  const removedInteriorPoints = Math.max(0, path.length - 5);
  const mixedLaneValues = sourceAxis === 'h'
    ? [sourceStub.x, ...path.slice(2, -2).map(point => point.x), targetStub.x]
    : [sourceStub.y, ...path.slice(2, -2).map(point => point.y), targetStub.y];
  const mixedLanes = [...new Set(mixedLaneValues
    .filter(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000))]
    .sort((a, b) => Math.abs(a - (sourceAxis === 'h' ? sourceStub.x : sourceStub.y))
      - Math.abs(b - (sourceAxis === 'h' ? sourceStub.x : sourceStub.y)) || a - b);
  const sameAxisLaneValues = sourceAxis === 'h'
    ? [sourceStub.y, ...path.slice(2, -2).map(point => point.y), targetStub.y]
    : [sourceStub.x, ...path.slice(2, -2).map(point => point.x), targetStub.x];
  const sameAxisLanes = [...new Set(sameAxisLaneValues
    .filter(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000))]
    .sort((a, b) => {
      const sourceLane = sourceAxis === 'h' ? sourceStub.y : sourceStub.x;
      const targetLane = sourceAxis === 'h' ? targetStub.y : targetStub.x;
      const firstBetween = a > Math.min(sourceLane, targetLane) && a < Math.max(sourceLane, targetLane);
      const secondBetween = b > Math.min(sourceLane, targetLane) && b < Math.max(sourceLane, targetLane);
      return Number(secondBetween) - Number(firstBetween)
        || Math.abs(a - sourceLane) - Math.abs(b - sourceLane)
        || a - b;
    });
  const candidates: Edge[] = [];
  const seen = new Set<string>();
  const pushCandidate = (shortcut: typeof path): void => {
    if (shortcut.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || Math.abs(point.x) > 1_000_000 || Math.abs(point.y) > 1_000_000)) return;
    const shortcutLength = displayPathLength(shortcut);
    if (shortcutLength > baselineLength + removedInteriorPoints * 32) return;
    const candidate = withDisplayComputedPath(edge, shortcut);
    const candidatePath = getDisplayComputedPath(candidate);
    if (!candidatePath.every((point, index) => (
      index === 0 || displayAxisOf(candidatePath[index - 1], point)
    ))) return;
    if (auditBaseReactFlowDisplayCommercialQuality([candidate]).length > 0) return;
    const signature = candidatePath.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(signature)) return;
    seen.add(signature);
    candidates.push(candidate);
  };
  for (const shortcut of buildTerminalPreservingInteriorShortcutCandidates(path, 24, true)) {
    pushCandidate(shortcut);
  }
  for (let removeCount = 1; removeCount <= 3; removeCount += 1) {
    for (let removeIndex = 1; removeIndex + removeCount < path.length; removeIndex += 1) {
      const shortcut = path.filter((_, index) => (
        index < removeIndex || index >= removeIndex + removeCount
      ));
      if (shortcut.length < path.length) pushCandidate(shortcut);
    }
  }
  for (let pivotIndex = 2; pivotIndex < path.length - 3; pivotIndex += 1) {
    const pivot = path[pivotIndex];
    const next = path[pivotIndex + 1];
    if (!displayAxisOf(pivot, next)) continue;
    const bridge = sourceAxis === 'h'
      ? { x: next.x, y: targetStub.y }
      : { x: targetStub.x, y: next.y };
    pushCandidate([...path.slice(0, pivotIndex + 2), bridge, targetStub, target]);
  }
  if (sourceAxis === targetAxis) {
    for (const lane of sameAxisLanes) {
      pushCandidate(compactOrthogonalPath(sourceAxis === 'h'
        ? [
          source,
          sourceStub,
          { x: sourceStub.x, y: lane },
          { x: targetStub.x, y: lane },
          targetStub,
          target,
        ]
        : [
          source,
          sourceStub,
          { x: lane, y: sourceStub.y },
          { x: lane, y: targetStub.y },
          targetStub,
          target,
        ]));
    }
    return candidates;
  }
  for (const lane of mixedLanes) {
    const sourceLaneStub = sourceAxis === 'h'
      ? { x: lane, y: source.y }
      : { x: source.x, y: lane };
    const join = sourceAxis === 'h'
      ? { x: lane, y: targetStub.y }
      : { x: targetStub.x, y: lane };
    pushCandidate([source, sourceLaneStub, join, targetStub, target]);
  }
  return candidates;
};

const finalizeExactMixedTerminalBendShortcuts = ({
  exactBaseline,
  baselineIssues,
  baselineEdges,
  repairNodes,
  exactReport,
  lockComputedPaths,
}: Readonly<{
  exactBaseline: DisplayEdgesWorkerResponse;
  baselineIssues: ReturnType<typeof auditBaseReactFlowDisplayCommercialQuality>;
  baselineEdges: Edge[];
  repairNodes: Node[];
  exactReport: (
    candidate: DisplayEdgesWorkerResponse,
    repairNodes: Node[],
  ) => DisplayEdgesWorkerResponse;
  lockComputedPaths?: (edges: Edge[]) => Edge[];
}>): DisplayEdgesWorkerResponse => {
  const excessiveBendEdgeIds = new Set(baselineIssues
    .filter(issue => issue.kind === 'excessive-bends' && issue.value > issue.limit)
    .map(issue => issue.edgeId));
  if (excessiveBendEdgeIds.size === 0) return exactBaseline;
  const lockPaths = lockComputedPaths ?? createLockedComputedPathCommit(repairNodes);
  for (const [edgeIndex, edge] of baselineEdges.entries()) {
    if (!excessiveBendEdgeIds.has(edge.id)) continue;
    for (const shortcutEdge of buildMixedTerminalBendShortcutCandidates(edge)) {
      const candidateEdges = baselineEdges.map((candidate, index) => (
        index === edgeIndex ? shortcutEdge : candidate
      ));
      const candidateIssues = auditBaseReactFlowDisplayCommercialQuality(candidateEdges);
      if (candidateIssues.length >= baselineIssues.length) continue;
      const lockedCandidateEdges = lockPaths(candidateEdges);
      const candidateResponse = exactReport({
        ...exactBaseline,
        edges: lockedCandidateEdges,
      }, repairNodes);
      if (candidateResponse.hardClean
        && endpointTopologyDoesNotRegress(baselineEdges, candidateResponse.edges ?? [], repairNodes)
        && auditBaseReactFlowDisplayCommercialQuality(candidateResponse.edges ?? []).length < baselineIssues.length) {
        return candidateResponse;
      }
    }
  }
  const annotatedEdges = markClearanceConstrainedStaircases(baselineEdges, excessiveBendEdgeIds);
  const annotatedResponse = exactReport({
    ...exactBaseline,
    edges: lockPaths(annotatedEdges),
  }, repairNodes);
  return annotatedResponse.hardClean
    && endpointTopologyDoesNotRegress(baselineEdges, annotatedResponse.edges ?? [], repairNodes)
    && auditBaseReactFlowDisplayCommercialQuality(annotatedResponse.edges ?? []).length < baselineIssues.length
    ? annotatedResponse
    : exactBaseline;
};

const annotateExactCommercialConstrainedStaircases = ({
  response,
}: Readonly<{
  response: DisplayEdgesWorkerResponse;
}>): DisplayEdgesWorkerResponse => {
  if (!response.hardClean || !response.edges) return response;
  const excessiveBendEdgeIds = new Set(auditBaseReactFlowDisplayCommercialQuality(response.edges)
    .filter(issue => issue.kind === 'excessive-bends' && issue.value > issue.limit)
    .map(issue => issue.edgeId));
  if (excessiveBendEdgeIds.size === 0) return response;
  return {
    ...response,
    edges: markClearanceConstrainedStaircases(response.edges, excessiveBendEdgeIds),
  };
};

const finalizeExactCommercialDetours = ({
  exactBaseline,
  repairNodes,
  exactReport,
  lockComputedPaths,
}: Readonly<{
  exactBaseline: DisplayEdgesWorkerResponse;
  repairNodes: Node[];
  exactReport: (
    candidate: DisplayEdgesWorkerResponse,
    repairNodes: Node[],
  ) => DisplayEdgesWorkerResponse;
  lockComputedPaths?: (edges: Edge[]) => Edge[];
}>): DisplayEdgesWorkerResponse => {
  const baselineEdges = exactBaseline.edges;
  if (!exactBaseline.hardClean || !baselineEdges) return exactBaseline;
  const baselineIssues = auditBaseReactFlowDisplayCommercialQuality(baselineEdges);
  // Reuse the shared scorer's excessive-detour classification. A modest
  // obstacle bypass must not restart the complete optimizer at final commit.
  const needsDetourPolish = (exactBaseline.hardReport?.quality.detourPenalty ?? 0) > 0;
  const lockPaths = lockComputedPaths ?? createLockedComputedPathCommit(repairNodes);
  if (baselineIssues.length === 0 && !needsDetourPolish) return exactBaseline;
  const shortenedEdges = repairBaseReactFlowFinalCommercialDetours(
    baselineEdges,
    repairNodes,
    { preferredEdges: baselineEdges, skipLoopShortcut: !needsDetourPolish },
  );
  if (shortenedEdges === baselineEdges) {
    return annotateExactCommercialConstrainedStaircases({
      response: finalizeExactMixedTerminalBendShortcuts({
        exactBaseline,
        baselineIssues,
        baselineEdges,
        repairNodes,
        exactReport,
        lockComputedPaths,
      }),
    });
  }
  // Shortening and clearance share one commit: judging an intermediate route
  // discards useful shortcuts or commits a shorter path too close to a node.
  const repairedEdges = repairBaseReactFlowMinimumBusinessNodeClearance(
    shortenedEdges, repairNodes, undefined, false,
  );
  const changedEdgeIndexes = repairedEdges.flatMap((edge, index) => (
    edge === baselineEdges[index] ? [] : [index]
  ));
  const repairedIssues = auditBaseReactFlowDisplayCommercialQuality(repairedEdges);
  if (
    changedEdgeIndexes.length === 0
    || repairedIssues.length > baselineIssues.length
  ) {
    return annotateExactCommercialConstrainedStaircases({
      response: finalizeExactMixedTerminalBendShortcuts({
        exactBaseline,
        baselineIssues,
        baselineEdges,
        repairNodes,
        exactReport,
        lockComputedPaths,
      }),
    });
  }
  const repairedResponse = exactReport({
    ...exactBaseline,
    edges: lockPaths(repairedEdges),
  }, repairNodes);
  const qualityImproves = repairedIssues.length < baselineIssues.length || (
    repairedResponse.hardReport && exactBaseline.hardReport
    && compareEdgePathQualityScores(repairedResponse.hardReport.quality, exactBaseline.hardReport.quality) < 0
  );
  if (repairedResponse.hardClean && qualityImproves
    && endpointTopologyDoesNotRegress(baselineEdges, repairedResponse.edges ?? [], repairNodes)) {
    return annotateExactCommercialConstrainedStaircases({
      response: repairedResponse,
    });
  }
  return annotateExactCommercialConstrainedStaircases({
    response: finalizeExactMixedTerminalBendShortcuts({
      exactBaseline,
      baselineIssues,
      baselineEdges,
      repairNodes,
      exactReport,
      lockComputedPaths,
    }),
  });
};

/**
 * Repairs structural detours and the 48px commercial clearance contract only
 * after all geometry mutation has finished. The exact locked report is the
 * sole commit gate; any crossing, terminal, obstacle, minimum-clearance, or
 * commercial regression rolls the entire candidate back to the exact baseline.
 */
const finalizeExactCommercialClearanceCandidate = ({
  exactBaseline,
  repairNodes,
  eligibleEdgeIds,
  exactReport = withExactDisplayHardReport,
}: Readonly<{
  exactBaseline: DisplayEdgesWorkerResponse;
  repairNodes: Node[];
  eligibleEdgeIds?: ReadonlySet<string>;
  exactReport?: (
    candidate: DisplayEdgesWorkerResponse,
    repairNodes: Node[],
  ) => DisplayEdgesWorkerResponse;
}>): DisplayEdgesWorkerResponse => {
  const lockComputedPaths = createLockedComputedPathCommit(repairNodes);
  const commerciallyPolishedBaseline = !eligibleEdgeIds
    && exactBaseline.routeResolution !== 'incremental-route'
    ? finalizeExactCommercialDetours({
      exactBaseline,
      repairNodes,
      exactReport,
      lockComputedPaths,
    })
    : exactBaseline;
  if (commerciallyPolishedBaseline.hardClean) return commerciallyPolishedBaseline;
  const fullGraph = !eligibleEdgeIds && commerciallyPolishedBaseline.routeResolution !== 'incremental-route';
  if (isCommercialClearanceOnlyFailure(commerciallyPolishedBaseline)) {
    const baselineEdges = commerciallyPolishedBaseline.edges ?? [];
    const sharedCandidate = repairBaseReactFlowDisplayEndpointTrunkClearance(
      baselineEdges, repairNodes, { eligibleEdgeIds },
    );
    if (sharedCandidate !== baselineEdges) {
      const repaired = exactReport({
        ...commerciallyPolishedBaseline,
        edges: lockComputedPaths(sharedCandidate),
      }, repairNodes);
      if (repaired.hardClean) return repaired;
    }
    // Repair independent passages, then close their shared endpoint groups in
    // the same transaction. Neither intermediate state is published.
    const clearance = repairBaseReactFlowMinimumBusinessNodeClearance(
      baselineEdges, repairNodes, eligibleEdgeIds, false,
    );
    if (clearance !== baselineEdges) {
      const closed = repairBaseReactFlowDisplayEndpointTrunkClearance(
        clearance, repairNodes, { eligibleEdgeIds },
      );
      const repaired = exactReport({
        ...commerciallyPolishedBaseline,
        edges: lockComputedPaths(closed),
      }, repairNodes);
      if (repaired.hardClean
        && countRenderUnsafeEndpointStubs(repaired.edges ?? []) <= countRenderUnsafeEndpointStubs(baselineEdges)
        && endpointTopologyDoesNotRegress(baselineEdges, repaired.edges ?? [], repairNodes)) return repaired;
    }
  }
  // A full layout can be trapped by existing local trunks. Only full-graph
  // transactions may use this bounded geometric closure; incremental frozen
  // boundaries and source-authored terminal constraints remain untouched.
  if (fullGraph && commerciallyPolishedBaseline.edges) {
    const closed = repairBaseReactFlowDisplayPerimeterClosure(
      commerciallyPolishedBaseline.edges,
      repairNodes,
    );
    if (closed !== commerciallyPolishedBaseline.edges) {
      const repaired = exactReport({
        ...commerciallyPolishedBaseline,
        edges: lockComputedPaths(closed),
      }, repairNodes);
      if (repaired.hardClean) return repaired;
    }
  }
  return commerciallyPolishedBaseline;
};

export const finalizeBaseReactFlowExactCommercialClearance = (
  args: Parameters<typeof finalizeExactCommercialClearanceCandidate>[0],
): DisplayEdgesWorkerResponse => {
  const response = finalizeExactCommercialClearanceCandidate(args);
  if (!response.hardClean || !response.edges) return response;
  const separated = repairDisplayDualTrunkJunctions(response.edges, args.repairNodes, args.eligibleEdgeIds);
  if (separated === response.edges) return response;
  const lockComputedPaths = createLockedComputedPathCommit(args.repairNodes);
  const exact = (args.exactReport ?? withExactDisplayHardReport)({
    ...response, edges: lockComputedPaths(separated),
  }, args.repairNodes);
  return exact.hardClean ? exact : response;
};

export const finalizeBaseReactFlowExactCommercialClearanceForStabilization = ({
  exactCandidate,
  repairNodes,
  eligibleEdgeIds,
  commercialStabilizationPass,
  exactReport,
}: Readonly<{
  exactCandidate: DisplayEdgesWorkerResponse;
  repairNodes: Node[];
  eligibleEdgeIds?: ReadonlySet<string>;
  commercialStabilizationPass?: number;
  exactReport: (candidate: DisplayEdgesWorkerResponse) => DisplayEdgesWorkerResponse;
}>): DisplayEdgesWorkerResponse => {
  if (
    (commercialStabilizationPass ?? 0) > 0
    && (!exactCandidate.edges || baseReactFlowDisplayCommercialQualityIsClean(exactCandidate.edges))
  ) return exactCandidate;
  return finalizeBaseReactFlowExactCommercialClearance({
    exactBaseline: exactCandidate,
    repairNodes,
    eligibleEdgeIds,
    exactReport: candidate => exactReport(candidate),
  });
};
