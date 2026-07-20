import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  createDisplayObstacleEvaluationContext,
} from './baseReactFlowDisplayEvaluation';
import {
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  segmentDisplayLength,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortCandidates';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalAxisRepair';

type TerminalRole = 'source' | 'target';
type TerminalSide = 'top' | 'bottom' | 'left' | 'right';

const MIN_DECLARED_ROLE_STUB = 56;
const TERMINAL_TANGENT_INSET = 16;
const MAX_RECONNECT_DEPTH = 8;
const DEFAULT_MAX_EVALUATIONS = 128;

export type DeclaredTerminalRoleRepairOutcome<T extends Edge[] = Edge[]> = Readonly<{
  edges: T;
  exactEvaluations: number;
}>;

const qualityDoesNotRegress = (
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

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

const declaredSide = (edge: Edge, role: TerminalRole): TerminalSide | null => (
  fullDisplayPortSide(normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle)) ?? null
);

const terminalTangent = (point: DisplayPoint, side: TerminalSide): number => (
  side === 'top' || side === 'bottom' ? point.x : point.y
);

const endpointForSide = (
  tangent: number,
  rect: DisplayRect,
  side: TerminalSide,
): DisplayPoint => {
  if (side === 'top' || side === 'bottom') {
    return {
      x: clamp(tangent, rect.x, rect.x + rect.width),
      y: side === 'top' ? rect.y : rect.y + rect.height,
    };
  }
  return {
    x: side === 'left' ? rect.x : rect.x + rect.width,
    y: clamp(tangent, rect.y, rect.y + rect.height),
  };
};

const outwardStub = (
  endpoint: DisplayPoint,
  side: TerminalSide,
  length: number,
): DisplayPoint => {
  if (side === 'top') return { x: endpoint.x, y: endpoint.y - length };
  if (side === 'bottom') return { x: endpoint.x, y: endpoint.y + length };
  if (side === 'left') return { x: endpoint.x - length, y: endpoint.y };
  return { x: endpoint.x + length, y: endpoint.y };
};

const pathSignature = (path: DisplayPoint[]): string => path
  .map(point => `${Math.round(point.x * 100) / 100}:${Math.round(point.y * 100) / 100}`)
  .join('|');

const buildTangentCoordinates = (
  path: DisplayPoint[],
  role: TerminalRole,
  rect: DisplayRect,
  side: TerminalSide,
): number[] => {
  const oriented = role === 'source' ? path : [...path].reverse();
  const verticalSide = side === 'top' || side === 'bottom';
  const boundaryMinimum = verticalSide ? rect.x : rect.y;
  const boundaryMaximum = verticalSide ? rect.x + rect.width : rect.y + rect.height;
  const insetMinimum = Math.min(boundaryMaximum, boundaryMinimum + TERMINAL_TANGENT_INSET);
  const insetMaximum = Math.max(boundaryMinimum, boundaryMaximum - TERMINAL_TANGENT_INSET);
  const current = terminalTangent(oriented[0], side);
  const localCoordinates = oriented
    .slice(0, MAX_RECONNECT_DEPTH + 1)
    .map(point => terminalTangent(point, side));
  return sortedUniqueNumbers([
    current,
    ...localCoordinates,
    (boundaryMinimum + boundaryMaximum) / 2,
    insetMinimum,
    insetMaximum,
    current - 48,
    current - 24,
    current + 24,
    current + 48,
  ].map(value => clamp(value, boundaryMinimum, boundaryMaximum)), current)
    .sort((first, second) => Math.abs(first - current) - Math.abs(second - current));
};

const buildStubLengths = (
  path: DisplayPoint[],
  role: TerminalRole,
  rect: DisplayRect,
  side: TerminalSide,
): number[] => {
  const oriented = role === 'source' ? path : [...path].reverse();
  const boundary = side === 'left'
    ? rect.x
    : side === 'right'
      ? rect.x + rect.width
      : side === 'top'
        ? rect.y
        : rect.y + rect.height;
  const outwardDirection = side === 'right' || side === 'bottom' ? 1 : -1;
  const outwardDistances = oriented
    .slice(1, MAX_RECONNECT_DEPTH + 1)
    .map(point => (
      (side === 'left' || side === 'right' ? point.x : point.y) - boundary
    ) * outwardDirection)
    .filter(distance => distance >= MIN_DECLARED_ROLE_STUB);
  return sortedUniqueNumbers([
    MIN_DECLARED_ROLE_STUB,
    72,
    96,
    120,
    ...outwardDistances,
  ], MIN_DECLARED_ROLE_STUB).sort((first, second) => first - second);
};

/**
 * Rebuilds only the terminal approach. Every candidate starts on the declared
 * node side, travels outward for a render-safe stub, and reconnects to an
 * existing local waypoint. No graph coordinates or edge identities are baked
 * into the search.
 */
export const buildDeclaredTerminalRoleRepairPaths = (
  path: DisplayPoint[],
  role: TerminalRole,
  rect: DisplayRect,
  side: TerminalSide,
): DisplayPoint[][] => {
  if (path.length < 2) return [];
  const oriented = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const tangents = buildTangentCoordinates(path, role, rect, side);
  const stubLengths = buildStubLengths(path, role, rect, side);
  const maximumReconnectIndex = Math.min(oriented.length - 1, MAX_RECONNECT_DEPTH);
  const seen = new Set<string>();
  const candidates: DisplayPoint[][] = [];

  for (let reconnectIndex = 1; reconnectIndex <= maximumReconnectIndex; reconnectIndex += 1) {
    const reconnect = oriented[reconnectIndex];
    for (const stubLength of stubLengths) {
      for (const tangent of tangents) {
        const endpoint = endpointForSide(tangent, rect, side);
        const stub = outwardStub(endpoint, side, stubLength);
        const bridge = side === 'top' || side === 'bottom'
          ? { x: reconnect.x, y: stub.y }
          : { x: stub.x, y: reconnect.y };
        const rebuiltOriented = compactOrthogonalPath([
          endpoint,
          stub,
          bridge,
          ...oriented.slice(reconnectIndex),
        ]);
        const candidate = role === 'source'
          ? rebuiltOriented
          : [...rebuiltOriented].reverse();
        const compacted = compactOrthogonalPath(candidate);
        const signature = pathSignature(compacted);
        if (compacted.length < 2 || seen.has(signature)) continue;
        seen.add(signature);
        candidates.push(compacted);
      }
    }
  }
  return candidates;
};

const edgeHasDeclaredRoleDefect = (
  edge: Edge,
  path: DisplayPoint[],
  sourceRect: DisplayRect,
  targetRect: DisplayRect,
): boolean => (
  displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'source', sourceRect)
  || displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'target', targetRect)
);

