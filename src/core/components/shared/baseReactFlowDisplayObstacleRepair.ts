import type { Edge, Node } from '@xyflow/react';

import { repairDetachedStrictCrossingBypasses } from '../../strategies/shared/edgeDetachedStrictCrossingRepair';
import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairDisplaySoftQualityRisks } from '../../strategies/shared/edgeDisplaySoftQualityRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  generateWaypointCandidates,
} from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  calculateEdgePathQualityScore,
  countStrictEdgeCrossings,
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  compactOrthogonalPath,
} from './baseReactFlowDisplayEdgeCore';
import {
  candidateStrictCrossingsForEdge,
  candidateUnrelatedOverlapForEdge,
  displayPathLength,
  extractDisplaySegments,
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  chooseFinalObstacleAwarePolishCandidate,
  countDisplayObstacleHits,
  createDisplayObstacleEvaluationContext,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
  hasHardDisplayOverlapRisk,
  obstacleRepairHardQualityIsAcceptable,
  obstacleRepairScore,
  type DisplayObstacleEvaluationContext,
  type DisplaySoftQualityOptions,
} from './baseReactFlowDisplayEvaluation';
import {
  buildObstacleOuterEscapeCandidates,
  buildObstacleSkirtCandidates,
  buildWholePathOuterLaneCandidates,
} from './baseReactFlowDisplayObstacleCandidates';
import {
  createDisplayObstacleHitContext,
  type DisplayObstacleHitContext,
} from './baseReactFlowDisplayObstacleHitCache';

const DISPLAY_RESIDUAL_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 2,
  maxHitBudget: 6,
  maxQualityEvaluations: 320,
  maxResidualPasses: 1,
  qualityOnly: true,
};

