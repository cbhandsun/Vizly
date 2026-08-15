import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  appendBaseReactFlowEdgeSemanticClassName,
  applyBaseReactFlowEdgePresentation,
  BASE_REACT_FLOW_EDGE_STROKE,
  BASE_REACT_FLOW_MARKER_SIZE,
} from '../baseReactFlowEdgePresentation';

const edge = (overrides: Partial<Edge> = {}): Edge => ({
  id: 'edge-1',
  source: 'source',
  target: 'target',
  ...overrides,
});

describe('baseReactFlowEdgePresentation', () => {
  it('matches an incomplete React Flow arrow to the semantic stroke and commercial size', () => {
    const [presented] = applyBaseReactFlowEdgePresentation([
      edge({
        style: { stroke: '#2563EB' },
        markerEnd: { type: 'arrowclosed' },
      }),
    ]);

    expect(presented.markerEnd).toEqual({
      type: 'arrowclosed',
      color: '#2563EB',
      width: BASE_REACT_FLOW_MARKER_SIZE,
      height: BASE_REACT_FLOW_MARKER_SIZE,
    });
  });

  it('adds a bounded, stroke-matched arrow when the edge inherits the default marker', () => {
    const [presented] = applyBaseReactFlowEdgePresentation([
      edge({ style: { stroke: '#10B981' } }),
    ]);

    expect(presented.markerEnd).toEqual({
      type: 'arrowclosed',
      color: '#10B981',
      width: BASE_REACT_FLOW_MARKER_SIZE,
      height: BASE_REACT_FLOW_MARKER_SIZE,
    });
  });

  it('preserves safe authored marker paint, size, URL markers, and explicit removal', () => {
    const customMarker = edge({
      id: 'custom',
      style: { stroke: '#2563EB' },
      markerEnd: { type: 'arrow', color: '#F97316', width: 20, height: 18 },
    });
    const urlMarker = edge({ id: 'url', markerEnd: 'url(#trusted-marker)' });
    const noMarker = edge({ id: 'none', markerEnd: undefined });

    const [presentedCustom, presentedUrl, presentedNone] = applyBaseReactFlowEdgePresentation([
      customMarker,
      urlMarker,
      noMarker,
    ]);

    expect(presentedCustom.markerEnd).toEqual(customMarker.markerEnd);
    expect(presentedUrl).toBe(urlMarker);
    expect(presentedNone).toBe(noMarker);
  });

  it('preserves the edge reference after its commercial presentation is already complete', () => {
    const complete = edge({
      style: { stroke: '#2563EB' },
      markerEnd: {
        type: 'arrowclosed',
        color: '#2563EB',
        width: BASE_REACT_FLOW_MARKER_SIZE,
        height: BASE_REACT_FLOW_MARKER_SIZE,
      },
    });

    expect(applyBaseReactFlowEdgePresentation([complete])[0]).toBe(complete);
  });

  it('replaces unsafe paint and unbounded marker dimensions with safe defaults', () => {
    const [presented] = applyBaseReactFlowEdgePresentation([
      edge({
        style: { stroke: 'url(javascript:alert(1))' },
        markerEnd: {
          type: 'arrowclosed',
          color: 'url(javascript:alert(2))',
          width: Number.POSITIVE_INFINITY,
          height: -1,
        },
      }),
    ]);

    expect(presented.markerEnd).toEqual({
      type: 'arrowclosed',
      color: BASE_REACT_FLOW_EDGE_STROKE,
      width: BASE_REACT_FLOW_MARKER_SIZE,
      height: BASE_REACT_FLOW_MARKER_SIZE,
    });
    expect(presented.style?.stroke).toBe(BASE_REACT_FLOW_EDGE_STROKE);
  });

  it('adds restrained role hierarchy after routing without mutating source geometry', () => {
    const sourceEdges = [
      edge({ id: 'main', type: 'advanced-smart-step', className: 'vizly-edge-role-main' }),
      edge({ id: 'data', type: 'data', className: 'vizly-edge-role-data' }),
      edge({ id: 'dependency', type: 'dependency', className: 'vizly-edge-role-dependency' }),
    ];
    const displayEdges = sourceEdges.map(source => edge({
      ...source,
      type: 'stablePath',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 80, y: 40 }] },
      style: { stroke: '#64748B', strokeWidth: 1.5 },
      markerEnd: { type: 'arrowclosed', color: '#64748B' },
    }));

    const [main, data, dependency] = applyBaseReactFlowEdgePresentation(displayEdges, sourceEdges);

    expect(main).toMatchObject({
      className: 'vizly-edge-role-main',
      style: { stroke: '#475569', strokeWidth: 1.75, strokeDasharray: 'none' },
      markerEnd: { color: '#475569', width: 20, height: 20 },
    });
    expect(data).toMatchObject({
      className: 'vizly-edge-role-data',
      style: { stroke: '#0E7490', strokeWidth: 1.5, strokeDasharray: '6 4' },
      markerEnd: { color: '#0E7490', width: 20, height: 20 },
    });
    expect(dependency).toMatchObject({
      className: 'vizly-edge-role-dependency',
      style: { stroke: '#64748B', strokeWidth: 1.5, strokeDasharray: '3 4' },
      markerEnd: { color: '#64748B', width: 20, height: 20 },
    });
    expect(main.data).toBe(displayEdges[0].data);
    expect(data.data).toBe(displayEdges[1].data);
    expect(dependency.data).toBe(displayEdges[2].data);
  });

  it('preserves bounded authored visual properties over inferred role defaults', () => {
    const source = edge({
      type: 'data',
      className: 'authored vizly-edge-role-data',
      style: { stroke: '#7C3AED', strokeWidth: '2px', strokeDasharray: 'none' },
      markerEnd: { type: 'arrowclosed', color: '#F97316', width: 18, height: 18 },
    });
    const display = edge({
      type: 'stablePath',
      markerEnd: source.markerEnd,
      style: source.style,
    });

    const [presented] = applyBaseReactFlowEdgePresentation([display], [source]);

    expect(presented.style).toEqual(source.style);
    expect(presented.markerEnd).toEqual(source.markerEnd);
    expect(presented.className).toBe('vizly-edge-role-data');
  });

  it('accepts only known bounded semantic role tokens', () => {
    expect(appendBaseReactFlowEdgeSemanticClassName('authored', 'DATA')).toBe(
      'authored vizly-edge-role-data',
    );
    expect(appendBaseReactFlowEdgeSemanticClassName('authored', 'unknown-role')).toBe('authored');
    expect(appendBaseReactFlowEdgeSemanticClassName('x'.repeat(513), 'main')).toBe(
      'vizly-edge-role-main',
    );
  });
});
