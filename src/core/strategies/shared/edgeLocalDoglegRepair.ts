import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  buildBroadReturnCandidate,
  buildFiveSegmentHairpinCollapseCandidate,
  buildHairpinBridgeCollapseCandidates,
  buildMonotonicStaircaseCollapseCandidate,
  buildNearReturnContinuationCollapseCandidate,
  buildOppositeReturnOffsetCandidate,
  buildReadableSideStepCandidate,
  buildReturnNotchCandidate,
  buildStepCandidate,
  buildTinyCornerBypassCandidate,
  buildTinyEndpointOffsetCandidates,
  buildTinyInteriorBridgeCollapseCandidate,
  buildTinyTerminalBridgeCollapseCandidates,
} from './edgeLocalDoglegBasicCandidates';
import {
  buildEndpointChannelBypassCandidates,
  buildEndpointTinyCornerLaneCandidates,
  buildOuterLaneContractionCandidates,
  buildTerminalStubCandidate,
  buildTinyCornerLaneBypassCandidates,
  buildTinyCornerObstacleBypassCandidates,
  buildTinyCornerReadableLadderCandidate,
  buildTinyLeadingBridgeWidenCandidates,
} from './edgeLocalDoglegAdvancedCandidates';
import { routeStrictCrossingMazeCandidate } from './edgeDetachedOverlapRepair';
import type { EdgeObstacleInteractionContext, Point, Rect } from './edgeLocalDoglegGeometry';
import {
  MAX_TERMINAL_STUB_LENGTH_PENALTY,
  MAX_TINY_CLEANUP_LENGTH_PENALTY,
  MAX_TINY_CLEANUP_RELATED_OVERLAP_PENALTY,
  MAX_VISUAL_POLISH_LENGTH_PENALTY,
  MIN_LENGTH_SAVING,
  MIN_TERMINAL_STUB,
  axisOf,
  bendCount,
  compactPath,
  createChangedEdgePathEvaluationBuffer,
  createEdgeObstacleInteractionContext,
  createEdgePathInteractionContext,
  createLocalDoglegCandidateSnapshot,
  edgesWithCurrentPaths,
  getEdgePath,
  getRoutingObstacles,
  hasLocalDoglegRisk,
  hasSameEndpoints,
  hasTinyInteriorSegment,
  localVisualNoise,
  nodeRect,
  pathEquals,
  pathLength,
  segmentLength,
  slideEndpointOnSide,
  terminalStubScore,
  toSegments,
  withComputedPath,
} from './edgeLocalDoglegGeometry';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityEvaluationContext,
} from './edgeStrictCrossingGuard';

