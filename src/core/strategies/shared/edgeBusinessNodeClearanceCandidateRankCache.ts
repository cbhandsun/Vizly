import type { BusinessNodeClearanceCandidateRank } from './edgeBusinessNodeClearanceCandidateRanking';

type Point = Readonly<{ x: number; y: number }>;

type CandidateWithHits = Readonly<{
  candidate: Point[];
  hits: number;
}>;

/**
 * Reuses only absolute clearance ranks for an exact request-local candidate
 * collection. The cache lifetime is one repair transaction and collection
 * identity binds the exact edge, clearance and candidate paths. Callers still
 * rerun relative ranking and every global gate.
 */
export const createBusinessNodeClearanceCandidateRankCache = () => {
  const ranksByCollection = new WeakMap<
    object,
    BusinessNodeClearanceCandidateRank<Point[]>[]
  >();
  return {
    getOrCreate: (
      collection: object,
      candidates: readonly CandidateWithHits[],
      scorePair: (candidate: Point[]) => readonly [number, number],
    ): Readonly<{
      value: BusinessNodeClearanceCandidateRank<Point[]>[];
      cacheHit: boolean;
    }> => {
      const cached = ranksByCollection.get(collection);
      if (cached) return { value: cached, cacheHit: true };
      const value = candidates.map(({ candidate, hits }) => {
        const [risk, commercialRisk] = scorePair(candidate);
        let length = 0;
        for (let index = 1; index < candidate.length; index += 1) {
          length += Math.abs(candidate[index].x - candidate[index - 1].x)
            + Math.abs(candidate[index].y - candidate[index - 1].y);
        }
        return {
          candidate,
          risk,
          commercialRisk,
          hits,
          length,
          bendCount: Math.max(0, candidate.length - 2),
        };
      });
      ranksByCollection.set(collection, value);
      return { value, cacheHit: false };
    },
  };
};