const edgeCandidateIsTerminalSafe = (
  edge: Edge,
  sourceRect: DisplayRect,
  targetRect: DisplayRect,
  terminalValidation: ReturnType<typeof createDisplayTerminalValidationSnapshot>,
): boolean => {
  const path = getDisplayComputedPath(edge);
  if (!terminalValidation.validateEdge(edge).anchored) return false;
  if (edgeHasDeclaredRoleDefect(edge, path, sourceRect, targetRect)) return false;
  const sourceSide = declaredSide(edge, 'source');
  const targetSide = declaredSide(edge, 'target');
  return Boolean(
    sourceSide
    && targetSide
    && segmentDisplayLength(path[0], path[1]) >= MIN_DECLARED_ROLE_STUB
    && segmentDisplayLength(path[path.length - 2], path[path.length - 1]) >= MIN_DECLARED_ROLE_STUB
  );
};

const buildEdgeCandidates = (
  edge: Edge,
  sourceRect: DisplayRect,
  targetRect: DisplayRect,
): Edge[] => {
  const path = getDisplayComputedPath(edge);
  const roles = (['source', 'target'] as const).filter(role => (
    displayTerminalRoleNeedsDeclaredAxisRepair(
      edge,
      path,
      role,
      role === 'source' ? sourceRect : targetRect,
    )
  ));
  if (roles.length === 0) return [];
  let paths = [path];
  for (const role of roles) {
    const side = declaredSide(edge, role);
    if (!side) return [];
    const rect = role === 'source' ? sourceRect : targetRect;
    const expanded: DisplayPoint[][] = [];
    const seen = new Set<string>();
    for (const candidateSeed of paths) {
      for (const candidatePath of buildDeclaredTerminalRoleRepairPaths(
        candidateSeed,
        role,
        rect,
        side,
      )) {
        const signature = pathSignature(candidatePath);
        if (seen.has(signature)) continue;
        seen.add(signature);
        expanded.push(candidatePath);
      }
    }
    paths = expanded;
  }
  return paths.map(candidatePath => withDisplayComputedPath(edge, candidatePath));
};