function findBestLocalDoglegCandidate(
  path: Point[],
  edge: Edge,
  edgeIndex: number,
  edgeKey: string,
  edges: Edge[],
  edgeKeys: string[],
  pathByEdgeKey: Map<string, Point[]>,
  obstacles: Map<string, Rect>,
  sourceRect: Rect | null,
  targetRect: Rect | null,
  obstacleContext: EdgeObstacleInteractionContext,
  qualityContext: EdgePathQualityEvaluationContext,
  interactionContext = createEdgePathInteractionContext(edgeKey, pathByEdgeKey),
): Point[] | null {
  const currentLength = pathLength(path);
  const currentBends = bendCount(path);
  const currentSegments = toSegments(path);
  const currentCrossings = interactionContext.countCrossings(currentSegments);
  const currentParallelOverlap = interactionContext.countParallelOverlap(currentSegments);
  const currentObstacleHits = obstacleContext.countPathHits(path);
  const currentEdges = edgesWithCurrentPaths(edges, edgeKeys, pathByEdgeKey, { index: edgeIndex, path });
  const candidateBuffer = createChangedEdgePathEvaluationBuffer(currentEdges, edgeIndex);
  const currentQuality = qualityContext.evaluateChanged(currentEdges, [edgeIndex]);
  let bestPath: Point[] | null = null;
  let bestLength = currentLength;
  let bestBends = currentBends;
  let bestCrossings = currentCrossings;
  let bestParallelOverlap = currentParallelOverlap;
  let bestObstacleHits = currentObstacleHits;
  let bestTerminalStubScore = terminalStubScore(path);
  let bestVisualNoise = localVisualNoise(path);
  let bestQuality = currentQuality;

  const tryCandidate = (candidate: Point[] | null, options: { preserveEndpoints?: boolean } = {}) => {
    if (!candidate) return;
    const preserveEndpoints = options.preserveEndpoints !== false;
    const snapshot = createLocalDoglegCandidateSnapshot(candidate);
    const normalized = snapshot.path;
    if (normalized.length < 2) return;
    if (preserveEndpoints && !hasSameEndpoints(path, normalized)) return;
    const obstacleHits = obstacleContext.countSegmentHits(snapshot.segments);
    if (obstacleHits > currentObstacleHits || obstacleHits > bestObstacleHits) return;

    const length = snapshot.length;
    const bends = snapshot.bends;
    const crossings = interactionContext.countCrossings(snapshot.segments);
    if (crossings > currentCrossings || crossings > bestCrossings) return;
    const candidateEdges = candidateBuffer.withPath(normalized);
    const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
    const tinyGateCleanup = currentQuality.tinyInteriorDoglegs > 0
      && candidateQuality.tinyInteriorDoglegs < currentQuality.tinyInteriorDoglegs
      && candidateQuality.hairpins <= currentQuality.hairpins + 2
      && bends <= currentBends + 4
      && length <= currentLength + MAX_TINY_CLEANUP_LENGTH_PENALTY;
    if (
      candidateQuality.nonOrthogonalSegments > currentQuality.nonOrthogonalSegments
      || candidateQuality.nonOrthogonalSegments > bestQuality.nonOrthogonalSegments
      || candidateQuality.strictCrossings > currentQuality.strictCrossings
      || candidateQuality.strictCrossings > bestQuality.strictCrossings
      || candidateQuality.reverseOverlap > currentQuality.reverseOverlap
      || candidateQuality.reverseOverlap > bestQuality.reverseOverlap
      || candidateQuality.unrelatedOverlap > currentQuality.unrelatedOverlap
      || candidateQuality.unrelatedOverlap > bestQuality.unrelatedOverlap
      || candidateQuality.unexplainedRelatedOverlap > currentQuality.unexplainedRelatedOverlap
      || candidateQuality.unexplainedRelatedOverlap > bestQuality.unexplainedRelatedOverlap
      || candidateQuality.shortEndpointStubs > currentQuality.shortEndpointStubs
      || candidateQuality.shortEndpointStubs > bestQuality.shortEndpointStubs
      || (!tinyGateCleanup && candidateQuality.hairpins > currentQuality.hairpins)
      || (!tinyGateCleanup && candidateQuality.hairpins > bestQuality.hairpins)
    ) return;
    const parallelOverlap = interactionContext.countParallelOverlap(snapshot.segments);

    const stubScore = terminalStubScore(normalized);
    const visualNoise = localVisualNoise(normalized);
    const tinyCleanupRelatedOverlapAllowance = tinyGateCleanup || (bestVisualNoise > 0 && visualNoise < bestVisualNoise)
      ? MAX_TINY_CLEANUP_RELATED_OVERLAP_PENALTY
      : 0;
    if (
      candidateQuality.relatedOverlap > currentQuality.relatedOverlap + tinyCleanupRelatedOverlapAllowance
      || candidateQuality.relatedOverlap > bestQuality.relatedOverlap + tinyCleanupRelatedOverlapAllowance
    ) return;
    const fewerCrossings = crossings < bestCrossings;
    const fewerParallelOverlap = parallelOverlap < bestParallelOverlap;
    const fewerObstacleHits = obstacleHits < bestObstacleHits;
    const shorter = length < bestLength - MIN_LENGTH_SAVING;
    const simpler = bends < bestBends && length <= bestLength + MIN_LENGTH_SAVING;
    const visuallyCleaner = visualNoise < bestVisualNoise
      && bends <= bestBends + 2
      && length <= bestLength + MAX_VISUAL_POLISH_LENGTH_PENALTY;
    const hardTinyCleanup = bestVisualNoise > 0
      && visualNoise < bestVisualNoise
      && bends <= bestBends + 2
      && length <= bestLength + MAX_TINY_CLEANUP_LENGTH_PENALTY;
    const fewerTinyDoglegs = candidateQuality.tinyInteriorDoglegs < bestQuality.tinyInteriorDoglegs
      && bends <= bestBends + 4
      && length <= bestLength + MAX_TINY_CLEANUP_LENGTH_PENALTY;
    const betterTerminalStub = bestTerminalStubScore < MIN_TERMINAL_STUB
      && stubScore > bestTerminalStubScore + MIN_LENGTH_SAVING
      && length <= bestLength + MAX_TERMINAL_STUB_LENGTH_PENALTY;
    if (
      !fewerCrossings
      && !fewerParallelOverlap
      && !fewerObstacleHits
      && !shorter
      && !simpler
      && !visuallyCleaner
      && !hardTinyCleanup
      && !fewerTinyDoglegs
      && !betterTerminalStub
    ) return;

    bestPath = normalized;
    bestLength = length;
    bestBends = bends;
    bestCrossings = crossings;
    bestParallelOverlap = parallelOverlap;
    bestObstacleHits = obstacleHits;
    bestTerminalStubScore = stubScore;
    bestVisualNoise = visualNoise;
    bestQuality = candidateQuality;
  };

  tryCandidate(buildTerminalStubCandidate(path, true));
  tryCandidate(buildTerminalStubCandidate(path, false));
  for (const candidate of buildEndpointChannelBypassCandidates(
    path,
    edgeKey,
    pathByEdgeKey,
    sourceRect,
    targetRect,
  )) {
    tryCandidate(candidate, { preserveEndpoints: false });
  }

  for (let index = 1; index + 3 < path.length - 1; index += 1) {
    tryCandidate(buildStepCandidate(path, index));
    for (const candidate of buildOuterLaneContractionCandidates(path, index, edge, edgeKey, pathByEdgeKey, obstacles)) {
      tryCandidate(candidate);
    }
  }
  for (let index = 0; index + 3 < path.length; index += 1) {
    for (const candidate of buildHairpinBridgeCollapseCandidates(path, index)) tryCandidate(candidate);
    tryCandidate(buildReadableSideStepCandidate(path, index));
    tryCandidate(buildMonotonicStaircaseCollapseCandidate(path, index));
    tryCandidate(buildTinyInteriorBridgeCollapseCandidate(path, index));
    tryCandidate(buildTinyCornerBypassCandidate(path, index));
    tryCandidate(buildTinyCornerReadableLadderCandidate(path, index));
    for (const candidate of buildTinyCornerLaneBypassCandidates(path, index)) tryCandidate(candidate);
    for (const candidate of buildTinyCornerObstacleBypassCandidates(path, index, edge, obstacles)) tryCandidate(candidate);
    for (const candidate of buildEndpointTinyCornerLaneCandidates(
      path,
      index,
      edgeKey,
      pathByEdgeKey,
      sourceRect,
    )) {
      tryCandidate(candidate, { preserveEndpoints: false });
    }
    for (const candidate of buildTinyLeadingBridgeWidenCandidates(path, index)) tryCandidate(candidate);
  }
  for (let index = 0; index + 3 < path.length; index += 1) {
    for (const candidate of buildTinyEndpointOffsetCandidates(path, index, sourceRect, targetRect)) {
      tryCandidate(candidate, { preserveEndpoints: false });
    }
    for (const candidate of buildTinyTerminalBridgeCollapseCandidates(path, index, sourceRect, targetRect)) {
      tryCandidate(candidate.path, { preserveEndpoints: candidate.preserveEndpoints });
    }
  }
  for (let index = 1; index + 4 < path.length - 1; index += 1) {
    tryCandidate(buildReturnNotchCandidate(path, index));
    tryCandidate(buildBroadReturnCandidate(path, index));
    tryCandidate(buildOppositeReturnOffsetCandidate(path, index));
  }
  for (let index = 0; index + 5 < path.length; index += 1) {
    tryCandidate(buildNearReturnContinuationCollapseCandidate(path, index));
    tryCandidate(buildFiveSegmentHairpinCollapseCandidate(path, index));
  }

  return bestPath;
}

