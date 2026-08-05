// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDiagramDragDrop } from '../useDiagramDragDrop';

const node = {
  id: 'node-a',
  position: { x: 10, y: 20 },
  data: {},
} satisfies Node;

const createProps = () => ({
  nodes: [node],
  edges: [] as Edge[],
  setNodes: vi.fn(),
  setEdges: vi.fn(),
  takeSnapshot: vi.fn(),
  notifyHistoryChanged: vi.fn(),
  reactFlowInstance: null,
  setIsDragging: vi.fn(),
  snapDeltaRef: { current: null as { x: number; y: number } | null },
  clearGuides: vi.fn(),
  enableAltDuplicate: false,
});

describe('useDiagramDragDrop drag performance boundary', () => {
  const scheduledFrames: FrameRequestCallback[] = [];

  beforeEach(() => {
    scheduledFrames.length = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not write global node positions while processing a drag frame', () => {
    const props = createProps();
    const { result } = renderHook(() => useDiagramDragDrop(props));

    act(() => {
      result.current.onNodeDrag(new MouseEvent('mousemove'), node, [node]);
      for (const frame of scheduledFrames.splice(0)) frame(16);
    });

    expect(props.setNodes).not.toHaveBeenCalled();
  });

  it('records a labeled pre-drag snapshot for undo without refreshing history early', () => {
    const props = createProps();
    const { result } = renderHook(() => useDiagramDragDrop(props));

    act(() => {
      result.current.onNodeDragStart(new MouseEvent('mousedown'), node);
    });

    expect(props.takeSnapshot).toHaveBeenCalledWith(
      [node],
      [],
      '移动节点',
      { notify: false, dedupe: false },
    );
    expect(props.notifyHistoryChanged).not.toHaveBeenCalled();
  });

  it('still persists the last smart-guide offset after release', () => {
    vi.useFakeTimers();
    const props = createProps();
    props.snapDeltaRef.current = { x: 3, y: -2 };
    props.clearGuides.mockImplementation(() => {
      props.snapDeltaRef.current = null;
    });
    const { result } = renderHook(() => useDiagramDragDrop(props));

    act(() => {
      result.current.onNodeDragStop(new MouseEvent('mouseup'), node, [node]);
      vi.runAllTimers();
    });

    expect(props.clearGuides).toHaveBeenCalledOnce();
    expect(props.setNodes).toHaveBeenCalledOnce();
    const update = props.setNodes.mock.calls[0][0] as (nodes: Node[]) => Node[];
    expect(update([node])[0].position).toEqual({ x: 13, y: 18 });
  });
});
