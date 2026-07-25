// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import type { EdgeProps } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SmartEdgeRoutingOwnerContext } from '../smartEdgeRoutingOwnership';

const renderState = vi.hoisted(() => ({
  canvas: vi.fn(),
  edge: vi.fn(),
}));

vi.mock('../CanvasRoutedSmartEdge', () => ({
  CanvasRoutedSmartEdge: (props: EdgeProps) => {
    renderState.canvas(props.id);
    return <div data-testid="canvas-edge" />;
  },
}));

vi.mock('../EdgeOwnedAdvancedSmartEdge', () => ({
  EdgeOwnedAdvancedSmartEdge: (props: EdgeProps) => {
    renderState.edge(props.id);
    return <div data-testid="edge-owned-edge" />;
  },
}));

import { AdvancedSmartStepEdge } from '../AdvancedSmartEdge';

const edgeProps = {
  id: 'edge-1',
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 0,
} as unknown as EdgeProps;

describe('AdvancedSmartStepEdge routing ownership', () => {
  beforeEach(() => {
    renderState.canvas.mockReset();
    renderState.edge.mockReset();
  });

  it('mounts only the lightweight renderer for canvas-owned routes', () => {
    render(
      <SmartEdgeRoutingOwnerContext.Provider value="canvas">
        <AdvancedSmartStepEdge {...edgeProps} />
      </SmartEdgeRoutingOwnerContext.Provider>,
    );

    expect(screen.getByTestId('canvas-edge')).toBeTruthy();
    expect(renderState.canvas).toHaveBeenCalledWith('edge-1');
    expect(renderState.edge).not.toHaveBeenCalled();
  });

  it('keeps the full controller for standalone edge-owned routes', () => {
    render(<AdvancedSmartStepEdge {...edgeProps} />);

    expect(screen.getByTestId('edge-owned-edge')).toBeTruthy();
    expect(renderState.edge).toHaveBeenCalledWith('edge-1');
  });
});
