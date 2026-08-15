// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  markBaseDisplayFinalized,
  withDisplayAbsolutePositions,
} from '../baseReactFlowDisplayEdgeCore';

describe('baseReactFlowDisplay finalization boundaries', () => {
  it('locks only finite internally finalized computed paths to the stable renderer', () => {
    const finalized = markBaseDisplayFinalized<Edge[]>([{
      id: 'final-route',
      source: 'source',
      target: 'target',
      type: 'advanced-smart-step',
      data: { computedPath: [{ x: 50, y: 200 }, { x: 350, y: 0 }] },
    }], 'final-route-signature');
    const malformed = markBaseDisplayFinalized<Edge[]>([{
      id: 'malformed-route',
      source: 'source',
      target: 'target',
      type: 'advanced-smart-step',
      data: { computedPath: [{ x: Number.NaN, y: 200 }, { x: 350, y: 0 }] },
    }], 'malformed-route-signature');

    expect(finalized[0].type).toBe('stablePath');
    expect(finalized[0].data?.layoutPathLocked).toBe(true);
    expect(finalized[0].data?._layoutPathLocked).toBe(true);
    expect(malformed[0].type).toBe('advanced-smart-step');
    expect(malformed[0].data?.layoutPathLocked).toBeUndefined();
  });

  it('preserves measured absolute positions for nested nodes', () => {
    type NodeWithAbsolutePosition = Node & {
      positionAbsolute?: { x: number; y: number };
    };
    const parent: NodeWithAbsolutePosition = {
      id: 'parent',
      position: { x: 100, y: 200 },
      data: {},
      positionAbsolute: { x: 1_200.5, y: 1_300.25 },
    };
    const child: NodeWithAbsolutePosition = {
      id: 'child',
      parentId: 'parent',
      position: { x: 10, y: 20 },
      data: {},
      positionAbsolute: { x: 1_500.75, y: 1_600.5 },
    };
    const nodes = [parent, child];

    const result = withDisplayAbsolutePositions(
      nodes,
      new Map(nodes.map(node => [node.id, node] as const)),
    );

    expect(result.map(node => (node as NodeWithAbsolutePosition).positionAbsolute)).toEqual([
      { x: 1_200.5, y: 1_300.25 },
      { x: 1_500.75, y: 1_600.5 },
    ]);
  });
});
