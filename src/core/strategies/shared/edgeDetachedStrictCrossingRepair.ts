import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';
import {
  buildDetachedStrictCrossingRepairSignature,
  DetachedStrictCrossingRepairMemo,
  type DetachedStrictCrossingPathPatch,
} from './edgeDetachedStrictCrossingMemo';
import {
  allSegmentsOrthogonal,
  axisOf,
  compactPath,
  compareQualityScores,
  createStrictCrossingSegmentIndex,
  createRoutingObstacleGate,
  createDetachedOverlapStateEvaluationContext,
  edgesWithPaths,
  extractPathSegmentRefs,
  extractPathSegmentRefsForPath,
  findStrictCrossings,
  getEdgePath,
  getRoutingObstacles,
  hasShortHairpin,
  pathEquals,
  pathManhattanLength,
  pointNear,
  routeStrictCrossingMazeCandidate,
  shiftInternalSegment,
  STRICT_BYPASS_CLEARANCES,
  strictCrossingsForEdgeSegments,
  type PathSegmentRef,
  type Point,
  withComputedPath,
} from './edgeDetachedOverlapRepair';

const detachedStrictCrossingRepairMemo = new DetachedStrictCrossingRepairMemo(16);

export const STRICT_CROSSING_CANDIDATE_SHORTLIST_LIMIT = 384;

export type DetachedStrictCrossingScoreEvaluationContext = {
  evaluate: (candidatePaths: Point[][]) => number;
  evaluateChanged: (candidatePaths: Point[][], changedIndexes: readonly number[]) => number;
};

export type DetachedStrictCrossingScoreEvaluationContextFactory = (
  baselinePaths: Point[][],
  edges: Edge[],
  nodes: ReactFlowNode[],
) => DetachedStrictCrossingScoreEvaluationContext;

export type DetachedStrictCrossingRepairDiagnostics = {
  generatedCandidateCount: number;
  deduplicatedCandidateCount: number;
  evaluatedCandidateCount: number;
  acceptedCandidateCount: number;
  minimumCandidateCount: number;
  maximumCandidateCount: number;
  strictHitCount: number;
  iterationCount: number;
  cacheHitCount: number;
};

export const createDetachedStrictCrossingRepairDiagnostics = (): DetachedStrictCrossingRepairDiagnostics => ({
  generatedCandidateCount: 0,
  deduplicatedCandidateCount: 0,
  evaluatedCandidateCount: 0,
  acceptedCandidateCount: 0,
  minimumCandidateCount: 0,
  maximumCandidateCount: 0,
  strictHitCount: 0,
  iterationCount: 0,
  cacheHitCount: 0,
});

type StrictCrossingCandidateEvidence = {
  edgeCrossings: number;
  obstacleSafe?: boolean;
  qualityScore?: EdgePathQualityScore;
  detachedScore?: number;
};

const strictRepairHardQualityDoesNotRegress = (
  candidate: EdgePathQualityScore,
  baseline: EdgePathQualityScore,
): boolean => candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins;

const materializeRepairedPaths = (
  edges: Edge[],
  patches: readonly Readonly<DetachedStrictCrossingPathPatch>[],
): Edge[] => {
  if (patches.length === 0) return edges;
  const patchesByIndex = new Map(patches.map(patch => [patch.edgeIndex, patch.path]));
  let changed = false;
  const repaired = edges.map((edge, index) => {
    const path = patchesByIndex.get(index);
    const original = compactPath(getEdgePath(edge));
    if (!path || path.length < 2 || pathEquals(path, original)) return edge;
    changed = true;
    return withComputedPath(edge, path);
  });
  return changed ? repaired : edges;
};

const exactPathKey = (path: readonly Point[]): string => (
  path.map(point => `${point.x}:${point.y}`).join('|')
);

