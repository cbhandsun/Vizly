import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { ElkNode } from 'elkjs';

import { LayoutType, type LayoutOptions } from '../../types/layout';
import { DomainCompoundElkLayoutStrategy } from '../DomainCompoundElkLayoutStrategy';

vi.mock('../../components/layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidthWithOverrides: () => 180,
      calculateNodeHeightWithOverrides: () => 80,
    }),
  },
}));

class InspectableDomainCompoundElkLayoutStrategy extends DomainCompoundElkLayoutStrategy {
  buildGraph(nodes: Node[], edges: Edge[], options: LayoutOptions): ElkNode {
    return this.buildElkGraph(nodes, edges, options);
  }
}

const node = (
  id: string,
  type: string,
  data: Record<string, unknown>,
): Node => ({
  id,
  type,
  data,
  position: { x: 0, y: 0 },
  width: 180,
  height: 80,
});

describe('DomainCompoundElkLayoutStrategy', () => {
  it('nests each sub-domain exactly once and keeps unowned semantic groups', () => {
    const nodes = [
      node('domain-a', 'titleGroup', { domain: 'A' }),
      node('sub-a-one', 'subGroup', { domain: 'A', subDomain: 'One' }),
      node('a-one-leaf', 'custom', { domain: 'A', subDomain: 'One' }),
      node('a-free-leaf', 'custom', { domain: 'A' }),
      node('sub-b-two', 'subGroup', { domain: 'B', subDomain: 'Two' }),
      node('b-two-leaf', 'custom', { domain: 'B', subDomain: 'Two' }),
    ];
    const edges: Edge[] = [{
      id: 'cross-domain',
      source: 'a-one-leaf',
      target: 'b-two-leaf',
    }];
    const graph = new InspectableDomainCompoundElkLayoutStrategy().buildGraph(
      nodes,
      edges,
      { type: LayoutType.ELK_LAYERED, direction: 'TB', domainOrder: ['A'] },
    );

    const rootChildren = graph.children ?? [];
    expect(rootChildren.map(child => child.id)).toEqual(['domain-a', 'sub-b-two']);
    expect(new Set(rootChildren.map(child => child.id)).size).toBe(rootChildren.length);
    const domainA = rootChildren.find(child => child.id === 'domain-a');
    expect(domainA?.children?.map(child => child.id)).toEqual([
      'sub-a-one',
      'a-free-leaf',
    ]);
    expect(domainA?.children?.[0]?.children?.map(child => child.id)).toEqual([
      'a-one-leaf',
    ]);
    expect(rootChildren.find(child => child.id === 'sub-b-two')?.children?.map(child => child.id))
      .toEqual(['b-two-leaf']);
    expect(graph.edges).toEqual([{
      id: 'cross-domain',
      sources: ['a-one-leaf'],
      targets: ['b-two-leaf'],
    }]);
  });
});
