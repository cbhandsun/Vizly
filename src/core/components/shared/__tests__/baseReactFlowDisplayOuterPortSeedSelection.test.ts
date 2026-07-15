import { describe, expect, it } from 'vitest';

import {
  selectDiverseOuterPortPairSeeds,
  type RankedOuterPortPair,
} from '../baseReactFlowDisplayOuterPortSeedSelection';

type PairValue = { firstIndex: number; secondIndex: number; label: string };

const pair = (
  firstIndex: number,
  secondIndex: number,
  quickScore: number,
): RankedOuterPortPair<PairValue> => ({
  firstIndex,
  secondIndex,
  quickScore,
  value: { firstIndex, secondIndex, label: `${firstIndex}:${secondIndex}` },
});

describe('outer port pair seed selection', () => {
  it('covers every port with its best pairing before filling globally', () => {
    const selected = selectDiverseOuterPortPairSeeds([
      pair(0, 0, 1), pair(0, 1, 9),
      pair(1, 0, 2), pair(1, 1, 3),
      pair(2, 0, 4), pair(2, 1, 5),
    ], 3, 2, 4);

    expect(new Set(selected.map(value => value.label))).toEqual(new Set([
      '0:0',
      '1:0',
      '1:1',
      '2:0',
    ]));
    expect(new Set(selected.map(value => value.firstIndex))).toEqual(new Set([0, 1, 2]));
    expect(new Set(selected.map(value => value.secondIndex))).toEqual(new Set([0, 1]));
  });

  it('covers the production maximum of 16 ports per edge within 32 seeds', () => {
    const pairs = Array.from({ length: 16 }, (_, firstIndex) => (
      Array.from({ length: 16 }, (_unused, secondIndex) => (
        pair(firstIndex, secondIndex, Math.abs(firstIndex - secondIndex) * 100 + firstIndex)
      ))
    )).flat();
    const selected = selectDiverseOuterPortPairSeeds(pairs, 16, 16, 32);

    expect(selected.length).toBeLessThanOrEqual(32);
    expect(new Set(selected.map(value => value.firstIndex)).size).toBe(16);
    expect(new Set(selected.map(value => value.secondIndex)).size).toBe(16);
  });

  it('uses stable coverage gain when an explicit cap cannot fit all best pairs', () => {
    const selected = selectDiverseOuterPortPairSeeds([
      pair(0, 0, 1),
      pair(0, 1, 2),
      pair(1, 0, 3),
      pair(1, 1, 4),
      pair(2, 2, 5),
    ], 3, 3, 2);

    expect(selected).toEqual([
      { firstIndex: 0, secondIndex: 0, label: '0:0' },
      { firstIndex: 2, secondIndex: 2, label: '2:2' },
    ]);
  });

  it('reserves bounded capacity for high-conflict topology pairings', () => {
    const selected = selectDiverseOuterPortPairSeeds([
      pair(0, 0, 1), pair(0, 1, 5), pair(0, 2, 100),
      pair(1, 0, 2), pair(1, 1, 3), pair(1, 2, 4),
    ], 2, 3, 5);

    expect(selected.map(value => value.label)).toContain('0:2');
    expect(selected).toHaveLength(5);
  });

  it('deduplicates coordinates and rejects invalid bounds or scores', () => {
    const selected = selectDiverseOuterPortPairSeeds([
      pair(0, 0, 8),
      pair(0, 0, 2),
      pair(1, 0, Number.NaN),
      pair(-1, 0, 1),
    ], 1, 1, 32);

    expect(selected).toEqual([{ firstIndex: 0, secondIndex: 0, label: '0:0' }]);
    expect(selectDiverseOuterPortPairSeeds([], 1, 1, 32)).toEqual([]);
    expect(selectDiverseOuterPortPairSeeds([pair(0, 0, 1)], 1, 1, 0)).toEqual([]);
    expect(selectDiverseOuterPortPairSeeds([pair(0, 0, 1)], Number.NaN, 1, 32)).toEqual([]);
  });
});
