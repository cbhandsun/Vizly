// @vitest-environment jsdom

import React, { type CSSProperties } from 'react';
import { render, screen } from '@testing-library/react';
import type { BaseEdgeProps } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { ContrastSafeBaseEdge } from '../ContrastSafeBaseEdge';

vi.mock('@xyflow/react', async () => {
  const ReactModule = await import('react');
  return {
    BaseEdge: ({
      interactionWidth: _interactionWidth,
      path,
      ...props
    }: BaseEdgeProps) => ReactModule.createElement('path', {
      ...props,
      'data-testid': 'semantic-edge',
      d: path,
    }),
  };
});

const renderEdge = ({
  ancestorOpacity,
  canvasBackground = '#ffffff',
  markerEnd,
  style,
}: {
  ancestorOpacity?: unknown;
  canvasBackground?: string;
  markerEnd?: string;
  style: CSSProperties;
}) => render(
  <svg>
    <g transform="scale(0.05)">
      <ContrastSafeBaseEdge
        id="edge-data"
        ancestorOpacity={ancestorOpacity}
        path="M 0 0 L 100 0"
        canvasBackground={canvasBackground}
        markerEnd={markerEnd}
        style={style}
      />
    </g>
  </svg>,
);

describe('ContrastSafeBaseEdge', () => {
  it('keeps cyan as the semantic/computed stroke while adding one non-scaling paint underlay', () => {
    const semanticStyle: CSSProperties = Object.freeze({
      stroke: '#47CACC',
      strokeWidth: 2,
      strokeDasharray: '6 4',
    });

    const { container } = renderEdge({
      markerEnd: 'url(#cyan-arrow)',
      style: semanticStyle,
    });

    const semanticEdge = screen.getByTestId('semantic-edge');
    const underlays = container.querySelectorAll('.vizly-edge-contrast-underlay');
    const underlay = underlays.item(0);
    expect(underlays).toHaveLength(1);
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(semanticEdge.style.stroke).toBe('rgb(71, 202, 204)');
    expect(getComputedStyle(semanticEdge).stroke).toBe(semanticEdge.style.stroke);
    expect(semanticEdge.style.strokeWidth).toBe('2');
    expect(semanticEdge.getAttribute('marker-end')).toBe('url(#cyan-arrow)');
    expect(semanticEdge.classList.contains('vizly-edge-contrast-marker-outline--dark')).toBe(true);
    expect(underlay.getAttribute('marker-end')).toBeNull();
    expect(underlay.getAttribute('stroke')).toBe('#334155');
    expect(underlay.getAttribute('stroke-width')).toBe('4');
    expect(underlay.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(underlay.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(underlay.getAttribute('opacity')).toBe('1');
    expect(semanticStyle).toEqual({ stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' });
  });

  it.each(['#FF5722', '#78909C'])('does not add a second path for sufficient stroke %s', stroke => {
    const { container } = renderEdge({ style: { stroke, strokeWidth: 2 } });

    expect(container.querySelector('.vizly-edge-contrast-underlay')).toBeNull();
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(screen.getByTestId('semantic-edge').getAttribute('data-edge-contrast')).toBe('sufficient');
  });

  it('does not add an unnecessary light halo when cyan already clears a dark canvas', () => {
    const { container } = renderEdge({
      canvasBackground: '#141414',
      markerEnd: 'url(#cyan-arrow)',
      style: { stroke: '#47CACC', strokeWidth: 2 },
    });

    const semanticEdge = screen.getByTestId('semantic-edge');
    expect(container.querySelector('.vizly-edge-contrast-underlay')).toBeNull();
    expect(semanticEdge.getAttribute('marker-end')).toBe('url(#cyan-arrow)');
    expect(semanticEdge.getAttribute('class') ?? '').not.toContain('vizly-edge-contrast-marker-outline');
  });

  it('adds a full-opacity boundary when authored opacity lowers an otherwise sufficient orange', () => {
    const { container } = renderEdge({
      ancestorOpacity: 0.8,
      style: { stroke: '#FF5722', strokeWidth: 3, opacity: 0.5 },
    });

    const underlay = container.querySelector('.vizly-edge-contrast-underlay');
    expect(underlay).not.toBeNull();
    expect(underlay?.getAttribute('opacity')).toBe('1');
    expect(underlay?.getAttribute('data-edge-effective-opacity')).toBe('0.400');
    expect(underlay?.getAttribute('style')).toContain('--vizly-edge-contrast-underlay-color');
    expect(screen.getByTestId('semantic-edge').style.opacity).toBe('0.5');
  });

  it('does not reveal a fully transparent or invalid-opacity edge with a boundary', () => {
    const transparent = renderEdge({ style: { stroke: '#47CACC', strokeWidth: 2, opacity: 0 } });
    expect(transparent.container.querySelector('.vizly-edge-contrast-underlay')).toBeNull();
    transparent.unmount();

    const invalid = renderEdge({
      ancestorOpacity: Number.NaN,
      style: { stroke: '#47CACC', strokeWidth: 2 },
    });
    expect(invalid.container.querySelector('.vizly-edge-contrast-underlay')).toBeNull();
    expect(screen.getByTestId('semantic-edge').getAttribute('data-edge-contrast')).toBe('unresolved');
  });
});
