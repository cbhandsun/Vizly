import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
    addFlowchartMindMapNode,
    addFlowchartStickyNote,
    applyFlowchartTemplate,
    copyFlowchartAsMermaid,
    exportFlowchartAsMermaid,
} from '../flowchartDesignerCanvasActions';
import type { NodeTemplate } from '../hooks/useNodeTemplates';

describe('flowchartDesignerCanvasActions', () => {
  it('exports mermaid artifacts via the provided downloader', async () => {
    const downloadFile = vi.fn();

    const artifact = await exportFlowchartAsMermaid({
      nodes: [] as Node[],
      edges: [] as Edge[],
      downloadFile,
      buildExport: vi.fn(async () => ({
        content: 'flowchart TD\nA-->B',
        filename: 'diagram.mmd',
        mimeType: 'text/markdown',
      })),
    });

    expect(downloadFile).toHaveBeenCalledWith('flowchart TD\nA-->B', 'diagram.mmd', 'text/markdown');
    expect(artifact.filename).toBe('diagram.mmd');
  });

  it('copies mermaid artifacts via the provided clipboard writer', async () => {
    const writeText = vi.fn(async () => undefined);

    await copyFlowchartAsMermaid({
      nodes: [] as Node[],
      edges: [] as Edge[],
      writeText,
      buildExport: vi.fn(async () => ({
        content: 'flowchart TD\nA-->B',
        filename: 'diagram.mmd',
        mimeType: 'text/markdown',
      })),
    });

    expect(writeText).toHaveBeenCalledWith('flowchart TD\nA-->B');
  });

  it('applies template plans by appending nodes and edges', () => {
    const nodes = [{ id: 'n1' }] as unknown as Node[];
    const edges = [{ id: 'e1' }] as unknown as Edge[];
    const appendNodes = vi.fn();
    const appendEdges = vi.fn();

    const plan = applyFlowchartTemplate({
      template: {
        id: 'tpl-1',
        name: 'Template',
        category: 'test',
        nodeType: 'flowchart',
        data: {},
        createdAt: 0,
      } satisfies NodeTemplate,
      viewport: { x: 10, y: 20, zoom: 1.5 },
      createFromTemplate: vi.fn(() => ({ nodes, edges })),
      appendNodes,
      appendEdges,
    });

    expect(appendNodes).toHaveBeenCalledWith(nodes);
    expect(appendEdges).toHaveBeenCalledWith(edges);
    expect(plan).toEqual({ nodes, edges });
  });

  it('creates and appends sticky notes and mind map nodes', () => {
    const setNodes = vi.fn((updater: (nodes: Node[]) => Node[]) => updater([]));

    const sticky = addFlowchartStickyNote({
      layer: 'layer-1',
      setNodes,
      readViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      readCanvasSize: () => ({ width: 1000, height: 800 }),
      offset: 10,
    });
    const mindMap = addFlowchartMindMapNode({
      layer: 'layer-2',
      label: 'Center',
      setNodes,
      readViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      readCanvasSize: () => ({ width: 1000, height: 800 }),
    });

    expect(sticky.type).toBe('sticky-note');
    expect(mindMap.type).toBe('mindmap');
    expect(setNodes).toHaveBeenCalledTimes(2);
  });
});
