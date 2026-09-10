import type { BusinessNodeClearanceCandidateRank } from './edgeBusinessNodeClearanceCandidateRanking';

type Point = Readonly<{ x: number; y: number }>;

type CandidateWithHits = Readonly<{
  candidate: Point[];
  hits: number;
}>;

const axisProgress = (point: Point, origin: Point, vector: Point): number => (
  (point.x - origin.x) * vector.x + (point.y - origin.y) * vector.y
);

const terminalDirection = (from: Point, to: Point): Point | null => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.abs(dx) + Math.abs(dy);
  if (length <= 0) return null;
  return { x: dx / length, y: dy / length };
};

export const measureBusinessNodeClearanceTerminalBacktrack = (
  candidate: readonly Point[],
): number => {
  if (candidate.length < 2) return 0;
  const sourceDirection = terminalDirection(candidate[0], candidate[1]);
  const targetDirection = terminalDirection(candidate[candidate.length - 2], candidate[candidate.length - 1]);
  let backtrack = 0;
  if (sourceDirection) {
    for (const point of candidate) {
      backtrack += Math.max(0, -axisProgress(point, candidate[0], sourceDirection));
    }
  }
  if (targetDirection) {
    const target = candidate[candidate.length - 1];
    for (const point of candidate) {
      backtrack += Math.max(0, axisProgress(point, target, targetDirection));
    }
  }
  return backtrack;
};

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
      scoreCandidate: (candidate: Point[]) => readonly [number, number, boolean],
    ): Readonly<{
      value: BusinessNodeClearanceCandidateRank<Point[]>[];
      cacheHit: boolean;
    }> => {
      const cached = ranksByCollection.get(collection);
      if (cached) return { value: cached, cacheHit: true };
      const value = candidates.map(({ candidate, hits }) => {
        const [risk, commercialRisk, minimumClearanceViolation] = scoreCandidate(candidate);
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
          minimumClearanceViolation,
          bendCount: Math.max(0, candidate.length - 2),
          terminalBacktrack: measureBusinessNodeClearanceTerminalBacktrack(candidate),
        };
      });
      ranksByCollection.set(collection, value);
      return { value, cacheHit: false };
    },
  };
};