/**
 * Repairs the narrow residual where ordinary terminal anchoring passes but a
 * declared handle axis does not. A graph is returned only when the complete
 * hard gate passes, so no partial terminal edit can leak into display output.
 */
export const repairDeclaredTerminalRolesWithHardGateWithOutcome = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxEvaluations = DEFAULT_MAX_EVALUATIONS,
): DeclaredTerminalRoleRepairOutcome<T> => {
  const unchanged = (exactEvaluations = 0): DeclaredTerminalRoleRepairOutcome<T> => ({
    edges,
    exactEvaluations,
  });
  if (edges.length === 0 || maxEvaluations <= 0) return unchanged();
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  if (!getDisplayTerminalValidationReport(edges, terminalValidation).allAnchored) return unchanged();
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const defectiveIndexes = edges.flatMap((edge, index) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) return [];
    const sourceRect = getDisplayNodeRect(sourceNode);
    const targetRect = getDisplayNodeRect(targetNode);
    if (!sourceRect || !targetRect) return [];
    return edgeHasDeclaredRoleDefect(edge, getDisplayComputedPath(edge), sourceRect, targetRect)
      ? [index]
      : [];
  });
  // The late transaction is intentionally narrow. Multi-edge role changes need
  // a dedicated joint search; committing only a subset would violate atomicity.
  if (defectiveIndexes.length !== 1) return unchanged();

  const edgeIndex = defectiveIndexes[0];
  const edge = edges[edgeIndex];
  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);
  if (!sourceNode || !targetNode) return unchanged();
  const sourceRect = getDisplayNodeRect(sourceNode);
  const targetRect = getDisplayNodeRect(targetNode);
  if (!sourceRect || !targetRect) return unchanged();

  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const baselineQuality = qualityContext.evaluate(edges);
  const baselineObstacleHits = obstacleContext.evaluate(edges);
  let evaluations = 0;
  for (const candidateEdge of buildEdgeCandidates(edge, sourceRect, targetRect)) {
    if (evaluations >= maxEvaluations) break;
    if (!edgeCandidateIsTerminalSafe(
      candidateEdge,
      sourceRect,
      targetRect,
      terminalValidation,
    )) continue;
    const candidate = edges.map((item, index) => (
      index === edgeIndex ? candidateEdge : item
    )) as T;
    evaluations += 1;
    const candidateQuality = qualityContext.evaluateChanged(candidate, [edgeIndex]);
    if (!qualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
    if (obstacleContext.evaluateKnownChanges(candidate, [edgeIndex]) > baselineObstacleHits) continue;
    if (getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean) {
      return { edges: candidate, exactEvaluations: evaluations };
    }
  }
  return unchanged(evaluations);
};

export const repairDeclaredTerminalRolesWithHardGate = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxEvaluations = DEFAULT_MAX_EVALUATIONS,
): T => repairDeclaredTerminalRolesWithHardGateWithOutcome(
  edges,
  nodes,
  maxEvaluations,
).edges;
