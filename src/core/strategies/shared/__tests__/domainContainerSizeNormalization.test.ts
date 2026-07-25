import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  unifyContainerHeightsByMaximum,
  unifyContainerWidthsByMaximum,
} from '../domainContainerSizeNormalization';

const domain = (
  id: string,
  width: number,
  height: number,
  hidden = false,
): ReactFlowNode => ({
  id,
  type: 'titleGroup',
  position: { x: 10, y: 20 },
  measured: { width, height },
  style: { width, height },
  width,
  height,
  data: { domain: id, hidden },
});

describe('domainContainerSizeNormalization', () => {
  it('unifies visible domain widths and synchronizes every dimension channel', () => {
    const input = [
      domain('short', 320, 180),
      domain('wide', 640, 220),
      domain('hidden', 900, 300, true),
    ];

    const result = unifyContainerWidthsByMaximum(
      input,
      new Set(['titleGroup']),
      100,
    );

    expect(result.slice(0, 2).map(node => ({
      style: node.style,
      measured: node.measured,
      width: node.width,
      height: node.height,
      position: node.position,
    }))).toEqual([
      {
        style: { width: 640, height: 180 },
        measured: { width: 640, height: 180 },
        width: 640,
        height: 180,
        position: { x: 10, y: 20 },
      },
      {
        style: { width: 640, height: 220 },
        measured: { width: 640, height: 220 },
        width: 640,
        height: 220,
        position: { x: 10, y: 20 },
      },
    ]);
    expect(result[2]).toEqual(input[2]);
    expect(input[0].width).toBe(320);
  });

  it('unifies visible domain heights without changing their widths or positions', () => {
    const result = unifyContainerHeightsByMaximum(
      [domain('short', 320, 180), domain('tall', 540, 460)],
      new Set(['titleGroup']),
      240,
    );

    expect(result.map(node => node.measured)).toEqual([
      { width: 320, height: 460 },
      { width: 540, height: 460 },
    ]);
    expect(result.map(node => node.position)).toEqual([
      { x: 10, y: 20 },
      { x: 10, y: 20 },
    ]);
  });

  it('handles empty, malformed, negative, and extreme dimensions safely', () => {
    expect(unifyContainerHeightsByMaximum(
      [],
      new Set(['titleGroup']),
      240,
    )).toEqual([]);
    expect(unifyContainerWidthsByMaximum(
      null as never,
      new Set(['titleGroup']),
      100,
    )).toEqual([]);

    const malformed = [
      {
        ...domain('invalid', 320, 180),
        measured: { width: Number.NaN, height: Number.POSITIVE_INFINITY },
        style: { width: -10, height: -20 },
        width: Number.NaN,
        height: Number.POSITIVE_INFINITY,
      },
      domain('extreme', Number.MAX_VALUE, Number.MAX_VALUE),
    ];
    const result = unifyContainerHeightsByMaximum(
      malformed,
      new Set(['titleGroup']),
      240,
    );

    expect(result.map(node => node.measured)).toEqual([
      { width: 240, height: 1_000_000 },
      { width: 1_000_000, height: 1_000_000 },
    ]);
    expect(result.flatMap(node => [
      node.measured?.width,
      node.measured?.height,
    ]).every(Number.isFinite)).toBe(true);
  });
});
