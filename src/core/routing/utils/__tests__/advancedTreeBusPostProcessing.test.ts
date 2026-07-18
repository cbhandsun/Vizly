import { describe, expect, it } from 'vitest';

import { postProcessTreeBusRouting } from '../advancedTreeBusPostProcessing';

interface TestEdge {
  id: string;
  source: string;
  target: string;
  data?: unknown;
}

const edge = (id: string, data?: unknown): TestEdge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data,
});

describe('advancedTreeBusPostProcessing', () => {
  it('returns stable empty and pathless inputs', () => {
    expect(postProcessTreeBusRouting([])).toEqual([]);
    const pathless = [edge('pathless')];
    expect(postProcessTreeBusRouting(pathless)).toEqual(pathless);
  });

  it('normalizes a diagonal external path into finite orthogonal segments', () => {
    const result = postProcessTreeBusRouting([
      edge('diagonal', {
        computedPath: [{ x: 0, y: 0 }, { x: 20, y: 20 }],
      }),
    ]);
    const data = result[0].data as Record<string, unknown>;
    const path = data.computedPath as Array<{ x: number; y: number }>;

    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
    expect(data.orthogonalSanitized).toBe(true);
    for (const point of path) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('ignores malformed and non-finite path entries without throwing', () => {
    const malformed = edge('malformed', {
      computedPath: [
        null,
        { x: Number.NaN, y: 2 },
        { x: 3, y: Number.POSITIVE_INFINITY },
        { x: '4', y: '5' },
      ],
    });

    expect(postProcessTreeBusRouting([malformed])).toEqual([malformed]);
  });

  it('does not spread primitive edge data into persisted routing state', () => {
    const primitive = edge('primitive', 'secret-value');

    expect(postProcessTreeBusRouting([primitive])).toEqual([primitive]);
  });
});