function repairPath(
  path: Point[],
  edge: Edge,
  edgeIndex: number,
  edgeKey: string,
  edges: Edge[],
  edgeKeys: string[],
  pathByEdgeKey: Map<string, Point[]>,
  obstacles: Map<string, Rect>,
  sourceRect: Rect | null,
  targetRect: Rect | null,
  obstacleContext: EdgeObstacleInteractionContext,
  qualityContext: EdgePathQualityEvaluationContext,
): Point[] {
  let current = compactPath(path);
  const interactionContext = createEdgePathInteractionContext(edgeKey, pathByEdgeKey);
  for (let pass = 0; pass < 6; pass += 1) {
    const candidate = findBestLocalDoglegCandidate(
      current,
      edge,
      edgeIndex,
      edgeKey,
      edges,
      edgeKeys,
      pathByEdgeKey,
      obstacles,
      sourceRect,
      targetRect,
      obstacleContext,
      qualityContext,
      interactionContext,
    );
    if (!candidate || pathEquals(candidate, current)) break;
    current = candidate;
    pathByEdgeKey.set(edgeKey, current);
  }
  return current;
}

function collapseShortMazeEndpointStubs(
  path: Point[],
  sourceRect: Rect | null,
  targetRect: Rect | null,
): Point[] {
  let current = compactPath(path);
  if (current.length >= 3) {
    const firstAxis = axisOf(current[0], current[1]);
    const nextAxis = axisOf(current[1], current[2]);
    const firstLength = segmentLength(current[0], current[1]);
    if (firstAxis && nextAxis && firstAxis !== nextAxis && firstLength < MIN_TERMINAL_STUB) {
      const movedStart = slideEndpointOnSide(
        current[0],
        sourceRect,
        nextAxis,
        nextAxis === 'v' ? current[1].x : current[1].y,
      );
      const fallbackStart = nextAxis === 'v'
        ? { x: current[1].x, y: current[0].y }
        : { x: current[0].x, y: current[1].y };
      const nextStart = movedStart
        || (segmentLength(current[0], fallbackStart) <= MIN_TERMINAL_STUB ? fallbackStart : null);
      if (nextStart) current = compactPath([nextStart, ...current.slice(2)]);
    }
  }

  if (current.length >= 3) {
    const lastIndex = current.length - 1;
    const previousAxis = axisOf(current[lastIndex - 2], current[lastIndex - 1]);
    const lastAxis = axisOf(current[lastIndex - 1], current[lastIndex]);
    const lastLength = segmentLength(current[lastIndex - 1], current[lastIndex]);
    if (previousAxis && lastAxis && previousAxis !== lastAxis && lastLength < MIN_TERMINAL_STUB) {
      const movedEnd = slideEndpointOnSide(
        current[lastIndex],
        targetRect,
        previousAxis,
        previousAxis === 'v' ? current[lastIndex - 1].x : current[lastIndex - 1].y,
      );
      const fallbackEnd = previousAxis === 'v'
        ? { x: current[lastIndex - 1].x, y: current[lastIndex].y }
        : { x: current[lastIndex].x, y: current[lastIndex - 1].y };
      const nextEnd = movedEnd
        || (segmentLength(current[lastIndex], fallbackEnd) <= MIN_TERMINAL_STUB ? fallbackEnd : null);
      if (nextEnd) current = compactPath([...current.slice(0, lastIndex - 1), nextEnd]);
    }
  }

  return current;
}

