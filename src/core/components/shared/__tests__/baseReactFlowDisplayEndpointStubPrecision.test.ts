import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { getDisplayComputedPath, segmentDisplayLength } from '../baseReactFlowDisplayGeometry';
import { repairSubpixelEndpointStubPrecision } from '../baseReactFlowDisplayEndpointStubPrecision';

const edgeWithPath = (id: string, path: Array<{ x: number; y: number }>): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath: path },
});

describe('subpixel endpoint stub precision', () => {
  it('normalizes horizontal and vertical deficits without moving endpoints', () => {
    const edges = [
      edgeWithPath('source', [
        { x: 10.3, y: 20 }, { x: 58, y: 20 }, { x: 58, y: 80 }, { x: 160, y: 80 },
      ]),
      edgeWithPath('target', [
        { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 52 },
        { x: 80, y: 52 }, { x: 80, y: 99.4 },
      ]),
    ];

    const repaired = repairSubpixelEndpointStubPrecision(edges);
    const sourcePath = getDisplayComputedPath(repaired[0]);
    const targetPath = getDisplayComputedPath(repaired[1]);
    expect(sourcePath[0]).toEqual({ x: 10.3, y: 20 });
    expect(targetPath[targetPath.length - 1]).toEqual({ x: 80, y: 99.4 });
    expect(segmentDisplayLength(sourcePath[0], sourcePath[1])).toBe(48);
    expect(segmentDisplayLength(targetPath[targetPath.length - 2], targetPath[targetPath.length - 1])).toBe(48);
  });

  it('keeps empty, invalid, sufficiently long, and materially short paths unchanged', () => {
    const edges = [
      edgeWithPath('empty', []),
      edgeWithPath('invalid', [{ x: Number.NaN, y: 0 }, { x: 48, y: 0 }]),
      edgeWithPath('long', [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 120, y: 80 }]),
      edgeWithPath('short', [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 80 }, { x: 120, y: 80 }]),
    ];

    expect(repairSubpixelEndpointStubPrecision(edges)).toBe(edges);
  });

  it('repairs multiple edges in one atomic candidate array', () => {
    const edges = [
      edgeWithPath('a', [{ x: 0.2, y: 0 }, { x: 48, y: 0 }, { x: 48, y: 60 }, { x: 120, y: 60 }]),
      edgeWithPath('b', [{ x: 0.4, y: 20 }, { x: 48, y: 20 }, { x: 48, y: 90 }, { x: 140, y: 90 }]),
    ];
    const repaired = repairSubpixelEndpointStubPrecision(edges);

    expect(repaired).not.toBe(edges);
    expect(repaired.every((edge) => {
      const path = getDisplayComputedPath(edge);
      return segmentDisplayLength(path[0], path[1]) === 48;
    })).toBe(true);
  });

  it('supports the render-safe threshold and falls back for invalid thresholds', () => {
    const renderSafe = [edgeWithPath('render-safe', [
      { x: 10.34, y: 20 }, { x: 66, y: 20 }, { x: 66, y: 80 }, { x: 160, y: 80 },
    ])];
    const repaired = repairSubpixelEndpointStubPrecision(renderSafe, 56);
    const repairedPath = getDisplayComputedPath(repaired[0]);
    expect(segmentDisplayLength(repairedPath[0], repairedPath[1])).toBe(56);

    const defaultThreshold = [edgeWithPath('default-threshold', [
      { x: 10.3, y: 20 }, { x: 58, y: 20 }, { x: 58, y: 80 }, { x: 160, y: 80 },
    ])];
    const defaultRepaired = repairSubpixelEndpointStubPrecision(defaultThreshold, Number.NaN);
    const defaultPath = getDisplayComputedPath(defaultRepaired[0]);
    expect(segmentDisplayLength(defaultPath[0], defaultPath[1])).toBe(48);
  });
});
