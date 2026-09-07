import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { ElkNode } from 'elkjs';

import type { ElkLayoutRunner } from '../../ports/elkLayoutExecutor';
import { LayoutType, type LayoutOptions } from '../../types/layout';
import type { LayoutCalculationContext } from '../../types/layout-strategy';
import { applyElkResultNodeGeometry } from '../AbstractElkLayoutStrategy';
import { DomainCompoundElkLayoutStrategy } from '../DomainCompoundElkLayoutStrategy';
import { DomainElkLayoutStrategy } from '../DomainElkLayoutStrategy';
import { evaluateLayoutGeometry } from '../../algorithms/layoutGeometryConstraints';

const elkMocks = vi.hoisted(() => ({
  runElkLayout: vi.fn(),
}));

vi.mock('../../workers/elkLayoutClient', () => ({
  runElkLayout: elkMocks.runElkLayout,
}));

vi.mock('../../components/layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidth: () => 180,
      calculateNodeHeight: () => 80,
      calculateNodeWidthWithOverrides: () => 180,
      calculateNodeHeightWithOverrides: () => 80,
    }),
  },
}));

class InspectableDomainCompoundElkLayoutStrategy extends DomainCompoundElkLayoutStrategy {
  buildGraph(nodes: Node[], edges: Edge[], options: LayoutOptions): ElkNode {
    return this.buildElkGraph(nodes, edges, options);
  }

  runGraph(graph: ElkNode, nodes: Node[], edges: Edge[], context: LayoutCalculationContext) {
    return this.runWorkerLayout(graph, nodes, edges, { x: 0, y: 0 }, context);
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

beforeEach(() => {
  elkMocks.runElkLayout.mockReset();
});

describe('DomainCompoundElkLayoutStrategy', () => {
  it('reconstructs the returned hierarchy after layout-switch preparation removed parent ids', () => {
    const domain = node('domain', 'titleGroup', { domain: 'A' });
    const subgroup = node('subgroup', 'subGroup', { domain: 'A', subDomain: 'One' });
    const child = node('child', 'custom', { domain: 'A', subDomain: 'One' });
    const direct = node('direct', 'custom', { domain: 'A' });
    const nodes = [child, direct, subgroup, domain];
    for (const current of nodes) current.measured = { width: 9000, height: 9000 };
    const orderedNodes = applyElkResultNodeGeometry([{
      id: 'domain', x: 10, y: 20, width: 600, height: 400,
      children: [
        { id: 'subgroup', x: 30, y: 60, width: 240, height: 200,
          children: [{ id: 'child', x: 20, y: 64, width: 180, height: 80 }] },
        { id: 'direct', x: 320, y: 88, width: 180, height: 80 },
      ],
    }], new Map(nodes.map(current => [current.id, current])), { x: 40, y: 40 });
    expect(orderedNodes.map(current => current.id)).toEqual(['domain', 'subgroup', 'child', 'direct']);
    expect(domain.position).toEqual({ x: 50, y: 60 });
    expect(subgroup).toMatchObject({ parentId: 'domain', extent: 'parent', position: { x: 30, y: 60 } });
    expect(child).toMatchObject({ parentId: 'subgroup', extent: 'parent', position: { x: 20, y: 64 } });
    expect(direct).toMatchObject({ parentId: 'domain', extent: 'parent', position: { x: 320, y: 88 } });
    for (const current of nodes) {
      expect(current.measured).toEqual({ width: current.width, height: current.height });
      expect(current.style).toMatchObject(current.measured ?? {});
    }
    expect(evaluateLayoutGeometry(nodes).clean).toBe(true);
  });

  it('uses the new ELK parent and clears obsolete hierarchy on roots', () => {
    const domain = { ...node('domain', 'titleGroup', {}), parentId: 'obsolete', extent: 'parent' as const };
    const child = { ...node('child', 'custom', {}), parentId: 'obsolete', extent: 'parent' as const,
      positionAbsolute: { x: 999, y: 999 } };
    applyElkResultNodeGeometry([{ id: 'domain', x: 10, y: 20, width: 300, height: 200,
      children: [{ id: 'child', x: 30, y: 60, width: 180, height: 80 }] }],
    new Map([domain, child].map(current => [current.id, current])), { x: 40, y: 40 });
    expect(domain.parentId).toBeUndefined();
    expect(domain.extent).toBeUndefined();
    expect(child.parentId).toBe('domain');
    expect(child.positionAbsolute).toBeUndefined();
    expect(evaluateLayoutGeometry([domain, child]).clean).toBe(true);
  });

  it('preserves omitted dimensions but cannot disguise supplied invalid ELK geometry', () => {
    const first = node('first', 'custom', {}), second = node('second', 'custom', {});
    applyElkResultNodeGeometry(undefined, new Map(), { x: 40, y: 40 });
    applyElkResultNodeGeometry([{ id: 'first' }], new Map([[first.id, first]]), { x: 40, y: 40 });
    expect(first.width).toBe(180);
    expect(first.position).toEqual({ x: 40, y: 40 });
    expect(evaluateLayoutGeometry([first]).clean).toBe(true);
    applyElkResultNodeGeometry([{ id: 'first', x: 0, y: 0, width: NaN, height: 80 },
      { id: 'second', x: 300, y: 0, width: -1, height: Infinity }],
    new Map([first, second].map(current => [current.id, current])), { x: 40, y: 40 });
    expect(evaluateLayoutGeometry([first, second]).clean).toBe(false);
    const invalidPosition = node('position', 'custom', {});
    applyElkResultNodeGeometry([{ id: 'position', x: Infinity, y: NaN }],
      new Map([[invalidPosition.id, invalidPosition]]), { x: 40, y: 40 });
    expect(evaluateLayoutGeometry([invalidPosition]).clean).toBe(false);
  });

  it('forwards cancellation and does not route unchanged geometry after an ELK failure', async () => {
    const controller = new AbortController();
    const failure = new Error('ELK layout timed out after 30000ms');
    elkMocks.runElkLayout.mockRejectedValueOnce(failure);

    const strategy = new InspectableDomainCompoundElkLayoutStrategy();
    const nodes = [node('source', 'custom', {}), node('target', 'custom', {})];
    const edges = [{ id: 'edge', source: 'source', target: 'target' }];
    const graph = strategy.buildGraph(
      nodes,
      edges,
      { type: LayoutType.ELK_LAYERED, direction: 'LR' },
    );

    await expect(strategy.runGraph(
      graph,
      nodes,
      edges,
      { signal: controller.signal },
    )).rejects.toBe(failure);

    expect(elkMocks.runElkLayout).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'domain-compound-elk-root' }),
      { timeoutMs: 30_000, signal: controller.signal },
    );
  });

