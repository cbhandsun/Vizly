import type { Point } from './edgeDetachedOverlapCandidates';

export interface BusinessNodeClearanceRepairDiagnostics {
  candidateCollectionCacheHitCount: number;
  candidateRankCacheHitCount: number;
  clearanceScoreCacheHitCount: number;
  clearanceScannedNodeCount: number;
  generatedCandidateCount: number;
  qualityContextBuildCount: number;
  qualityContextCacheHitCount: number;
  uniqueCandidateCount: number;
}

export const resetBusinessNodeClearanceRepairDiagnostics = (
  diagnostics: BusinessNodeClearanceRepairDiagnostics | undefined,
): void => {
  if (!diagnostics) return;
  diagnostics.candidateCollectionCacheHitCount = 0;
  diagnostics.candidateRankCacheHitCount = 0;
  diagnostics.clearanceScoreCacheHitCount = 0;
  diagnostics.clearanceScannedNodeCount = 0;
  diagnostics.generatedCandidateCount = 0;
  diagnostics.qualityContextBuildCount = 0;
  diagnostics.qualityContextCacheHitCount = 0;
  diagnostics.uniqueCandidateCount = 0;
};

const MAX_CACHE_ENTRIES = 512;
const MAX_PATH_POINTS = 256;
const MAX_EDGE_ID_LENGTH = 512;

const exactCollectionKey = (
  path: readonly Point[],
  sourceId: string,
  targetId: string,
  minimumClearance: number,
): string | null => {
  if (
    path.length > MAX_PATH_POINTS
    || sourceId.length > MAX_EDGE_ID_LENGTH
    || targetId.length > MAX_EDGE_ID_LENGTH
    || !Number.isFinite(minimumClearance)
  ) return null;
  const coordinates: Array<readonly [number, number]> = [];
  for (const point of path) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    coordinates.push([point.x, point.y]);
  }
  return JSON.stringify([sourceId, targetId, minimumClearance, coordinates]);
};

export const createBusinessNodeClearanceCandidateCache = <T>(): Readonly<{
  getOrCreate: (input: Readonly<{
    path: readonly Point[];
    sourceId: string;
    targetId: string;
    minimumClearance: number;
    create: () => T;
  }>) => Readonly<{ value: T; cacheHit: boolean }>;
}> => {
  const values = new Map<string, T>();
  return {
    getOrCreate: ({ path, sourceId, targetId, minimumClearance, create }) => {
      const key = exactCollectionKey(path, sourceId, targetId, minimumClearance);
      const cached = key === null ? undefined : values.get(key);
      if (cached !== undefined) return { value: cached, cacheHit: true };
      const value = create();
      if (key !== null && values.size < MAX_CACHE_ENTRIES) values.set(key, value);
      return { value, cacheHit: false };
    },
  };
};
