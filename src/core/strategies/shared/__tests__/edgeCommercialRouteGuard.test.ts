import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  chooseCommercialRouteCandidate,
  chooseCommercialSingleEdgeRouteCandidate,
  countCommercialObstacleHits,
} from '../edgeCommercialRouteGuard';

const pathEdge = (id: string, points: Array<{ x: number; y: number }>): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath: points },
});

describe('edgeCommercialRouteGuard', () => {
  it('prefers a node-safe route even when the unsafe route has fewer crossings', () => {
    const nodes: Node[] = [{
      id: 'obstacle',
      position: { x: 40, y: 40 },
      width: 40,
      height: 40,
      data: {},
    }];
    const unsafe = [pathEdge('primary', [{ x: 0, y: 60 }, { x: 120, y: 60 }])];
    const safe = [pathEdge('primary', [
      { x: 0, y: 60 },
      { x: 20, y: 60 },
      { x: 20, y: 20 },
      { x: 120, y: 20 },
    ])];

    expect(countCommercialObstacleHits(unsafe, nodes)).toBe(1);
    expect(countCommercialObstacleHits(safe, nodes)).toBe(0);
    expect(chooseCommercialRouteCandidate(nodes, unsafe, safe)).toBe(safe);
  });

  it('uses crossing quality when candidates have equal obstacle safety', () => {
    const first = pathEdge('first', [{ x: 0, y: 50 }, { x: 100, y: 50 }]);
    const crossing = pathEdge('second', [{ x: 50, y: 0 }, { x: 50, y: 100 }]);
    const clear = pathEdge('second', [
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 120, y: 20 },
    ]);
    const crossed = [first, crossing];
    const uncrossed = [first, clear];

    expect(chooseCommercialRouteCandidate([], crossed, uncrossed)).toBe(uncrossed);
  });

  it('preserves whole-graph selection when only one edge changes', () => {
    const fixed = pathEdge('fixed', [{ x: 0, y: 120 }, { x: 120, y: 120 }]);
    const obstacle: Node = {
      id: 'obstacle', position: { x: 40, y: 40 }, width: 40, height: 40, data: {},
    };
    const unsafe = [fixed, pathEdge('primary', [{ x: 0, y: 60 }, { x: 120, y: 60 }])];
    const safe = [fixed, pathEdge('primary', [
      { x: 0, y: 60 }, { x: 20, y: 60 }, { x: 20, y: 20 }, { x: 120, y: 20 },
    ])];

    expect(chooseCommercialSingleEdgeRouteCandidate([obstacle], 1, unsafe, safe))
      .toBe(chooseCommercialRouteCandidate([obstacle], unsafe, safe));
  });

  it('falls back to whole-graph scoring for malformed or multi-edge candidates', () => {
    const first = [pathEdge('first', [{ x: 0, y: 0 }, { x: 100, y: 0 }])];
    const second = [pathEdge('second', [{ x: 0, y: 20 }, { x: 100, y: 20 }])];
    expect(chooseCommercialSingleEdgeRouteCandidate([], 4, first, second))
      .toBe(chooseCommercialRouteCandidate([], first, second));

    const firstPair = [first[0], pathEdge('fixed-a', [{ x: 0, y: 40 }, { x: 100, y: 40 }])];
    const secondPair = [second[0], pathEdge('fixed-b', [{ x: 0, y: 60 }, { x: 100, y: 60 }])];
    expect(chooseCommercialSingleEdgeRouteCandidate([], 0, firstPair, secondPair))
      .toBe(chooseCommercialRouteCandidate([], firstPair, secondPair));
  });
});
