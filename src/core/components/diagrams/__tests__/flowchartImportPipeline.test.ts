import { describe, expect, it, vi } from 'vitest';

import { runFlowchartImportPipeline } from '../flowchartImportPipeline';

describe('flowchartImportPipeline', () => {
  it('routes json imports through the json plan/apply pipeline', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const onStandardPluginSuccess = vi.fn();
    const registerStandardReload = vi.fn(async () => undefined);
    const onStandardReloadQueued = vi.fn();
    const onReactFlowSuccess = vi.fn();
    const onJsonImportFailure = vi.fn();

    await runFlowchartImportPipeline({
      content: JSON.stringify({
        nodes: [
          {
            id: 'rf-node',
            type: 'custom',
            position: { x: 10, y: 20 },
            data: { label: 'RF Node' },
          },
        ],
        edges: [],
      }),
      importKind: 'json',
      invalidFormatMessage: 'Invalid format',
      fallbackTitle: 'Imported Diagram',
      openedAt: '2026-06-25T00:00:00.000Z',
      setNodes,
      setEdges,
      onStandardPluginSuccess,
      registerStandardReload,
      onStandardReloadQueued,
      onReactFlowSuccess,
      onJsonImportFailure,
      onMermaidSuccess: vi.fn(),
      onMermaidLayoutHint: vi.fn(),
      onMermaidImportFailure: vi.fn(),
    });

    expect(setNodes).toHaveBeenCalled();
    expect(setEdges).toHaveBeenCalled();
    expect(onReactFlowSuccess).toHaveBeenCalledWith({
      nodes: [
        {
          id: 'rf-node',
          type: 'custom',
          position: { x: 10, y: 20 },
          data: { label: 'RF Node' },
        },
      ],
      edges: [],
    });
    expect(onJsonImportFailure).not.toHaveBeenCalled();
  });

  it('reports json import failures through the provided callback', async () => {
    const onJsonImportFailure = vi.fn();

    await runFlowchartImportPipeline({
      content: '{invalid-json',
      importKind: 'json',
      invalidFormatMessage: 'Invalid format',
      fallbackTitle: 'Imported Diagram',
      openedAt: '2026-06-25T00:00:00.000Z',
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      onStandardPluginSuccess: vi.fn(),
      registerStandardReload: vi.fn(async () => undefined),
      onStandardReloadQueued: vi.fn(),
      onReactFlowSuccess: vi.fn(),
      onJsonImportFailure,
      onMermaidSuccess: vi.fn(),
      onMermaidLayoutHint: vi.fn(),
      onMermaidImportFailure: vi.fn(),
    });

    expect(onJsonImportFailure).toHaveBeenCalled();
  });

  it('routes mermaid imports through the mermaid plan/apply pipeline', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const onMermaidSuccess = vi.fn();
    const onMermaidLayoutHint = vi.fn();
    const onMermaidImportFailure = vi.fn();

    await runFlowchartImportPipeline({
      content: 'flowchart TD\nA-->B',
      importKind: 'mermaid',
      invalidFormatMessage: 'Invalid format',
      fallbackTitle: 'Imported Diagram',
      openedAt: '2026-06-25T00:00:00.000Z',
      setNodes,
      setEdges,
      onStandardPluginSuccess: vi.fn(),
      registerStandardReload: vi.fn(async () => undefined),
      onStandardReloadQueued: vi.fn(),
      onReactFlowSuccess: vi.fn(),
      onJsonImportFailure: vi.fn(),
      onMermaidSuccess,
      onMermaidLayoutHint,
      onMermaidImportFailure,
    });

    expect(setNodes).toHaveBeenCalled();
    expect(setEdges).toHaveBeenCalled();
    expect(onMermaidSuccess).toHaveBeenCalled();
    expect(onMermaidLayoutHint).toHaveBeenCalled();
    expect(onMermaidImportFailure).not.toHaveBeenCalled();
  });
});
