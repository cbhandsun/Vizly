// @vitest-environment jsdom

import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import flowchartDesignerControllerSource from '../useFlowchartDesignerController.ts?raw';
import { scheduleFlowchartInitialFit } from '../flowchartInitialFit';
import { dispatchDiagramControl } from '../../shared/diagramControl';

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
    } as Pick<ReactFlowInstance<Node, Edge>, 'getNodes'>;

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
    } as Pick<ReactFlowInstance<Node, Edge>, 'getNodes'>;

    scheduleFlowchartInitialFit({
      reactFlowInstance,
      dispatchFit,
      delayMs: 100,
    });

    vi.advanceTimersByTime(100);
    expect(dispatchFit).not.toHaveBeenCalled();
  });

  it('keeps the designer initializer bound to the fit dispatcher', () => {
    vi.useFakeTimers();

    expect(flowchartDesignerControllerSource).toMatch(
      /import\s*{\s*dispatchDiagramControl\s*}\s*from\s*['"]\.\.\/shared\/diagramControl['"]/,
    );
    expect(flowchartDesignerControllerSource).toMatch(
      /dispatchFit:\s*\(\)\s*=>\s*dispatchDiagramControl\(\s*['"]fit['"]\s*,\s*id\s*\)/,
    );

    const handleDiagramControl = vi.fn();
    window.addEventListener('diagramControl', handleDiagramControl);

    const reactFlowInstance = {
      getNodes: vi.fn(() => [
        {
          id: 'node-1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { label: 'Node 1' },
        },
      ] satisfies Node[]),
    } as Pick<ReactFlowInstance<Node, Edge>, 'getNodes'>;

    expect(() => scheduleFlowchartInitialFit({
      reactFlowInstance,
      delayMs: 1,
      dispatchFit: () => dispatchDiagramControl('fit', 'diagram-1'),
    })).not.toThrow();
    expect(() => vi.advanceTimersByTime(1)).not.toThrow();

    expect(handleDiagramControl).toHaveBeenCalledTimes(1);
    expect((handleDiagramControl.mock.calls[0][0] as CustomEvent).detail).toEqual({
      action: 'fit',
      diagramId: 'diagram-1',
    });

    window.removeEventListener('diagramControl', handleDiagramControl);
  });
});
