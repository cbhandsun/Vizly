import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';

import { arrangeDomainDagreChildren } from '../domainDagreChildArrangement';
import { createDomainDagreDirectContent } from '../domainDagreDirectContent';
import { domainDagrePeerComponentIndex } from '../domainDagrePeerComponents';

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

  it.each(['grid', 'flow'] as const)('preserves externally connected process geometry in %s', arrangement => {
    const links = nodes.map(node => ({ id: node.id, source: node.id, target: 'remote' }));
    const componentIndex = domainDagrePeerComponentIndex([...nodes.map(node => node.id), 'remote'], links);
    const dagre = arrangeDomainDagreChildren(nodes, [], 'dagre', false, 40, 30, dimensions);
    expect(arrangeDomainDagreChildren(nodes, [], arrangement, false, 40, 30, dimensions,
      true, undefined, componentIndex)).toEqual(dagre);
    expect(arrangeDomainDagreChildren(nodes, [], arrangement, false, 40, 30, dimensions)).not.toEqual(dagre);
    const direct = createDomainDagreDirectContent(nodes, links, arrangement, false, 40, 30,
      dimensions, new Set([...nodes.map(node => node.id), 'remote']), true, componentIndex);
    expect(direct?.positions).toEqual(dagre);
    expect(direct?.positions.map(position => position.id)).toEqual(nodes.map(node => node.id));
  });

  it.each(['grid', 'flow'] as const)('recognizes a single boundary-connected member while retaining independent %s layouts', arrangement => {
    const links = [{ source: 'a', target: 'remote' }];
    const componentIndex = domainDagrePeerComponentIndex([...nodes.map(node => node.id), 'remote'], links);
    const dagre = arrangeDomainDagreChildren(nodes, [], 'dagre', false, 40, 30, dimensions);
    expect(arrangeDomainDagreChildren(nodes, [], arrangement, false, 40, 30, dimensions,
      true, undefined, componentIndex)).toEqual(dagre);
    // A missing external endpoint is dangling, so it cannot prove a dependency.
    const independent = domainDagrePeerComponentIndex(nodes.map(node => node.id), links);
    expect(arrangeDomainDagreChildren(nodes, [], arrangement, false, 40, 30, dimensions,
      true, undefined, independent)).toEqual(arrangeDomainDagreChildren(nodes, [], arrangement, false, 40, 30, dimensions));
  });

  it.each(['grid', 'flow'] as const)('fails closed to Dagre when the explicit %s component map is invalid', arrangement => {
    const dagre = arrangeDomainDagreChildren(nodes, [], 'dagre', false, 40, 30, dimensions);
    for (const componentIndex of [new Map<string, number>(), new Map([['a', 0], ['b', 0]]),
      new Map([['a', 0], ['b', 0], ['c', NaN]])]) {
      expect(arrangeDomainDagreChildren(nodes, [], arrangement, false, 40, 30, dimensions,
        true, undefined, componentIndex)).toEqual(dagre);
    }
  });

  it.each(['grid', 'flow'] as const)('fits measured card proportions in %s without forcing square node counts', arrangement => {
    const wide = Array.from({ length: 6 }, (_, index) => node(String(index), 240, 60));
    const tall = Array.from({ length: 6 }, (_, index) => node(String(index), 60, 240));
    const before = structuredClone({ wide, tall });
    const wideResult = arrangeDomainDagreChildren(wide, [], arrangement, false, 40, 30, dimensions);
    const tallResult = arrangeDomainDagreChildren(tall, [], arrangement, false, 40, 30, dimensions);
    expect(new Set(wideResult.map(position => position.x)).size).toBe(2);
    expect(new Set(tallResult.map(position => position.x)).size).toBe(6);
    expect(Math.max(...wideResult.map(position => position.x + 240))).toBe(520);
    expect(Math.max(...tallResult.map(position => position.y + 240))).toBe(240);
    expect({ wide, tall }).toEqual(before);
    expect(arrangeDomainDagreChildren(wide, [], arrangement, false, 40, 30, dimensions)).toEqual(wideResult);
  });

  it('chooses columns from the parent envelope and keeps directed dependencies', () => {
    const cards = Array.from({ length: 6 }, (_, index) => node(String(index), 240, 60));
    const vertical = arrangeDomainDagreChildren(cards, [], 'flow', false, 40, 30, dimensions, false,
      { maxWidth: 240, maxHeight: 600, objective: 'width' });
    expect(new Set(vertical.map(position => position.x)).size).toBe(1);
    const horizontal = arrangeDomainDagreChildren(cards, [], 'flow', false, 40, 30, dimensions, false,
      { maxWidth: 1800, maxHeight: 60, objective: 'height' });
    expect(new Set(horizontal.map(position => position.y)).size).toBe(1);
    const links = cards.slice(1).map((card, index) => ({ id: String(index), source: cards[index].id, target: card.id }));
    for (const arrangement of ['grid', 'flow'] as const) {
      const ranked = arrangeDomainDagreChildren(cards.toReversed(), links, arrangement, false, 40, 30, dimensions);
      const byId = new Map(ranked.map(position => [position.id, position]));
      for (const edge of links) expect(byId.get(edge.source)?.y).toBeLessThan(byId.get(edge.target)?.y ?? NaN);
    }
    expect(arrangeDomainDagreChildren(cards, [], 'flow', false, 40, 30, dimensions, false,
      { maxWidth: 1, maxHeight: 1, objective: 'width' }))
      .toEqual(arrangeDomainDagreChildren(cards, [], 'flow', false, 40, 30, dimensions));
  });
});