const repairRemainingObstacleHitsWithOuterLanes = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  hitContext: DisplayObstacleHitContext,
): T => {
  let current = edges;
  for (let pass = 0; pass < 2; pass += 1) {
    const entries = current
      .map((edge, edgeIndex) => {
        const path = getDisplayComputedPath(edge);
        return {
          edge,
          edgeIndex,
          path,
          hits: path.length >= 2 ? hitContext.countUnrelated(path, edge) : 0,
        };
      })
      .filter(entry => entry.path.length >= 2 && entry.hits > 0)
      .sort((first, second) => second.hits - first.hits);
    if (entries.length === 0) break;

    let changed = false;
    for (const entry of entries) {
      const edge = current[entry.edgeIndex];
      if (!edge) continue;
      const qualityContext = createEdgePathQualityEvaluationContext(current);
      const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
      const baselineObstacleHits = obstacleContext.evaluate(current);
      const baselineQuality = qualityContext.evaluate(current);
      const baselineStrictCrossings = baselineQuality.strictCrossings;
      const baselinePathHits = hitContext.countUnrelated(entry.path, edge);
      const includeOuterRingCandidates = current.length <= 20 && nodes.length <= 40 && baselinePathHits >= 1;
      const rawCandidates = [
        ...buildWholePathOuterLaneCandidates(entry.path, nodes, edge, includeOuterRingCandidates)
          .map(candidate => ({ path: candidate, priority: 0 })),
      ]
        .map(candidate => ({
          path: candidate.path,
          hits: hitContext.countUnrelated(candidate.path, edge),
          length: displayPathLength(candidate.path),
          priority: candidate.priority,
        }))
        .filter(candidate => candidate.hits < baselinePathHits);
      const candidates = includeOuterRingCandidates
        ? (() => {
          const otherSegmentsForEntry = extractDisplaySegments(current)
            .filter(segment => segment.edgeIndex !== entry.edgeIndex);
          return rawCandidates
            .map(candidate => ({
              ...candidate,
              strictCrossings: candidateStrictCrossingsForEdge(entry.edgeIndex, candidate.path, otherSegmentsForEntry),
              unrelatedOverlap: candidateUnrelatedOverlapForEdge(
                entry.edgeIndex,
                candidate.path,
                current,
                otherSegmentsForEntry,
              ),
            }))
            .sort((first, second) => (
              first.hits - second.hits
              || first.strictCrossings - second.strictCrossings
              || first.unrelatedOverlap - second.unrelatedOverlap
              || first.priority - second.priority
              || first.length - second.length
            ))
            .slice(0, 20);
        })()
        : rawCandidates
          .sort((first, second) => first.hits - second.hits || first.priority - second.priority || first.length - second.length)
          .slice(0, 12);

      let strictRepairAttempts = 0;
      for (const candidate of candidates) {
        const candidateEdges = current.map((candidateEdge, candidateIndex) => (
          candidateIndex === entry.edgeIndex ? withDisplayComputedPath(candidateEdge, candidate.path) : candidateEdge
        )) as T;
        let acceptedEdges = candidateEdges;
        let acceptedQuality = qualityContext.evaluateChanged(acceptedEdges, [entry.edgeIndex]);
        let acceptedStrictCrossings = acceptedQuality.strictCrossings;
        let acceptedObstacleHits = obstacleContext.evaluateKnownChanges(acceptedEdges, [entry.edgeIndex]);
        if (acceptedObstacleHits >= baselineObstacleHits) continue;
        if (acceptedStrictCrossings > baselineStrictCrossings) {
          if (candidate.hits > 0 || strictRepairAttempts >= 3) continue;
          strictRepairAttempts += 1;
          const strictCleaned = repairStrictBypassesIfNeeded(acceptedEdges, nodes) as T;
          const endpointCleaned = repairEndpointOrthogonalPaths(strictCleaned, nodes) as T;
          const detachedCleaned = separateDetachedParallelOverlaps(
            endpointCleaned,
            nodes,
            16,
            DISPLAY_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
          ) as T;
          const microCleaned = repairDisplayMicroArtifacts(detachedCleaned) as T;
          acceptedEdges = chooseFinalObstacleAwarePolishCandidate(
            nodes,
            acceptedEdges,
            strictCleaned,
            endpointCleaned,
            detachedCleaned,
            microCleaned,
          );
          acceptedQuality = evaluateDisplayQualityCandidate(qualityContext, current, acceptedEdges);
          acceptedStrictCrossings = acceptedQuality.strictCrossings;
          acceptedObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, current, acceptedEdges);
        }
        if (acceptedStrictCrossings > baselineStrictCrossings) continue;
        if (acceptedObstacleHits >= baselineObstacleHits) continue;
        if (acceptedQuality.reverseOverlap > baselineQuality.reverseOverlap) continue;
        if (acceptedQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap) continue;
        if (acceptedQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap) continue;
        current = acceptedEdges;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return current;
};

export const repairDisplayObstacleHits = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  layoutDirection: string,
  options: DisplaySoftQualityOptions,
): T => {
  if (edges.length === 0 || nodes.length === 0) return edges;
  const hitContext = createDisplayObstacleHitContext(nodes);
  if (hitContext.obstacles.size === 0 || hitContext.countEdgesUnrelated(edges, getDisplayComputedPath) === 0) {
    return edges;
  }
  let current = edges;
  let qualityEvaluations = 0;
  const fastBudget = options.maxCandidatesPerEdge <= 8 && options.maxQualityEvaluations <= 8;
  const boundedBudget = edges.length > 16 || nodes.length > 24;
  const maxEdges = fastBudget
    ? options.maxEdges
    : (boundedBudget ? Math.max(options.maxEdges, 4) : Math.max(options.maxEdges, 8));
  const maxCandidatesPerEdge = fastBudget
    ? options.maxCandidatesPerEdge
    : (boundedBudget ? Math.max(options.maxCandidatesPerEdge, 32) : Math.max(options.maxCandidatesPerEdge, 240));
  const maxQualityEvaluations = fastBudget
    ? options.maxQualityEvaluations
    : (boundedBudget ? Math.max(options.maxQualityEvaluations, 64) : Math.max(options.maxQualityEvaluations, 360));

  for (let pass = 0; pass < 2; pass += 1) {
    type ObstacleCandidatePool = {
      baseline: T;
      pathKey: string;
      scored: Array<{
        path: DisplayPoint[];
        priority: number;
        hits: number;
        length: number;
      }>;
    };
    const candidatePools = new Map<number, ObstacleCandidatePool>();
    let segmentBaseline: T | null = null;
    let cachedSegments: ReturnType<typeof extractDisplaySegments> = [];
    const segmentsForCurrent = (): ReturnType<typeof extractDisplaySegments> => {
      if (segmentBaseline !== current) {
        segmentBaseline = current;
        cachedSegments = extractDisplaySegments(current);
      }
      return cachedSegments;
    };
    const getCandidatePool = (
      edgeIndex: number,
      edge: Edge,
      path: DisplayPoint[],
    ): ObstacleCandidatePool => {
      const pathKey = path
        .map(point => `${Math.round(point.x)},${Math.round(point.y)}`)
        .join('|');
      const cached = candidatePools.get(edgeIndex);
      if (cached?.baseline === current && cached.pathKey === pathKey) return cached;
      const seenPaths = new Set<string>();
      const scored = [
        ...buildObstacleSkirtCandidates(path, nodes, edge, current, segmentsForCurrent())
          .map(candidate => ({ path: candidate, priority: 0 })),
        ...buildObstacleOuterEscapeCandidates(path, nodes, edge)
          .map(candidate => ({ path: candidate, priority: 1 })),
      ]
        .map(candidate => ({
          path: compactOrthogonalPath(candidate.path),
          priority: candidate.priority,
        }))
        .filter(candidate => candidate.path.length >= 2)
        .filter((candidate) => {
          const key = candidate.path.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|');
          if (seenPaths.has(key)) return false;
          seenPaths.add(key);
          return true;
        })
        .map(candidate => ({
          ...candidate,
          hits: hitContext.countUnrelated(candidate.path, edge),
          length: displayPathLength(candidate.path),
        }));
      const pool = {
        baseline: current,
        pathKey,
        scored,
      };
      candidatePools.set(edgeIndex, pool);
      return pool;
    };
    let contextBaseline: T | null = null;
    let cachedQualityContext: EdgePathQualityEvaluationContext | null = null;
    let cachedObstacleContext: DisplayObstacleEvaluationContext | null = null;
    let cachedBaselineQuality: EdgePathQualityScore | null = null;
    let cachedBaselineObstacleHits = 0;
    const contextsForCurrent = () => {
      if (
        contextBaseline !== current
        || !cachedQualityContext
        || !cachedObstacleContext
        || !cachedBaselineQuality
      ) {
        contextBaseline = current;
        cachedQualityContext = createEdgePathQualityEvaluationContext(current);
        cachedObstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
        cachedBaselineQuality = cachedQualityContext.evaluate(current);
        cachedBaselineObstacleHits = cachedObstacleContext.evaluate(current);
      }
      return {
        qualityContext: cachedQualityContext,
        obstacleContext: cachedObstacleContext,
        baselineQuality: cachedBaselineQuality,
        baselineObstacleHits: cachedBaselineObstacleHits,
      };
    };
    const entries = current
      .map((edge, edgeIndex) => {
        const path = getDisplayComputedPath(edge);
        return {
          edge,
          edgeIndex,
          path,
          hits: path.length >= 2 ? hitContext.countUnrelated(path, edge) : 0,
        };
      })
      .filter(entry => entry.path.length >= 2 && entry.hits > 0)
      .sort((first, second) => second.hits - first.hits);
    if (entries.length === 0) break;

    let changed = false;
    for (const entry of entries) {
      const contexts = contextsForCurrent();
      if (contexts.baselineObstacleHits === 0) break;
      const edge = current[entry.edgeIndex];
      if (!edge) continue;
      const path = getDisplayComputedPath(edge);
      const baselinePathHits = hitContext.countUnrelated(path, edge);
      if (path.length < 2 || baselinePathHits === 0) continue;
      const baselineStrictCrossings = contexts.baselineQuality.strictCrossings;
      const candidatePool = getCandidatePool(entry.edgeIndex, edge, path);
      const quickCandidates = candidatePool.scored
        .filter(candidate => candidate.hits < baselinePathHits)
        .sort((first, second) => first.hits - second.hits || first.length - second.length)
        .slice(0, 16);

      for (const candidate of quickCandidates) {
        const candidateEdges = current.map((candidateEdge, candidateIndex) => (
          candidateIndex === entry.edgeIndex ? withDisplayComputedPath(candidateEdge, candidate.path) : candidateEdge
        )) as T;
        if (contexts.qualityContext.evaluateChanged(candidateEdges, [entry.edgeIndex]).strictCrossings > baselineStrictCrossings) continue;
        const candidateObstacleHits = contexts.baselineObstacleHits - baselinePathHits + candidate.hits;
        if (candidateObstacleHits >= contexts.baselineObstacleHits) continue;
        current = candidateEdges;
        changed = true;
        break;
      }
    }

    if (contextsForCurrent().baselineObstacleHits === 0) break;

    let processed = 0;
    for (const entry of entries) {
      if (processed >= maxEdges || qualityEvaluations >= maxQualityEvaluations) break;
      const edge = current[entry.edgeIndex];
      if (!edge) continue;
      const path = getDisplayComputedPath(edge);
      if (path.length < 2) continue;

      const contexts = contextsForCurrent();
      const { qualityContext, baselineQuality, baselineObstacleHits } = contexts;
      const baselinePathHits = hitContext.countUnrelated(path, edge);
      if (baselineObstacleHits === 0 || baselinePathHits === 0) continue;
      let bestEdges = current;
      let bestObstacleHits = baselineObstacleHits;
      let bestScore = obstacleRepairScore(baselineQuality, baselineObstacleHits);

      const candidatePool = getCandidatePool(entry.edgeIndex, edge, path);
      const rawCandidates = [
        ...candidatePool.scored,
        ...generateWaypointCandidates(path, layoutDirection, nodes, edge, {
          includeNodeAwareLanes: true,
        })
          .slice(1)
          .map(candidate => ({ path: candidate, priority: 2 })),
      ];
      const seenCandidatePaths = new Set<string>();
      const candidates = rawCandidates
        .map(candidate => ('hits' in candidate
          ? candidate
          : {
            path: compactOrthogonalPath(candidate.path),
            priority: candidate.priority,
            hits: undefined,
            length: undefined,
          }))
        .filter(candidate => candidate.path.length >= 2)
        .filter((candidate) => {
          const key = candidate.path.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|');
          if (seenCandidatePaths.has(key)) return false;
          seenCandidatePaths.add(key);
          return true;
        })
        .map(candidate => ({
          ...candidate,
            hits: candidate.hits ?? hitContext.countUnrelated(candidate.path, edge),
          length: candidate.length ?? displayPathLength(candidate.path),
        }))
        .sort((first, second) => (
          first.hits - second.hits
          || first.priority - second.priority
          || first.length - second.length
        ))
        .slice(0, maxCandidatesPerEdge);

      for (const candidate of candidates) {
        if (qualityEvaluations >= maxQualityEvaluations) break;
        const candidatePath = candidate.path;
        const candidatePathHits = candidate.hits;
        if (candidatePathHits >= baselinePathHits) continue;
        const candidateEdges = current.map((candidateEdge, candidateIndex) => (
          candidateIndex === entry.edgeIndex ? withDisplayComputedPath(candidateEdge, candidatePath) : candidateEdge
        )) as T;
        const candidateObstacleHits = baselineObstacleHits - baselinePathHits + candidatePathHits;
        if (candidateObstacleHits >= baselineObstacleHits) continue;
        const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [entry.edgeIndex]);
        qualityEvaluations += 1;
        if (!obstacleRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)) continue;
        const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
        if (
          candidateObstacleHits < bestObstacleHits
          || (candidateObstacleHits === bestObstacleHits && candidateScore < bestScore - 1)
        ) {
          bestEdges = candidateEdges;
          bestObstacleHits = candidateObstacleHits;
          bestScore = candidateScore;
        }
      }

      if (bestEdges !== current) {
        const strictCleaned = repairStrictBypassesIfNeeded(bestEdges, nodes) as T;
        const endpointCleaned = repairEndpointOrthogonalPaths(strictCleaned, nodes) as T;
        const detachedCleaned = separateDetachedParallelOverlaps(
          endpointCleaned,
          nodes,
          16,
          DISPLAY_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
        ) as T;
        const microCleaned = repairDisplayMicroArtifacts(detachedCleaned) as T;
        current = chooseFinalObstacleAwarePolishCandidate(
          nodes,
          bestEdges,
          strictCleaned,
          endpointCleaned,
          detachedCleaned,
          microCleaned,
        );
        changed = true;
        processed += 1;
        if (contextsForCurrent().baselineObstacleHits === 0) break;
      }
    }
    if (!changed) break;
  }

  return options.skipOuterFallback
    ? current
    : repairRemainingObstacleHitsWithOuterLanes(current, nodes, hitContext);
};

