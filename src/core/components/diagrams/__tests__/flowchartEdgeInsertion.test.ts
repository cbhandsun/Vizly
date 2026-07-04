import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { buildFlowchartEdgeInsertionPlan } from '../flowchartEdgeInsertion';

describe('flowchartEdgeInsertion', () => {
  const nodes: Node[] = [
    {
      id: 'source',
      type: 'custom',
      position: { x: 100, y: 200 },
      data: { label: 'Source' },
      measured: { width: 200, height: 80 },
    },
    {
      id: 'target',
      type: 'custom',
      position: { x: 500, y: 400 },
      data: { label: 'Target' },
      measured: { width: 120, height: 60 },
    },
  ];

  const edge: Edge = {
    id: 'edge-1',
    source: 'source',
    target: 'target',
    type: 'advanced-smart-step',
    style: { stroke: '#333' },
    animated: true,
  };

  it('builds an inserted node at the edge midpoint and preserves visual edge props', () => {
    const plan = buildFlowchartEdgeInsertionPlan({
      edge,
      nodes,
      label: 'New Node',
      createNodeId: () => 'inserted-fixed',
      createEdgeId: (source, target) => `${source}->${target}`,
    });

    expect(plan).toEqual({
      node: {
        id: 'inserted-fixed',
        type: 'custom',
        position: { x: 320, y: 315 },
        data: { label: 'New Node', shape: 'roundedRect' },
      },
      replacementEdges: [
        {
          id: 'source->inserted-fixed',
          source: 'source',
          target: 'inserted-fixed',
          type: 'advanced-smart-step',
          style: { stroke: '#333' },
          animated: true,
          markerEnd: undefined,
          markerStart: undefined,
        },
        {
          id: 'inserted-fixed->target',
          source: 'inserted-fixed',
          target: 'target',
          type: 'advanced-smart-step',
          style: { stroke: '#333' },
          animated: true,
          markerEnd: undefined,
          markerStart: undefined,
        },
      ],
    });
  });

  it('returns null when either endpoint node is missing', () => {
    expect(buildFlowchartEdgeInsertionPlan({
      edge,
      nodes: [nodes[0]],
      label: 'New Node',
    })).toBeNull();
  });
});
