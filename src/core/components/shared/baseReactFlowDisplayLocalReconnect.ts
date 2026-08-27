import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { buildDeclaredTerminalRoleRepairPaths } from './baseReactFlowDeclaredTerminalRoleRepair';
import {
  createDisplayObstacleEvaluationContext,
  obstacleRepairScore,
} from './baseReactFlowDisplayEvaluation';
import {
  findDisplayStrictCrossingHits,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortCandidates';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalValidation';

type DisplayTerminalRole = 'source' | 'target';
type DisplayTerminalSide = 'left' | 'right' | 'top' | 'bottom';

const MAX_RECONNECT_CANDIDATES_PER_EDGE = 256;
const TARGET_RECONNECT_CANDIDATES_PER_TRANSACTION = 256;
const STRICT_BOUNDARY_TANGENT_EPSILON = 1;

export const resolveReconnectCandidateBudgetPerEdge = (
  mutableEdgeCount: number,
): number => {
  if (!Number.isSafeInteger(mutableEdgeCount) || mutableEdgeCount < 1) return 0;
  if (mutableEdgeCount <= 2) return MAX_RECONNECT_CANDIDATES_PER_EDGE;
  // High-fanout moved nodes need the complete per-edge terminal set to keep
  // their shared source/target trunks atomic. Only low-fanout multi-edge edits
  // share the transaction target; the full-fallback matrix proves this split.
  if (mutableEdgeCount >= 6) return MAX_RECONNECT_CANDIDATES_PER_EDGE;
  if (mutableEdgeCount === 5) return 128;
  return Math.max(
    32,
    Math.min(
      MAX_RECONNECT_CANDIDATES_PER_EDGE,
      Math.floor(TARGET_RECONNECT_CANDIDATES_PER_TRANSACTION / mutableEdgeCount),
    ),
  );
};

const terminalSide = (
  edge: Edge,
  role: DisplayTerminalRole,
): DisplayTerminalSide | null => (
  fullDisplayPortSide(normalizeHandle(
    role === 'source' ? edge.sourceHandle : edge.targetHandle,
  )) ?? null
);

const hardDefectCount = (quality: EdgePathQualityScore): number => (
  quality.nonOrthogonalSegments
  + quality.strictCrossings
  + quality.reverseOverlap
  + quality.unrelatedOverlap
  + quality.unexplainedRelatedOverlap
  + quality.shortEndpointStubs
  + quality.tinyInteriorDoglegs
  + quality.hairpins
);

const strictBoundaryTangentsForRole = ({
  edges,
  edgeIndex,
  side,
}: {
  edges: Edge[];
  edgeIndex: number;
  side: DisplayTerminalSide;
}): number[] => {
  const verticalTerminalSide = side === 'top' || side === 'bottom';
  const tangents: number[] = [];
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    const other = hit.a.edgeIndex === edgeIndex
      ? hit.b
      : hit.b.edgeIndex === edgeIndex
        ? hit.a
        : null;
    if (!other) continue;
    const first = verticalTerminalSide ? other.a.x : other.a.y;
    const second = verticalTerminalSide ? other.b.x : other.b.y;
    tangents.push(
      first - STRICT_BOUNDARY_TANGENT_EPSILON,
      first + STRICT_BOUNDARY_TANGENT_EPSILON,
      second - STRICT_BOUNDARY_TANGENT_EPSILON,
      second + STRICT_BOUNDARY_TANGENT_EPSILON,
    );
  }
  return tangents;
};

