// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StablePathEdge } from '../StablePathEdge';

vi.mock('@xyflow/react', async () => {
  const ReactModule = await import('react');
  return {
    BaseEdge: ({ path }: { path: string }) => ReactModule.createElement('path', {
      'data-testid': 'base-edge',
      d: path,
    }),
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    useStore: () => [],
  };
});

const renderStablePathEdge = (props: Record<string, unknown>) => {
  render(
    <svg>
      <StablePathEdge
        id="edge-test"
        sourceX={0}
        sourceY={0}
        targetX={80}
        targetY={40}
        selected={false}
        sourcePosition={'right' as any}
        targetPosition={'left' as any}
        source="source"
        target="target"
        {...(props as any)}
      />
    </svg>,
  );
};

describe('StablePathEdge', () => {
  it('renders locked computed paths as strict M/L orthogonal SVG paths', () => {
    renderStablePathEdge({
      data: {
        computedPath: [
          { x: 10, y: 20 },
          { x: 10.6, y: 96 },
          { x: 140, y: 96.4 },
        ],
      },
    });

    const path = screen.getByTestId('base-edge');
    expect(path.getAttribute('d')).toBe('M 10 20 L 10 96 L 140 96');
    expect(path.getAttribute('d')).not.toMatch(/[ACQ]/);
  });

  it('snaps small rendered endpoint drift back onto the dominant orthogonal axis', () => {
    renderStablePathEdge({
      data: {
        computedPath: [
          { x: 13, y: 476 },
          { x: 16.0055, y: 636.014 },
        ],
      },
    });

    const path = screen.getByTestId('base-edge');
    expect(path.getAttribute('d')).toBe('M 13 476 L 13 636.014');
  });

  it('uses an orthogonal M/L fallback instead of React Flow smoothstep curves', () => {
    renderStablePathEdge({
      sourceX: 10,
      sourceY: 20,
      targetX: 140,
      targetY: 96,
      sourcePosition: 'bottom',
      data: {},
    });

    const path = screen.getByTestId('base-edge');
    expect(path.getAttribute('d')).toBe('M 10 20 L 10 96 L 140 96');
    expect(path.getAttribute('d')).not.toMatch(/[ACQ]/);
  });
});
