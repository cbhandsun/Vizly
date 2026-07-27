import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  calculateEdgePathQualityScore,
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
import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortCandidates';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalValidation';

type DisplayTerminalRole = 'source' | 'target';
type DisplayTerminalSide = 'left' | 'right' | 'top' | 'bottom';

const MAX_RECONNECT_CANDIDATES_PER_EDGE = 256;
const STRICT_BOUNDARY_TANGENT_EPSILON = 1;

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
}: {
  edge: Edge;
  edges: Edge[];
  edgeIndex: number;
  nodesById: ReadonlyMap<string, Node>;
  roles: readonly DisplayTerminalRole[];
}): DisplayPoint[][] => {
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
        if (expanded.length >= MAX_RECONNECT_CANDIDATES_PER_EDGE) break;
      }
      if (expanded.length >= MAX_RECONNECT_CANDIDATES_PER_EDGE) break;
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

const rankReconnectCandidates = ({
  edges,
  edgeIndex,
  candidatePaths,
  nodes,
  limit,
}: {
  edges: Edge[];
  edgeIndex: number;
  candidatePaths: readonly DisplayPoint[][];
  nodes: Node[];
  limit: number;
}): RankedReconnectCandidate[] => {
  const edge = edges[edgeIndex];
  if (!edge) return [];
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const nodesById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceNode = nodesById.get(edge.source);
  const targetNode = nodesById.get(edge.target);
  if (!sourceNode || !targetNode) return [];
  const sourceRect = getDisplayNodeRect(sourceNode);
  const targetRect = getDisplayNodeRect(targetNode);
  if (!sourceRect || !targetRect) return [];
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const ranked: RankedReconnectCandidate[] = [];

  for (const path of candidatePaths) {
    const candidateEdge = withDisplayComputedPath(edge, path);
    if (calculateEdgePathQualityScore([candidateEdge]).hairpins > 0) continue;
    if (!terminalValidation.validateEdge(candidateEdge).anchored) continue;
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
    const obstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [edgeIndex]);
    const hardDefects = hardDefectCount(quality) + obstacleHits;
    const score = obstacleRepairScore(quality, obstacleHits);
    ranked.push({ edges: candidateEdges, score, hardDefects });
  }
  return ranked
    .sort((first, second) => (
      first.hardDefects - second.hardDefects
      || first.score - second.score
    ))
    .slice(0, limit);
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
}: {
  baselineEdges: Edge[];
  nodes: Node[];
  changedNodeIds: readonly string[];
  mutableEdgeIds: readonly string[];
  beamWidth?: number;
}): Edge[][] => {
  if (!Number.isSafeInteger(beamWidth) || beamWidth < 1 || beamWidth > 8) return [];
  const changedNodes = new Set(changedNodeIds);
  const mutableEdges = new Set(mutableEdgeIds);
  const nodesById = new Map(nodes.map(node => [node.id, node] as const));
  const mutableIndexes = baselineEdges
    .map((edge, edgeIndex) => (mutableEdges.has(edge.id) ? edgeIndex : -1))
    .filter(edgeIndex => edgeIndex >= 0);
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
      const paths = reconnectPathsForRoles({
        edge,
        edges: state.edges,
        edgeIndex,
        nodesById,
        roles,
      });
      expanded.push(...rankReconnectCandidates({
        edges: state.edges,
        edgeIndex,
        candidatePaths: paths,
        nodes,
        limit: beamWidth,
      }));
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
      const participantIndexes = [...new Set(
        findDisplayStrictCrossingHits(state.edges)
          .flatMap(hit => [hit.a.edgeIndex, hit.b.edgeIndex]),
      )].filter(edgeIndex => mutableEdges.has(state.edges[edgeIndex]?.id ?? ''));
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
        const paths = reconnectPathsForRoles({
          edge: baselineEdge,
          edges: state.edges,
          edgeIndex,
          nodesById,
          roles,
        });
        refined.push(...rankReconnectCandidates({
          edges: state.edges,
          edgeIndex,
          candidatePaths: paths,
          nodes,
          limit: beamWidth,
        }));
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
};
