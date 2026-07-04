import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  buildFlowchartMermaidImportPlan,
  FLOWCHART_MERMAID_LAYOUT_HINT_DELAY_MS,
} from '../flowchartMermaidImport';

describe('flowchartMermaidImport', () => {
  it('returns parsed nodes, edges, and the default layout hint delay', () => {
    const nodes: Node[] = [
      {
        id: 'node-1',
        type: 'custom',
        position: { x: 10, y: 20 },
        data: { label: 'A' },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
      },
    ];
    const parseMermaid = vi.fn(() => ({ nodes, edges }));

    const plan = buildFlowchartMermaidImportPlan('flowchart TD\nA-->B', parseMermaid);

    expect(parseMermaid).toHaveBeenCalledWith('flowchart TD\nA-->B');
    expect(plan).toEqual({
      nodes,
      edges,
      layoutHintDelayMs: FLOWCHART_MERMAID_LAYOUT_HINT_DELAY_MS,
    });
  });

  it('surfaces parser failures to the caller', () => {
    expect(() => buildFlowchartMermaidImportPlan(
      'broken mermaid',
      () => {
        throw new Error('Mermaid parse failed');
      }
    )).toThrow('Mermaid parse failed');
  });
});
