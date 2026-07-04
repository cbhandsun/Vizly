import { describe, expect, it, vi } from 'vitest';

import {
  buildFlowchartClearCanvasConfirm,
  clearFlowchartCanvas,
} from '../flowchartClearCanvas';

describe('flowchartClearCanvas', () => {
  it('clears nodes and edges and snapshots the empty canvas', () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();

    clearFlowchartCanvas({
      setNodes,
      setEdges,
      takeSnapshot,
    });

    expect(setNodes).toHaveBeenCalledWith([]);
    expect(setEdges).toHaveBeenCalledWith([]);
    expect(takeSnapshot).toHaveBeenCalledWith([], []);
    expect(setNodes.mock.invocationCallOrder[0]).toBeLessThan(takeSnapshot.mock.invocationCallOrder[0]);
    expect(setEdges.mock.invocationCallOrder[0]).toBeLessThan(takeSnapshot.mock.invocationCallOrder[0]);
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
    });

    config.onOk();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
