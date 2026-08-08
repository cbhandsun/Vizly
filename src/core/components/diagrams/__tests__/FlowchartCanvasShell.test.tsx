// @vitest-environment jsdom

import React from 'react';
import { act, render } from '@testing-library/react';
import { applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const baseReactFlowProps = vi.fn();

vi.mock('../../shared/BaseReactFlow', () => ({
  default: (props: Record<string, unknown>) => {
    baseReactFlowProps(props);
    return <div data-testid="base-react-flow">{props.children as React.ReactNode}</div>;
  },
}));

import { FlowchartCanvasShell } from '../FlowchartCanvasShell';
import {
  createFinalPositionChanges,
  createSnappedPositionChange,
  getNonPositionNodeChanges,
} from '../hooks/useFlowchartDragBuffer';

describe('FlowchartCanvasShell', () => {
  beforeEach(() => {
    baseReactFlowProps.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not refit or pin the viewport on canvas rerenders', () => {
    const noop = vi.fn();

    render(
      <FlowchartCanvasShell
        nodes={[]}
        displayEdges={[]}
        nodeTypes={{}}
        onInit={noop}
        onNodesChange={noop}
        onEdgesChange={noop}
        onConnect={noop}
        onConnectStart={noop}
        onConnectEnd={noop}
        autoRoutingEnabled
        enableSmartEdges
        showMinimap={false}
        showGrid
        gridVariant={'dots' as never}
        onNodeDrag={noop}
        onNodeDragStart={noop}
        onSelectionChange={noop}
        onPaneClick={noop}
        onPaneDoubleClick={noop}
        selectionMode={'partial' as never}
        onNodeContextMenu={noop}
        onEdgeContextMenu={noop}
        onPaneContextMenu={noop}
        isSpacePressed={false}
        isConnecting={false}
        connectPreview={null}
        connectionMode={'loose' as never}
        isDragging={false}
      />,
    );

    const props = baseReactFlowProps.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      fitMode: 'none',
      fitPadding: 0.1,
      pinFit: false,
      nodesFocusable: true,
      edgesFocusable: true,
      multiSelectionKeyCode: null,
    });
    expect(props).not.toHaveProperty('fitView');
  });

  it('removes every canvas mutation entry point when editing is disabled', () => {
    const noop = vi.fn();
    render(
      <FlowchartCanvasShell
        nodes={[{ id: 'A', position: { x: 0, y: 0 }, data: {}, selected: true }]}
        displayEdges={[{ id: 'E', source: 'A', target: 'A', selected: true }]}
        nodeTypes={{}}
        onInit={noop}
        onNodesChange={noop}
        onEdgesChange={noop}
        onConnect={noop}
        onConnectStart={noop}
        onConnectEnd={noop}
        autoRoutingEnabled
        enableSmartEdges
        showMinimap={false}
        showGrid
        gridVariant={'dots' as never}
        onNodeDrag={noop}
        onNodeDragStart={noop}
        onSelectionChange={noop}
        onPaneClick={noop}
        onPaneDoubleClick={noop}
        selectionMode={'partial' as never}
        onNodeContextMenu={noop}
        onEdgeContextMenu={noop}
        onPaneContextMenu={noop}
        isSpacePressed={false}
        isConnecting={false}
        connectPreview={null}
        connectionMode={'loose' as never}
        isDragging={false}
        editingEnabled={false}
      />,
    );

    const props = baseReactFlowProps.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      nodesDraggable: false,
      nodesConnectable: false,
      elementsSelectable: false,
      nodesFocusable: false,
      edgesFocusable: false,
      edgesReconnectable: false,
      selectionOnDrag: false,
      panOnDrag: true,
    });
    expect(props.onNodesChange).toBeUndefined();
    expect(props.onEdgesChange).toBeUndefined();
    expect(props.onConnect).toBeUndefined();
    expect(props.onPaneDoubleClick).toBeUndefined();
    expect((props.nodes as Node[])[0].selected).toBe(false);
    expect((props.edges as Edge[])[0].selected).toBe(false);
  });

  it('keeps drag positions local and commits final multi-node positions once', () => {
    const initialNodes = [
      { id: 'A', position: { x: 0, y: 0 }, data: {} },
      { id: 'B', position: { x: 20, y: 30 }, data: {}, selected: true },
    ] satisfies Node[];
    const upstreamChanges: NodeChange[][] = [];
    const onNodeDragStart = vi.fn();
    const onNodeDragStop = vi.fn();

    const Harness = () => {
      const [nodes, setNodes] = React.useState<Node[]>(initialNodes);
      const onNodesChange = React.useCallback((changes: NodeChange[]) => {
        upstreamChanges.push(changes);
        setNodes(current => applyNodeChanges(changes, current));
      }, []);

      return (
        <FlowchartCanvasShell
          nodes={nodes}
          displayEdges={[]}
          nodeTypes={{}}
          onInit={vi.fn()}
          onNodesChange={onNodesChange}
          onEdgesChange={vi.fn()}
          onConnect={vi.fn()}
          onConnectStart={vi.fn()}
          onConnectEnd={vi.fn()}
          autoRoutingEnabled
          enableSmartEdges
          showMinimap={false}
          showGrid
          gridVariant={'dots' as never}
          onNodeDrag={vi.fn()}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onSelectionChange={vi.fn()}
          onPaneClick={vi.fn()}
          onPaneDoubleClick={vi.fn()}
          selectionMode={'partial' as never}
          onNodeContextMenu={vi.fn()}
          onEdgeContextMenu={vi.fn()}
          onPaneContextMenu={vi.fn()}
          isSpacePressed={false}
          isConnecting={false}
          connectPreview={null}
          connectionMode={'loose' as never}
          isDragging
        />
      );
    };

    render(<Harness />);
    const event = new MouseEvent('mousedown');
    const startingProps = baseReactFlowProps.mock.calls.at(-1)?.[0];
    act(() => {
      (startingProps.onNodeDragStart as (
        event: MouseEvent,
        node: Node,
        draggedNodes: Node[],
      ) => void)(event, initialNodes[0], initialNodes);
    });

    const draggingProps = baseReactFlowProps.mock.calls.at(-1)?.[0];
    act(() => {
      (draggingProps.onNodesChange as (changes: NodeChange[]) => void)([
        { id: 'A', type: 'position', position: { x: 80, y: 90 }, dragging: true },
        { id: 'B', type: 'position', position: { x: 100, y: 120 }, dragging: true },
      ]);
    });

    expect(upstreamChanges).toEqual([]);
    expect((baseReactFlowProps.mock.calls.at(-1)?.[0].nodes as Node[]).map(node => node.position))
      .toEqual([{ x: 80, y: 90 }, { x: 100, y: 120 }]);

    act(() => {
      (baseReactFlowProps.mock.calls.at(-1)?.[0].onNodesChange as (
        changes: NodeChange[],
      ) => void)([{ id: 'A', type: 'select', selected: true }]);
    });
    expect(upstreamChanges).toEqual([[{ id: 'A', type: 'select', selected: true }]]);

    const finalNodes = [
      { ...initialNodes[0], position: { x: 81, y: 91 } },
      { ...initialNodes[1], position: { x: 101, y: 121 } },
    ];
    act(() => {
      (baseReactFlowProps.mock.calls.at(-1)?.[0].onNodeDragStop as (
        event: MouseEvent,
        node: Node,
        draggedNodes: Node[],
      ) => void)(event, finalNodes[0], finalNodes);
    });

    expect(upstreamChanges).toHaveLength(2);
    expect(upstreamChanges[1]).toEqual([
      { id: 'A', type: 'position', position: { x: 81, y: 91 }, dragging: false },
      { id: 'B', type: 'position', position: { x: 101, y: 121 }, dragging: false },
    ]);
    expect((baseReactFlowProps.mock.calls.at(-1)?.[0].nodes as Node[]).map(node => node.position))
      .toEqual([{ x: 81, y: 91 }, { x: 101, y: 121 }]);
    expect(onNodeDragStart).toHaveBeenCalledOnce();
    expect(onNodeDragStop).toHaveBeenCalledOnce();
  });

  it('forwards position changes normally outside a drag gesture', () => {
    const onNodesChange = vi.fn();
    const noop = vi.fn();
    render(
      <FlowchartCanvasShell
        nodes={[{ id: 'A', position: { x: 0, y: 0 }, data: {} }]}
        displayEdges={[]}
        nodeTypes={{}}
        onInit={noop}
        onNodesChange={onNodesChange}
        onEdgesChange={noop}
        onConnect={noop}
        onConnectStart={noop}
        onConnectEnd={noop}
        autoRoutingEnabled
        enableSmartEdges
        showMinimap={false}
        showGrid
        gridVariant={'dots' as never}
        onNodeDrag={noop}
        onNodeDragStart={noop}
        onSelectionChange={noop}
        onPaneClick={noop}
        onPaneDoubleClick={noop}
        selectionMode={'partial' as never}
        onNodeContextMenu={noop}
        onEdgeContextMenu={noop}
        onPaneContextMenu={noop}
        isSpacePressed={false}
        isConnecting={false}
        connectPreview={null}
        connectionMode={'loose' as never}
        isDragging={false}
      />,
    );

    const changes: NodeChange[] = [
      { id: 'A', type: 'position', position: { x: 1, y: 2 }, dragging: false },
    ];
    act(() => {
      (baseReactFlowProps.mock.calls.at(-1)?.[0].onNodesChange as (
        changes: NodeChange[],
      ) => void)(changes);
    });
    expect(onNodesChange).toHaveBeenCalledWith(changes);
  });

  it('reconciles Shift multi-selection after React Flow finishes its click update', () => {
    const onNodesChange = vi.fn();
    const onNodeClick = vi.fn();
    const noop = vi.fn();
    let scheduledSelection: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      scheduledSelection = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const nodes = [
      { id: 'A', position: { x: 0, y: 0 }, data: {}, selected: true },
      { id: 'B', position: { x: 50, y: 0 }, data: {}, selected: false },
    ] satisfies Node[];
    render(
      <FlowchartCanvasShell
        nodes={nodes}
        displayEdges={[]}
        nodeTypes={{}}
        onInit={noop}
        onNodesChange={onNodesChange}
        onEdgesChange={noop}
        onConnect={noop}
        onConnectStart={noop}
        onConnectEnd={noop}
        autoRoutingEnabled
        enableSmartEdges
        showMinimap={false}
        showGrid
        gridVariant={'dots' as never}
        onNodeDrag={noop}
        onNodeDragStart={noop}
        onSelectionChange={noop}
        onPaneClick={noop}
        onPaneDoubleClick={noop}
        onNodeClick={onNodeClick}
        selectionMode={'partial' as never}
        onNodeContextMenu={noop}
        onEdgeContextMenu={noop}
        onPaneContextMenu={noop}
        isSpacePressed={false}
        isConnecting={false}
        connectPreview={null}
        connectionMode={'loose' as never}
        isDragging={false}
      />,
    );

    const props = baseReactFlowProps.mock.calls.at(-1)?.[0];
    act(() => {
      (props.onNodeClick as (event: React.MouseEvent, node: Node) => void)(
        { shiftKey: true } as React.MouseEvent,
        nodes[1],
      );
    });

    expect(props.multiSelectionKeyCode).toBeNull();
    expect(onNodeClick).toHaveBeenCalledOnce();
    expect(onNodesChange).not.toHaveBeenCalled();

    act(() => scheduledSelection?.(16));
    expect(onNodesChange).toHaveBeenCalledWith([
      { id: 'A', type: 'select', selected: true },
      { id: 'B', type: 'select', selected: true },
    ]);
  });

  it('applies smart-guide snapping inside the canvas without an upstream position write', () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const node = { id: 'A', position: { x: 0, y: 0 }, data: {} } satisfies Node;
    const onNodesChange = vi.fn();
    const onNodeDrag = vi.fn();
    const onSmartNodeDrag = vi.fn(() => ({ x: 3, y: -2 }));
    const noop = vi.fn();
    render(
      <FlowchartCanvasShell
        nodes={[node]}
        displayEdges={[]}
        nodeTypes={{}}
        onInit={noop}
        onNodesChange={onNodesChange}
        onEdgesChange={noop}
        onConnect={noop}
        onConnectStart={noop}
        onConnectEnd={noop}
        autoRoutingEnabled
        enableSmartEdges
        showMinimap={false}
        showGrid
        gridVariant={'dots' as never}
        onNodeDrag={onNodeDrag}
        onSmartNodeDrag={onSmartNodeDrag}
        onNodeDragStart={noop}
        onSelectionChange={noop}
        onPaneClick={noop}
        onPaneDoubleClick={noop}
        selectionMode={'partial' as never}
        onNodeContextMenu={noop}
        onEdgeContextMenu={noop}
        onPaneContextMenu={noop}
        isSpacePressed={false}
        isConnecting={false}
        connectPreview={null}
        connectionMode={'loose' as never}
        isDragging
      />,
    );

    const event = new MouseEvent('mousemove');
    act(() => {
      (baseReactFlowProps.mock.calls.at(-1)?.[0].onNodeDragStart as (
        event: MouseEvent,
        node: Node,
        draggedNodes: Node[],
      ) => void)(event, node, [node]);
    });
    const draggedNode = { ...node, position: { x: 10, y: 20 } };
    act(() => {
      (baseReactFlowProps.mock.calls.at(-1)?.[0].onNodesChange as (
        changes: NodeChange[],
      ) => void)([{
        id: 'A',
        type: 'position',
        position: draggedNode.position,
        dragging: true,
      }]);
      (baseReactFlowProps.mock.calls.at(-1)?.[0].onNodeDrag as (
        event: MouseEvent,
        node: Node,
        draggedNodes: Node[],
      ) => void)(event, draggedNode, [draggedNode]);
    });
    act(() => {
      scheduledFrame?.(16);
    });

    expect(onNodeDrag).toHaveBeenCalledOnce();
    expect(onSmartNodeDrag).toHaveBeenCalledOnce();
    expect(onNodesChange).not.toHaveBeenCalled();
    expect((baseReactFlowProps.mock.calls.at(-1)?.[0].nodes as Node[])[0].position)
      .toEqual({ x: 13, y: 18 });
  });

  it('sanitizes final drag commits and preserves non-position changes', () => {
    const validNode = { id: 'A', position: { x: 3, y: 4 }, data: {} } satisfies Node;
    const duplicate = { ...validNode, position: { x: 5, y: 6 } };
    const invalidPosition = {
      id: 'invalid',
      position: { x: Number.POSITIVE_INFINITY, y: 0 },
      data: {},
    } satisfies Node;
    const invalidId = {
      id: 'x'.repeat(1_025),
      position: { x: Number.MIN_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
      data: {},
    } satisfies Node;

    expect(createFinalPositionChanges(validNode, [
      duplicate,
      invalidPosition,
      invalidId,
    ])).toEqual([{
      id: 'A',
      type: 'position',
      position: { x: 5, y: 6 },
      dragging: false,
    }]);
    expect(createSnappedPositionChange(validNode, { x: 2, y: -1 })).toEqual({
      id: 'A',
      type: 'position',
      position: { x: 5, y: 3 },
      dragging: true,
    });
    expect(createSnappedPositionChange(validNode, {
      x: Number.NaN,
      y: 0,
    })).toBeNull();
    expect(createSnappedPositionChange({
      ...validNode,
      position: { x: Number.MAX_VALUE, y: 0 },
    }, {
      x: Number.MAX_VALUE,
      y: 0,
    })).toBeNull();
    expect(getNonPositionNodeChanges([])).toEqual([]);
    expect(getNonPositionNodeChanges([
      { id: 'A', type: 'position', position: { x: 1, y: 2 } },
      { id: 'A', type: 'select', selected: true },
      { id: 'B', type: 'remove' },
    ])).toEqual([
      { id: 'A', type: 'select', selected: true },
      { id: 'B', type: 'remove' },
    ]);
  });
});
