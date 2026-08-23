// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import type { EdgeProps } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderState = vi.hoisted(() => ({
  canvas: vi.fn(),
}));

vi.mock('../CanvasRoutedSmartEdge', () => ({
  CanvasRoutedSmartEdge: (props: EdgeProps) => {
    renderState.canvas(props.id);
    return <div data-testid="canvas-edge" />;
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
  });

  it('always mounts the render-only adapter without an edge-owned controller', () => {
    render(<AdvancedSmartStepEdge {...edgeProps} />);

    expect(screen.getByTestId('canvas-edge')).toBeTruthy();
    expect(renderState.canvas).toHaveBeenCalledWith('edge-1');
  });
});
