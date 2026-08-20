// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { BaseReactFlowProps } from '../baseReactFlowTypes';
import { useBaseReactFlowNodeDragState } from '../useBaseReactFlowNodeDragState';

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
    const event = {} as React.MouseEvent;
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
    expect(hook.result.current.nodeDragFallbackIds).toEqual([]);
  });
});
