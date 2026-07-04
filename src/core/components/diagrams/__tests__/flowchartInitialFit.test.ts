import type { Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { scheduleFlowchartInitialFit } from '../flowchartInitialFit';

describe('flowchartInitialFit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches fit after the delay when nodes exist', () => {
    vi.useFakeTimers();

    const dispatchFit = vi.fn();
    const reactFlowInstance = {
      getNodes: vi.fn(() => [
        {
          id: 'node-1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { label: 'Node 1' },
        },
      ] satisfies Node[]),
    } as Pick<ReactFlowInstance<Node, unknown>, 'getNodes'>;

    scheduleFlowchartInitialFit({
      reactFlowInstance,
      dispatchFit,
    });

    vi.advanceTimersByTime(249);
    expect(dispatchFit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(dispatchFit).toHaveBeenCalledTimes(1);
  });

  it('skips fit dispatch when the canvas is empty', () => {
    vi.useFakeTimers();

    const dispatchFit = vi.fn();
    const reactFlowInstance = {
      getNodes: vi.fn(() => [] satisfies Node[]),
    } as Pick<ReactFlowInstance<Node, unknown>, 'getNodes'>;

    scheduleFlowchartInitialFit({
      reactFlowInstance,
      dispatchFit,
      delayMs: 100,
    });

    vi.advanceTimersByTime(100);
    expect(dispatchFit).not.toHaveBeenCalled();
  });
});
