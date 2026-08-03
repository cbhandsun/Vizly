import { describe, expect, it, vi } from 'vitest';

import {
  buildFlowchartClearCanvasConfirm,
  clearFlowchartCanvas,
  shouldConfirmFlowchartClearCanvas,
} from '../flowchartClearCanvas';

describe('flowchartClearCanvas', () => {
  it('snapshots the current canvas before clearing nodes and edges', () => {
    const nodes = [{ id: 'node-1' }];
    const edges = [{ id: 'edge-1' }];
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();

    clearFlowchartCanvas({
      nodes,
      edges,
      setNodes,
      setEdges,
      takeSnapshot,
    });

    expect(setNodes).toHaveBeenCalledWith([]);
    expect(setEdges).toHaveBeenCalledWith([]);
    expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
    expect(takeSnapshot.mock.invocationCallOrder[0]).toBeLessThan(setNodes.mock.invocationCallOrder[0]);
    expect(takeSnapshot.mock.invocationCallOrder[0]).toBeLessThan(setEdges.mock.invocationCallOrder[0]);
  });

  it('only asks for confirmation when the canvas has content', () => {
    expect(shouldConfirmFlowchartClearCanvas([], [])).toBe(false);
    expect(shouldConfirmFlowchartClearCanvas([{ id: 'node-1' }], [])).toBe(true);
    expect(shouldConfirmFlowchartClearCanvas([], [{ id: 'edge-1' }])).toBe(true);
  });

  it('builds confirm config that wires the provided labels and callback', () => {
    const onConfirm = vi.fn();

    const config = buildFlowchartClearCanvasConfirm({
      title: 'Clear?',
      content: 'This removes everything.',
      okText: 'Yes',
      cancelText: 'No',
      onConfirm,
    });

    expect(config).toMatchObject({
      title: 'Clear?',
      content: 'This removes everything.',
      okText: 'Yes',
      cancelText: 'No',
      okButtonProps: { danger: true },
    });

    config.onOk();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