function repairRemainingTinyArtifactsWithMaze(
  path: Point[],
  edge: Edge,
  edgeIndex: number,
  edgeKey: string,
  edges: Edge[],
  edgeKeys: string[],
  pathByEdgeKey: Map<string, Point[]>,
  nodes: ReactFlowNode[],
  sourceRect: Rect | null,
  targetRect: Rect | null,
  obstacleContext: EdgeObstacleInteractionContext,
  qualityContext: EdgePathQualityEvaluationContext,
): Point[] {
  const currentNoise = localVisualNoise(path);
  if (currentNoise <= 0) return path;
  if (!hasTinyInteriorSegment(path)) return path;
  if (terminalStubScore(path) < MIN_TERMINAL_STUB) return path;

  const allPaths = edgeKeys.map(key => pathByEdgeKey.get(key) ?? []);
  const candidate = routeStrictCrossingMazeCandidate(path, edgeIndex, allPaths, edges, nodes);
  if (!candidate || !hasSameEndpoints(path, candidate)) return path;
  const snapshot = createLocalDoglegCandidateSnapshot(
    collapseShortMazeEndpointStubs(candidate, sourceRect, targetRect),
  );
  const normalized = snapshot.path;
  if (normalized.length < 2) return path;
  if (obstacleContext.countSegmentHits(snapshot.segments) > 0) return path;
  const interactionContext = createEdgePathInteractionContext(edgeKey, pathByEdgeKey);
  if (
    interactionContext.countCrossings(snapshot.segments)
    > interactionContext.countCrossings(toSegments(path))
  ) return path;
  if (localVisualNoise(normalized) >= currentNoise) return path;
  if (snapshot.bends > bendCount(path) + 4) return path;
  if (snapshot.length > pathLength(path) + MAX_TINY_CLEANUP_LENGTH_PENALTY) return path;
  const baselineEdges = edgesWithCurrentPaths(edges, edgeKeys, pathByEdgeKey);
  const candidateBuffer = createChangedEdgePathEvaluationBuffer(baselineEdges, edgeIndex);
  const baselineQuality = qualityContext.evaluateChanged(baselineEdges, [edgeIndex]);
  const candidateEdges = candidateBuffer.withPath(normalized);
  const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
  if (candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments) return path;
  if (candidateQuality.strictCrossings > baselineQuality.strictCrossings) return path;
  if (candidateQuality.reverseOverlap > baselineQuality.reverseOverlap) return path;
  if (candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap) return path;
  if (candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap) return path;
  if (candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs) return path;
  if (candidateQuality.hairpins > baselineQuality.hairpins) return path;
  return normalized;
}

