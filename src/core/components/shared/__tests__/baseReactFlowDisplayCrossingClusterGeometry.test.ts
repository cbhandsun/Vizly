import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  displayCrossingClusterCrossingPairSignature,
  displayCrossingClusterEdgeStateSignature,
  displayCrossingClusterPathSignature,
  firstDisplayCrossingClusterStrictHits,
  selectDisplayCrossingClusterOtherSegments,
} from '../baseReactFlowDisplayCrossingClusterGeometry';
import type { DisplayPoint, DisplaySegment } from '../baseReactFlowDisplayGeometry';

const segment = (
  edgeIndex: number,
  axis: 'h' | 'v',
  a: DisplayPoint,
  b: DisplayPoint,
): DisplaySegment => ({
  edgeIndex,
  segmentIndex: 0,
  axis,
  direction: 1,
  a,
  b,
});

const crossingSegments = (): DisplaySegment[] => [
  segment(0, 'h', { x: 0, y: 0 }, { x: 10, y: 0 }),
  segment(1, 'v', { x: 2, y: -5 }, { x: 2, y: 5 }),
  segment(2, 'v', { x: 8, y: -5 }, { x: 8, y: 5 }),
];

describe('display crossing cluster geometry', () => {
  it('builds the legacy signature text without allocating an intermediate string array', () => {
    expect(displayCrossingClusterPathSignature([
      { x: 1.24, y: -0 },
      { x: -1.26, y: 2.05 },
      { x: 100.01, y: -3.04 },
    ])).toBe('12:0|-13:21|1000:-30');
    expect(displayCrossingClusterPathSignature([])).toBe('');
  });

  it('preserves legacy sparse and non-finite number serialization exactly', () => {
    const sparsePath = new Array<DisplayPoint>(3);
    sparsePath[1] = { x: Number.NaN, y: Number.POSITIVE_INFINITY };

    expect(displayCrossingClusterPathSignature(sparsePath)).toBe('|NaN:Infinity|');
    expect(displayCrossingClusterPathSignature([
      { x: Number.NEGATIVE_INFINITY, y: -0.04 },
      { x: Number.MAX_VALUE, y: Number.MIN_VALUE },
    ])).toBe('-Infinity:0|Infinity:0');
  });

  it('keeps edge-state and crossing-pair signatures deterministic', () => {
    const edges: Edge[] = [{
      id: 'edge-a',
      source: 'a',
      target: 'b',
      sourceHandle: 'right',
      targetHandle: null,
      data: { computedPath: [{ x: 1.24, y: 2.05 }] },
    }];

    expect(displayCrossingClusterEdgeStateSignature(edges, [0])).toBe('0:right::12:21');
    expect(displayCrossingClusterEdgeStateSignature(edges, [])).toBe('');
    expect(displayCrossingClusterCrossingPairSignature(crossingSegments())).toBe('0:1|0:2');
  });

  it('bounds strict-hit scans and treats invalid non-positive limits as empty', () => {
    const segments = crossingSegments();

    expect(firstDisplayCrossingClusterStrictHits(segments, 1)).toHaveLength(1);
    expect(firstDisplayCrossingClusterStrictHits(segments)).toHaveLength(2);
    expect(firstDisplayCrossingClusterStrictHits(segments, Number.POSITIVE_INFINITY)).toHaveLength(2);
    expect(firstDisplayCrossingClusterStrictHits(segments, 0)).toEqual([]);
    expect(firstDisplayCrossingClusterStrictHits(segments, -1)).toEqual([]);
    expect(firstDisplayCrossingClusterStrictHits(segments, Number.NEGATIVE_INFINITY)).toEqual([]);
    expect(firstDisplayCrossingClusterStrictHits(segments, Number.NaN)).toEqual([]);
    expect(firstDisplayCrossingClusterStrictHits(segments, '2' as unknown as number)).toEqual([]);
    expect(firstDisplayCrossingClusterStrictHits([], 2)).toEqual([]);
  });

  it('selects other-edge segments without mutating or cloning the shared segment records', () => {
    const segments = crossingSegments();
    const snapshot = [...segments];

    const selected = selectDisplayCrossingClusterOtherSegments(segments, 0);

    expect(selected).toEqual(segments.slice(1));
    expect(selected[0]).toBe(segments[1]);
    expect(segments).toEqual(snapshot);
    expect(selectDisplayCrossingClusterOtherSegments(segments, Number.NaN)).toEqual(segments);
    expect(selectDisplayCrossingClusterOtherSegments([], 0)).toEqual([]);
  });
});
