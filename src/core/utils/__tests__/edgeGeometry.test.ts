import { describe, expect, it } from 'vitest';
import {
  computeBezierPath,
  computeOrthogonalPath,
  computeStraightPath,
  createRenderEdgeGeometryFromEdgeProps,
  getPathEndpoints,
  pointsToSvgPath,
  resolveEdgeMarker,
} from '../../rendering/edgeGeometry';

describe('edgeGeometry', () => {
  it('creates stable SVG path data from internal points only', () => {
    expect(pointsToSvgPath([{ x: 0, y: 0 }, { x: 10.12345, y: 20 }])).toBe('M 0 0 L 10.123 20');
    expect(pointsToSvgPath([{ x: 0, y: 0 }, { x: Number.NaN, y: 20 } as any])).toBe('');
  });

  it('computes straight, orthogonal, and bezier paths', () => {
    expect(computeStraightPath({ x: 0, y: 0 }, { x: 10, y: 20 })).toBe('M 0 0 L 10 20');
    expect(computeOrthogonalPath({ x: 0, y: 0 }, { x: 100, y: 40 })).toBe('M 0 0 L 50 0 L 50 40 L 100 40');
    expect(computeBezierPath({ x: 0, y: 0 }, { x: 100, y: 40 })).toBe('M 0 0 C 50 0 50 40 100 40');
  });

  it('resolves marker variants', () => {
    expect(resolveEdgeMarker({ type: 'arrowclosed', color: '#222' })).toEqual({ kind: 'arrow', color: '#222' });
    expect(resolveEdgeMarker('openArrow')).toEqual({ kind: 'openArrow', color: '#64748b' });
    expect(resolveEdgeMarker(false)).toEqual({ kind: 'none', color: '#64748b' });
    expect(resolveEdgeMarker({ type: 'arrowclosed', color: 'url(javascript:alert(1))' }, 'url(#bad)')).toEqual({
      kind: 'arrow',
      color: '#64748b',
    });
  });

  it('derives render geometry from EdgeProps with safe fallback path', () => {
    const geometry = createRenderEdgeGeometryFromEdgeProps({
      id: 'e1',
      source: 'a',
      target: 'b',
      sourceX: 1,
      sourceY: 2,
      targetX: 11,
      targetY: 22,
      markerEnd: { type: 'arrowclosed' },
      style: { strokeWidth: 3 },
      data: { label: '<b>safe text</b>' },
    } as any, 'javascript:alert(1)');

    expect(geometry.path).toBe('M 1 2 L 11 22');
    expect(geometry.label).toBe('<b>safe text</b>');
    expect(getPathEndpoints(geometry.path)).toEqual({ source: { x: 1, y: 2 }, target: { x: 11, y: 22 } });
  });

  it('normalizes unsafe SVG style tokens from EdgeProps', () => {
    const geometry = createRenderEdgeGeometryFromEdgeProps({
      id: 'unsafe-edge',
      source: 'a',
      target: 'b',
      sourceX: 1,
      sourceY: 2,
      targetX: 11,
      targetY: 22,
      style: {
        stroke: 'url(#external)',
        strokeDasharray: '1;stroke:red',
      },
      markerEnd: { type: 'arrowclosed', color: 'url(javascript:alert(1))' },
    } as any, 'M 1 2 L 11 22');

    expect(geometry.stroke).toBe('#64748b');
    expect(geometry.strokeDasharray).toBeUndefined();
    expect(geometry.markerEnd).toEqual({ kind: 'arrow', color: '#64748b' });
  });
});
