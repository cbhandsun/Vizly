import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';

import {
  countEndpointNodeTraversalHits,
  countRoutingObstacleHits,
  countUnrelatedObstacleHits,
} from './edgeWaypointCandidateRepair';

import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';

import {
  EPS,
  BOUNDARY_TOLERANCE,
  MIN_READABLE_BRIDGE,
  DEFAULT_MAX_REPAIRED_EDGES,
  DEFAULT_MAX_GRAPH_EDGES,
  DEFAULT_MAX_DECLARED_AXIS_REPAIRS,
  getEdgePath,
  nodeRect,
  axisOf,
  segmentLength,
  pathLength,
  compactPath,
  pathEquals,
  terminalPositionIsFixed,
  leavesBoundaryOutward,
  declaredBoundarySide,
  boundaryPointOnSide,
  buildGeometricExitTerminalReanchor,
  buildInwardTerminalReanchor,
  offsetOutward,
  buildTerminalCandidate,
  buildTerminalDoglegCollapseCandidate,
  buildTerminalDoglegWidenCandidate,
  buildTerminalCandidateVariants,
  buildNearTerminalStairDepthCandidate,
  terminalOuterCoordinatePool,
  buildTangentialBoundaryLaneCandidates,
  buildTerminalOuterBypassCandidates,
  terminalBoundaryStairRisk,
  routingObstacles,
  withComputedPath,
} from './edgeTerminalBoundaryStairGeometry';

import type {
  Point,
  Rect,
  Axis,
  TerminalRole,
  BoundarySide,
} from './edgeTerminalBoundaryStairGeometry';

function repairInwardEndpointTraversals(
  edge: Edge,
  sourceRect: Rect | null,
  targetRect: Rect | null,
  switchFacingTangentialSide = false,
  preferGeometricExit = false,
): Edge {
  let path = compactPath(getEdgePath(edge));
  if (path.length < 2) return edge;
  let sourceSide: BoundarySide | null = null;
  let targetSide: BoundarySide | null = null;
  if (sourceRect) {
    const sourceRepair = preferGeometricExit
      ? buildGeometricExitTerminalReanchor(path, sourceRect, 'source', edge)
      : buildInwardTerminalReanchor(
        path,
        sourceRect,
        targetRect,
        'source',
        edge,
        switchFacingTangentialSide,
      );
    if (sourceRepair) {
      path = sourceRepair.path;
      sourceSide = sourceRepair.side;
    }
  }
  if (targetRect) {
    const targetRepair = preferGeometricExit
      ? buildGeometricExitTerminalReanchor(path, targetRect, 'target', edge)
      : buildInwardTerminalReanchor(
        path,
        targetRect,
        sourceRect,
        'target',
        edge,
        switchFacingTangentialSide,
      );
    if (targetRepair) {
      path = targetRepair.path;
      targetSide = targetRepair.side;
    }
  }
  if (!sourceSide && !targetSide) return edge;

  const repaired = withComputedPath(edge, path);
  const data = (repaired.data || {}) as Record<string, any>;
  const nextSourceHandle = sourceSide ?? String(repaired.sourceHandle ?? '');
  const nextTargetHandle = targetSide ?? String(repaired.targetHandle ?? '');
  return {
    ...repaired,
    sourceHandle: nextSourceHandle || repaired.sourceHandle,
    targetHandle: nextTargetHandle || repaired.targetHandle,
    data: {
      ...data,
      terminalInteriorTraversalRepaired: true,
      runtimeHandleLock: {
        ...(data.runtimeHandleLock && typeof data.runtimeHandleLock === 'object'
          ? data.runtimeHandleLock
          : {}),
        ...(sourceSide ? { source: true } : {}),
        ...(targetSide ? { target: true } : {}),
      },
      treeRouting: data.treeRouting && Array.isArray(data.treeRouting.points)
        ? {
          ...data.treeRouting,
          effectiveSourceHandle: nextSourceHandle || data.treeRouting.effectiveSourceHandle,
          effectiveTargetHandle: nextTargetHandle || data.treeRouting.effectiveTargetHandle,
          points: path,
        }
        : data.treeRouting,
    },
  };
}

