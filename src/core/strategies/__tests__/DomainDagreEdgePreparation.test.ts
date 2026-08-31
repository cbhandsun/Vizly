import { describe, expect, it, vi } from 'vitest';
import type { Edge } from '@xyflow/react';

import { LayoutType, type LayoutOptions } from '../../types/layout';
import { prepareDomainDagreEdges } from '../DomainDagreEdgePreparation';
import type { RoutingNode } from '../domainDagreEdgePreparationSupport';

const { loadFull } = vi.hoisted(() => ({ loadFull: vi.fn() }));
vi.mock('../domainDagreFullEdgePreparation', async importOriginal => {
  loadFull();
  return importOriginal<typeof import('../domainDagreFullEdgePreparation')>();
});

describe('prepareDomainDagreEdges', () => {
  it('preserves leaf geometry and canonicalizes subpixel DOM dimensions', async () => {
    const nodes: RoutingNode[] = [
      {
        id: 'source',
        type: 'custom',
        position: { x: 0, y: 0 },
        measured: { width: 249, height: 96 },
        data: {},
      },
      {
        id: 'target',
        type: 'custom',
        position: { x: 400, y: 0 },
        measured: { width: 217.4, height: 95.6 },
        data: {},
      },
    ];
    const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target' }];
    const nodeById = new Map(nodes.map(node => [node.id, node] as const));
    const options: LayoutOptions = {
      type: LayoutType.DAGRE,
      direction: 'LR',
      edgeRoutingQuality: 'interactive',
    };

    await prepareDomainDagreEdges({
      nodes,
      edges,
      options,
      config: {},
      nodeById,
      leafNodes: nodes,
    });

    expect(loadFull).not.toHaveBeenCalled();

    expect(nodes.map(node => ({
      width: node.width,
      height: node.height,
      measured: node.measured,
    }))).toEqual([
      { width: 249, height: 96, measured: { width: 249, height: 96 } },
      { width: 217, height: 96, measured: { width: 217, height: 96 } },
    ]);
  });
});