const uniqueStrictCrossingCandidatePaths = (
  candidates: readonly Point[][],
  originalPath: readonly Point[],
  diagnostics?: DetachedStrictCrossingRepairDiagnostics,
): Point[][] => {
  if (diagnostics) diagnostics.generatedCandidateCount += candidates.length;
  const seen = new Set<string>([exactPathKey(originalPath)]);
  const unique: Point[][] = [];
  for (const candidate of candidates) {
    const key = exactPathKey(candidate);
    if (seen.has(key)) {
      if (diagnostics) diagnostics.deduplicatedCandidateCount += 1;
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
};

type RankedStrictCrossingCandidatePath = Readonly<{
  path: Point[];
  score: number;
  originalIndex: number;
}>;

const countInteriorBends = (path: readonly Point[]): number => {
  let bendCount = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    if (axisOf(path[index - 1], path[index]) !== axisOf(path[index], path[index + 1])) {
      bendCount += 1;
    }
  }
  return bendCount;
};

const segmentCenterDistance = (path: readonly Point[], segment: PathSegmentRef): number => {
  const segmentCenterX = (segment.a.x + segment.b.x) / 2;
  const segmentCenterY = (segment.a.y + segment.b.y) / 2;
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length - 1; index += 1) {
    const point = path[index];
    const distance = Math.abs(point.x - segmentCenterX) + Math.abs(point.y - segmentCenterY);
    if (distance < nearest) nearest = distance;
  }
  return Number.isFinite(nearest) ? nearest : 0;
};

const rankStrictCrossingCandidatePaths = (
  candidates: readonly Point[][],
  originalPath: Point[],
  segment: PathSegmentRef,
  diagnostics?: DetachedStrictCrossingRepairDiagnostics,
): Point[][] => {
  if (candidates.length === 0) return [];
  const shortlistedCount = Math.min(candidates.length, STRICT_CROSSING_CANDIDATE_SHORTLIST_LIMIT);
  if (diagnostics) {
    diagnostics.minimumCandidateCount = diagnostics.minimumCandidateCount === 0
      ? shortlistedCount
      : Math.min(diagnostics.minimumCandidateCount, shortlistedCount);
    diagnostics.maximumCandidateCount = Math.max(
      diagnostics.maximumCandidateCount,
      shortlistedCount,
    );
  }
  if (candidates.length <= STRICT_CROSSING_CANDIDATE_SHORTLIST_LIMIT) return [...candidates];

  const originalLength = pathManhattanLength(originalPath);
  const ranked: RankedStrictCrossingCandidatePath[] = candidates.map((path, originalIndex) => {
    const lengthDelta = Math.max(0, pathManhattanLength(path) - originalLength);
    const bendPenalty = countInteriorBends(path) * 32;
    const localityPenalty = segmentCenterDistance(path, segment) * 0.05;
    return {
      path,
      score: lengthDelta + bendPenalty + localityPenalty + originalIndex * 0.001,
      originalIndex,
    };
  });

  return ranked
    .sort((left, right) => left.score - right.score || left.originalIndex - right.originalIndex)
    .slice(0, STRICT_CROSSING_CANDIDATE_SHORTLIST_LIMIT)
    .map(candidate => candidate.path);
};

