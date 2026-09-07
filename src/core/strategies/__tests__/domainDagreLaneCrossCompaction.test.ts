// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { compactDomainDagreLaneCrossAxis } from '../domainDagreLaneCrossCompaction';

const node = (id: string, cross: number, size = 200): Node => ({
  id, position: { x: cross, y: cross }, data: {},
  width: size, height: size, measured: { width: size, height: size },
});
const ranks = (entries: [string, number][]) => new Map(entries.map(([id, flow]) => [id, { x: flow, y: flow }]));

describe('swimlane cross-axis constraint compaction', () => {
  it.each(['x', 'y'] as const)('reuses %s space across process bands while centering a narrower chain member', axis => {
    const nodes = [node('first', 100), node('second', 1400, 100), node('last', 2600)];
    const positions = ranks([['first', 0], ['second', 300], ['last', 600]]);
    const before = structuredClone(nodes);
    const result = compactDomainDagreLaneCrossAxis(nodes, positions, axis, 120);
    expect([...result]).toEqual([['first', 100], ['second', 150], ['last', 100]]);
    expect(nodes).toEqual(before);
    expect(compactDomainDagreLaneCrossAxis(nodes, positions, axis, 120)).toEqual(result);
  });

  it.each(['x', 'y'] as const)('preserves peer order, widths and the routing corridor on %s', axis => {
    const nodes = [node('left', 0, 300), node('right', 1500, 200), node('next', 2300, 200)];
    const result = compactDomainDagreLaneCrossAxis(nodes, ranks([['left', 0], ['right', 0], ['next', 400]]), axis, 120);
    expect(result.get('left')).toBe(0);
    expect(result.get('right')).toBe(420);
    expect(result.get('next')).toBe(210);
  });

  it('reserves separation for nearby bands, including nodes with different heights', () => {
    const nodes = [node('tall', 0, 300), node('near', 1500), node('far', 3000)];
    const result = compactDomainDagreLaneCrossAxis(nodes, ranks([['tall', 0], ['near', 340], ['far', 800]]), 'x', 120);
    expect((result.get('near') ?? NaN) - (result.get('tall') ?? NaN)).toBe(420);
    expect(result.get('far')).toBe(210);
  });

  it('does not enlarge an already valid narrower gap or compact a layout with no gain', () => {
    const nodes = [node('left', 0), node('right', 260)];
    const expected = new Map([['left', 0], ['right', 260]]);
    expect(compactDomainDagreLaneCrossAxis(nodes, ranks([['left', 0], ['right', 0]]), 'x', 120)).toEqual(expected);
    expect(compactDomainDagreLaneCrossAxis(nodes, ranks([['left', 0], ['right', 0]]), 'x', 0).get('right')).toBe(248);
  });

  it('leaves overlapping input to the existing overlap validation path', () => {
    const nodes = [node('a', 0), node('b', 100), node('c', 900)];
    expect(compactDomainDagreLaneCrossAxis(nodes, ranks([['a', 0], ['b', 0], ['c', 0]]), 'x', 120))
      .toEqual(new Map([['a', 0], ['b', 100], ['c', 900]]));
  });

  it('handles empty, singleton, duplicate, incomplete and invalid ranks without mutation', () => {
    expect(compactDomainDagreLaneCrossAxis([], new Map(), 'x', 120).size).toBe(0);
    const singleton = [node('a', 55)];
    expect(compactDomainDagreLaneCrossAxis(singleton, ranks([['a', 0]]), 'x', 120).get('a')).toBe(55);
    const nodes = [node('a', 0), node('b', 900)];
    const before = structuredClone(nodes);
    const expected = new Map([['a', 0], ['b', 900]]);
    for (const positions of [new Map(), ranks([['a', 0]]), ranks([['a', 0], ['b', NaN]]), ranks([['a', 0], ['b', Infinity]]), ranks([['a', 0], ['b', 1e9]])]) {
      expect(compactDomainDagreLaneCrossAxis(nodes, positions, 'x', 120)).toEqual(expected);
    }
    expect(compactDomainDagreLaneCrossAxis([node('same', 0), node('same', 900)], ranks([['same', 0]]), 'x', 120))
      .toEqual(new Map([['same', 900]]));
    expect(nodes).toEqual(before);
  });

  it.each([NaN, Infinity, -1, 5001])('rejects invalid spacing %s', gap => {
    expect(compactDomainDagreLaneCrossAxis([node('a', 0), node('b', 900)], ranks([['a', 0], ['b', 400]]), 'x', gap))
      .toEqual(new Map([['a', 0], ['b', 900]]));
  });

  it('bounds work on extreme buckets and treats special identifiers as plain data', () => {
    const large = Array.from({ length: 257 }, (_, index) => node(String(index), index * 400));
    const positions = ranks(large.map(value => [value.id, 0]));
    expect(compactDomainDagreLaneCrossAxis(large, positions, 'x', 120))
      .toEqual(new Map(large.map(value => [value.id, value.position.x])));
    const special = [node('__proto__', 0), node('<img onerror=alert(1)>', 900)];
    expect(compactDomainDagreLaneCrossAxis(special, ranks(special.map((value, index) => [value.id, index * 400])), 'x', 120))
      .toEqual(new Map(special.map(value => [value.id, 0])));
  });
});
