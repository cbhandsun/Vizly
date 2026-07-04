import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  replaceFlowchartNodeLabel,
  replaceFlowchartNodeLabels,
} from '../flowchartSearchReplace';

describe('flowchartSearchReplace', () => {
  const nodes: Node[] = [
    {
      id: 'node-1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: { label: 'Alpha', meta: 1 },
    },
    {
      id: 'node-2',
      type: 'custom',
      position: { x: 10, y: 10 },
      data: { label: 'Beta', meta: 2 },
    },
  ];

  it('replaces the label for a single node while preserving other node data', () => {
    expect(replaceFlowchartNodeLabel(nodes, 'node-2', 'Gamma')).toEqual([
      nodes[0],
      {
        ...nodes[1],
        data: { label: 'Gamma', meta: 2 },
      },
    ]);
  });

  it('replaces labels for multiple nodes and leaves unmatched nodes intact', () => {
    expect(replaceFlowchartNodeLabels(nodes, ['node-1', 'missing'], 'Unified')).toEqual([
      {
        ...nodes[0],
        data: { label: 'Unified', meta: 1 },
      },
      nodes[1],
    ]);
  });
});
