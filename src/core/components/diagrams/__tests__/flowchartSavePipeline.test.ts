import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@/core/types/plugin';
import { runFlowchartSavePipeline } from '../flowchartSavePipeline';

describe('flowchartSavePipeline', () => {
  const nodes: Node[] = [
    {
      id: 'node-1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: { label: 'Node' },
    },
  ];

  const edges: Edge[] = [];

  it('runs plugin sync before invoking the save action', async () => {
    const onDataSync = vi.fn();
    const saveAction = vi.fn(async () => undefined);
    const pluginCtx = {} as PluginContext;

    await runFlowchartSavePipeline({
      activePlugin: { onDataSync },
      pluginCtx,
      nodes,
      edges,
      saveAction,
    });

    expect(onDataSync).toHaveBeenCalledWith(nodes, edges, false, pluginCtx);
    expect(saveAction).toHaveBeenCalled();
    expect(onDataSync.mock.invocationCallOrder[0]).toBeLessThan(saveAction.mock.invocationCallOrder[0]);
  });

  it('skips plugin sync when the plugin or context is missing and still runs the save action', async () => {
    const saveAction = vi.fn(async () => undefined);

    await runFlowchartSavePipeline({
      activePlugin: null,
      pluginCtx: null,
      nodes,
      edges,
      saveAction,
    });

    expect(saveAction).toHaveBeenCalled();
  });

  it('succeeds when there is no save action to run', async () => {
    const onDataSync = vi.fn();

    await expect(runFlowchartSavePipeline({
      activePlugin: { onDataSync },
      pluginCtx: {} as PluginContext,
      nodes,
      edges,
      saveAction: undefined,
    })).resolves.toBeUndefined();

    expect(onDataSync).toHaveBeenCalled();
  });

  it('preserves an explicit cancelled result from the save boundary', async () => {
    await expect(runFlowchartSavePipeline({
      activePlugin: null,
      pluginCtx: null,
      nodes,
      edges,
      saveAction: async () => 'cancelled',
    })).resolves.toBe('cancelled');
  });
});
