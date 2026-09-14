import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';

import { LayoutType } from '../../types/layout';
import { applyDomainDagreEdgeRouting } from '../domainDagreFullEdgePreparation';
import type { RoutingNode } from '../domainDagreEdgePreparationSupport';

const node = (id: string, x: number, y: number, width = 220, height = 96): RoutingNode => ({
  id,
  type: 'custom',
  position: { x, y },
  positionAbsolute: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

const computedPath = (edge: Edge): Array<{ x: number; y: number }> => {
  const path = edge.data?.computedPath;
  return Array.isArray(path) ? path as Array<{ x: number; y: number }> : [];
};

describe('applyDomainDagreEdgeRouting geometry-facing terminals', () => {
  it('flips router-owned reversed horizontal fan-in terminals before locking the path', () => {
    const nodes: RoutingNode[] = [
      node('oms-atc', 1244, 112, 228, 96),
      node('oms-fulfill', 1792, 112, 220, 96),
      node('wms-outbound', 2962, 112, 253, 96),
    ];
    const edges: Edge[] = [
      { id: 'edge-oms-atc-fulfill', source: 'oms-atc', target: 'oms-fulfill' },
      { id: 'edge-wms-outbound-oms-fulfill', source: 'wms-outbound', target: 'oms-fulfill' },
    ];
    const nodeById = new Map(nodes.map(item => [item.id, item] as const));

    applyDomainDagreEdgeRouting(nodes, edges, nodeById, {}, {
      type: LayoutType.DAGRE,
      direction: 'TB',
      edgeRoutingQuality: 'full',
    });

    const forward = edges.find(edge => edge.id === 'edge-oms-atc-fulfill');
    expect(forward).toBeTruthy();
    if (!forward) return;
    const path = computedPath(forward);

    expect(forward.sourceHandle).toBe('right');
    expect(forward.targetHandle).toBe('left');
    expect(forward.data).toMatchObject({
      autoSource: true,
      autoTarget: true,
      layoutPathLocked: true,
      runtimeHandleLock: { source: true, target: true },
    });
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toMatchObject({ x: 1472, y: 160 });
    expect(path[path.length - 1]).toMatchObject({ x: 1792, y: 160 });
  });
});