function bypassStrictCrossingSegmentCandidates(
  path: Point[],
  segment: PathSegmentRef,
  other: PathSegmentRef,
  clearance = 16,
): Point[][] {
  if (segment.segIdx < 0 || segment.segIdx > path.length - 2) return [];
  if (segment.axis === other.axis) return [];

  const candidates: Point[][] = [];
  const prefix = segment.segIdx === 0 ? [segment.a] : path.slice(0, segment.segIdx);
  const suffix = segment.segIdx === path.length - 2 ? [segment.b] : path.slice(segment.segIdx + 2);
  const clearances = Array.from(new Set([clearance, ...STRICT_BYPASS_CLEARANCES]));
  const readableBridgeClearances = Array.from(new Set([24, 32, 48, 64, 96, 128, 160]));
  const bridgeOffsets = [0, -160, -128, -96, -80, -76, -64, -48, -32, 32, 48, 64, 76, 80, 96, 128, 160];
  const seenCandidateKeys = new Set<string>([exactPathKey(path)]);
  const pushCandidate = (points: Point[]) => {
    const compacted = compactPath(points);
    const key = exactPathKey(compacted);
    if (seenCandidateKeys.has(key)) return;
    seenCandidateKeys.add(key);
    candidates.push(compacted);
  };

  if (segment.axis === 'h' && other.axis === 'v') {
    const direction = Math.sign(segment.b.x - segment.a.x) || 1;
    const crossingX = other.a.x;
    const minY = Math.min(other.a.y, other.b.y);
    const maxY = Math.max(other.a.y, other.b.y);
    if (
      segment.segIdx >= 2
      && axisOf(path[segment.segIdx - 2], path[segment.segIdx - 1]) === 'h'
      && axisOf(path[segment.segIdx - 1], path[segment.segIdx]) === 'v'
    ) {
      const shortcutAnchor = path[segment.segIdx - 2];
      for (const offset of readableBridgeClearances) {
        const farX = crossingX + direction * offset;
        if (
          farX > Math.min(segment.a.x, segment.b.x) + 1
          && farX < Math.max(segment.a.x, segment.b.x) - 1
        ) {
          pushCandidate([
            ...path.slice(0, segment.segIdx - 1),
            { x: farX, y: shortcutAnchor.y },
            { x: farX, y: segment.a.y },
            segment.b,
            ...suffix,
          ]);
        }
      }
    }
    for (const offset of clearances) {
      const beforeX = crossingX - direction * offset;
      const afterX = crossingX + direction * offset;
      const insideBridge = beforeX > Math.min(segment.a.x, segment.b.x) + 1
        && beforeX < Math.max(segment.a.x, segment.b.x) - 1
        && afterX > Math.min(segment.a.x, segment.b.x) + 1
        && afterX < Math.max(segment.a.x, segment.b.x) - 1;
      if (insideBridge) {
        for (const laneY of [segment.a.y - offset, segment.a.y + offset]) {
          pushCandidate([
            ...path.slice(0, segment.segIdx + 1),
            { x: beforeX, y: segment.a.y },
            { x: beforeX, y: laneY },
            { x: afterX, y: laneY },
            { x: afterX, y: segment.a.y },
            segment.b,
            ...suffix,
          ]);
        }
      }
      for (const laneY of [minY - offset, maxY + offset]) {
        pushCandidate([
          ...prefix,
          { x: segment.a.x, y: laneY },
          { x: segment.b.x, y: laneY },
          ...suffix,
        ]);
        const suffixAnchor = suffix[0];
        if (suffixAnchor && axisOf(segment.b, suffixAnchor) === 'v') {
          for (const bridgeClearance of readableBridgeClearances) {
            for (const exitX of [segment.b.x - bridgeClearance, segment.b.x + bridgeClearance]) {
              pushCandidate([
                ...prefix,
                { x: segment.a.x, y: laneY },
                { x: exitX, y: laneY },
                { x: exitX, y: suffixAnchor.y },
                ...suffix,
              ]);
            }
          }
        }
        if (
          segment.segIdx >= 2
          && axisOf(path[segment.segIdx - 2], path[segment.segIdx - 1]) === 'h'
          && axisOf(path[segment.segIdx - 1], path[segment.segIdx]) === 'v'
        ) {
          const shortcutAnchor = path[segment.segIdx - 2];
          pushCandidate([
            ...path.slice(0, segment.segIdx - 1),
            { x: shortcutAnchor.x, y: laneY },
            { x: segment.b.x, y: laneY },
            ...suffix,
          ]);
          for (const bridgeOffset of bridgeOffsets) {
            const bridgeX = segment.a.x + bridgeOffset;
            pushCandidate([
              ...path.slice(0, segment.segIdx - 1),
              { x: bridgeX, y: path[segment.segIdx - 1].y },
              { x: bridgeX, y: laneY },
              { x: segment.b.x, y: laneY },
              ...suffix,
            ]);
          }
        }
        if (segment.segIdx === 1 && axisOf(path[0], path[1]) === 'v') {
          for (const bridgeOffset of bridgeOffsets) {
            const bridgeX = segment.a.x + bridgeOffset;
            pushCandidate([
              path[0],
              { x: bridgeX, y: path[0].y },
              { x: bridgeX, y: laneY },
              { x: segment.b.x, y: laneY },
              ...suffix,
            ]);
          }
        }
      }
    }
  } else if (segment.axis === 'v' && other.axis === 'h') {
    const direction = Math.sign(segment.b.y - segment.a.y) || 1;
    const crossingY = other.a.y;
    const minX = Math.min(other.a.x, other.b.x);
    const maxX = Math.max(other.a.x, other.b.x);
    if (
      segment.segIdx >= 2
      && axisOf(path[segment.segIdx - 2], path[segment.segIdx - 1]) === 'v'
      && axisOf(path[segment.segIdx - 1], path[segment.segIdx]) === 'h'
    ) {
      const shortcutAnchor = path[segment.segIdx - 2];
      for (const offset of readableBridgeClearances) {
        const farY = crossingY + direction * offset;
        if (
          farY > Math.min(segment.a.y, segment.b.y) + 1
          && farY < Math.max(segment.a.y, segment.b.y) - 1
        ) {
          pushCandidate([
            ...path.slice(0, segment.segIdx - 1),
            { x: shortcutAnchor.x, y: farY },
            { x: segment.a.x, y: farY },
            segment.b,
            ...suffix,
          ]);
        }
      }
    }
    for (const offset of clearances) {
      const beforeY = crossingY - direction * offset;
      const afterY = crossingY + direction * offset;
      const insideBridge = beforeY > Math.min(segment.a.y, segment.b.y) + 1
        && beforeY < Math.max(segment.a.y, segment.b.y) - 1
        && afterY > Math.min(segment.a.y, segment.b.y) + 1
        && afterY < Math.max(segment.a.y, segment.b.y) - 1;
      if (insideBridge) {
        for (const laneX of [segment.a.x - offset, segment.a.x + offset]) {
          pushCandidate([
            ...path.slice(0, segment.segIdx + 1),
            { x: segment.a.x, y: beforeY },
            { x: laneX, y: beforeY },
            { x: laneX, y: afterY },
            { x: segment.a.x, y: afterY },
            segment.b,
            ...suffix,
          ]);
        }
      }
      for (const laneX of [minX - offset, maxX + offset]) {
        pushCandidate([
          ...prefix,
          { x: laneX, y: segment.a.y },
          { x: laneX, y: segment.b.y },
          ...suffix,
        ]);
        const suffixAnchor = suffix[0];
        if (suffixAnchor && axisOf(segment.b, suffixAnchor) === 'h') {
          for (const bridgeClearance of readableBridgeClearances) {
            for (const exitY of [segment.b.y - bridgeClearance, segment.b.y + bridgeClearance]) {
              pushCandidate([
                ...prefix,
                { x: laneX, y: segment.a.y },
                { x: laneX, y: exitY },
                { x: suffixAnchor.x, y: exitY },
                ...suffix,
              ]);
            }
          }
        }
        if (
          segment.segIdx >= 2
          && axisOf(path[segment.segIdx - 2], path[segment.segIdx - 1]) === 'v'
          && axisOf(path[segment.segIdx - 1], path[segment.segIdx]) === 'h'
        ) {
          const shortcutAnchor = path[segment.segIdx - 2];
          pushCandidate([
            ...path.slice(0, segment.segIdx - 1),
            { x: laneX, y: shortcutAnchor.y },
            { x: laneX, y: segment.b.y },
            ...suffix,
          ]);
          for (const bridgeOffset of bridgeOffsets) {
            const bridgeY = segment.a.y + bridgeOffset;
            pushCandidate([
              ...path.slice(0, segment.segIdx - 1),
              { x: path[segment.segIdx - 1].x, y: bridgeY },
              { x: laneX, y: bridgeY },
              { x: laneX, y: segment.b.y },
              ...suffix,
            ]);
          }
        }
        if (segment.segIdx === 1 && axisOf(path[0], path[1]) === 'h') {
          for (const bridgeOffset of bridgeOffsets) {
            const bridgeY = segment.a.y + bridgeOffset;
            pushCandidate([
              path[0],
              { x: path[0].x, y: bridgeY },
              { x: laneX, y: bridgeY },
              { x: laneX, y: segment.b.y },
              ...suffix,
            ]);
          }
        }
      }
    }
  }

  return candidates.filter(candidate => (
    candidate.length >= 2
    && pointNear(candidate[0], path[0], 1)
    && pointNear(candidate[candidate.length - 1], path[path.length - 1], 1)
    && allSegmentsOrthogonal(candidate)
  ));
}

