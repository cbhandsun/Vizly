import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  compactOrthogonalPath,
} from './baseReactFlowDisplayEdgeCore';
import {
  createDisplayObstacleEvaluationContext,
  finalVisualPolishScoreFromQuality,
} from './baseReactFlowDisplayEvaluation';
import {
  fullDisplayPortSide,
  displayAxisOf,
  getDisplayComputedPath,
  getDisplayNodeRect,
  segmentDisplayLength,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortRepair';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';

const MIN_RENDER_SAFE_ENDPOINT_STUB = 56;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const declaredTerminalSide = (edge: Edge, role: 'source' | 'target') => fullDisplayPortSide(
  normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle),
);

const terminalEndpoint = (
  point: DisplayPoint,
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint => {
  if (side === 'top' || side === 'bottom') {
    return {
      x: clamp(point.x, rect.x, rect.x + rect.width),
      y: side === 'top' ? rect.y : rect.y + rect.height,
    };
  }
  return {
    x: side === 'left' ? rect.x : rect.x + rect.width,
    y: clamp(point.y, rect.y, rect.y + rect.height),
  };
};

const outwardStubPoint = (
  endpoint: DisplayPoint,
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint => {
  if (side === 'top') return { x: endpoint.x, y: endpoint.y - MIN_RENDER_SAFE_ENDPOINT_STUB };
  if (side === 'bottom') return { x: endpoint.x, y: endpoint.y + MIN_RENDER_SAFE_ENDPOINT_STUB };
  if (side === 'left') return { x: endpoint.x - MIN_RENDER_SAFE_ENDPOINT_STUB, y: endpoint.y };
  return { x: endpoint.x + MIN_RENDER_SAFE_ENDPOINT_STUB, y: endpoint.y };
};

const repairDeclaredTerminalRolePath = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint[] | null => {
  if (path.length < 3) return null;
  const endpointIndex = role === 'source' ? 0 : path.length - 1;
  const endpoint = terminalEndpoint(path[endpointIndex], rect, side);
  const stub = outwardStubPoint(endpoint, side);
  const reconnect = role === 'source' ? path[2] : path[path.length - 3];
  const bridge = side === 'top' || side === 'bottom'
    ? { x: reconnect.x, y: stub.y }
    : { x: stub.x, y: reconnect.y };
  const candidate = role === 'source'
    ? [endpoint, stub, bridge, ...path.slice(2)]
    : [...path.slice(0, -2), bridge, stub, endpoint];
  return compactOrthogonalPath(candidate);
};

const buildDeclaredTerminalRolePaths = (
  path: DisplayPoint[],
  role: 'source' | 'target',
  rect: DisplayRect,
  side: 'top' | 'bottom' | 'left' | 'right',
): DisplayPoint[][] => {
  if (path.length < 3) return [];
  const endpointIndex = role === 'source' ? 0 : path.length - 1;
  const neighborIndex = role === 'source' ? 1 : path.length - 2;
  const endpoint = path[endpointIndex];
  const neighbor = path[neighborIndex];
  const verticalSide = side === 'top' || side === 'bottom';
  const min = verticalSide ? rect.x + 16 : rect.y + 16;
  const max = verticalSide ? rect.x + rect.width - 16 : rect.y + rect.height - 16;
  const current = verticalSide ? endpoint.x : endpoint.y;
  const neighborCoordinate = verticalSide ? neighbor.x : neighbor.y;
  const center = (min + max) / 2;
  const coordinates = [...new Set([
    current,
    neighborCoordinate,
    center,
    current - 48,
    current - 24,
    current + 24,
    current + 48,
    min,
    max,
  ].map(value => Math.round(clamp(value, min, max) * 100) / 100))]
    .sort((first, second) => Math.abs(first - current) - Math.abs(second - current));
  const seen = new Set<string>();
  const candidates: DisplayPoint[][] = [];
  const directCandidates: DisplayPoint[][] = [];
  for (const coordinate of coordinates) {
    const variant = path.map(point => ({ ...point }));
    if (verticalSide) variant[endpointIndex].x = coordinate;
    else variant[endpointIndex].y = coordinate;
    const candidate = repairDeclaredTerminalRolePath(variant, role, rect, side);
    if (!candidate) continue;
    const signature = candidate.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    candidates.push(candidate);

    const expectedAxis = verticalSide ? 'v' : 'h';
    if (role === 'target' && path.length >= 4) {
      const terminalAxis = displayAxisOf(path[path.length - 2], path[path.length - 1]);
      const precedingAxis = displayAxisOf(path[path.length - 3], path[path.length - 2]);
      const leadInAxis = displayAxisOf(path[path.length - 4], path[path.length - 3]);
      if (terminalAxis !== expectedAxis && precedingAxis === expectedAxis && leadInAxis !== expectedAxis) {
        const exactEndpoint = terminalEndpoint(variant[endpointIndex], rect, side);
        const earlyTurn = verticalSide
          ? { x: exactEndpoint.x, y: path[path.length - 3].y }
          : { x: path[path.length - 3].x, y: exactEndpoint.y };
        const directCandidate = compactOrthogonalPath([
          ...path.slice(0, -3),
          earlyTurn,
          exactEndpoint,
        ]);
        const directSignature = directCandidate.map(point => `${point.x}:${point.y}`).join('|');
        if (!seen.has(directSignature)) {
          seen.add(directSignature);
          directCandidates.push(directCandidate);
        }
      }
    }
  }
  const interleaved: DisplayPoint[][] = [];
  const length = Math.max(directCandidates.length, candidates.length);
  for (let index = 0; index < length; index += 1) {
    if (directCandidates[index]) interleaved.push(directCandidates[index]);
    if (candidates[index]) interleaved.push(candidates[index]);
  }
  return interleaved;
};

export const repairRenderSafeTerminalAxes = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxEvaluations = 24,
): T => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const defectCount = (candidateEdges: Edge[]): number => candidateEdges.reduce((total, edge) => {
    const path = getDisplayComputedPath(edge);
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (!sourceRect || !targetRect) return total + 2;
    const sourceSide = declaredTerminalSide(edge, 'source');
    const targetSide = declaredTerminalSide(edge, 'target');
    return total
      + Number(!terminalValidation.validateEdge(edge).anchored)
      + Number(Boolean(
        sourceSide
        && displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'source', sourceRect)
      ))
      + Number(Boolean(
        targetSide
        && displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'target', targetRect)
      ))
      + Number(Boolean(
        sourceSide
        && path.length >= 3
        && segmentDisplayLength(path[0], path[1]) < MIN_RENDER_SAFE_ENDPOINT_STUB
      ))
      + Number(Boolean(
        targetSide
        && path.length >= 3
        && segmentDisplayLength(path[path.length - 2], path[path.length - 1]) < MIN_RENDER_SAFE_ENDPOINT_STUB
      ));
  }, 0);

  let current = edges;
  let evaluations = 0;
  for (let pass = 0; pass < edges.length && evaluations < maxEvaluations; pass += 1) {
    const baselineDefects = defectCount(current);
    if (baselineDefects === 0) break;
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = obstacleContext.evaluate(current);
    let best: T | null = null;
    let bestDefects = baselineDefects;
    let bestScore = Number.POSITIVE_INFINITY;
    const candidatePools = new Map<number, T[]>();
    const candidateQualityIsAcceptable = (candidateQuality: typeof baselineQuality): boolean => (
      candidateQuality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
      && candidateQuality.strictCrossings <= baselineQuality.strictCrossings
      && candidateQuality.reverseOverlap <= baselineQuality.reverseOverlap
      && candidateQuality.unrelatedOverlap <= baselineQuality.unrelatedOverlap
      && candidateQuality.unexplainedRelatedOverlap <= baselineQuality.unexplainedRelatedOverlap
      && candidateQuality.tinyInteriorDoglegs <= baselineQuality.tinyInteriorDoglegs
      && candidateQuality.hairpins <= baselineQuality.hairpins
    );

    for (let edgeIndex = 0; edgeIndex < current.length && evaluations < maxEvaluations; edgeIndex += 1) {
      const edge = current[edgeIndex];
      const path = getDisplayComputedPath(edge);
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
      const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
      if (path.length < 3 || !sourceRect || !targetRect) continue;
      const sourceSide = declaredTerminalSide(edge, 'source');
      const targetSide = declaredTerminalSide(edge, 'target');
      const sourceNeedsRepair = Boolean(
        sourceSide
        && (
          displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'source', sourceRect)
          || segmentDisplayLength(path[0], path[1]) < MIN_RENDER_SAFE_ENDPOINT_STUB
        )
      );
      const targetNeedsRepair = Boolean(
        targetSide
        && (
          displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'target', targetRect)
          || segmentDisplayLength(path[path.length - 2], path[path.length - 1])
            < MIN_RENDER_SAFE_ENDPOINT_STUB
        )
      );
      if (!sourceNeedsRepair && !targetNeedsRepair) continue;

      const candidatePaths: DisplayPoint[][] = [];
      if (sourceNeedsRepair && sourceSide) {
        candidatePaths.push(...buildDeclaredTerminalRolePaths(
          path,
          'source',
          sourceRect,
          sourceSide,
        ));
      }
      if (targetNeedsRepair && targetSide) {
        candidatePaths.push(...buildDeclaredTerminalRolePaths(
          path,
          'target',
          targetRect,
          targetSide,
        ));
      }
      if (sourceNeedsRepair && targetNeedsRepair && sourceSide && targetSide) {
        const sourceCandidate = repairDeclaredTerminalRolePath(path, 'source', sourceRect, sourceSide);
        const combined = sourceCandidate
          ? repairDeclaredTerminalRolePath(sourceCandidate, 'target', targetRect, targetSide)
          : null;
        if (combined) candidatePaths.unshift(combined);
      }

      const candidateGraphs = candidatePaths.slice(0, 8).map(candidatePath => current.map((item, index) => (
        index === edgeIndex ? withDisplayComputedPath(item, candidatePath) : item
      )) as T);
      if (candidateGraphs.length > 0) candidatePools.set(edgeIndex, candidateGraphs);
      for (const candidate of candidateGraphs) {
        if (evaluations >= maxEvaluations) break;
        evaluations += 1;
        const candidateDefects = defectCount(candidate);
        if (candidateDefects >= bestDefects) continue;
        const candidateQuality = qualityContext.evaluateChanged(candidate, [edgeIndex]);
        if (!candidateQualityIsAcceptable(candidateQuality)) continue;
        if (obstacleContext.evaluateKnownChanges(candidate, [edgeIndex]) > baselineObstacleHits) continue;
        const score = finalVisualPolishScoreFromQuality(candidateQuality);
        if (candidateDefects < bestDefects || score < bestScore) {
          best = candidate;
          bestDefects = candidateDefects;
          bestScore = score;
        }
      }
    }
    if (!best && evaluations < maxEvaluations) {
      const poolEntries = [...candidatePools.entries()];
      for (let first = 0; first < poolEntries.length && evaluations < maxEvaluations; first += 1) {
        for (let second = first + 1; second < poolEntries.length && evaluations < maxEvaluations; second += 1) {
          const [firstIndex, firstCandidates] = poolEntries[first];
          const [secondIndex, secondCandidates] = poolEntries[second];
          for (const firstCandidate of firstCandidates) {
            for (const secondCandidate of secondCandidates) {
              if (evaluations >= maxEvaluations) break;
              evaluations += 1;
              const candidate = current.map((edge, index) => (
                index === firstIndex
                  ? firstCandidate[firstIndex]
                  : index === secondIndex
                    ? secondCandidate[secondIndex]
                    : edge
              )) as T;
              const candidateDefects = defectCount(candidate);
              if (candidateDefects >= bestDefects) continue;
              const candidateQuality = qualityContext.evaluateChanged(
                candidate,
                [firstIndex, secondIndex],
              );
              if (!candidateQualityIsAcceptable(candidateQuality)) continue;
              if (
                obstacleContext.evaluateKnownChanges(candidate, [firstIndex, secondIndex])
                > baselineObstacleHits
              ) continue;
              const score = finalVisualPolishScoreFromQuality(candidateQuality);
              if (candidateDefects < bestDefects || score < bestScore) {
                best = candidate;
                bestDefects = candidateDefects;
                bestScore = score;
              }
            }
          }
        }
      }
    }
    if (!best) break;
    current = best;
  }
  return current;
};
