import { describe, expect, it } from 'vitest';
import { createDefaultRoutingConfig, Position } from '../../../types/routing';
import { PathPostProcessor } from '../PathPostProcessor';
import type { Point } from '../../../types/routing';

const processSharedTrunk = (points: Point[]) => {
  const config = createDefaultRoutingConfig();
  const processor = new PathPostProcessor(config);

  return processor.process(points, {
    config,
    obstacles: [],
    startPos: Position.Bottom,
    endPos: Position.Top,
    metadata: {
      isOneToMany: false,
      isManyToOne: true,
      outgoingIndex: 0,
      outgoingCount: 1,
      incomingIndex: 0,
      incomingCount: 1,
      strategy: 'Global Trunk Direct',
      peerGroupSize: 2,
      hasSharedTrunk: true,
    },
  }).points;
};

describe('PathPostProcessor shared trunk protection', () => {
  it('preserves small but intentional shared-trunk jogs for fan-in edges', () => {
    const points = processSharedTrunk([
      { x: 216, y: 2063 },
      { x: 216, y: 2103 },
      { x: 216, y: 2280 },
      { x: 202, y: 2280 },
      { x: 202, y: 2343 },
      { x: 202, y: 2383 },
    ]);

    expect(points).toEqual([
      { x: 216, y: 2063 },
      { x: 216, y: 2280 },
      { x: 202, y: 2280 },
      { x: 202, y: 2383 },
    ]);
  });

  it('still snaps sub-pixel trunk offsets instead of leaving tiny diagonals', () => {
    const points = processSharedTrunk([
      { x: 243, y: 646 },
      { x: 242.5, y: 760 },
      { x: 242.5, y: 806 },
    ]);

    expect(points).toEqual([
      { x: 243, y: 646 },
      { x: 243, y: 806 },
    ]);
  });
});
