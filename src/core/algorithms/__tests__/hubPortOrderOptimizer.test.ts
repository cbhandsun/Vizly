import { describe, expect, it } from 'vitest';
import { optimizeHubPortOrder, type HubPortOrderItem } from '../hubPortOrderOptimizer';

const item = (
  id: string,
  branchCoord: number,
  peerCoord: number,
  secondaryCoord?: number
): HubPortOrderItem<string> => ({
  id,
  item: id,
  branchCoord,
  peerCoord,
  secondaryCoord,
});

describe('optimizeHubPortOrder', () => {
  it('returns a stable branch/peer/id sort for one or two items', () => {
    expect(optimizeHubPortOrder([
      item('b', 20, 0),
      item('a', 10, 50),
    ])).toEqual(['a', 'b']);

    expect(optimizeHubPortOrder([
      item('b', 10, 10),
      item('a', 10, 10),
    ])).toEqual(['a', 'b']);
  });

  it('greedily swaps a reversed peer order to reduce branch crossings', () => {
    const ordered = optimizeHubPortOrder([
      item('a', 0, 300),
      item('b', 100, 200),
      item('c', 200, 100),
      item('d', 300, 0),
    ], {
      primaryWeight: 10,
      branchOrderWeight: 1,
      maxPasses: 8,
    });

    expect(ordered).toEqual(['d', 'c', 'b', 'a']);
  });

  it('uses secondary coordinates as a tiebreaker when primary peers are aligned', () => {
    const ordered = optimizeHubPortOrder([
      item('a', 0, 100, 30),
      item('b', 10, 100, 10),
      item('c', 20, 100, 20),
    ], {
      primaryWeight: 0,
      secondaryWeight: 10,
      branchOrderWeight: 1,
      maxPasses: 8,
    });

    expect(ordered).toEqual(['b', 'c', 'a']);
  });

  it('honors maxPasses when an improvement would require more swaps', () => {
    const input = [
      item('a', 0, 300),
      item('b', 100, 200),
      item('c', 200, 100),
      item('d', 300, 0),
    ];

    expect(optimizeHubPortOrder(input, { maxPasses: 0 })).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps deterministic id ordering for identical geometry', () => {
    expect(optimizeHubPortOrder([
      item('z', 0, 0, 0),
      item('m', 0, 0, 0),
      item('a', 0, 0, 0),
    ])).toEqual(['a', 'm', 'z']);
  });
});