const reconnectPathsForRoles = ({
  edge,
  edges,
  edgeIndex,
  nodesById,
  roles,
  maxCandidates,
}: {
  edge: Edge;
  edges: Edge[];
  edgeIndex: number;
  nodesById: ReadonlyMap<string, Node>;
  roles: readonly DisplayTerminalRole[];
  maxCandidates: number;
}): DisplayPoint[][] => {
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1) return [];
  const candidateLimit = Math.min(MAX_RECONNECT_CANDIDATES_PER_EDGE, maxCandidates);
  let paths = [getDisplayComputedPath(edge)];
  for (const role of roles) {
    const node = nodesById.get(role === 'source' ? edge.source : edge.target);
    const rect = node ? getDisplayNodeRect(node) : null;
    const side = terminalSide(edge, role);
    if (!rect || !side) return [];
    const expanded: DisplayPoint[][] = [];
    const priorityTangents = strictBoundaryTangentsForRole({
      edges,
      edgeIndex,
      side,
    });
    for (const path of paths) {
      for (const candidate of buildDeclaredTerminalRoleRepairPaths(
        path,
        role,
        rect,
        side,
        priorityTangents,
      )) {
        expanded.push(candidate);
        if (expanded.length >= candidateLimit) break;
      }
      if (expanded.length >= candidateLimit) break;
    }
    paths = expanded;
    if (paths.length === 0) return [];
  }
  return paths;
};

type RankedReconnectCandidate = Readonly<{
  edges: Edge[];
  score: number;
  hardDefects: number;
}>;

type ReconnectRank = Readonly<{
  score: number;
  hardDefects: number;
}>;

const compareReconnectRanks = (first: ReconnectRank, second: ReconnectRank): number => (
  first.hardDefects - second.hardDefects
  || first.score - second.score
);

export const pushBoundedReconnectRankedCandidate = <T extends ReconnectRank>(
  ranked: T[],
  candidate: T,
  limit: number,
): void => {
  if (!Number.isSafeInteger(limit) || limit < 1) return;
  const insertionIndex = ranked.findIndex(existing => (
    compareReconnectRanks(candidate, existing) < 0
  ));
  if (insertionIndex < 0) {
    if (ranked.length < limit) ranked.push(candidate);
    return;
  }
  ranked.splice(insertionIndex, 0, candidate);
  if (ranked.length > limit) ranked.pop();
};

type ReconnectTerminalEvaluationContext = Readonly<{
  terminalValidation: ReturnType<typeof createDisplayTerminalValidationSnapshot>;
  nodesById: ReadonlyMap<string, Node>;
}>;

export type BaseReactFlowReconnectDiagnostics = Readonly<{
  generatedPathCount: number;
  evaluatedPathCount: number;
}>;

type MutableReconnectDiagnostics = {
  generatedPathCount: number;
  evaluatedPathCount: number;
};

const rankReconnectCandidates = ({
  edges,
  edgeIndex,
  candidatePaths,
  nodes,
  terminalContext,
  diagnostics,
  limit,
}: {
  edges: Edge[];
  edgeIndex: number;
  candidatePaths: readonly DisplayPoint[][];
  nodes: Node[];
  terminalContext: ReconnectTerminalEvaluationContext;
  diagnostics: MutableReconnectDiagnostics;
  limit: number;
}): RankedReconnectCandidate[] => {
  const edge = edges[edgeIndex];
  if (!edge) return [];
  const sourceNode = terminalContext.nodesById.get(edge.source);
  const targetNode = terminalContext.nodesById.get(edge.target);
  if (!sourceNode || !targetNode) return [];
  const sourceRect = getDisplayNodeRect(sourceNode);
  const targetRect = getDisplayNodeRect(targetNode);
  if (!sourceRect || !targetRect) return [];
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const ranked: RankedReconnectCandidate[] = [];

  for (const path of candidatePaths) {
    diagnostics.evaluatedPathCount += 1;
    const candidateEdge = withDisplayComputedPath(edge, path);
    if (!terminalContext.terminalValidation.validateEdge(candidateEdge).anchored) continue;
    if (
      displayTerminalRoleNeedsDeclaredAxisRepair(
        candidateEdge,
        path,
        'source',
        sourceRect,
      )
      || displayTerminalRoleNeedsDeclaredAxisRepair(
        candidateEdge,
        path,
        'target',
        targetRect,
      )
    ) continue;
    const candidateEdges = edges.map((item, index) => (
      index === edgeIndex ? candidateEdge : item
    ));
    const quality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
    if (quality.hairpins > 0) continue;
    const obstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [edgeIndex]);
    const hardDefects = hardDefectCount(quality) + obstacleHits;
    const score = obstacleRepairScore(quality, obstacleHits);
    pushBoundedReconnectRankedCandidate(
      ranked,
      { edges: candidateEdges, score, hardDefects },
      limit,
    );
  }
  return ranked;
};

