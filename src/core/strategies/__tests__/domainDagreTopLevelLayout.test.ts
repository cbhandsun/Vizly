import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import {
  buildDomainDagreCrossDomainEdges,
  reorderDomainDagreDomains,
  runDomainDagreTopLevelLayout,
} from '../domainDagreTopLevelLayout';

const dimensions = (node: Node) => ({
  width: Number(node.style?.width ?? 200),
  height: Number(node.style?.height ?? 100),
});

const domain = (id: string, key: string, x: number, y: number): Node => ({
  id,
  type: 'titleGroup',
  position: { x, y },
  style: { width: 200, height: 100 },
  data: { domain: key },
});

const leaf = (id: string, key: string, x: number, y: number): Node => ({
  id,
  position: { x, y },
  style: { width: 80, height: 40 },
  data: { domain: key },
});

describe('domainDagreTopLevelLayout', () => {
  it('deduplicates cross-domain topology and ignores invalid or same-domain edges', () => {
    const firstDomain = domain('domain-a', 'a', 0, 0);
    const secondDomain = domain('domain-b', 'b', 0, 0);
    const nodes = [firstDomain, secondDomain, leaf('a1', 'a', 0, 0), leaf('a2', 'a', 0, 0), leaf('b1', 'b', 0, 0)];
    const edges: Edge[] = [
      { id: 'cross-1', source: 'a1', target: 'b1' },
      { id: 'cross-2', source: 'a2', target: 'b1' },
      { id: 'inside', source: 'a1', target: 'a2' },
      { id: 'missing', source: 'missing', target: 'b1' },
    ];

    expect(buildDomainDagreCrossDomainEdges(
      edges,
      [firstDomain, secondDomain],
      new Map(nodes.map(node => [node.id, node])),
    )).toEqual([{
      id: 'domain_edge_domain-a_domain-b',
      source: 'domain-a',
      target: 'domain-b',
    }]);
  });

  it.each([
    { horizontal: false, axis: 'y' as const, crossAxis: 'x' as const },
    { horizontal: true, axis: 'x' as const, crossAxis: 'y' as const },
  ])('reorders domains and translates their children when horizontal=$horizontal', ({ horizontal, axis, crossAxis }) => {
    const firstDomain = domain('domain-first', 'first', 400, 300);
    const secondDomain = domain('domain-second', 'second', 50, 40);
    const firstChild = leaf('first-child', 'first', 430, 330);
    const secondChild = leaf('second-child', 'second', 80, 70);
    const nodes = [firstDomain, secondDomain, firstChild, secondChild];
    const firstOffset = {
      x: firstChild.position.x - firstDomain.position.x,
      y: firstChild.position.y - firstDomain.position.y,
    };

    reorderDomainDagreDomains({
      nodes,
      domainOrder: ['first', 'second'],
      domainOrderIndex: new Map([['first', 0], ['second', 1]]),
      isHorizontal: horizontal,
      domainGap: 30,
      getNodeDimensions: dimensions,
    });

    expect(firstDomain.position[axis]).toBeLessThan(secondDomain.position[axis]);
    expect(firstDomain.position[crossAxis]).toBe(secondDomain.position[crossAxis]);
    expect(firstChild.position.x - firstDomain.position.x).toBe(firstOffset.x);
    expect(firstChild.position.y - firstDomain.position.y).toBe(firstOffset.y);
  });

  it('lays out domains from cross-domain edges and keeps parent-member offsets stable', () => {
    const firstDomain = domain('domain-a', 'a', 0, 0);
    const secondDomain = domain('domain-b', 'b', 0, 0);
    const firstChild = leaf('a1', 'a', 20, 30);
    const secondChild = leaf('b1', 'b', 20, 30);
    const nodes = [firstDomain, secondDomain, firstChild, secondChild];

    runDomainDagreTopLevelLayout({
      nodes,
      edges: [{ id: 'cross', source: 'a1', target: 'b1' }],
      domains: [firstDomain, secondDomain],
      leafNodes: [firstChild, secondChild],
      nodeById: new Map(nodes.map(node => [node.id, node])),
      nodeToSubGroup: new Map(),
      domainOrder: ['a', 'b'],
      domainOrderIndex: new Map([['a', 0], ['b', 1]]),
      isHorizontal: false,
      domainGap: 50,
      getNodeDimensions: dimensions,
    });

    expect(firstDomain.position.y).toBeLessThan(secondDomain.position.y);
    expect(firstChild.position.x - firstDomain.position.x).toBe(20);
    expect(firstChild.position.y - firstDomain.position.y).toBe(30);
    expect(secondChild.position.x - secondDomain.position.x).toBe(20);
    expect(secondChild.position.y - secondDomain.position.y).toBe(30);
  });
});
