import type { Edge, Node } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import {
  repairDisplayMicroArtifacts,
  type DisplayMicroCleanupDiagnostics,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
import {
  calculateEdgePathQualityScore,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import { hasHardDisplayOverlapRisk } from './baseReactFlowDisplayEvaluation';
import { displayRoutingObstaclesSignature } from './baseReactFlowDisplayGeometry';

export const canSkipLargeDetachedOverlapRepair = (
  edgeCount: number,
  quality: EdgePathQualityScore,
): boolean => edgeCount > 24 && !hasHardDisplayOverlapRisk(quality);

export const boundedQualityPolishNeedsMicroRepair = (
  quality: EdgePathQualityScore,
): boolean => quality.strictCrossings > 0
  || quality.shortEndpointStubs > 0
  || quality.tinyInteriorDoglegs > 0
  || quality.hairpins > 0;

export const shouldMaterializeDetachedMicroAlternative = (
  useBoundedLargeRepair: boolean,
): boolean => useBoundedLargeRepair;

const DETACHED_NOOP_CACHE_LIMIT = 128;
const detachedNoopCacheByRepair = new WeakMap<
  typeof separateDetachedParallelOverlaps,
  Map<string, true>
>();

const detachedRepairNoopCacheKey = (
  edges: Edge[],
  nodes: Node[],
  minOverlap: number,
  options: NonNullable<Parameters<typeof separateDetachedParallelOverlaps>[3]>,
): string | null => {
  const routeSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
  if (!routeSignature) return null;
  return JSON.stringify([
    routeSignature,
    displayRoutingObstaclesSignature(nodes),
    minOverlap,
    options.maxIterations ?? null,
    options.maxHitBudget ?? null,
    options.maxQualityEvaluations ?? null,
    options.maxResidualPasses ?? null,
    options.qualityOnly === true,
  ]);
};

const readDetachedRepairNoop = (
  repair: typeof separateDetachedParallelOverlaps,
  cacheKey: string,
): boolean => {
  const cache = detachedNoopCacheByRepair.get(repair);
  if (!cache?.has(cacheKey)) return false;
  cache.delete(cacheKey);
  cache.set(cacheKey, true);
  return true;
};

const rememberDetachedRepairNoop = (
  repair: typeof separateDetachedParallelOverlaps,
  cacheKey: string,
): void => {
  let cache = detachedNoopCacheByRepair.get(repair);
  if (!cache) {
    cache = new Map<string, true>();
    detachedNoopCacheByRepair.set(repair, cache);
  }
  if (cache.has(cacheKey)) cache.delete(cacheKey);
  cache.set(cacheKey, true);
  while (cache.size > DETACHED_NOOP_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== 'string') break;
    cache.delete(oldest);
  }
};

export const shouldUseBoundedQualityResidualRepair = (
  useBoundedLargeRepair: boolean,
  edgeCount: number,
): boolean => useBoundedLargeRepair || edgeCount >= 12;

export const repairBoundedQualityPolishMicroArtifacts = (
  edges: Edge[],
  useBoundedLargeRepair: boolean,
  diagnostics?: DisplayMicroCleanupDiagnostics,
): Edge[] => (
  useBoundedLargeRepair
  && !boundedQualityPolishNeedsMicroRepair(calculateEdgePathQualityScore(edges))
    ? edges
    : repairDisplayMicroArtifacts(edges, undefined, diagnostics)
);

export const separateLargeDetachedParallelOverlapsIfNeeded = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  minOverlap: number,
  options: NonNullable<Parameters<typeof separateDetachedParallelOverlaps>[3]>,
  repair: typeof separateDetachedParallelOverlaps = separateDetachedParallelOverlaps,
  evaluateQuality: typeof calculateEdgePathQualityScore = calculateEdgePathQualityScore,
): T => {
  // Above the detached repair's search threshold, a hard-overlap-clean report
  // is the repair's exact no-op condition. Keep the small-graph cleanup path.
  if (
    edges.length > 24
    && canSkipLargeDetachedOverlapRepair(edges.length, evaluateQuality(edges))
  ) return edges;
  const cacheKey = detachedRepairNoopCacheKey(edges, nodes, minOverlap, options);
  if (cacheKey && readDetachedRepairNoop(repair, cacheKey)) return edges;
  const repaired = repair(edges, nodes, minOverlap, options) as T;
  if (cacheKey && repaired === edges) rememberDetachedRepairNoop(repair, cacheKey);
  return repaired;
};
