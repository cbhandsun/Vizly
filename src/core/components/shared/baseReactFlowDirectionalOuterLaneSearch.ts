export type DirectionalOuterLaneCandidateBatch<T> = {
  candidates: T[];
  tier: number;
};

type ProgressiveDirectionalOuterLaneSearchOptions<T> = {
  laneCount: number;
  sourceStubCount: number;
  targetStubCount: number;
  createCandidates: (
    laneIndex: number,
    sourceStubIndex: number,
    targetStubIndex: number,
  ) => Iterable<T>;
  candidateKey: (candidate: T) => string;
  batchSize?: number;
};

const INITIAL_LANE_COUNT = 4;
const INITIAL_SOURCE_STUB_COUNT = 3;
const INITIAL_TARGET_STUB_COUNT = 2;
const DEFAULT_BATCH_SIZE = 48;

const buildExpansionLimits = (total: number, initial: number): number[] => {
  if (total <= 0) return [];
  const limits = [Math.min(total, initial)];
  while (limits[limits.length - 1] < total) {
    limits.push(Math.min(total, limits[limits.length - 1] * 2));
  }
  return limits;
};

/**
 * Streams the directional outer-lane Cartesian search from the most useful
 * lanes/stubs to the full search space. Each coordinate is visited once and
 * globally duplicate candidate paths are emitted once, so a consumer may stop
 * after a clean candidate without first materializing the exhaustive fallback.
 */
export function* streamDirectionalOuterLaneCandidateBatches<T>({
  laneCount,
  sourceStubCount,
  targetStubCount,
  createCandidates,
  candidateKey,
  batchSize = DEFAULT_BATCH_SIZE,
}: ProgressiveDirectionalOuterLaneSearchOptions<T>): Generator<DirectionalOuterLaneCandidateBatch<T>> {
  if (laneCount <= 0 || sourceStubCount <= 0 || targetStubCount <= 0) return;

  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const laneLimits = buildExpansionLimits(laneCount, INITIAL_LANE_COUNT);
  const sourceStubLimits = buildExpansionLimits(sourceStubCount, INITIAL_SOURCE_STUB_COUNT);
  const targetStubLimits = buildExpansionLimits(targetStubCount, INITIAL_TARGET_STUB_COUNT);
  const tierCount = Math.max(laneLimits.length, sourceStubLimits.length, targetStubLimits.length);
  const visitedCoordinates = new Set<string>();
  const emittedCandidateKeys = new Set<string>();

  for (let tier = 0; tier < tierCount; tier += 1) {
    const laneLimit = laneLimits[Math.min(tier, laneLimits.length - 1)];
    const sourceStubLimit = sourceStubLimits[Math.min(tier, sourceStubLimits.length - 1)];
    const targetStubLimit = targetStubLimits[Math.min(tier, targetStubLimits.length - 1)];
    let candidates: T[] = [];

    for (let laneIndex = 0; laneIndex < laneLimit; laneIndex += 1) {
      for (let sourceStubIndex = 0; sourceStubIndex < sourceStubLimit; sourceStubIndex += 1) {
        for (let targetStubIndex = 0; targetStubIndex < targetStubLimit; targetStubIndex += 1) {
          const coordinateKey = `${laneIndex}:${sourceStubIndex}:${targetStubIndex}`;
          if (visitedCoordinates.has(coordinateKey)) continue;
          visitedCoordinates.add(coordinateKey);

          for (const candidate of createCandidates(laneIndex, sourceStubIndex, targetStubIndex)) {
            const key = candidateKey(candidate);
            if (emittedCandidateKeys.has(key)) continue;
            emittedCandidateKeys.add(key);
            candidates.push(candidate);
            if (candidates.length >= safeBatchSize) {
              yield { candidates, tier };
              candidates = [];
            }
          }
        }
      }
    }

    if (candidates.length > 0) yield { candidates, tier };
  }
}
