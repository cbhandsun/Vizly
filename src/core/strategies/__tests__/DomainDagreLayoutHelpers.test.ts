import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import {
  calculateBounds,
  getNodeDimensions,
  layoutWithDagre,
  mapEdgesToContainers,
} from '../DomainDagreLayoutHelpers';

const node = (id: string, x = 0, y = 0): Node => ({
  id,
  position: { x, y },
  data: {},
  style: { width: 120, height: 60 },
});

describe('DomainDagreLayoutHelpers', () => {
  it.each([
    ['TB', 'y', 1],
    ['BT', 'y', -1],
    ['LR', 'x', 1],
    ['RL', 'x', -1],
  ] as const)('honors the %s ranking direction', (direction, axis, sign) => {
    const result = layoutWithDagre(
      [node('source'), node('target')],
      [{ id: 'edge', source: 'source', target: 'target' }],
      direction,
      30,
      40,
    );
    const source = result.find(position => position.id === 'source');
    const target = result.find(position => position.id === 'target');

    expect(source).toBeTruthy();
    expect(target).toBeTruthy();
    expect(Math.sign((target?.[axis] ?? 0) - (source?.[axis] ?? 0))).toBe(sign);
  });

  it('uses bounded default dimensions when no resolver is provided', () => {
    const result = layoutWithDagre(
      [node('source'), node('target')],
      [{ id: 'edge', source: 'source', target: 'target' }],
      'TB',
      30,
      40,
    );

    expect(result).toHaveLength(2);
    expect(result.every(position => (
      Number.isFinite(position.x) && Number.isFinite(position.y)
    ))).toBe(true);
  });

  it('falls through invalid dimensions and caps extreme values', () => {
    const candidate = node('candidate') as Node & {
      width?: number;
      height?: number;
    };
    candidate.measured = { width: Number.NaN, height: -1 };
    candidate.style = { width: 150, height: Number.POSITIVE_INFINITY };
    candidate.width = 1_000_000_000;
    candidate.height = 75;

    expect(getNodeDimensions(candidate)).toEqual({ width: 150, height: 75 });
    candidate.style = {};
    expect(getNodeDimensions(candidate).width).toBe(100_000);
  });

  it('contains invalid or throwing custom dimension resolvers', () => {
    const nodes = [node('source'), node('target')];
    const invalidResolver = vi.fn(() => ({ width: Number.NaN, height: -20 }));
    const throwingResolver = vi.fn(() => {
      throw new Error('measurement unavailable');
    });

    expect(layoutWithDagre(nodes, [], 'TB', 20, 20, invalidResolver)).toHaveLength(2);
    expect(calculateBounds(nodes, throwingResolver)).toEqual({
      width: 120,
      height: 60,
      minX: 0,
      minY: 0,
    });
  });

  it('bounds invalid coordinates and width compensation', () => {
    const first = node('first', Number.NaN, Number.POSITIVE_INFINITY);
    const second = node('second', 200, 100);

    expect(calculateBounds([first, second], undefined, -3)).toEqual({
      width: 320,
      height: 160,
      minX: 0,
      minY: 0,
    });
  });

  it('deduplicates mapped container edges without mutating source edges', () => {
    const edges: Edge[] = [
      { id: 'first', source: 'a', target: 'b' },
      { id: 'second', source: 'a2', target: 'b2' },
      { id: 'inside', source: 'a', target: 'a2' },
    ];
    const mapped = mapEdgesToContainers(edges, new Map([
      ['a', 'left'],
      ['a2', 'left'],
      ['b', 'right'],
      ['b2', 'right'],
    ]));

    expect(mapped).toEqual([
      expect.objectContaining({ id: 'cnt-first', source: 'left', target: 'right' }),
    ]);
    expect(edges[0]).toEqual({ id: 'first', source: 'a', target: 'b' });
  });
});
