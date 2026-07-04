import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { OptimizationResult } from '@/core/services/DiagramIntelligenceService';

import { runFlowchartSmartOptimize } from '../flowchartSmartOptimize';

describe('flowchartSmartOptimize', () => {
  const nodes: Node[] = [
    {
      id: 'node-1',
      type: 'custom',
      position: { x: 15, y: 25 },
      data: { label: 'Node 1' },
    },
  ];

  const edges: Edge[] = [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    },
  ];

  it('takes a snapshot before running optimization', async () => {
    const takeSnapshot = vi.fn();
    const optimizeResult: OptimizationResult = {
      nodes: [
        {
          ...nodes[0],
          position: { x: 20, y: 20 },
        },
      ],
      edges,
      stats: {
        rectifiedOverlaps: 1,
        alignedNodes: 1,
      },
    };
    const optimize = vi.fn(async () => optimizeResult);

    await expect(runFlowchartSmartOptimize({
      nodes,
      edges,
      takeSnapshot,
      optimize,
    })).resolves.toEqual(optimizeResult);

    expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
    expect(optimize).toHaveBeenCalledWith(nodes, edges);
    expect(takeSnapshot.mock.invocationCallOrder[0]).toBeLessThan(optimize.mock.invocationCallOrder[0]);
  });

  it('preserves optimize failures after taking a snapshot', async () => {
    const takeSnapshot = vi.fn();
    const optimize = vi.fn(async () => {
      throw new Error('optimize failed');
    });

    await expect(runFlowchartSmartOptimize({
      nodes,
      edges,
      takeSnapshot,
      optimize,
    })).rejects.toThrow('optimize failed');

    expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
    expect(optimize).toHaveBeenCalledWith(nodes, edges);
  });
});