const repairDetachedStrictCrossingPaths = (
  inputPaths: Point[][],
  edges: Edge[],
  nodes: ReactFlowNode[],
  createScoreEvaluationContext: DetachedStrictCrossingScoreEvaluationContextFactory,
  diagnostics?: DetachedStrictCrossingRepairDiagnostics,
): Point[][] => {
  let paths = inputPaths;
  const routingObstacleGate = createRoutingObstacleGate(edges, getRoutingObstacles(nodes), undefined, nodes);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const hits = findStrictCrossings(paths, edges);
    if (hits.length === 0) break;
    if (diagnostics) {
      diagnostics.iterationCount += 1;
      diagnostics.strictHitCount += hits.length;
    }

    const currentEdges = edgesWithPaths(edges, paths);
    const qualityContext = createEdgePathQualityEvaluationContext(currentEdges);
    const currentQualityScore = qualityContext.evaluate(currentEdges);
    const currentSegments = extractPathSegmentRefs(paths, edges);
    const strictCrossingSegmentIndex = createStrictCrossingSegmentIndex(currentSegments);
    let detachedScoreContext: DetachedStrictCrossingScoreEvaluationContext | null = null;
    let bestScore: number | null = null;
    let bestQualityScore = currentQualityScore;
    let bestPaths: Point[][] | null = null;
    let bestChangedEdgeIndex: number | null = null;
    const crossingCountByEdgeIndex = new Map<number, number>();
    for (const hit of hits) {
      crossingCountByEdgeIndex.set(hit.a.edgeIndex, (crossingCountByEdgeIndex.get(hit.a.edgeIndex) ?? 0) + 1);
      crossingCountByEdgeIndex.set(hit.b.edgeIndex, (crossingCountByEdgeIndex.get(hit.b.edgeIndex) ?? 0) + 1);
    }
    const maxEdgeCrossings = Math.max(...crossingCountByEdgeIndex.values());
    const mazeCandidateByEdgeIndex = new Map<number, Point[] | null>();
    const candidateEvidenceByKey = new Map<string, StrictCrossingCandidateEvidence>();
    const getDetachedScoreContext = (): DetachedStrictCrossingScoreEvaluationContext => {
      if (!detachedScoreContext) {
        detachedScoreContext = createScoreEvaluationContext(paths, edges, nodes);
      }
      return detachedScoreContext;
    };
    const getBestDetachedScore = (): number => {
      if (bestScore !== null) return bestScore;
      const context = getDetachedScoreContext();
      bestScore = bestPaths && bestChangedEdgeIndex !== null
        ? context.evaluateChanged(bestPaths, [bestChangedEdgeIndex])
        : context.evaluate(paths);
      return bestScore;
    };

    for (const hit of hits.slice(0, 8)) {
      for (const [segment, other] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
        const shiftedCandidates: Point[][] = [];
        if (segment.axis === 'h' && other.axis === 'v') {
          const minY = Math.min(other.a.y, other.b.y);
          const maxY = Math.max(other.a.y, other.b.y);
          for (const offset of STRICT_BYPASS_CLEARANCES) {
            for (const laneY of [minY - offset, maxY + offset]) {
              const shifted = shiftInternalSegment(
                paths[segment.edgeIndex],
                segment,
                laneY - segment.a.y,
              );
              if (shifted) shiftedCandidates.push(shifted);
            }
          }
        } else if (segment.axis === 'v' && other.axis === 'h') {
          const minX = Math.min(other.a.x, other.b.x);
          const maxX = Math.max(other.a.x, other.b.x);
          for (const offset of STRICT_BYPASS_CLEARANCES) {
            for (const laneX of [minX - offset, maxX + offset]) {
              const shifted = shiftInternalSegment(
                paths[segment.edgeIndex],
                segment,
                laneX - segment.a.x,
              );
              if (shifted) shiftedCandidates.push(shifted);
            }
          }
        }

        let mazeCandidate: Point[] | null = null;
        const segmentEdgeCrossings = crossingCountByEdgeIndex.get(segment.edgeIndex) ?? 0;
        const shouldTryMazeCandidate = segmentEdgeCrossings === maxEdgeCrossings && (
          maxEdgeCrossings >= 2
          || (segmentEdgeCrossings >= 1
            && pathManhattanLength(paths[segment.edgeIndex]) >= 1200
            && hasShortHairpin(paths[segment.edgeIndex]))
        );
        if (shouldTryMazeCandidate) {
          if (!mazeCandidateByEdgeIndex.has(segment.edgeIndex)) {
            mazeCandidateByEdgeIndex.set(segment.edgeIndex, routeStrictCrossingMazeCandidate(
              paths[segment.edgeIndex],
              segment.edgeIndex,
              paths,
              edges,
              nodes,
            ));
          }
          mazeCandidate = mazeCandidateByEdgeIndex.get(segment.edgeIndex) ?? null;
        }

        const candidatePathsForSegment = rankStrictCrossingCandidatePaths(
          uniqueStrictCrossingCandidatePaths([
            ...(mazeCandidate ? [mazeCandidate] : []),
            ...shiftedCandidates,
            ...bypassStrictCrossingSegmentCandidates(paths[segment.edgeIndex], segment, other),
          ], paths[segment.edgeIndex], diagnostics),
          paths[segment.edgeIndex],
          segment,
          diagnostics,
        );
        const currentEdgeCrossings = crossingCountByEdgeIndex.get(segment.edgeIndex) ?? 0;
        for (const candidatePath of candidatePathsForSegment) {
          if (diagnostics) diagnostics.evaluatedCandidateCount += 1;
          const candidateEvidenceKey = `${segment.edgeIndex}:${exactPathKey(candidatePath)}`;
          let candidateEvidence = candidateEvidenceByKey.get(candidateEvidenceKey);
          if (candidateEvidence) {
            if (diagnostics) diagnostics.cacheHitCount += 1;
          } else {
            candidateEvidence = {
              edgeCrossings: strictCrossingsForEdgeSegments(
                extractPathSegmentRefsForPath(candidatePath, segment.edgeIndex, edges),
                currentSegments,
                segment.edgeIndex,
                strictCrossingSegmentIndex,
              ),
            };
            candidateEvidenceByKey.set(candidateEvidenceKey, candidateEvidence);
          }
          const candidateEdgeCrossings = candidateEvidence.edgeCrossings;
          if (candidateEdgeCrossings > currentEdgeCrossings) continue;

          const candidateStrictCrossings = currentQualityScore.strictCrossings
            - currentEdgeCrossings
            + candidateEdgeCrossings;
          const reducesStrictCrossings = candidateStrictCrossings < bestQualityScore.strictCrossings;
          const tiesReducedStrictCrossings = candidateStrictCrossings === bestQualityScore.strictCrossings
            && candidateStrictCrossings < currentQualityScore.strictCrossings;
          if (!reducesStrictCrossings && !tiesReducedStrictCrossings) continue;
          let candidatePaths: Point[][] | null = null;
          const getCandidatePaths = (): Point[][] => {
            if (!candidatePaths) {
              candidatePaths = paths.map((path, index) => (
                index === segment.edgeIndex ? candidatePath : path
              ));
            }
            return candidatePaths;
          };
          if (typeof candidateEvidence.obstacleSafe !== 'boolean') {
            candidateEvidence.obstacleSafe = routingObstacleGate(
              paths,
              getCandidatePaths(),
              [segment.edgeIndex],
            );
          }
          if (!candidateEvidence.obstacleSafe) continue;
          if (!candidateEvidence.qualityScore) {
            const candidateEdges = edgesWithPaths(
              currentEdges,
              getCandidatePaths(),
              [segment.edgeIndex],
            );
            candidateEvidence.qualityScore = qualityContext.evaluateChanged(
              candidateEdges,
              [segment.edgeIndex],
            );
          }
          const candidateQualityScore = candidateEvidence.qualityScore;
          if (!strictRepairHardQualityDoesNotRegress(
            candidateQualityScore,
            currentQualityScore,
          )) continue;
          let candidateScore: number | null = null;
          let improvesReducedStrictCandidate = false;
          if (tiesReducedStrictCrossings) {
            const currentBestScore = getBestDetachedScore();
            if (typeof candidateEvidence.detachedScore !== 'number') {
              candidateEvidence.detachedScore = getDetachedScoreContext().evaluateChanged(
                getCandidatePaths(),
                [segment.edgeIndex],
              );
            }
            candidateScore = candidateEvidence.detachedScore;
            improvesReducedStrictCandidate = candidateScore < currentBestScore - 25
              || compareQualityScores(candidateQualityScore, bestQualityScore) < 0;
          }
          if (
            reducesStrictCrossings
            || improvesReducedStrictCandidate
          ) {
            bestScore = reducesStrictCrossings ? null : candidateScore;
            bestQualityScore = candidateQualityScore;
            bestPaths = getCandidatePaths();
            bestChangedEdgeIndex = segment.edgeIndex;
            if (diagnostics) diagnostics.acceptedCandidateCount += 1;
          }
        }
      }
    }

    if (!bestPaths) break;
    paths = bestPaths;
  }

  const changedIndexes = paths.flatMap((path, edgeIndex) => (
    pathEquals(path, inputPaths[edgeIndex] ?? []) ? [] : [edgeIndex]
  ));
  if (changedIndexes.length === 0) return inputPaths;
  if (!routingObstacleGate(inputPaths, paths, changedIndexes)) return inputPaths;

  const baselineEdges = edgesWithPaths(edges, inputPaths);
  const candidateEdges = edgesWithPaths(baselineEdges, paths, changedIndexes);
  const finalQualityContext = createEdgePathQualityEvaluationContext(baselineEdges);
  const baselineQuality = finalQualityContext.evaluate(baselineEdges);
  const candidateQuality = finalQualityContext.evaluateChanged(candidateEdges, changedIndexes);
  return strictRepairHardQualityDoesNotRegress(candidateQuality, baselineQuality)
    ? paths
    : inputPaths;
};

