// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { BaseReactFlowProps } from '../baseReactFlowTypes';
import { useBaseReactFlowNodeDragState } from '../useBaseReactFlowNodeDragState';
import { useBaseReactFlowResolvedOrDragFallbackEdges } from '../useBaseReactFlowDisplayCandidateBootstrap';

const primaryNode: Node = {
  id: 'primary',
  position: { x: 0, y: 0 },
  data: {},
};

const selectedNode: Node = {
  id: 'selected',
  position: { x: 100, y: 0 },
  selected: true,
  data: {},
};

describe('useBaseReactFlowNodeDragState', () => {
  it('tracks drag fallback nodes and forwards lifecycle callbacks', () => {
    const onNodeDragStart = vi.fn<NonNullable<BaseReactFlowProps['onNodeDragStart']>>();
    const onNodeDragStop = vi.fn<NonNullable<BaseReactFlowProps['onNodeDragStop']>>();
    const event = new MouseEvent('pointermove');
    const hook = renderHook(() => useBaseReactFlowNodeDragState({
      onNodeDragStart,
      onNodeDragStop,
    }));

    act(() => hook.result.current.handleNodeDragStart(
      event,
      primaryNode,
      [primaryNode, selectedNode],
    ));

    expect(hook.result.current.isNodeDragging).toBe(true);
    expect(hook.result.current.isNodeDragFallbackPending).toBe(true);
    expect(hook.result.current.nodeDragFallbackIds).toEqual(['primary', 'selected']);
    expect(onNodeDragStart).toHaveBeenCalledWith(
      event,
      primaryNode,
      [primaryNode, selectedNode],
    );

    act(() => hook.result.current.handleNodeDragStop(event, primaryNode, [primaryNode]));
    expect(hook.result.current.isNodeDragging).toBe(false);
    expect(onNodeDragStop).toHaveBeenCalledWith(event, primaryNode, [primaryNode]);

    act(() => hook.result.current.handleNodeDragFallbackResolved());
    expect(hook.result.current.isNodeDragFallbackPending).toBe(false);
    expect(hook.result.current.nodeDragFallbackIds).toEqual(['primary', 'selected']);

    act(() => hook.result.current.handleNodeDragStart(event, selectedNode, [selectedNode]));
    expect(hook.result.current.nodeDragFallbackIds).toEqual(['selected']);
  });

  it('narrows an already active fallback when the dragged node identity arrives', () => {
    const sourceEdges = [
      { id: 'incident', source: 'primary', target: 'target', type: 'advanced-smart-step' },
      { id: 'unrelated', source: 'other-source', target: 'other-target', type: 'advanced-smart-step' },
    ];
    const resolvedEdges = sourceEdges.map(edge => ({ ...edge, type: 'stablePath' }));
    const immediateEdges = sourceEdges.map(edge => ({ ...edge, type: 'smoothstep' }));
    const hook = renderHook(({ ids, dragging, resolved }: {
      ids: readonly string[];
      dragging: boolean;
      resolved: typeof resolvedEdges;
    }) => (
      useBaseReactFlowResolvedOrDragFallbackEdges({
        sourceEdges,
        resolvedEdges: resolved,
        isNodeDragging: dragging,
        dragFallbackPending: dragging,
        nodeDragFallbackIds: ids,
        settledEdges: resolvedEdges,
      })
    ), { initialProps: { ids: [] as readonly string[], dragging: false, resolved: resolvedEdges } });

    expect(hook.result.current.map(edge => edge.type)).toEqual(['stablePath', 'stablePath']);
    hook.rerender({ ids: ['primary'], dragging: true, resolved: immediateEdges });
    expect(hook.result.current.map(edge => edge.type)).toEqual(['smoothstep', 'stablePath']);
  });

});
