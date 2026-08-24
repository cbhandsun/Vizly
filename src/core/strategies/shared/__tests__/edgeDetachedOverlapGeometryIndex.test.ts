import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  extractPathSegmentRefs,
  findDetachedParallelOverlaps,
  segmentOverlap,
  type Point,
} from '../edgeDetachedOverlapGeometry';

const edge = (index: number): Edge => ({
  id: `edge-${index}`,
  source: `source-${index}`,
  target: `target-${index}`,
  data: {},
});

const hitKey = (hit: ReturnType<typeof findDetachedParallelOverlaps>[number]): string => (
  `${hit.a.edgeIndex}:${hit.a.segIdx}|${hit.b.edgeIndex}:${hit.b.segIdx}|${hit.overlap}`
);

describe('edgeDetachedOverlapGeometry parallel index', () => {
  it('preserves full-scan overlap hits across dense nearby lanes', () => {
    const paths: Point[][] = Array.from({ length: 24 }, (_, index) => {
      const line = Math.floor(index / 3) * 12 + (index % 3) * 2;
      return index % 2 === 0
        ? [{ x: 0, y: line }, { x: 240 + index, y: line }]
        : [{ x: line, y: 0 }, { x: line, y: 240 + index }];
    });
    const edges = paths.map((_, index) => edge(index));
    const segments = extractPathSegmentRefs(paths, edges);
    const expected: string[] = [];
    for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
        const first = segments[firstIndex];
        const second = segments[secondIndex];
        if (first.edgeIndex === second.edgeIndex || first.axis !== second.axis) continue;
        const overlap = segmentOverlap(first, second);
        if (overlap >= 16) expected.push(hitKey({ a: first, b: second, overlap }));
      }
    }

    expect(findDetachedParallelOverlaps(paths, edges, 16).map(hitKey).sort())
      .toEqual(expected.sort());
  });
});
