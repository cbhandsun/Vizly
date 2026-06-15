import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/config/DiagramConfig', () => ({
  diagramConfigManager: {
    getConfig: () => ({
      domain: {
        padding: { horizontal: 20 },
        title: { height: 40, padding: { vertical: 10 }, safeGap: 12 },
        sideSafeGap: 8,
      },
    }),
    getLayoutConfig: () => ({
      NODE_MIN_WIDTH: 120,
      NODE_V_GAP: 80,
    }),
  },
}));

vi.mock('../../../components/layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidth: (text: string) => 80 + text.length * 5,
      calculateNodeHeight: (text: string) => 40 + Math.ceil(text.length / 10) * 10,
    }),
  },
}));

import {
  calculateBoundingBox,
  countNodeOverlapsByDomain,
  countRectOverlaps,
  ensureMeasuredForNodes,
  pushFreeNodesBelowSubGroupRow,
  scatterNodesAtSamePoint,
  sortNodesInRow,
} from '../geometryUtils';

describe('layout geometryUtils', () => {
  it('sorts nodes by sequence/order before x position', () => {
    const nodes = [
      { id: 'x', position: { x: 300, y: 0 }, data: {} },
      { id: 'seq2', position: { x: 0, y: 0 }, data: { sequence: 2 } },
      { id: 'seq1', position: { x: 100, y: 0 }, data: { order: '1' } },
    ];

    expect(sortNodesInRow(nodes as never).map(node => node.id)).toEqual(['seq1', 'seq2', 'x']);
  });

  it('ensures measured sizes for business nodes and preserves container sizes', () => {
    const result = ensureMeasuredForNodes([
      { id: 'biz', position: { x: 0, y: 0 }, data: { description: 'long description' } },
      { id: 'group', type: 'subGroup', position: { x: 0, y: 0 }, style: { width: 300, height: 200 }, data: {} },
    ] as never);

    expect(result[0].measured?.width).toBeGreaterThanOrEqual(120);
    expect(result[0].style).toMatchObject(result[0].measured ?? {});
    expect(result[1].measured).toEqual({ width: 300, height: 200 });
  });

  it('calculates bounding boxes including border width', () => {
    const box = calculateBoundingBox([
      { id: 'a', position: { x: 10, y: 20 }, measured: { width: 100, height: 50 }, data: { customStyle: { border: '2px solid red' } } },
      { id: 'b', position: { x: -10, y: 0 }, style: { width: 20, height: 30 }, data: {} },
    ] as never);

    expect(box).toEqual({ x: -10, y: 0, width: 124, height: 74 });
    expect(calculateBoundingBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('scatters same-point nodes on the requested axis', () => {
    const nodes = [
      { id: 'b', position: { x: 100, y: 100 } },
      { id: 'a', position: { x: 100, y: 100 } },
      { id: 'c', position: { x: 100, y: 100 } },
    ];

    scatterNodesAtSamePoint(nodes as never, 'x', 20);

    expect(nodes.map(node => node.position.x).sort((a, b) => a - b)).toEqual([80, 100, 120]);
  });

  it('counts rectangle and same-domain business-node overlaps', () => {
    expect(countRectOverlaps([
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 10, y: 10, width: 20, height: 20 },
      { x: 100, y: 100, width: 20, height: 20 },
    ])).toBe(1);

    expect(countNodeOverlapsByDomain([
      { id: 'a', position: { x: 0, y: 0 }, measured: { width: 20, height: 20 }, data: { domain: 'D' } },
      { id: 'b', position: { x: 10, y: 10 }, measured: { width: 20, height: 20 }, data: { domain: 'D' } },
      { id: 'group', type: 'subGroup', position: { x: 0, y: 0 }, measured: { width: 100, height: 100 }, data: { domain: 'D' } },
    ] as never)).toBe(1);
  });

  it('pushes free nodes below subgroup rows and clamps them inside domain bounds', () => {
    const result = pushFreeNodesBelowSubGroupRow([
      { id: 'domain', type: 'titleGroup', position: { x: 0, y: 0 }, style: { width: 300, height: 300 }, measured: { width: 300, height: 300 }, data: { domain: 'D' } },
      { id: 'sg', type: 'subGroup', position: { x: 50, y: 80 }, measured: { width: 100, height: 60 }, data: { domain: 'D' } },
      { id: 'free', position: { x: 500, y: 50 }, measured: { width: 50, height: 30 }, data: { domain: 'D' } },
    ] as never);

    const free = result.find(node => node.id === 'free') as any;
    expect(free.position.y).toBeGreaterThanOrEqual(220);
    expect(free.position.x).toBeLessThanOrEqual(222);
  });
});