const buildPathPatches = (
  inputPaths: Point[][],
  paths: Point[][],
): DetachedStrictCrossingPathPatch[] => paths.flatMap<DetachedStrictCrossingPathPatch>((path, edgeIndex) => (
  pathEquals(path, inputPaths[edgeIndex] ?? [])
    ? []
    : [{ edgeIndex, path }]
));

export function repairDetachedStrictCrossingBypasses(
  edges: Edge[],
  nodes: ReactFlowNode[],
  diagnostics?: DetachedStrictCrossingRepairDiagnostics,
): Edge[] {
  const inputPaths = edges.map(edge => compactPath(getEdgePath(edge)));
  if (inputPaths.filter(path => path.length >= 2).length < 2) return edges;

  const inputSignature = buildDetachedStrictCrossingRepairSignature(edges, nodes, inputPaths);
  const cachedPatches = detachedStrictCrossingRepairMemo.get(inputSignature);
  if (cachedPatches) {
    if (diagnostics) diagnostics.cacheHitCount += 1;
    return materializeRepairedPaths(edges, cachedPatches);
  }

  const paths = repairDetachedStrictCrossingPaths(
    inputPaths,
    edges,
    nodes,
    createDetachedOverlapStateEvaluationContext,
    diagnostics,
  );
  const patches = buildPathPatches(inputPaths, paths);
  detachedStrictCrossingRepairMemo.set(inputSignature, patches);
  return materializeRepairedPaths(edges, patches);
}

export function repairDetachedStrictCrossingBypassesWithScoreContextForTesting(
  edges: Edge[],
  nodes: ReactFlowNode[],
  createScoreEvaluationContext: DetachedStrictCrossingScoreEvaluationContextFactory,
): Edge[] {
  const inputPaths = edges.map(edge => compactPath(getEdgePath(edge)));
  if (inputPaths.filter(path => path.length >= 2).length < 2) return edges;
  const paths = repairDetachedStrictCrossingPaths(
    inputPaths,
    edges,
    nodes,
    createScoreEvaluationContext,
  );
  return materializeRepairedPaths(edges, buildPathPatches(inputPaths, paths));
}