function terminalTraversalQualityDoesNotRegress(
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean {
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.strictCrossings <= baseline.strictCrossings
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins
    && candidate.backtrackPenalty <= baseline.backtrackPenalty;
}

/**
 * Endpoint-body repair is intentionally transactional per edge. A batch `map` can make several
 * individually plausible handle changes cross one another, after which a large-graph early return
 * would accidentally preserve that degraded graph as the new baseline.
 */
function repairGuardedInwardEndpointTraversals(
  edges: Edge[],
  nodeById: Map<string, ReactFlowNode>,
  obstacles: Map<string, Rect>,
  candidateMode: 'preserve-side' | 'geometric-exit' = 'preserve-side',
): Edge[] {
  let current = edges;

  for (let edgeIndex = 0; edgeIndex < current.length; edgeIndex += 1) {
    const edge = current[edgeIndex];
    const path = compactPath(getEdgePath(edge));
    if (path.length < 2) continue;
    const baselineEndpointHits = countEndpointNodeTraversalHits(path, edge, obstacles);
    if (baselineEndpointHits === 0) continue;

    const sourceRect = nodeRect(nodeById.get(edge.source));
    const targetRect = nodeRect(nodeById.get(edge.target));
    const rawCandidates = candidateMode === 'preserve-side'
      ? [{ edge: repairInwardEndpointTraversals(edge, sourceRect, targetRect), sidePriority: 0 }]
      : [{
        edge: repairInwardEndpointTraversals(edge, sourceRect, targetRect, false, true),
        sidePriority: 1,
      }];
    const candidateEntries = rawCandidates.filter(candidate => candidate.edge !== edge);
    if (candidateEntries.length === 0) continue;
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineUnrelatedHits = countUnrelatedObstacleHits(path, edge, obstacles);
    const baselineRoutingHits = countRoutingObstacleHits(path, edge, obstacles);
    let bestEdges: Edge[] | null = null;
    let bestEndpointHits = baselineEndpointHits;
    let bestRoutingHits = baselineRoutingHits;
    let bestSidePriority = Number.POSITIVE_INFINITY;
    let bestLength = Number.POSITIVE_INFINITY;
    const seen = new Set<string>();

    for (const rawCandidate of candidateEntries) {
      const candidateEdge = rawCandidate.edge;
      const candidatePath = compactPath(getEdgePath(candidateEdge));
      const key = `${String(candidateEdge.sourceHandle ?? '')}|${String(candidateEdge.targetHandle ?? '')}|${candidatePath
        .map(point => `${point.x},${point.y}`)
        .join(';')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const candidateEndpointHits = countEndpointNodeTraversalHits(candidatePath, candidateEdge, obstacles);
      const candidateRoutingHits = countRoutingObstacleHits(candidatePath, candidateEdge, obstacles);
      if (
        candidatePath.length < 2
        || candidateEndpointHits >= baselineEndpointHits
        || countUnrelatedObstacleHits(candidatePath, candidateEdge, obstacles) > baselineUnrelatedHits
        || candidateRoutingHits > baselineRoutingHits
      ) continue;
      const candidateEdges = current.map((item, index) => (
        index === edgeIndex ? candidateEdge : item
      ));
      const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
      if (!terminalTraversalQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
      const candidateLength = pathLength(candidatePath);
      if (
        !bestEdges
        || candidateEndpointHits < bestEndpointHits
        || (candidateEndpointHits === bestEndpointHits && candidateRoutingHits < bestRoutingHits)
        || (
          candidateEndpointHits === bestEndpointHits
          && candidateRoutingHits === bestRoutingHits
          && rawCandidate.sidePriority < bestSidePriority
        )
        || (
          candidateEndpointHits === bestEndpointHits
          && candidateRoutingHits === bestRoutingHits
          && rawCandidate.sidePriority === bestSidePriority
          && candidateLength < bestLength - EPS
        )
      ) {
        bestEdges = candidateEdges;
        bestEndpointHits = candidateEndpointHits;
        bestRoutingHits = candidateRoutingHits;
        bestSidePriority = rawCandidate.sidePriority;
        bestLength = candidateLength;
      }
    }
    if (bestEdges) current = bestEdges;
  }

  return current;
}

function declaredTerminalAxisMismatch(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
  side: BoundarySide,
): boolean {
  const ordered = role === 'source' ? path : [...path].reverse();
  const terminal = ordered[0];
  const adjacent = ordered[1];
  if (!terminal || !adjacent) return false;
  const expectedAxis: Axis = side === 'left' || side === 'right' ? 'h' : 'v';
  return axisOf(terminal, adjacent) !== expectedAxis
    || !leavesBoundaryOutward(terminal, adjacent, side)
    || segmentLength(terminal, adjacent) < MIN_READABLE_BRIDGE - EPS
    || segmentLength(terminal, boundaryPointOnSide(terminal, rect, side)) > BOUNDARY_TOLERANCE;
}

function projectDeclaredTerminalCandidate(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
  side: BoundarySide,
  preservePosition: boolean,
): Point[] {
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  if (!ordered[0] || !ordered[1]) return path;
  if (!preservePosition) ordered[0] = boundaryPointOnSide(ordered[0], rect, side);
  const expectedAxis: Axis = side === 'left' || side === 'right' ? 'h' : 'v';
  if (
    axisOf(ordered[0], ordered[1]) === expectedAxis
    && segmentLength(ordered[0], ordered[1]) < MIN_READABLE_BRIDGE - EPS
  ) {
    ordered[1] = offsetOutward(ordered[0], side, MIN_READABLE_BRIDGE);
  }
  const candidate = compactPath(ordered);
  return role === 'source' ? candidate : candidate.reverse();
}

function repairGuardedDeclaredHandleAxisStairs(
  edges: Edge[],
  nodeById: Map<string, ReactFlowNode>,
  obstacles: Map<string, Rect>,
): Edge[] {
  let current = edges;
  let repairedCount = 0;

  for (
    let edgeIndex = 0;
    edgeIndex < current.length && repairedCount < DEFAULT_MAX_DECLARED_AXIS_REPAIRS;
    edgeIndex += 1
  ) {
    const edge = current[edgeIndex];
    const path = compactPath(getEdgePath(edge));
    if (path.length < 4) continue;
    const sourceRect = nodeRect(nodeById.get(edge.source));
    const targetRect = nodeRect(nodeById.get(edge.target));
    const entries = ([
      { role: 'source' as const, rect: sourceRect, side: declaredBoundarySide(edge, 'source') },
      { role: 'target' as const, rect: targetRect, side: declaredBoundarySide(edge, 'target') },
    ]).filter((entry): entry is { role: TerminalRole; rect: Rect; side: BoundarySide } => (
      Boolean(entry.rect && entry.side)
    ));
    if (entries.length === 0) continue;

    const baselineMismatchCount = entries.reduce((count, entry) => (
      count + Number(declaredTerminalAxisMismatch(path, entry.rect, entry.role, entry.side))
    ), 0);
    if (baselineMismatchCount === 0) continue;
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = countRoutingObstacleHits(path, edge, obstacles);
    let bestEdges: Edge[] | null = null;
    let bestMismatchCount = baselineMismatchCount;
    let bestLength = Number.POSITIVE_INFINITY;

    for (const entry of entries) {
      if (!declaredTerminalAxisMismatch(path, entry.rect, entry.role, entry.side)) continue;
      const rawCandidate = buildTerminalCandidate(path, entry.rect, entry.role);
      if (!rawCandidate) continue;
      const candidatePath = projectDeclaredTerminalCandidate(
        rawCandidate,
        entry.rect,
        entry.role,
        entry.side,
        terminalPositionIsFixed(edge, entry.role),
      );
      const candidateMismatchCount = entries.reduce((count, candidateEntry) => (
        count + Number(declaredTerminalAxisMismatch(
          candidatePath,
          candidateEntry.rect,
          candidateEntry.role,
          candidateEntry.side,
        ))
      ), 0);
      if (
        candidateMismatchCount >= bestMismatchCount
        || countRoutingObstacleHits(candidatePath, edge, obstacles) > baselineObstacleHits
      ) continue;
      const candidateEdge = withComputedPath(edge, candidatePath);
      const candidateEdges = current.map((item, index) => (
        index === edgeIndex ? candidateEdge : item
      ));
      const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
      if (!terminalTraversalQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
      const candidateLength = pathLength(candidatePath);
      if (
        !bestEdges
        || candidateMismatchCount < bestMismatchCount
        || (candidateMismatchCount === bestMismatchCount && candidateLength < bestLength - EPS)
      ) {
        bestEdges = candidateEdges;
        bestMismatchCount = candidateMismatchCount;
        bestLength = candidateLength;
      }
    }

    if (bestEdges) {
      current = bestEdges;
      repairedCount += 1;
    }
  }
  return current;
}

function repairCheapTerminalDoglegCollapses(
  edges: Edge[],
  nodeById: Map<string, ReactFlowNode>,
  obstacles: Map<string, Rect>,
): Edge[] {
  let current = edges;
  let repairedCount = 0;
  for (let edgeIndex = 0; edgeIndex < current.length && repairedCount < DEFAULT_MAX_REPAIRED_EDGES; edgeIndex += 1) {
    const edge = current[edgeIndex];
    const path = compactPath(getEdgePath(edge));
    if (path.length !== 4) continue;
    const sourceRect = nodeRect(nodeById.get(edge.source));
    const targetRect = nodeRect(nodeById.get(edge.target));
    if (
      !sourceRect
      || !targetRect
      || terminalPositionIsFixed(edge, 'source')
      || terminalPositionIsFixed(edge, 'target')
    ) continue;
    const candidatePaths = [
      buildTerminalDoglegCollapseCandidate(path, sourceRect, 'source'),
      buildTerminalDoglegCollapseCandidate(path, targetRect, 'target'),
      ...[24, 32, 48, 64, 96].flatMap(clearance => [
        buildTerminalDoglegWidenCandidate(path, sourceRect, 'source', clearance),
        buildTerminalDoglegWidenCandidate(path, targetRect, 'target', clearance),
      ]),
    ].filter((candidate): candidate is Point[] => Boolean(candidate));
    if (candidatePaths.length === 0) continue;

    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = countRoutingObstacleHits(path, edge, obstacles);
    let bestEdges = current;
    let bestQuality = baselineQuality;
    for (const candidatePath of candidatePaths) {
      if (pathEquals(candidatePath, path)) continue;
      const candidateEdge = withComputedPath(edge, candidatePath);
      if (countRoutingObstacleHits(candidatePath, candidateEdge, obstacles) > baselineObstacleHits) continue;
      const candidateEdges = current.map((item, index) => (
        index === edgeIndex ? candidateEdge : item
      ));
      const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
      if (
        candidateQuality.tinyInteriorDoglegs >= baselineQuality.tinyInteriorDoglegs
        || candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
        || candidateQuality.strictCrossings > baselineQuality.strictCrossings
        || candidateQuality.reverseOverlap > baselineQuality.reverseOverlap
        || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
        || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
        || candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs
        || candidateQuality.hairpins > baselineQuality.hairpins
        || candidateQuality.backtrackPenalty > baselineQuality.backtrackPenalty
      ) continue;
      if (
        bestEdges === current
        || candidateQuality.tinyInteriorDoglegs < bestQuality.tinyInteriorDoglegs
        || (
          candidateQuality.tinyInteriorDoglegs === bestQuality.tinyInteriorDoglegs
          && candidateQuality.totalLength < bestQuality.totalLength
        )
      ) {
        bestEdges = candidateEdges;
        bestQuality = candidateQuality;
      }
    }
    if (bestEdges !== current) {
      current = bestEdges;
      repairedCount += 1;
    }
  }
  return current;
}

/**
 * Widens a tiny terminal staircase by sliding the free endpoint along its existing node side.
 * The route keeps the same side and corridor; only the terminal lane is moved, then the full graph
 * crossing/overlap and node-obstacle gates decide whether the candidate is safe.
 */
export function repairTerminalBoundaryStairs(
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: { maxEdges?: number; maxGraphEdges?: number } = {},
): Edge[] {
  if (edges.length === 0 || nodes.length === 0) return edges;
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacles = routingObstacles(nodes);
  let current = repairGuardedInwardEndpointTraversals(
    edges,
    nodeById,
    obstacles,
    'preserve-side',
  );
  current = repairGuardedDeclaredHandleAxisStairs(current, nodeById, obstacles);
  current = repairCheapTerminalDoglegCollapses(current, nodeById, obstacles);
  const maxGraphEdges = Math.max(1, Math.floor(options.maxGraphEdges ?? DEFAULT_MAX_GRAPH_EDGES));
  if (edges.length > maxGraphEdges) {
    return repairGuardedInwardEndpointTraversals(
      current,
      nodeById,
      obstacles,
      'geometric-exit',
    );
  }
  const maxEdges = Math.max(0, Math.floor(options.maxEdges ?? DEFAULT_MAX_REPAIRED_EDGES));
  if (maxEdges === 0) {
    return repairGuardedInwardEndpointTraversals(
      current,
      nodeById,
      obstacles,
      'geometric-exit',
    );
  }
  const riskyEdgeIndexes = current
    .map((edge, edgeIndex) => {
      const path = compactPath(getEdgePath(edge));
      if (path.length < 4) return -1;
      const sourceRect = nodeRect(nodeById.get(edge.source));
      const targetRect = nodeRect(nodeById.get(edge.target));
      return terminalBoundaryStairRisk(path, sourceRect, targetRect) > 0 ? edgeIndex : -1;
    })
    .filter(edgeIndex => edgeIndex >= 0);
  if (riskyEdgeIndexes.length === 0) {
    return repairGuardedInwardEndpointTraversals(
      current,
      nodeById,
      obstacles,
      'geometric-exit',
    );
  }
  const horizontalOuterPool = terminalOuterCoordinatePool(current, obstacles, 'h');
  const verticalOuterPool = terminalOuterCoordinatePool(current, obstacles, 'v');
  let repairedCount = 0;

  for (const edgeIndex of riskyEdgeIndexes) {
    if (repairedCount >= maxEdges) break;
    const edge = current[edgeIndex];
    const path = compactPath(getEdgePath(edge));
    if (path.length < 4) continue;
    const sourceRect = nodeRect(nodeById.get(edge.source));
    const targetRect = nodeRect(nodeById.get(edge.target));
    const baselineRisk = terminalBoundaryStairRisk(path, sourceRect, targetRect);
    if (baselineRisk === 0) continue;

    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = countRoutingObstacleHits(path, edge, obstacles);
    const baselineEndpointTraversalHits = countEndpointNodeTraversalHits(path, edge, obstacles);
    let bestEdges = current;
    let bestPath = path;
    let bestRisk = baselineRisk;
    let bestEndpointTraversalHits = baselineEndpointTraversalHits;

    const candidates: Point[][] = [];
    const sourceHandle = normalizeHandle(edge.sourceHandle);
    const targetHandle = normalizeHandle(edge.targetHandle);
    const sourceDeclaredSide = sourceHandle === 't'
      ? 'top'
      : sourceHandle === 'b'
        ? 'bottom'
        : sourceHandle === 'l'
          ? 'left'
          : sourceHandle === 'r'
            ? 'right'
            : null;
    const targetDeclaredSide = targetHandle === 't'
      ? 'top'
      : targetHandle === 'b'
        ? 'bottom'
        : targetHandle === 'l'
          ? 'left'
          : targetHandle === 'r'
            ? 'right'
            : null;
    const sourceCanMove = Boolean(sourceRect && !terminalPositionIsFixed(edge, 'source'));
    const targetCanMove = Boolean(targetRect && !terminalPositionIsFixed(edge, 'target'));
    const bothTerminalPositionsCanAlign = sourceCanMove && targetCanMove;
    if (sourceRect && targetRect && sourceCanMove && targetCanMove) {
      const sourceBase = buildTerminalCandidate(path, sourceRect, 'source');
      const bothTerminals = sourceBase
        ? buildTerminalCandidate(sourceBase, targetRect, 'target')
        : null;
      if (bothTerminals) candidates.push(bothTerminals);
    }
    if (sourceRect && sourceCanMove) {
      const collapsedSourceDogleg = bothTerminalPositionsCanAlign
        ? buildTerminalDoglegCollapseCandidate(path, sourceRect, 'source')
        : null;
      if (collapsedSourceDogleg) candidates.push(collapsedSourceDogleg);
      candidates.push(...buildTangentialBoundaryLaneCandidates(
        path,
        sourceRect,
        'source',
        sourceDeclaredSide,
        horizontalOuterPool,
        verticalOuterPool,
      ));
      const sourceCandidates = buildTerminalCandidateVariants(path, sourceRect, 'source');
      candidates.push(...sourceCandidates);
      for (const candidate of sourceCandidates) {
        const widened = buildNearTerminalStairDepthCandidate(candidate, 'source');
        if (widened) candidates.push(widened);
      }
      candidates.push(...buildTerminalOuterBypassCandidates(
        path,
        sourceRect,
        'source',
        horizontalOuterPool,
        verticalOuterPool,
      ));
    }
    if (targetRect && targetCanMove) {
      const collapsedTargetDogleg = bothTerminalPositionsCanAlign
        ? buildTerminalDoglegCollapseCandidate(path, targetRect, 'target')
        : null;
      if (collapsedTargetDogleg) candidates.push(collapsedTargetDogleg);
      candidates.push(...buildTangentialBoundaryLaneCandidates(
        path,
        targetRect,
        'target',
        targetDeclaredSide,
        horizontalOuterPool,
        verticalOuterPool,
      ));
      const targetCandidates = buildTerminalCandidateVariants(path, targetRect, 'target');
      candidates.push(...targetCandidates);
      for (const candidate of targetCandidates) {
        const widened = buildNearTerminalStairDepthCandidate(candidate, 'target');
        if (widened) candidates.push(widened);
      }
      candidates.push(...buildTerminalOuterBypassCandidates(
        path,
        targetRect,
        'target',
        horizontalOuterPool,
        verticalOuterPool,
      ));
    }
    const sourceDepthCandidate = buildNearTerminalStairDepthCandidate(path, 'source');
    if (sourceDepthCandidate) candidates.push(sourceDepthCandidate);
    const targetDepthCandidate = buildNearTerminalStairDepthCandidate(path, 'target');
    if (targetDepthCandidate) candidates.push(targetDepthCandidate);

    for (const candidatePath of candidates) {
      if (pathEquals(candidatePath, path)) continue;
      const candidateRisk = terminalBoundaryStairRisk(candidatePath, sourceRect, targetRect);
      if (candidateRisk >= bestRisk) continue;
      const candidateObstacleHits = countRoutingObstacleHits(candidatePath, edge, obstacles);
      if (candidateObstacleHits > baselineObstacleHits) continue;
      const candidateEndpointTraversalHits = countEndpointNodeTraversalHits(
        candidatePath,
        edge,
        obstacles,
      );
      if (candidateEndpointTraversalHits > baselineEndpointTraversalHits) continue;
      const candidateEdges = current.map((candidateEdge, candidateIndex) => (
        candidateIndex === edgeIndex ? withComputedPath(candidateEdge, candidatePath) : candidateEdge
      ));
      const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
      if (
        candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
        || candidateQuality.strictCrossings > baselineQuality.strictCrossings
        || candidateQuality.reverseOverlap > baselineQuality.reverseOverlap
        || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
        || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
        || candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs
        || candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
        || candidateQuality.hairpins > baselineQuality.hairpins
        || candidateQuality.backtrackPenalty > baselineQuality.backtrackPenalty
      ) continue;
      if (
        candidateEndpointTraversalHits < bestEndpointTraversalHits
        || (
          candidateEndpointTraversalHits === bestEndpointTraversalHits
          && (
            candidateRisk < bestRisk
            || (candidateRisk === bestRisk && pathLength(candidatePath) < pathLength(bestPath))
          )
        )
      ) {
        bestEdges = candidateEdges;
        bestPath = candidatePath;
        bestRisk = candidateRisk;
        bestEndpointTraversalHits = candidateEndpointTraversalHits;
      }
    }

    if (bestEdges !== current) {
      current = bestEdges;
      repairedCount += 1;
    }
  }

  return repairGuardedInwardEndpointTraversals(
    current,
    nodeById,
    obstacles,
    'geometric-exit',
  );
}
