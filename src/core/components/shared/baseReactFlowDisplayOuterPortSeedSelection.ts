export type RankedOuterPortPair<T> = {
  firstIndex: number;
  secondIndex: number;
  quickScore: number;
  value: T;
};

const finiteCount = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
);

const comparePairs = <T>(
  first: RankedOuterPortPair<T>,
  second: RankedOuterPortPair<T>,
): number => (
  first.quickScore - second.quickScore
  || first.firstIndex - second.firstIndex
  || first.secondIndex - second.secondIndex
);

/**
 * Selects a bounded set of port-pair seeds without letting globally short
 * combinations starve a port path. Every first/second port contributes its
 * best available pairing before remaining capacity is split between the
 * lowest and highest direct-pair scores. High-score seeds are intentional:
 * they expose port-topology conflicts that the outer path is meant to repair.
 *
 * With the production bounds (at most 16 ports per edge and 32 seeds), the
 * coverage phase itself is guaranteed to fit. A smaller caller-provided cap
 * remains a strict cap and keeps the best deterministic prefix.
 */
export const selectDiverseOuterPortPairSeeds = <T>(
  pairs: ReadonlyArray<RankedOuterPortPair<T>>,
  firstCount: number,
  secondCount: number,
  limit = 32,
): T[] => {
  const safeFirstCount = finiteCount(firstCount);
  const safeSecondCount = finiteCount(secondCount);
  const safeLimit = Math.min(32, finiteCount(limit));
  if (safeFirstCount === 0 || safeSecondCount === 0 || safeLimit === 0) return [];

  const uniquePairs = new Map<string, RankedOuterPortPair<T>>();
  for (const pair of pairs) {
    if (
      !Number.isInteger(pair.firstIndex)
      || !Number.isInteger(pair.secondIndex)
      || pair.firstIndex < 0
      || pair.firstIndex >= safeFirstCount
      || pair.secondIndex < 0
      || pair.secondIndex >= safeSecondCount
      || !Number.isFinite(pair.quickScore)
    ) continue;
    const key = `${pair.firstIndex}:${pair.secondIndex}`;
    const current = uniquePairs.get(key);
    if (!current || comparePairs(pair, current) < 0) uniquePairs.set(key, pair);
  }
  const ranked = Array.from(uniquePairs.values()).sort(comparePairs);
  if (ranked.length === 0) return [];

  const coverage = new Map<string, RankedOuterPortPair<T>>();
  for (let firstIndex = 0; firstIndex < safeFirstCount; firstIndex += 1) {
    const best = ranked.find(pair => pair.firstIndex === firstIndex);
    if (best) coverage.set(`${best.firstIndex}:${best.secondIndex}`, best);
  }
  for (let secondIndex = 0; secondIndex < safeSecondCount; secondIndex += 1) {
    const best = ranked.find(pair => pair.secondIndex === secondIndex);
    if (best) coverage.set(`${best.firstIndex}:${best.secondIndex}`, best);
  }

  const coveragePool = Array.from(coverage.values());
  const selected: Array<RankedOuterPortPair<T>> = [];
  const coveredFirst = new Set<number>();
  const coveredSecond = new Set<number>();
  while (coveragePool.length > 0 && selected.length < safeLimit) {
    coveragePool.sort((first, second) => {
      const firstGain = Number(!coveredFirst.has(first.firstIndex))
        + Number(!coveredSecond.has(first.secondIndex));
      const secondGain = Number(!coveredFirst.has(second.firstIndex))
        + Number(!coveredSecond.has(second.secondIndex));
      return secondGain - firstGain || comparePairs(first, second);
    });
    const next = coveragePool.shift();
    if (!next) break;
    selected.push(next);
    coveredFirst.add(next.firstIndex);
    coveredSecond.add(next.secondIndex);
  }
  const selectedKeys = new Set(selected.map(pair => `${pair.firstIndex}:${pair.secondIndex}`));
  const remaining = ranked.filter(pair => (
    !selectedKeys.has(`${pair.firstIndex}:${pair.secondIndex}`)
  ));
  const remainingCapacity = safeLimit - selected.length;
  const highScoreCapacity = Math.ceil(remainingCapacity * 2 / 3);
  const append = (pair: RankedOuterPortPair<T> | undefined) => {
    if (!pair || selected.length >= safeLimit) return;
    const key = `${pair.firstIndex}:${pair.secondIndex}`;
    if (selectedKeys.has(key)) return;
    selected.push(pair);
    selectedKeys.add(key);
  };
  for (let index = 0; index < highScoreCapacity; index += 1) {
    append(remaining[remaining.length - 1 - index]);
  }
  for (const pair of remaining) append(pair);
  return selected.map(pair => pair.value);
};
