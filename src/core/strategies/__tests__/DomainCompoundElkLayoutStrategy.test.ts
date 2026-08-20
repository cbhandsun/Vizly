import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { ElkNode } from 'elkjs';

import { LayoutType, type LayoutOptions } from '../../types/layout';
import { applyElkResultNodeGeometry } from '../AbstractElkLayoutStrategy';
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
  it('keeps compound child coordinates relative while applying padding to roots', () => {
    const domain = node('domain-a', 'titleGroup', { domain: 'A' });
    const subDomain = {
      ...node('sub-a', 'subGroup', { domain: 'A', subDomain: 'One' }),
      parentId: 'domain-a',
    };
    const leaf = {
      ...node('leaf-a', 'custom', { domain: 'A', subDomain: 'One' }),
      parentId: 'sub-a',
    };
    const nodeById = new Map([domain, subDomain, leaf].map(item => [item.id, item] as const));

    applyElkResultNodeGeometry([{
      id: 'domain-a', x: 100, y: 200, width: 600, height: 500,
      children: [{
        id: 'sub-a', x: 30, y: 60, width: 400, height: 300,
        children: [{ id: 'leaf-a', x: 20, y: 80, width: 180, height: 80 }],
      }],
    }], nodeById, { x: 40, y: 40 });

    expect(domain.position).toEqual({ x: 140, y: 240 });
    expect(subDomain.position).toEqual({ x: 30, y: 60 });
    expect(leaf.position).toEqual({ x: 20, y: 80 });
    expect(domain.measured).toEqual({ width: 600, height: 500 });
    expect(subDomain.measured).toEqual({ width: 400, height: 300 });
  });

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
    expect(graph.layoutOptions).toMatchObject({
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.mergeHierarchyEdges': 'true',
      'elk.layered.crossingMinimization.hierarchicalSweepiness': '1.0',
      'elk.layered.crossingMinimization.greedySwitchHierarchical.type': 'TWO_SIDED',
    });
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
