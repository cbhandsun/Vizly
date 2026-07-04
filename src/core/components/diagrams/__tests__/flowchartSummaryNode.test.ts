import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createFlowchartSummaryNode,
  getFlowchartSummaryAnchor,
  selectOnlyFlowchartSummaryNode,
} from '../flowchartSummaryNode';

const nodes: Node[] = [
  {
    id: 'node-1',
    type: 'custom',
    position: { x: 100, y: 200 },
    data: { label: 'A' },
  },
  {
    id: 'node-2',
    type: 'custom',
    position: { x: 300, y: 400 },
    data: { label: 'B' },
  },
];

describe('flowchartSummaryNode', () => {
  it('computes the average anchor position for matched source nodes', () => {
    expect(getFlowchartSummaryAnchor(nodes, ['node-1', 'node-2'])).toEqual({
      x: 200,
      y: 300,
    });
  });

  it('ignores missing source ids and falls back to origin when nothing matches', () => {
    expect(getFlowchartSummaryAnchor(nodes, ['missing', 'node-2'])).toEqual({
      x: 300,
      y: 400,
    });

    expect(getFlowchartSummaryAnchor(nodes, ['missing'])).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('creates a summary node offset to the right with summary metadata', () => {
    const summaryNode = createFlowchartSummaryNode({
      nodes,
      sourceIds: ['node-1', 'node-2'],
      label: 'Summary',
      createNodeId: () => 'summary-fixed',
    });

    expect(summaryNode).toEqual({
      id: 'summary-fixed',
      type: 'mindmap',
      position: { x: 500, y: 300 },
      data: {
        label: 'Summary',
        isSummary: true,
        summaryTargets: ['node-1', 'node-2'],
        direction: 'L',
      },
    });
  });

  it('marks only the summary node as selected', () => {
    expect(selectOnlyFlowchartSummaryNode([
      { ...nodes[0], selected: true },
      { ...nodes[1], selected: false },
      {
        id: 'summary-fixed',
        type: 'mindmap',
        position: { x: 500, y: 300 },
        data: { label: 'Summary' },
        selected: false,
      },
    ], 'summary-fixed')).toEqual([
      { ...nodes[0], selected: false },
      { ...nodes[1], selected: false },
      {
        id: 'summary-fixed',
        type: 'mindmap',
        position: { x: 500, y: 300 },
        data: { label: 'Summary' },
        selected: true,
      },
    ]);
  });
});
