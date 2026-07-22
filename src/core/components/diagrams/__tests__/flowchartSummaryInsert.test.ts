import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  applyFlowchartSummarySelection,
  runFlowchartSummaryInsert,
} from '../flowchartSummaryInsert';

describe('flowchartSummaryInsert', () => {
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

  it('takes a snapshot, appends the summary node, and schedules selection', () => {
    const takeSnapshot = vi.fn();
    const appendNode = vi.fn();
    const applySelection = vi.fn();
    const scheduled: { callback?: () => void } = {};
    const scheduleSelection = vi.fn((callback: () => void) => {
      scheduled.callback = callback;
    });

    const summaryNode = runFlowchartSummaryInsert({
      nodes,
      edges: [],
      sourceIds: ['node-1', 'node-2'],
      label: 'Summary',
      takeSnapshot,
      appendNode,
      applySelection,
      scheduleSelection,
    });

    expect(summaryNode).toMatchObject({
      type: 'mindmap',
      position: { x: 500, y: 300 },
      data: {
        label: 'Summary',
        isSummary: true,
        summaryTargets: ['node-1', 'node-2'],
        direction: 'L',
      },
    });
    expect(takeSnapshot).toHaveBeenCalledWith(nodes, []);
    expect(appendNode).toHaveBeenCalledWith(summaryNode);
    expect(scheduleSelection).toHaveBeenCalledTimes(1);
    expect(applySelection).not.toHaveBeenCalled();

    scheduled.callback?.();
    expect(applySelection).toHaveBeenCalledWith(summaryNode!.id);
    expect(takeSnapshot.mock.invocationCallOrder[0]).toBeLessThan(appendNode.mock.invocationCallOrder[0]);
  });

  it('skips insertion when there are no source ids', () => {
    const takeSnapshot = vi.fn();
    const appendNode = vi.fn();
    const applySelection = vi.fn();
    const scheduleSelection = vi.fn();

    expect(runFlowchartSummaryInsert({
      nodes,
      edges: [],
      sourceIds: [],
      label: 'Summary',
      takeSnapshot,
      appendNode,
      applySelection,
      scheduleSelection,
    })).toBeNull();

    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(appendNode).not.toHaveBeenCalled();
    expect(scheduleSelection).not.toHaveBeenCalled();
    expect(applySelection).not.toHaveBeenCalled();
  });

  it('applies summary selection to exactly one node', () => {
    expect(applyFlowchartSummarySelection([
      { ...nodes[0], selected: true },
      { ...nodes[1], selected: false },
      {
        id: 'summary',
        type: 'mindmap',
        position: { x: 0, y: 0 },
        data: { label: 'Summary' },
        selected: false,
      },
    ], 'summary')).toEqual([
      { ...nodes[0], selected: false },
      { ...nodes[1], selected: false },
      {
        id: 'summary',
        type: 'mindmap',
        position: { x: 0, y: 0 },
        data: { label: 'Summary' },
        selected: true,
      },
    ]);
  });
});
