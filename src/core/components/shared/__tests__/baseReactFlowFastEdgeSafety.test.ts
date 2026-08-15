import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { findDisplayStrictCrossingHits } from '../baseReactFlowDisplayGeometry';
import {
  fastDisplayHardSafetyIsClean,
  repairFastDisplayHardSafety,
} from '../baseReactFlowFastEdgeSafety';

describe('baseReactFlowFastEdgeSafety', () => {
  it('prefers a crossing-free obstacle lane over the shorter feeder fan', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 300, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target', position: { x: 0, y: 360 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'obstacle', position: { x: 140, y: 330 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'fan-source', position: { x: 180, y: 200 }, measured: { width: 20, height: 20 }, data: {} },
      { id: 'fan-target', position: { x: 180, y: 440 }, measured: { width: 20, height: 20 }, data: {} },
    ];
    const edges: Edge[] = [
      {
        id: 'route',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: {
          computedPath: [
            { x: 350, y: 60 },
            { x: 350, y: 390 },
            { x: 50, y: 390 },
          ],
        },
      },
      {
        id: 'feeder',
        source: 'fan-source',
        target: 'fan-target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: {
          computedPath: [
            { x: 190, y: 220 },
            { x: 190, y: 440 },
          ],
        },
      },
    ];

    const repaired = repairFastDisplayHardSafety(edges, nodes);

    expect(fastDisplayHardSafetyIsClean(repaired, nodes)).toBe(true);
    expect(findDisplayStrictCrossingHits(repaired)).toEqual([]);
  });
});