function widenReadableSideStepPath(
  path: Point[],
  edge: Edge,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
  obstacles: Map<string, Rect>,
): Point[] {
  let current = compactPath(path);
  const interactionContext = createEdgePathInteractionContext(edgeKey, pathByEdgeKey);
  const obstacleContext = createEdgeObstacleInteractionContext(edge, obstacles);
  for (let pass = 0; pass < 4; pass += 1) {
    const currentCrossings = interactionContext.countCrossings(toSegments(current));
    const currentNoise = localVisualNoise(current);
    const currentLength = pathLength(current);
    let best = current;
    let bestNoise = currentNoise;
    let bestLength = currentLength;

    for (let index = 0; index + 4 < current.length; index += 1) {
      const candidates = [
        buildReadableSideStepCandidate(current, index),
        buildMonotonicStaircaseCollapseCandidate(current, index),
      ].filter((candidate): candidate is Point[] => candidate !== null);
      for (const candidate of candidates) {
        const snapshot = createLocalDoglegCandidateSnapshot(candidate);
        const normalized = snapshot.path;
        if (normalized.length < 2 || !hasSameEndpoints(current, normalized)) continue;
        if (obstacleContext.countSegmentHits(snapshot.segments) > 0) continue;
        if (interactionContext.countCrossings(snapshot.segments) > currentCrossings) continue;

        const noise = localVisualNoise(normalized);
        const length = snapshot.length;
        if (
          noise < bestNoise
          && length <= currentLength + MAX_VISUAL_POLISH_LENGTH_PENALTY
          && (noise < bestNoise || length < bestLength)
        ) {
          best = normalized;
          bestNoise = noise;
          bestLength = length;
        }
      }
    }

    if (pathEquals(best, current)) break;
    current = best;
    pathByEdgeKey.set(edgeKey, current);
  }
  return current;
}

