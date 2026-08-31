import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { LayoutType } from '../../types/layout';

const { routeEdges } = vi.hoisted(() => ({ routeEdges: vi.fn() }));

vi.mock('../domainDagreFullEdgePreparation', () => ({
  applyDomainDagreEdgeRouting: routeEdges,
}));

import { runDomainDagreSimplifiedPath } from '../domainDagreSimplifiedPaths';

const dimensions = () => ({ width: 120, height: 60 });

const makeLeaf = (id: string): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: { label: id },
  style: { width: 120, height: 60 },
});

const contextFor = (nodes: Node[], edges: Edge[]) => ({
  nodes,
  edges,
  domains: [] as Node[],
  subGroups: [] as Node[],
  leafNodes: nodes.filter(node => node.type !== 'subGroup'),
  idMap: new Map(nodes.map(node => [node.id, node])),
  routingConfig: {},
  options: { type: LayoutType.DAGRE },
  isHorizontal: false,
  subDomainNodeIsHorizontal: false,
  domainSubGroupIsHorizontal: true,
  nodeGapH: 40,
  nodeGapV: 30,
  subDomainPaddingH: 24,
  subDomainPaddingV: 16,
  subDomainPaddingBottom: 12,
  subDomainTitleHeight: 28,
  titleSafetyGap: 8,
  widthCompensation: 1,
  getNodeDimensions: dimensions,
});

describe('runDomainDagreSimplifiedPath', () => {
  beforeEach(() => routeEdges.mockClear());

  it('lays out ungrouped leaves and removes dangling edges', () => {
    const nodes = [makeLeaf('a'), makeLeaf('b')];
    const edges: Edge[] = [
      { id: 'valid', source: 'a', target: 'b' },
      { id: 'dangling', source: 'a', target: 'missing' },
    ];

    const result = runDomainDagreSimplifiedPath(contextFor(nodes, edges));

    expect(result?.edges.map(edge => edge.id)).toEqual(['valid']);
    expect(result?.nodes.every(node => (
      Number.isFinite(node.position.x) && Number.isFinite(node.position.y)
    ))).toBe(true);
    expect(result?.nodes.every(node => node.measured?.width === 120)).toBe(true);
    expect(result?.nodes.every(node => !('positionAbsolute' in node))).toBe(true);
    expect(routeEdges).toHaveBeenCalledOnce();
  });

  it('sizes subgroups, preserves free nodes, and emits parent-relative children', () => {
    const first = makeLeaf('first');
    const second = makeLeaf('second');
    const free = makeLeaf('free');
    const subGroup: Node = {
      id: 'subgroup',
      type: 'subGroup',
      position: { x: 0, y: 0 },
      data: { children: ['first', 'second'] },
    };
    const nodes = [subGroup, first, second, free];
    const edges: Edge[] = [{ id: 'inside', source: 'first', target: 'second' }];
    const context = contextFor(nodes, edges);
    context.subGroups = [subGroup];

    const result = runDomainDagreSimplifiedPath(context);
    const resultSubGroup = result?.nodes.find(node => node.id === 'subgroup');
    const children = result?.nodes.filter(node => ['first', 'second'].includes(node.id)) ?? [];
    const resultFree = result?.nodes.find(node => node.id === 'free');

    expect(resultSubGroup?.style?.width).toEqual(expect.any(Number));
    expect(resultSubGroup?.style?.height).toEqual(expect.any(Number));
    expect(children.every(node => node.parentId === 'subgroup' && node.extent === 'parent')).toBe(true);
    expect(children.every(node => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
    expect(resultFree?.parentId).toBeUndefined();
    expect(result?.nodes[0].id).toBe('subgroup');
    expect(routeEdges).toHaveBeenCalledOnce();
  });

  it('defers to the full layout path when a visible domain exists', () => {
    const nodes = [makeLeaf('leaf')];
    const context = contextFor(nodes, []);
    context.domains = [{
      id: 'domain',
      type: 'titleGroup',
      position: { x: 0, y: 0 },
      data: { domain: 'operations' },
    }];

    expect(runDomainDagreSimplifiedPath(context)).toBeNull();
    expect(routeEdges).not.toHaveBeenCalled();
  });
});
