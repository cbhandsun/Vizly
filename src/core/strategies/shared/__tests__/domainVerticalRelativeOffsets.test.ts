import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { snapshotVisibleSubGroupChildOriginOffsets } from '../domainVerticalRelativeOffsets';

const node = (
  id: string,
  type: string,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: { width: 100, height: 60 },
  data,
});

describe('snapshotVisibleSubGroupChildOriginOffsets', () => {
  it('records visible child offsets from the subgroup container origin', () => {
    const input = [
      node('sub', 'subGroup', 100, 200, {
        children: ['first', 'second'],
      }),
      node('first', 'default', 135.6, 248.4),
      node('second', 'default', 260, 330),
    ];

    const result = snapshotVisibleSubGroupChildOriginOffsets(input);

    expect(result[1].data.__rel).toEqual({ x: 36, y: 48 });
    expect(result[2].data.__rel).toEqual({ x: 160, y: 130 });
    expect(input[1].data.__rel).toBeUndefined();
  });

  it('ignores hidden, missing, empty, and non-string child references', () => {
    const result = snapshotVisibleSubGroupChildOriginOffsets([
      node('sub', 'subGroup', 10, 20, {
        children: ['visible', 'hidden', 'missing', '', null, 42],
      }),
      node('visible', 'default', 30, 50),
      node('hidden', 'default', 40, 60, { hidden: true, __rel: { x: 1, y: 2 } }),
    ]);

    expect(result[1].data.__rel).toEqual({ x: 20, y: 30 });
    expect(result[2].data.__rel).toEqual({ x: 1, y: 2 });
  });

  it('does not treat malformed children values as declarations', () => {
    const result = snapshotVisibleSubGroupChildOriginOffsets([
      node('sub', 'subGroup', 10, 20, { children: 'child' }),
      node('child', 'default', 30, 50),
    ]);

    expect(result[1].data.__rel).toBeUndefined();
  });

  it('sanitizes non-finite container and child coordinates', () => {
    const result = snapshotVisibleSubGroupChildOriginOffsets([
      node(
        'sub',
        'subGroup',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        { children: ['child'] },
      ),
      node(
        'child',
        'default',
        Number.NEGATIVE_INFINITY,
        Number.NaN,
      ),
    ]);

    expect(result[0].position).toEqual({ x: 0, y: 0 });
    expect(result[1].position).toEqual({ x: 0, y: 0 });
    expect(result[1].data.__rel).toEqual({ x: 0, y: 0 });
  });

  it('handles empty inputs and duplicate child declarations deterministically', () => {
    expect(snapshotVisibleSubGroupChildOriginOffsets([])).toEqual([]);

    const result = snapshotVisibleSubGroupChildOriginOffsets([
      node('sub', 'subGroup', 10, 20, { children: ['child', 'child'] }),
      node('child', 'default', 15, 25),
    ]);
    expect(result[1].data.__rel).toEqual({ x: 5, y: 5 });
  });
});