export const repairStrictBypassesIfNeeded = <T extends Edge[]>(edges: T, nodes: Node[]): T => (
  countStrictEdgeCrossings(edges) === 0
    ? edges
    : repairDetachedStrictCrossingBypasses(edges, nodes) as T
);

export const finishDisplaySoftQuality = <T extends Edge[]>(
  edges: T,
  repairNodes: Node[],
  layoutDirection: string,
  options: DisplaySoftQualityOptions,
): T => {
  const quality = calculateEdgePathQualityScore(edges);
  const obstacleHits = countDisplayObstacleHits(edges, repairNodes);
  const hasHardRisk = hasHardDisplayOverlapRisk(quality)
    || quality.nonOrthogonalSegments > 0
    || quality.strictCrossings > 0
    || quality.tinyInteriorDoglegs > 0
    || quality.hairpins > 0;
  if (!hasHardRisk && obstacleHits === 0) {
    const microCleaned = repairDisplayMicroArtifacts(edges) as T;
    return chooseFinalObstacleAwarePolishCandidate(repairNodes, edges, microCleaned);
  }

  const boundedBudget = options.maxCandidatesPerEdge <= 16 && options.maxQualityEvaluations <= 18;
  if (boundedBudget && obstacleHits === 0) {
    const microCleaned = repairDisplayMicroArtifacts(edges) as T;
    return chooseFinalObstacleAwarePolishCandidate(repairNodes, edges, microCleaned);
  }

  const conservativeSoft = repairDisplaySoftQualityRisks(edges, repairNodes, layoutDirection, {
    maxEdges: options.maxEdges,
    maxCandidatesPerEdge: options.maxCandidatesPerEdge,
    maxQualityEvaluations: options.maxQualityEvaluations,
  }) as T;
  const conservativeMicroClean = repairDisplayMicroArtifacts(conservativeSoft) as T;
  const selected = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    edges,
    conservativeSoft,
    conservativeMicroClean,
  );
  const obstacleCleaned = repairDisplayObstacleHits(selected, repairNodes, layoutDirection, options);
  const obstacleMicroCleaned = repairDisplayMicroArtifacts(obstacleCleaned) as T;
  return chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    selected,
    obstacleCleaned,
    obstacleMicroCleaned,
  );
};
