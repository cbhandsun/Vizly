import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';

const sameSourceBusEdges = (withSourceHandle: boolean): Edge[] => [
  {
    id: 'priority',
    source: 'task-group',
    target: 'priority-sequence',
    sourceHandle: withSourceHandle ? 'right' : undefined,
    targetHandle: 'left',
    data: {
      computedPath: [
        { x: 1298, y: 1453 },
        { x: 1362, y: 1453 },
        { x: 1362, y: 2149 },
        { x: 1418, y: 2149 },
      ],
    },
  },
  {
    id: 'wave',
    source: 'task-group',
    target: 'wave-build',
    sourceHandle: withSourceHandle ? 'right' : undefined,
    targetHandle: 'left',
    data: {
      computedPath: [
        { x: 1298, y: 1429 },
        { x: 1362, y: 1429 },
        { x: 1362, y: 2335.5 },
        { x: 1418, y: 2335.5 },
      ],
    },
  },
];

describe('same-handle internal trunk quality', () => {
  it('explains same-source same-handle internal bus trunks after separate source stubs', () => {
    const quality = calculateEdgePathQualityScore(sameSourceBusEdges(true));

    expect(quality.relatedOverlap).toBeGreaterThan(0);
    expect(quality.unexplainedRelatedOverlap).toBe(0);
  });

  it('keeps same-source internal trunk overlaps unexplained without a shared handle', () => {
    expect(calculateEdgePathQualityScore(sameSourceBusEdges(false)).unexplainedRelatedOverlap)
      .toBeGreaterThan(0);
  });
});
