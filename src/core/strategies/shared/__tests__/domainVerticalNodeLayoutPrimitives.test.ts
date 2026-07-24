import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  layoutNodesHorizontally,
  layoutNodesInGrid,
  layoutNodesVertically,
  placeNodeRowWithoutWrap,
  placeNodeRowWithWrap,
  resolveNodeOverlapsByLayout,
  type DomainVerticalNodeMetrics,
} from '../domainVerticalNodeLayoutPrimitives';

const metrics: DomainVerticalNodeMetrics = {
  minimumWidth: 120,
  defaultWidth: 160,
  defaultHeight: 80,
  horizontalGap: 20,
  verticalGap: 30,
};

const node = (
  id: string,
  width: number,
  height: number,
  x = 0,
  y = 0,
): ReactFlowNode => ({
  id,
  type: 'default',
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data: {},
});

describe('domainVerticalNodeLayoutPrimitives', () => {
  it('centers a horizontal row and vertically aligns mixed-height nodes', () => {
    const nodes = [node('a', 120, 40), node('b', 180, 80)];

    const result = layoutNodesHorizontally(nodes, 100, 600, 50, metrics);

    expect(nodes[0].position).toEqual({ x: 190, y: 70 });
    expect(nodes[1].position).toEqual({ x: 330, y: 50 });
    expect(result.endY).toBe(130);
  });

  it('falls back to the left when horizontal content exceeds available width', () => {
    const nodes = [node('a', 200, 80), node('b', 200, 80)];

    layoutNodesHorizontally(nodes, 40, 300, 10, metrics);

    expect(nodes[0].position.x).toBe(40);
    expect(nodes[1].position.x).toBe(260);
  });

  it('stacks nodes vertically with sanitized dimensions and spacing', () => {
    const nodes = [
      node('a', 120, Number.NaN),
      node('b', 120, -30),
    ];

    const result = layoutNodesVertically(nodes, Number.NaN, 25, {
      ...metrics,
      verticalGap: -10,
    });

    expect(nodes[0].position).toEqual({ x: 0, y: 25 });
    expect(nodes[1].position).toEqual({ x: 0, y: 105 });
    expect(result.endY).toBe(185);
  });

  it('wraps rows by available width and keeps no-wrap rows linear', () => {
    const wrapped = [
      node('a', 140, 50),
      node('b', 140, 60),
      node('c', 140, 70),
    ];
    const linear = wrapped.map(item => ({
      ...item,
      position: { x: 0, y: 0 },
    }));

    const wrappedResult = placeNodeRowWithWrap(
      wrapped,
      10,
      320,
      20,
      20,
      metrics,
    );
    const linearResult = placeNodeRowWithoutWrap(
      linear,
      10,
      20,
      20,
      metrics,
    );

    expect(wrapped.map(item => item.position)).toEqual([
      { x: 10, y: 20 },
      { x: 170, y: 20 },
      { x: 10, y: 110 },
    ]);
    expect(wrappedResult.endY).toBe(180);
    expect(linear.map(item => item.position.x)).toEqual([10, 170, 330]);
    expect(linearResult.endY).toBe(90);
  });

  it('lays out a variable-width grid by explicit columns and reports rows', () => {
    const nodes = [
      node('a', 100, 40),
      node('b', 160, 60),
      node('c', 120, 50),
    ];

    const result = layoutNodesInGrid(nodes, 50, 1000, 25, 2, metrics);

    expect(nodes.map(item => item.position)).toEqual([
      { x: 50, y: 25 },
      { x: 170, y: 25 },
      { x: 50, y: 115 },
    ]);
    expect(result.rows.map(row => row.map(item => item.id))).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
    expect(result.rowWidths).toEqual([280, 120]);
    expect(result.endY).toBe(165);
  });

  it('automatically wraps a grid when width is exhausted', () => {
    const nodes = [node('a', 140, 40), node('b', 140, 50)];

    const result = layoutNodesInGrid(nodes, 0, 250, 0, undefined, metrics);

    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(nodes[1].position).toEqual({ x: 0, y: 70 });
    expect(result.rows).toHaveLength(2);
  });

  it('resolves horizontal, vertical, and same-row grid overlaps', () => {
    const horizontal = [node('a', 100, 50, 0, 0), node('b', 100, 50, 20, 0)];
    const vertical = [node('a', 100, 50, 0, 0), node('b', 100, 50, 0, 10)];
    const grid = [
      node('a', 100, 50, 0, 0),
      node('b', 100, 50, 10, 2),
      node('c', 100, 50, 0, 100),
    ];

    resolveNodeOverlapsByLayout(horizontal, 'horizontal', metrics);
    resolveNodeOverlapsByLayout(vertical, 'vertical', metrics);
    resolveNodeOverlapsByLayout(grid, 'grid', metrics);

    expect(horizontal[1].position.x).toBe(120);
    expect(vertical[1].position.y).toBe(80);
    expect(grid[1].position.x).toBe(120);
    expect(grid[2].position).toEqual({ x: 0, y: 100 });
  });

  it('handles empty inputs and hostile metric values without non-finite output', () => {
    expect(layoutNodesInGrid([], 0, 0, 0, 0, metrics)).toEqual({
      endY: 0,
      rows: [],
      rowWidths: [],
    });
    const nodes = [node('invalid', Number.POSITIVE_INFINITY, -10)];

    layoutNodesHorizontally(nodes, Number.NaN, Number.POSITIVE_INFINITY, Number.NaN, {
      minimumWidth: Number.NaN,
      defaultWidth: -1,
      defaultHeight: Number.POSITIVE_INFINITY,
      horizontalGap: Number.NaN,
      verticalGap: Number.NEGATIVE_INFINITY,
    });

    expect(Number.isFinite(nodes[0].position.x)).toBe(true);
    expect(Number.isFinite(nodes[0].position.y)).toBe(true);
  });
});
