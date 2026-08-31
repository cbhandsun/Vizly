import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { LayoutType } from '../../../../types/layout';
import { alignDomainDagreLaneFlow } from '../../../../strategies/domainDagreSemanticLaneFlow';
import {
  calculateLayeredLayoutWithReverse,
  reverseLayeredLayoutGeometry,
} from '../reverseLayeredLayoutGeometry';

describe('reverseLayeredLayoutGeometry', () => {
  it('mirrors BT nodes and every supported absolute route path without mutating the source', () => {
    const invalidPath = [{ x: 0, y: Number.NaN }];
    const nodes = [
      { id: 'source', position: { x: 10, y: 40 }, width: 100, height: 60, data: {} },
      { id: 'target', position: { x: 10, y: 220 }, width: 100, height: 40, data: {} },
    ] as Node[];
    const edges = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [{ x: 60, y: 100 }, { x: 60, y: 200 }],
        elkPath: [{ x: 70, y: 120 }, { x: 70, y: 180 }],
        treeRouting: { points: [{ x: 80, y: 140 }, { x: 80, y: 160 }] },
        unsupportedPath: invalidPath,
      },
    }] as Edge[];
    const originalPositions = nodes.map(node => ({ ...node.position }));

    const result = reverseLayeredLayoutGeometry({ nodes, edges }, 'BT');

    expect(result.nodes.map(node => node.position)).toEqual([
      { x: 10, y: 200 },
      { x: 10, y: 40 },
    ]);
    expect(result.edges[0]?.data).toMatchObject({
      computedPath: [{ x: 60, y: 200 }, { x: 60, y: 100 }],
      elkPath: [{ x: 70, y: 180 }, { x: 70, y: 120 }],
      treeRouting: { points: [{ x: 80, y: 160 }, { x: 80, y: 140 }] },
    });
    expect(result.edges[0]?.data?.unsupportedPath).toBe(invalidPath);
    expect(nodes.map(node => node.position)).toEqual(originalPositions);
    expect(edges[0]?.data?.computedPath).toEqual([
      { x: 60, y: 100 },
      { x: 60, y: 200 },
    ]);
  });

  it('mirrors nested nodes and paths in one absolute frame, preserving endpoint attachment', () => {
    const nodes = [
      { id: 'parent', position: { x: 40, y: 100 }, width: 500, height: 400, data: {} },
      {
        id: 'first-child',
        parentId: 'parent',
        position: { x: 30, y: 50 },
        width: 100,
        height: 60,
        data: {},
      },
      {
        id: 'second-child',
        parentId: 'parent',
        position: { x: 30, y: 250 },
        width: 100,
        height: 60,
        data: {},
      },
    ] as Node[];
    const edges = [{
      id: 'nested-edge',
      source: 'first-child',
      target: 'second-child',
      data: { computedPath: [{ x: 120, y: 150 }, { x: 120, y: 350 }] },
    }] as Edge[];

    const result = reverseLayeredLayoutGeometry({ nodes, edges }, 'BT');

    expect(result.nodes.map(node => node.position)).toEqual([
      { x: 40, y: 100 },
      { x: 30, y: 290 },
      { x: 30, y: 90 },
    ]);
    expect(result.edges[0]?.data?.computedPath).toEqual([
      { x: 120, y: 450 },
      { x: 120, y: 250 },
    ]);
    const parentY = result.nodes[0].position.y;
    expect(parentY + result.nodes[1].position.y + 60).toBe(450);
    expect(parentY + result.nodes[2].position.y + 60).toBe(250);
  });

  it('mirrors RL geometry on the horizontal axis', () => {
    const nodes = [
      { id: 'source', position: { x: 20, y: 10 }, width: 100, height: 60, data: {} },
      { id: 'target', position: { x: 300, y: 10 }, width: 80, height: 60, data: {} },
    ] as Node[];
    const edges = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 70, y: 40 }, { x: 340, y: 40 }] },
    }] as Edge[];

    const result = reverseLayeredLayoutGeometry({ nodes, edges }, 'RL');

    expect(result.nodes.map(node => node.position)).toEqual([
      { x: 280, y: 10 },
      { x: 20, y: 10 },
    ]);
    expect(result.edges[0]?.data?.computedPath).toEqual([
      { x: 330, y: 40 },
      { x: 60, y: 40 },
    ]);
  });

  it.each(['BT', 'RL'] as const)('keeps cross-domain endpoints attached with asymmetric nested padding in %s', direction => {
    const nodes: Array<Node & { positionAbsolute?: { x: number; y: number } }> = [
      { id: 'a', position: { x: 10, y: 20 }, width: 400, height: 500, data: {} },
      { id: 'b', position: { x: 600, y: 300 }, width: 400, height: 700, data: {} },
      { id: 'source', parentId: 'a', position: { x: 30, y: 40 },
        positionAbsolute: { x: 40, y: 60 }, width: 100, height: 60, data: {} },
      { id: 'target', parentId: 'b', position: { x: 90, y: 300 },
        positionAbsolute: { x: 690, y: 600 }, width: 120, height: 80, data: {} },
    ];
    const path = direction === 'BT'
      ? [{ x: 90, y: 120 }, { x: 90, y: 400 }, { x: 750, y: 400 }, { x: 750, y: 600 }]
      : [{ x: 140, y: 90 }, { x: 400, y: 90 }, { x: 400, y: 640 }, { x: 690, y: 640 }];
    const edges: Edge[] = [{ id: 'cross-domain', source: 'source', target: 'target', data: { computedPath: path } }];
    const input = { nodes, edges };
    const before = structuredClone(input);
    const result = reverseLayeredLayoutGeometry(input, direction);
    const [parentA, parentB, source, target] = result.nodes;
    const absoluteSource = { x: parentA.position.x + source.position.x, y: parentA.position.y + source.position.y };
    const absoluteTarget = { x: parentB.position.x + target.position.x, y: parentB.position.y + target.position.y };
    expect(source.positionAbsolute).toEqual(absoluteSource);
    expect(target.positionAbsolute).toEqual(absoluteTarget);
    expect(result.edges[0].data?.computedPath).toEqual(direction === 'BT'
      ? [{ x: absoluteSource.x + 50, y: absoluteSource.y }, { x: 90, y: 620 },
        { x: 750, y: 620 }, { x: absoluteTarget.x + 60, y: absoluteTarget.y + 80 }]
      : [{ x: absoluteSource.x, y: absoluteSource.y + 30 }, { x: 610, y: 90 },
        { x: 610, y: 640 }, { x: absoluteTarget.x + 120, y: absoluteTarget.y + 40 }]);
    expect(source.position.x).toBeGreaterThanOrEqual(0);
    expect(source.position.y).toBeGreaterThanOrEqual(0);
    expect(target.position.x).toBeGreaterThanOrEqual(0);
    expect(target.position.y).toBeGreaterThanOrEqual(0);
    expect(reverseLayeredLayoutGeometry(result, direction)).toEqual(input);
    expect(input).toEqual(before);
  });

  it('retains empty and non-finite graph inputs without inventing geometry', () => {
    const empty = { nodes: [], edges: [] };
    expect(reverseLayeredLayoutGeometry(empty, 'BT')).toBe(empty);
    const invalid = { nodes: [{ id: 'bad', position: { x: 0, y: NaN }, data: {} }], edges: [] };
    expect(reverseLayeredLayoutGeometry(invalid, 'BT')).toBe(invalid);
  });

  it('calculates reverse requests with forward nested rankings before mirroring', async () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
      { id: 'target', position: { x: 0, y: 200 }, width: 100, height: 40, data: {} },
    ] as Node[];
    const edges = [{ id: 'edge', source: 'source', target: 'target' }] as Edge[];
    const calculateLayout = vi.fn(async () => ({ nodes, edges }));
    const controller = new AbortController();

    const result = await calculateLayeredLayoutWithReverse(
      { calculateLayout },
      nodes,
      edges,
      {
        type: LayoutType.ELK_LAYERED,
        direction: 'BT',
        directionOverrides: { domain: { warehouse: 'BT' } },
        domainSubGroupDirection: 'BT',
        subDomainNodeDirection: 'BT',
      },
      'BT',
      true,
      { signal: controller.signal },
    );

    expect(calculateLayout).toHaveBeenCalledWith(nodes, edges, expect.objectContaining({
      direction: 'TB',
      directionOverrides: undefined,
      domainSubGroupDirection: 'TB',
      subDomainNodeDirection: 'TB',
    }), { signal: controller.signal });
    expect(result.nodes.map(node => node.position.y)).toEqual([200, 0]);
  });

  it.each([
    ['BT', LayoutType.DAGRE], ['RL', LayoutType.DAGRE], ['BT', LayoutType.FLOW], ['RL', LayoutType.FLOW],
  ] as const)('uses native semantic lane ranking in %s/%s so headers stay above their children', async (direction, nodeLayout) => {
    const nodes: Node[] = [
      { id: 'domain', type: 'titleGroup', position: { x: 0, y: 0 }, data: { domain: 'a' } },
      { id: 'sub', type: 'subGroup', position: { x: 0, y: 0 }, data: { domain: 'a', subDomain: 'one' } },
      ...['source', 'target'].map(id => ({ id, type: 'custom', position: { x: 0, y: 0 },
        width: 160, height: 80, data: { domain: 'a', subDomain: 'one' } })),
    ];
    const edges: Edge[] = [{ id: 'e', source: 'source', target: 'target' }];
    const membership = new Map([['source', 'sub'], ['target', 'sub']]);
    const calculateLayout = vi.fn(async (_nodes: Node[], _edges: Edge[], options: { direction?: string } = {}) => ({
      nodes: alignDomainDagreLaneFlow(nodes, edges, {
        direction: options.direction === 'BT' || options.direction === 'RL' || options.direction === 'LR'
          ? options.direction : 'TB', nodeToSubGroup: membership,
      }), edges,
    }));
    const result = await calculateLayeredLayoutWithReverse({ calculateLayout }, nodes, edges,
      { type: LayoutType.DAGRE, domainPlacement: 'ordered-lanes', nodeLayout }, direction, true);
    expect(calculateLayout).toHaveBeenCalledWith(nodes, edges, expect.objectContaining({ direction }), undefined);
    const [domain, sub, source, target] = result.nodes;
    expect(sub.position.y - domain.position.y).toBeGreaterThanOrEqual(50);
    for (const child of [source, target]) expect(child.position.y - sub.position.y).toBeGreaterThanOrEqual(32);
    const flow = direction === 'BT' ? 'y' : 'x';
    expect(source.position[flow]).toBeGreaterThan(target.position[flow]);
  });
});
