// @vitest-environment node
import { expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { alignDomainDagreLaneFlow } from '../domainDagreSemanticLaneFlow';

const node = (id: string, domain: string, type = 'custom'): Node => ({
  id, type, data: { domain }, position: { x: 0, y: 0 }, width: 160, height: 80,
});
const chainFixture = (count: number, ids: string[], isolatedDomain: string, insertion: number) => {
  const nodes = [node('domain-a', 'a', 'titleGroup'), node('domain-b', 'b', 'titleGroup'),
    node('domain-c', 'c', 'titleGroup'), ...ids.map((id, index) => node(id, index < 3 ? 'a' : 'b'))];
  nodes.splice(insertion, 0, ...Array.from({ length: count - 5 }, (_, index) => node(`isolated-${index}`, isolatedDomain)));
  const edges: Edge[] = ids.slice(1).map((target, index) => ({ id: `edge-${index}`, source: ids[index], target }));
  return { nodes, edges, ids };
};

const boundaryCases = (['TB', 'BT', 'LR', 'RL'] as const).flatMap(direction => (
  [22, 23, 24, 25].map(count => ({ direction, count }))
));

it.each(boundaryCases)('preserves the declared main chain at $count nodes in $direction', ({ direction, count }) => {
  const axis = direction === 'LR' || direction === 'RL' ? 'x' : 'y';
  const size = axis === 'x' ? 160 : 80;
  const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
  for (const ids of [
    ['a0', 'a1', 'a2', 'b0', 'b1'], ['50', '40', '30', '20', '10'],
    ['__proto__', '<svg>', 'constructor', 'a->b', '\\'],
  ]) for (const cycle of [false, true]) for (const isolatedDomain of ['a', 'b', 'c', '']) for (const insertion of [0, 5, 8]) {
    const fixture = chainFixture(count, ids, isolatedDomain, insertion);
    // This fixture explicitly declares the first four edges as main chain and this edge as feedback.
    const edges = cycle ? [...fixture.edges, { id: 'feedback', source: ids[4], target: ids[1] }] : fixture.edges;
    const before = structuredClone(fixture.nodes);
    const result = alignDomainDagreLaneFlow(fixture.nodes, insertion === 5 ? edges.toReversed() : edges, { direction });
    const positions = new Map(result.map(value => [value.id, value.position[axis]]));
    for (const edge of fixture.edges) expect(((positions.get(edge.target) ?? NaN) - (positions.get(edge.source) ?? NaN)) * sign - size).toBeGreaterThan(0);
    if (cycle) expect(((positions.get(ids[1]) ?? NaN) - (positions.get(ids[4]) ?? NaN)) * sign).toBeLessThan(0);
    expect(fixture.nodes).toEqual(before);
    const lengths = result.filter(node => node.type === 'titleGroup').map(node => node[axis === 'x' ? 'width' : 'height']);
    expect(new Set(lengths).size).toBe(1);
  }
});
