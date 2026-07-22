import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { FlowchartJsonImportPlan } from '../flowchartImportPlan';
import type { FlowchartMermaidImportPlan } from '../flowchartMermaidImport';
import {
  applyFlowchartJsonImportPlan,
  applyFlowchartMermaidImportPlan,
  createFlowchartImportFallbackId,
} from '../flowchartImportApply';

describe('flowchartImportApply', () => {
  const nodes: Node[] = [
    {
      id: 'node-1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: { label: 'Node 1' },
    },
  ];

  const edges: Edge[] = [];

  it('prefers businessData id, then diagram id, then generated fallback id', () => {
    expect(createFlowchartImportFallbackId({
      businessDataId: 'business-id',
      diagramId: 'diagram-id',
    })).toBe('business-id');

    expect(createFlowchartImportFallbackId({
      diagramId: 'diagram-id',
    })).toBe('diagram-id');

    expect(createFlowchartImportFallbackId({
      createId: () => 'generated-id',
    })).toBe('generated-id');
  });

  it('applies standard-plugin import plans directly to canvas state', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const onStandardPluginSuccess = vi.fn();

    await applyFlowchartJsonImportPlan({
      importPlan: {
        kind: 'standard-plugin',
        nodes,
        edges,
      },
      setNodes,
      setEdges,
      onStandardPluginSuccess,
      registerStandardReload: vi.fn(),
      onStandardReloadQueued: vi.fn(),
      onReactFlowSuccess: vi.fn(),
    });

    expect(setNodes).toHaveBeenCalledWith(nodes);
    expect(setEdges).toHaveBeenCalledWith(edges);
    expect(onStandardPluginSuccess).toHaveBeenCalledWith(1);
  });

  it('registers standard-reload plans before queuing navigation', async () => {
    const registerStandardReload = vi.fn(async () => undefined);
    const onStandardReloadQueued = vi.fn();

    const plan: FlowchartJsonImportPlan = {
      kind: 'standard-reload',
      currentId: 'diagram-1',
      normalized: {
        id: 'diagram-1',
        name: 'Imported',
        type: 'flowchart',
        version: '1.0.0',
        nodes: [],
        edges: [],
        layout: {
          type: 'custom',
          direction: 'TB',
          spacing: { horizontal: 80, vertical: 60 },
          padding: { horizontal: 24, vertical: 16 },
        },
        theme: { name: 'default', displayName: 'Default', domains: {} },
      },
      title: 'Imported',
    };

    await applyFlowchartJsonImportPlan({
      importPlan: plan,
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      onStandardPluginSuccess: vi.fn(),
      registerStandardReload,
      onStandardReloadQueued,
      onReactFlowSuccess: vi.fn(),
    });

    if (plan.kind !== 'standard-reload') {
      throw new Error('Expected standard-reload plan');
    }

    expect(registerStandardReload).toHaveBeenCalledWith({
      normalized: plan.normalized,
      currentId: 'diagram-1',
      title: 'Imported',
    });
    expect(onStandardReloadQueued).toHaveBeenCalledWith('diagram-1');
    expect(registerStandardReload.mock.invocationCallOrder[0]).toBeLessThan(onStandardReloadQueued.mock.invocationCallOrder[0]);
  });

  it('applies reactflow plans and reports imported canvas counts', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const onReactFlowSuccess = vi.fn();

    await applyFlowchartJsonImportPlan({
      importPlan: {
        kind: 'reactflow',
        nodes,
        edges,
      },
      setNodes,
      setEdges,
      onStandardPluginSuccess: vi.fn(),
      registerStandardReload: vi.fn(),
      onStandardReloadQueued: vi.fn(),
      onReactFlowSuccess,
    });

    expect(setNodes).toHaveBeenCalledWith(nodes);
    expect(setEdges).toHaveBeenCalledWith(edges);
    expect(onReactFlowSuccess).toHaveBeenCalledWith({ nodes, edges });
  });

  it('applies mermaid plans and schedules the layout hint', () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const onMermaidSuccess = vi.fn();
    const onMermaidLayoutHint = vi.fn();
    const importPlan: FlowchartMermaidImportPlan = {
      nodes,
      edges,
      layoutHintDelayMs: 500,
    };

    applyFlowchartMermaidImportPlan({
      importPlan,
      setNodes,
      setEdges,
      onMermaidSuccess,
      onMermaidLayoutHint,
    });

    expect(setNodes).toHaveBeenCalledWith(nodes);
    expect(setEdges).toHaveBeenCalledWith(edges);
    expect(onMermaidSuccess).toHaveBeenCalled();
    expect(onMermaidLayoutHint).toHaveBeenCalledWith(500);
  });
});
