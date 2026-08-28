import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { LayoutType } from '../../../../types/layout';
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

  it('mirrors nested nodes inside their parent coordinate space', () => {
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
      { x: 30, y: 250 },
      { x: 30, y: 50 },
    ]);
    expect(result.edges[0]?.data?.computedPath).toEqual([
      { x: 120, y: 450 },
      { x: 120, y: 250 },
    ]);
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
});
