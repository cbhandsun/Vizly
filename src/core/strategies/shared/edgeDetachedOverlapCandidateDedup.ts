import type { Point } from './edgeDetachedOverlapCandidates';

const MAX_DEDUP_ENTRIES = 8_192;
const MAX_PATH_POINTS = 256;

const exactPathKey = (path: readonly Point[]): string | null => {
  if (path.length > MAX_PATH_POINTS) return null;
  let key = String(path.length);
  for (const point of path) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    key += `|${point.x},${point.y}`;
  }
  return key;
};

/**
 * Memoizes exact duplicate geometry inside one immutable detached-overlap
 * baseline. Obstacle-safe duplicates still consume the original candidate
 * budget and return their score to the caller, so later search-state selection
 * runs unchanged while repeated geometry work is avoided.
 */
export const createDetachedOverlapCandidateDedup = <T extends object>(): Readonly<{
  evaluate: (
    paths: readonly Point[][],
    changedIndexes: readonly number[],
    variant: 'narrow' | 'regular',
    evaluateObstacle: () => boolean,
    evaluateQuality: () => T | null,
    consumeCachedRequest: () => boolean,
  ) => Readonly<{ obstacleAccepted: boolean; quality: T | null }>;
}> => {
  const outcomes = new Map<string, Readonly<
    | { obstacleAccepted: false; quality: null }
    | { obstacleAccepted: true; quality: T | null }
  >>();
  const evaluateWithoutMemo = (
    evaluateObstacle: () => boolean,
    evaluateQuality: () => T | null,
  ): Readonly<{ obstacleAccepted: boolean; quality: T | null }> => {
    const obstacleAccepted = evaluateObstacle();
    return {
      obstacleAccepted,
      quality: obstacleAccepted ? evaluateQuality() : null,
    };
  };
  return {
    evaluate(
      paths,
      changedIndexes,
      variant,
      evaluateObstacle,
      evaluateQuality,
      consumeCachedRequest,
    ) {
      const indexes = [...new Set(changedIndexes)].sort((first, second) => first - second);
      if (
        indexes.length === 0
        || indexes.length !== changedIndexes.length
        || indexes.some(index => !Number.isInteger(index) || index < 0 || index >= paths.length)
      ) return evaluateWithoutMemo(evaluateObstacle, evaluateQuality);
      const pathKeys = indexes.map(index => exactPathKey(paths[index]));
      if (pathKeys.some(key => key === null)) {
        return evaluateWithoutMemo(evaluateObstacle, evaluateQuality);
      }
      const key = `${variant}:${indexes.map((index, offset) => (
        `${index}:${pathKeys[offset]}`
      )).join('||')}`;
      const cached = outcomes.get(key);
      if (cached) {
        if (!cached.obstacleAccepted) return { obstacleAccepted: false, quality: null };
        if (cached.quality !== null && consumeCachedRequest()) {
          return { obstacleAccepted: true, quality: cached.quality };
        }
        const quality = evaluateQuality();
        if (quality !== null) outcomes.set(key, { obstacleAccepted: true, quality });
        return { obstacleAccepted: true, quality };
      }
      const obstacleAccepted = evaluateObstacle();
      const quality = obstacleAccepted ? evaluateQuality() : null;
      if (outcomes.size < MAX_DEDUP_ENTRIES) {
        outcomes.set(key, obstacleAccepted
          ? { obstacleAccepted: true, quality }
          : { obstacleAccepted: false, quality: null });
      }
      return { obstacleAccepted, quality };
    },
  };
};
