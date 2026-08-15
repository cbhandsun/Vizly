import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildEdgeSegments,
  calculateEdgePairQuality,
} from '../edgePathQualityGeometry';

const edgeWithPath = (
  id: string,
  computedPath: Array<{ x: number; y: number }>,
  lineHops?: string,
): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath, h: lineHops },
});

const pairStrictCrossings = (first: Edge, second: Edge): number => calculateEdgePairQuality(
  first,
  second,
  buildEdgeSegments(first.data?.computedPath as Array<{ x: number; y: number }>, 0),
  buildEdgeSegments(second.data?.computedPath as Array<{ x: number; y: number }>, 1),
).strictCrossings;

describe('explicit soft crossing bridge quality intent', () => {
  it('explains only the declared edge and exact crossing coordinate', () => {
    const horizontal = edgeWithPath(
      'horizontal',
      [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      ';50,50;',
    );
    const vertical = edgeWithPath('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]);

    expect(pairStrictCrossings(horizontal, vertical)).toBe(0);
    expect(pairStrictCrossings(
      edgeWithPath(
        'horizontal',
        [{ x: 0, y: 50 }, { x: 100, y: 50 }],
        ';51,50;',
      ),
      vertical,
    )).toBe(1);
  });

  it('does not explain a crossing within 24px of a bend or terminal', () => {
    const horizontal = edgeWithPath(
      'horizontal',
      [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      ';20,50;',
    );
    const vertical = edgeWithPath('vertical', [{ x: 20, y: 0 }, { x: 20, y: 100 }]);

    expect(pairStrictCrossings(horizontal, vertical)).toBe(1);
  });

  it('ignores malformed and non-finite declarations', () => {
    const horizontal = edgeWithPath('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]);
    horizontal.data = {
      ...horizontal.data,
      h: [';50,50;'],
    };
    const vertical = edgeWithPath('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]);

    expect(pairStrictCrossings(horizontal, vertical)).toBe(1);
  });
});
