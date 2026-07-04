import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  buildFlowchartMermaidExport,
  createFlowchartMermaidFilename,
} from '../flowchartMermaidExport';

describe('flowchartMermaidExport', () => {
  it('builds Mermaid export content with a stable default filename shape', async () => {
    const nodes: Node[] = [
      {
        id: 'node-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
    ];
    const edges: Edge[] = [];
    const stringifyMermaid = vi.fn(() => 'flowchart TD\nnode_1["Start"]');

    const artifact = await buildFlowchartMermaidExport({
      nodes,
      edges,
      now: 1234567890,
      stringifyMermaid,
    });

    expect(stringifyMermaid).toHaveBeenCalledWith(nodes, edges);
    expect(artifact).toEqual({
      content: 'flowchart TD\nnode_1["Start"]',
      filename: 'flowchart-1234567890.mmd',
      mimeType: 'text/markdown',
    });
  });

  it('exposes the filename helper directly', () => {
    expect(createFlowchartMermaidFilename(42)).toBe('flowchart-42.mmd');
  });
});
