// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { useDesignerEdgeCallbacks } from '../useDesignerEdgeCallbacks';

const node: Node = { id: 'node-1', position: { x: 0, y: 0 }, data: {} };
const edge: Edge = {
  id: 'edge-1',
  source: 'source',
  target: 'target',
  label: 'Old label',
  data: { label: 'Old label', waypoints: [{ x: 1, y: 2 }] },
};

describe('useDesignerEdgeCallbacks history boundary', () => {
  it('records one snapshot for a committed waypoint edit and ignores no-op or missing targets', () => {
    const nodesRef = { current: [node] };
    const edgesRef = { current: [edge] };
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const { result } = renderHook(() => useDesignerEdgeCallbacks({
      setEdges,
      nodesRef,
      edgesRef,
      takeSnapshot,
    }));

    act(() => result.current.handleWaypointsChange('edge-1', [{ x: 10, y: 20 }]));

    expect(takeSnapshot).toHaveBeenCalledOnce();
    expect(takeSnapshot).toHaveBeenCalledWith([node], [edge]);
    expect(edgesRef.current[0].data?.waypoints).toEqual([{ x: 10, y: 20 }]);
    expect(setEdges).toHaveBeenCalledWith(edgesRef.current);

    act(() => {
      result.current.handleWaypointsChange('edge-1', [{ x: 10, y: 20 }]);
      result.current.handleWaypointsChange('missing', [{ x: 30, y: 40 }]);
    });
    expect(takeSnapshot).toHaveBeenCalledOnce();
    expect(setEdges).toHaveBeenCalledOnce();
  });

  it('makes a submitted label edit undoable without recording unchanged text', () => {
    const nodesRef = { current: [node] };
    const edgesRef = { current: [edge] };
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const { result } = renderHook(() => useDesignerEdgeCallbacks({
      setEdges,
      nodesRef,
      edgesRef,
      takeSnapshot,
    }));

    act(() => result.current.handleEdgeLabelChange('edge-1', 'Updated label'));

    expect(takeSnapshot).toHaveBeenCalledOnce();
    expect(edgesRef.current[0]).toMatchObject({
      label: 'Updated label',
      data: { label: 'Updated label' },
    });

    act(() => result.current.handleEdgeLabelChange('edge-1', 'Updated label'));
    expect(takeSnapshot).toHaveBeenCalledOnce();
  });
});
