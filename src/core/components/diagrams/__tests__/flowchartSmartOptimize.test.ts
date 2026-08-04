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

  it('applies an immutable result and snapshots only after optimization succeeds', async () => {
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
    const optimize = vi.fn(async (_inputNodes: Node[], _inputEdges: Edge[]) => optimizeResult);

    await expect(runFlowchartSmartOptimize({
      nodes,
      edges,
      takeSnapshot,
      optimize,
    })).resolves.toEqual({ status: 'applied', result: optimizeResult });

    expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
    expect(optimize).toHaveBeenCalledOnce();
    expect(optimize.mock.calls[0][0]).not.toBe(nodes);
    expect(optimize.mock.calls[0][0][0]).not.toBe(nodes[0]);
    expect(optimize.mock.calls[0][0][0].position).not.toBe(nodes[0].position);
    expect(optimize.mock.calls[0][1]).not.toBe(edges);
    expect(optimize.mock.invocationCallOrder[0]).toBeLessThan(takeSnapshot.mock.invocationCallOrder[0]);
  });

  it('preserves optimize failures without adding an empty undo step', async () => {
    const takeSnapshot = vi.fn();
    const optimize = vi.fn(async (_inputNodes: Node[], _inputEdges: Edge[]) => {
      throw new Error('optimize failed');
    });

    await expect(runFlowchartSmartOptimize({
      nodes,
      edges,
      takeSnapshot,
      optimize,
    })).rejects.toThrow('optimize failed');

    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(optimize).toHaveBeenCalledOnce();
  });

  it('keeps locked nodes fixed while allowing editable peers to move', async () => {
    const locked = {
      ...nodes[0],
      data: { ...nodes[0].data, locked: true },
      draggable: false,
      position: { x: 15, y: 25 },
    };
    const editable = {
      ...nodes[0],
      id: 'node-2',
      position: { x: 18, y: 28 },
    };
    const takeSnapshot = vi.fn();
    const optimize = vi.fn(async (inputNodes: Node[]): Promise<OptimizationResult> => ({
      nodes: inputNodes.map(node => ({ ...node, position: { x: 40, y: 40 } })),
      edges: [],
      stats: { rectifiedOverlaps: 1, alignedNodes: 1 },
    }));

    const outcome = await runFlowchartSmartOptimize({
      nodes: [editable, locked],
      edges: [],
      takeSnapshot,
      optimize,
    });

    expect(outcome.status).toBe('applied');
    expect(outcome.result?.nodes.map(node => ({ id: node.id, position: node.position }))).toEqual([
      { id: 'node-2', position: { x: 40, y: 40 } },
      { id: 'node-1', position: { x: 15, y: 25 } },
    ]);
    expect(optimize.mock.calls[0][0].map(node => node.id)).toEqual(['node-1', 'node-2']);
    expect(takeSnapshot).toHaveBeenCalledOnce();
  });

  it('skips empty, fully locked, and unchanged canvases without history noise', async () => {
    const takeSnapshot = vi.fn();
    const optimize = vi.fn(async (inputNodes: Node[]): Promise<OptimizationResult> => ({
      nodes: inputNodes,
      edges: [],
      stats: { rectifiedOverlaps: 0, alignedNodes: 0 },
    }));

    await expect(runFlowchartSmartOptimize({ nodes: [], edges: [], takeSnapshot, optimize }))
      .resolves.toEqual({ status: 'empty', result: null });
    await expect(runFlowchartSmartOptimize({
      nodes: [{ ...nodes[0], data: { locked: true } }],
      edges: [],
      takeSnapshot,
      optimize,
    })).resolves.toMatchObject({ status: 'unchanged' });
    await expect(runFlowchartSmartOptimize({ nodes, edges: [], takeSnapshot, optimize }))
      .resolves.toMatchObject({ status: 'unchanged' });

    expect(optimize).toHaveBeenCalledOnce();
    expect(takeSnapshot).not.toHaveBeenCalled();
  });
});