export function widenReadableSideStepArtifacts(edges: Edge[], nodes: ReactFlowNode[]): Edge[] {
  if (edges.length === 0) return edges;

  const pathByEdgeKey = new Map<string, Point[]>();
  const edgeKeys = edges.map((edge, index) => edge.id || `${edge.source}->${edge.target}#${index}`);
  edges.forEach((edge, index) => {
    const path = compactPath(getEdgePath(edge));
    if (path.length >= 2) pathByEdgeKey.set(edgeKeys[index], path);
  });
  if (pathByEdgeKey.size === 0) return edges;

  const obstacles = getRoutingObstacles(nodes);
  let changed = false;
  const widenedEdges = edges.map((edge, index) => {
    const edgeKey = edgeKeys[index];
    const path = pathByEdgeKey.get(edgeKey);
    if (!path || path.length < 5) return edge;
    const widened = widenReadableSideStepPath(path, edge, edgeKey, pathByEdgeKey, obstacles);
    if (pathEquals(path, widened)) return edge;
    changed = true;
    pathByEdgeKey.set(edgeKey, widened);
    return withComputedPath(edge, widened);
  });
  return changed ? widenedEdges : edges;
}

export function repairLocalDoglegArtifacts(edges: Edge[], nodes: ReactFlowNode[]): Edge[] {
  if (edges.length === 0) return edges;

  const pathByEdgeKey = new Map<string, Point[]>();
  const edgeKeys = edges.map((edge, index) => edge.id || `${edge.source}->${edge.target}#${index}`);
  const riskyEdgeKeys = new Set<string>();
  edges.forEach((edge, index) => {
    const path = compactPath(getEdgePath(edge));
    if (path.length >= 2) pathByEdgeKey.set(edgeKeys[index], path);
    if (path.length >= 4 && hasLocalDoglegRisk(path)) riskyEdgeKeys.add(edgeKeys[index]);
  });
  if (pathByEdgeKey.size === 0 || riskyEdgeKeys.size === 0) return edges;

  const obstacles = getRoutingObstacles(nodes);
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  let changed = false;
  const repairedEdges = edges.map((edge, index) => {
    const edgeKey = edgeKeys[index];
    const path = pathByEdgeKey.get(edgeKey);
    if (!path || path.length < 4 || !riskyEdgeKeys.has(edgeKey)) return edge;
    const sourceRect = nodeRect(nodeById.get(edge.source));
    const targetRect = nodeRect(nodeById.get(edge.target));
    const obstacleContext = createEdgeObstacleInteractionContext(edge, obstacles);
    const qualityBaselineEdges = edgesWithCurrentPaths(edges, edgeKeys, pathByEdgeKey);
    const qualityContext = createEdgePathQualityEvaluationContext(qualityBaselineEdges);
    const repaired = repairPath(
      path,
      edge,
      index,
      edgeKey,
      edges,
      edgeKeys,
      pathByEdgeKey,
      obstacles,
      sourceRect,
      targetRect,
      obstacleContext,
      qualityContext,
    );
    let finalRepaired = repairRemainingTinyArtifactsWithMaze(
      repaired,
      edge,
      index,
      edgeKey,
      edges,
      edgeKeys,
      pathByEdgeKey,
      nodes,
      sourceRect,
      targetRect,
      obstacleContext,
      qualityContext,
    );
    if (!pathEquals(repaired, finalRepaired)) {
      pathByEdgeKey.set(edgeKey, finalRepaired);
      finalRepaired = repairPath(
        finalRepaired,
        edge,
        index,
        edgeKey,
        edges,
        edgeKeys,
        pathByEdgeKey,
        obstacles,
        sourceRect,
        targetRect,
        obstacleContext,
        qualityContext,
      );
    }
    if (pathEquals(path, finalRepaired)) return edge;
    changed = true;
    pathByEdgeKey.set(edgeKey, finalRepaired);
    return withComputedPath(edge, finalRepaired);
  });
  return changed ? repairedEdges : edges;
}