  it('prefers the injected runner and forwards its cancellation context', async () => {
    const controller = new AbortController();
    const run = vi.fn().mockResolvedValue({
      id: 'domain-compound-elk-root',
      children: [
        { id: 'source', x: 10, y: 20, width: 180, height: 80 },
        { id: 'target', x: 300, y: 20, width: 180, height: 80 },
      ],
      edges: [],
    });
    const runner: ElkLayoutRunner = { run };
    const strategy = new InspectableDomainCompoundElkLayoutStrategy();
    const nodes = [node('source', 'custom', {}), node('target', 'custom', {})];
    const edges = [{ id: 'edge', source: 'source', target: 'target' }];
    const graph = strategy.buildGraph(
      nodes,
      edges,
      { type: LayoutType.ELK_LAYERED, direction: 'LR' },
    );

    await expect(strategy.runGraph(graph, nodes, edges, {
      elkLayoutRunner: runner,
      signal: controller.signal,
    })).resolves.toMatchObject({ nodes });

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'domain-compound-elk-root' }),
      { timeoutMs: 30_000, signal: controller.signal },
    );
    expect(elkMocks.runElkLayout).not.toHaveBeenCalled();
  });

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
      'elk.json.edgeCoords': 'ROOT',
      'elk.spacing.edgeNode': '64',
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

  it.each([
    ['TB', 'DOWN'],
    ['BT', 'UP'],
    ['LR', 'RIGHT'],
    ['RL', 'LEFT'],
  ] as const)('maps %s to the matching ELK compound direction', (direction, expected) => {
    const graph = new InspectableDomainCompoundElkLayoutStrategy().buildGraph(
      [node('source', 'custom', {}), node('target', 'custom', {})],
      [{ id: 'edge', source: 'source', target: 'target' }],
      { type: LayoutType.ELK_LAYERED, direction },
    );

    expect(graph.layoutOptions?.['elk.direction']).toBe(expected);
  });
});

describe('DomainElkLayoutStrategy runner injection', () => {
  const resultFor = (rootId: string) => ({
    id: 'elk-domain-layout',
    children: [{ id: rootId, x: 100, y: 50, width: 180, height: 80 }],
    edges: [],
  });

  it('prefers an injected runner while retaining the one-shot fallback', async () => {
    const controller = new AbortController();
    const run = vi.fn().mockResolvedValue(resultFor('injected-node'));
    const runner: ElkLayoutRunner = { run };
    const strategy = new DomainElkLayoutStrategy();
    const options: LayoutOptions = { type: LayoutType.ELK_LAYERED, direction: 'TB' };

    await strategy.calculateLayout(
      [node('injected-node', 'custom', {})],
      [],
      options,
      { elkLayoutRunner: runner, signal: controller.signal },
    );

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'elk-domain-layout' }),
      { signal: controller.signal },
    );
    expect(elkMocks.runElkLayout).not.toHaveBeenCalled();

    elkMocks.runElkLayout.mockResolvedValueOnce(resultFor('fallback-node'));
    await strategy.calculateLayout(
      [node('fallback-node', 'custom', {})],
      [],
      options,
      { signal: controller.signal },
    );

    expect(elkMocks.runElkLayout).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'elk-domain-layout' }),
      { signal: controller.signal },
    );
  });
});
