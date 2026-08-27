import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { resolveBaseReactFlowDragAwareInputIdentity } from '../baseReactFlowDragRoutingFreeze';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerProjection';

const nodes: Node[] = [
  {
    id: 'domain',
    position: { x: 400, y: 300 },
    width: 400,
    height: 240,
    data: {},
  },
  {
    id: 'child',
    parentId: 'domain',
    position: { x: 40, y: 30 },
    width: 100,
    height: 60,
    data: {},
  },
];
const edges: Edge[] = [{ id: 'self', source: 'child', target: 'child', data: {} }];

describe('drag-aware display routing identity', () => {
  it('uses the exact projected geometry sent across the Worker boundary', () => {
    const projected = projectBaseReactFlowDisplayWorkerInput({ nodes, edges });
    const expected = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: projected.nodes,
      edges: projected.edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });

    expect(resolveBaseReactFlowDragAwareInputIdentity({
      isNodeDragging: false,
      nodes,
      edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    })).toEqual(expected);
  });

  it('does not recompute a moving graph identity mid-drag', () => {
    expect(resolveBaseReactFlowDragAwareInputIdentity({
      isNodeDragging: true,
      nodes: [],
      edges: [],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    })).toEqual({
      cacheSignature: 'node-drag-paused',
      geometryDigest: 'node-drag-paused',
    });
  });
});
