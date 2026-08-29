import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';

import { arrangeDomainDagreChildren } from '../domainDagreChildArrangement';

const node = (id: string, width: number, height: number): Node => ({
  id,
  position: { x: 0, y: 0 },
  measured: { width, height },
  data: {},
});

const dimensions = (value: Node) => ({
  width: Number(value.measured?.width ?? 0),
  height: Number(value.measured?.height ?? 0),
});

describe('arrangeDomainDagreChildren', () => {
  const nodes = [
    node('a', 120, 60),
    node('b', 180, 80),
    node('c', 100, 50),
  ];

  it('returns no positions for an empty subdomain', () => {
    expect(arrangeDomainDagreChildren([], [], 'flow', true, 40, 30, dimensions)).toEqual([]);
  });

  it('supports horizontal and vertical node arrangements with measured gaps', () => {
    const horizontal = arrangeDomainDagreChildren(nodes, [], 'horizontal', true, 40, 30, dimensions);
    expect(horizontal.map(position => position.y)).toEqual([0, 0, 0]);
    expect(horizontal.map(position => position.x)).toEqual([0, 160, 380]);

    const vertical = arrangeDomainDagreChildren(nodes, [], 'vertical', false, 40, 30, dimensions);
    expect(vertical.map(position => position.x)).toEqual([0, 0, 0]);
    expect(vertical.map(position => position.y)).toEqual([0, 90, 200]);
  });

  it('distinguishes uniform grid cells from measured flow rows', () => {
    const grid = arrangeDomainDagreChildren(nodes, [], 'grid', true, 40, 30, dimensions);
    const flow = arrangeDomainDagreChildren(nodes, [], 'flow', true, 40, 30, dimensions);

    expect(grid).toEqual([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 220, y: 0 },
      { id: 'c', x: 0, y: 110 },
    ]);
    expect(flow).toEqual([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 160, y: 0 },
      { id: 'c', x: 0, y: 110 },
    ]);
  });

  it('keeps Dagre edge-driven ordering available', () => {
    const arranged = arrangeDomainDagreChildren(
      nodes,
      [{ id: 'a-b', source: 'a', target: 'b' }],
      'dagre',
      true,
      40,
      30,
      dimensions,
    );
    const byId = new Map(arranged.map(position => [position.id, position]));
    expect(byId.get('b')!.x).toBeGreaterThan(byId.get('a')!.x);
    expect(arranged.every(position => Number.isFinite(position.x) && Number.isFinite(position.y))).toBe(true);
  });
});