/**
 * Reconnects only terminals attached to moved nodes. Every untouched edge
 * keeps its object reference and full path; mutable edges preserve their
 * existing corridor beyond the bounded terminal splice.
 */
export const createBaseReactFlowMovedNodeReconnectCandidates = ({
  baselineEdges,
  nodes,
  changedNodeIds,
  mutableEdgeIds,
  beamWidth = 4,
  onDiagnostics,
  onPhaseTrace,
}: {
  baselineEdges: Edge[];
  nodes: Node[];
  changedNodeIds: readonly string[];
  mutableEdgeIds: readonly string[];
  beamWidth?: number;
  onDiagnostics?: (diagnostics: BaseReactFlowReconnectDiagnostics) => void;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): Edge[][] => {
  if (!Number.isSafeInteger(beamWidth) || beamWidth < 1 || beamWidth > 8) return [];
  const diagnostics: MutableReconnectDiagnostics = {
    generatedPathCount: 0,
    evaluatedPathCount: 0,
  };
  try {
  const setupTimer = startDisplayRoutingPhaseTrace({
    phase: 'local-reconnect-setup',
    candidateCount: mutableEdgeIds.length,
    onTrace: onPhaseTrace,
  });
  const changedNodes = new Set(changedNodeIds);
  const mutableEdges = new Set(mutableEdgeIds);
  const nodesById = new Map(nodes.map(node => [node.id, node] as const));
  const terminalContext: ReconnectTerminalEvaluationContext = {
    terminalValidation: createDisplayTerminalValidationSnapshot(nodes),
    nodesById,
  };
  const mutableIndexes = baselineEdges
    .map((edge, edgeIndex) => (mutableEdges.has(edge.id) ? edgeIndex : -1))
    .filter(edgeIndex => edgeIndex >= 0);
  const candidateBudgetPerEdge = resolveReconnectCandidateBudgetPerEdge(mutableIndexes.length);
  setupTimer.finish(
    candidateBudgetPerEdge > 0 ? 'accepted' : 'fallback',
    0,
    { candidateCount: mutableIndexes.length },
  );
  if (candidateBudgetPerEdge === 0) return [];
  let states: RankedReconnectCandidate[] = [{
    edges: baselineEdges,
    score: Number.POSITIVE_INFINITY,
    hardDefects: Number.POSITIVE_INFINITY,
  }];

  for (const edgeIndex of mutableIndexes) {
    const expanded: RankedReconnectCandidate[] = [];
    for (const state of states) {
      const edge = state.edges[edgeIndex];
      if (!edge) return [];
      const roles: DisplayTerminalRole[] = [];
      if (changedNodes.has(edge.source)) roles.push('source');
      if (changedNodes.has(edge.target)) roles.push('target');
      if (roles.length === 0) return [];
      const generationTimer = startDisplayRoutingPhaseTrace({
        phase: 'local-reconnect-path-generation',
        candidateCount: candidateBudgetPerEdge,
        onTrace: onPhaseTrace,
      });
      const paths = reconnectPathsForRoles({
        edge,
        edges: state.edges,
        edgeIndex,
        nodesById,
        roles,
        maxCandidates: candidateBudgetPerEdge,
      });
      diagnostics.generatedPathCount += paths.length;
      generationTimer.finish(
        paths.length > 0 ? 'accepted' : 'fallback',
        0,
        {
          candidateCount: paths.length,
          evaluationCount: candidateBudgetPerEdge,
          workItemCount: 1,
          budgetCount: candidateBudgetPerEdge,
          underBudgetCount: paths.length < candidateBudgetPerEdge ? 1 : 0,
          minimumCandidateCount: paths.length,
          maximumCandidateCount: paths.length,
        },
      );
      const rankingTimer = startDisplayRoutingPhaseTrace({
        phase: 'local-reconnect-ranking',
        candidateCount: paths.length,
        onTrace: onPhaseTrace,
      });
      const ranked = rankReconnectCandidates({
        edges: state.edges,
        edgeIndex,
        candidatePaths: paths,
        nodes,
        terminalContext,
        diagnostics,
        limit: beamWidth,
      });
      expanded.push(...ranked);
      rankingTimer.finish(
        ranked.length > 0 ? 'accepted' : 'rejected',
        0,
        { candidateCount: paths.length, evaluationCount: paths.length },
      );
    }
    states = expanded
      .sort((first, second) => (
        first.hardDefects - second.hardDefects
        || first.score - second.score
      ))
      .slice(0, beamWidth);
    if (states.length === 0) return [];
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const refined: RankedReconnectCandidate[] = [];
    let hasStrictParticipant = false;
    for (const state of states) {
      const strictScanTimer = startDisplayRoutingPhaseTrace({
        phase: 'local-reconnect-strict-scan',
        candidateCount: state.edges.length,
        onTrace: onPhaseTrace,
      });
      const participantIndexes = [...new Set(
        findDisplayStrictCrossingHits(state.edges)
          .flatMap(hit => [hit.a.edgeIndex, hit.b.edgeIndex]),
      )].filter(edgeIndex => mutableEdges.has(state.edges[edgeIndex]?.id ?? ''));
      strictScanTimer.finish(participantIndexes.length > 0 ? 'hit' : 'skip');
      if (participantIndexes.length === 0) {
        refined.push(state);
        continue;
      }
      hasStrictParticipant = true;
      for (const edgeIndex of participantIndexes) {
        const baselineEdge = baselineEdges[edgeIndex];
        if (!baselineEdge) continue;
        const roles: DisplayTerminalRole[] = [];
        if (changedNodes.has(baselineEdge.source)) roles.push('source');
        if (changedNodes.has(baselineEdge.target)) roles.push('target');
        const generationTimer = startDisplayRoutingPhaseTrace({
          phase: 'local-reconnect-path-generation',
          candidateCount: candidateBudgetPerEdge,
          onTrace: onPhaseTrace,
        });
        const paths = reconnectPathsForRoles({
          edge: baselineEdge,
          edges: state.edges,
          edgeIndex,
          nodesById,
          roles,
          maxCandidates: candidateBudgetPerEdge,
        });
        diagnostics.generatedPathCount += paths.length;
        generationTimer.finish(
          paths.length > 0 ? 'accepted' : 'fallback',
          0,
          {
            candidateCount: paths.length,
            evaluationCount: candidateBudgetPerEdge,
            workItemCount: 1,
            budgetCount: candidateBudgetPerEdge,
            underBudgetCount: paths.length < candidateBudgetPerEdge ? 1 : 0,
            minimumCandidateCount: paths.length,
            maximumCandidateCount: paths.length,
          },
        );
        const rankingTimer = startDisplayRoutingPhaseTrace({
          phase: 'local-reconnect-ranking',
          candidateCount: paths.length,
          onTrace: onPhaseTrace,
        });
        const ranked = rankReconnectCandidates({
          edges: state.edges,
          edgeIndex,
          candidatePaths: paths,
          nodes,
          terminalContext,
          diagnostics,
          limit: beamWidth,
        });
        refined.push(...ranked);
        rankingTimer.finish(
          ranked.length > 0 ? 'accepted' : 'rejected',
          0,
          { candidateCount: paths.length, evaluationCount: paths.length },
        );
      }
    }
    if (!hasStrictParticipant || refined.length === 0) break;
    states = refined
      .sort((first, second) => (
        first.hardDefects - second.hardDefects
        || first.score - second.score
      ))
      .slice(0, beamWidth);
    if (states[0]?.hardDefects === 0) break;
  }
  return states.map(state => state.edges);
  } finally {
    onDiagnostics?.({ ...diagnostics });
  }
};
