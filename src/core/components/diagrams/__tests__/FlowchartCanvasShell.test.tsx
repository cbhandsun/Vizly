// @vitest-environment jsdom

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const baseReactFlowProps = vi.fn();
const lightweightReactFlowProps = vi.fn();

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    Background: () => <div data-testid="lightweight-background" />,
    ReactFlow: (props: Record<string, unknown>) => {
      lightweightReactFlowProps(props);
      return (
        <div className="react-flow" data-testid="lightweight-react-flow">
          <div className="react-flow__renderer" />
          {props.children as React.ReactNode}
        </div>
      );
    },
  };
});

vi.mock('../../shared/BaseReactFlow', () => ({
  default: (props: Record<string, unknown>) => {
    baseReactFlowProps(props);
    return (
      <div data-testid="base-react-flow">
        <div className="react-flow__renderer" />
        {props.children as React.ReactNode}
      </div>
    );
  },
}));

import { FlowchartCanvasShell } from '../FlowchartCanvasShell';
import { AdvancedFlowchartCanvasShell } from '../AdvancedFlowchartCanvasShell';
import {
  bindBaseReactFlowRendererAssistiveVisibility,
  syncBaseReactFlowRendererAssistiveVisibility,
} from '../../shared/baseReactFlowAssistiveVisibility';
import {
  createFinalPositionChanges,
  createSnappedPositionChange,
  getNonPositionNodeChanges,
} from '../hooks/useFlowchartDragBuffer';
import { createBaseReactFlowRoutingSessionRuntime } from '../../shared/baseReactFlowRoutingSessionRuntime';

describe('FlowchartCanvasShell', () => {
  beforeEach(() => {
    baseReactFlowProps.mockClear();
    lightweightReactFlowProps.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps an interactive lightweight pane on the empty startup path', () => {
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
        viewportPersistenceKey="diagram-a:page-1"
      />,
    );

    const props = lightweightReactFlowProps.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      elementsSelectable: false,
      nodes: [],
      edges: [],
      nodesFocusable: true,
      edgesFocusable: true,
    });
    expect(baseReactFlowProps).not.toHaveBeenCalled();
  });

  it('keeps unchanged accessibility projections stable across a node move', async () => {
    const noop = vi.fn();
    const fixedNode: Node = {
      id: 'fixed',
      position: { x: 0, y: 0 },
      data: { label: '固定节点' },
    };
    const movingNode: Node = {
      id: 'moving',
      position: { x: 100, y: 0 },
      data: { label: '移动节点' },
    };
    const edges: Edge[] = [{ id: 'edge', source: 'fixed', target: 'moving' }];
    const renderShell = (nodes: Node[]) => (
      <AdvancedFlowchartCanvasShell
        nodes={nodes}
        displayEdges={edges}
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
      />
    );
    const view = render(renderShell([fixedNode, movingNode]));
    await waitFor(() => expect(baseReactFlowProps).toHaveBeenCalled());
    const initialProps = baseReactFlowProps.mock.calls.at(-1)?.[0] as {
      nodes: Node[];
      edges: Edge[];
    };
    const initialRenderCount = baseReactFlowProps.mock.calls.length;

    view.rerender(renderShell([
      fixedNode,
      { ...movingNode, position: { x: 124, y: 0 } },
    ]));
    await waitFor(() => expect(baseReactFlowProps.mock.calls.length).toBeGreaterThan(
      initialRenderCount,
    ));
    const movedProps = baseReactFlowProps.mock.calls.at(-1)?.[0] as {
      nodes: Node[];
      edges: Edge[];
    };

    expect(movedProps.edges).toBe(initialProps.edges);
    expect(movedProps.nodes[0]).toBe(initialProps.nodes[0]);
    expect(movedProps.nodes[1]).not.toBe(initialProps.nodes[1]);
  });

  it('removes a plugin-replaced default canvas from keyboard and assistive navigation', () => {
    const noop = vi.fn();

    const { getByTestId } = render(
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
        defaultCanvasHiddenFromAssistiveTech
      />,
    );

    expect(lightweightReactFlowProps.mock.calls.at(-1)?.[0]).toMatchObject({
      nodesFocusable: false,
      edgesFocusable: false,
    });
    expect(getByTestId('lightweight-react-flow').querySelector('.react-flow__renderer')?.getAttribute('aria-hidden'))
      .toBe('true');
  });

  it('hides only the replaced renderer while preserving plugin-owned canvas content', () => {
    const container = document.createElement('div');
    container.innerHTML = [
      '<div class="react-flow__renderer"><button>legacy node</button></div>',
      '<section class="plugin-canvas" aria-label="Timeline"><button>timeline task</button></section>',
    ].join('');

    const renderer = syncBaseReactFlowRendererAssistiveVisibility(container, true);

    expect(renderer?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.plugin-canvas')?.hasAttribute('aria-hidden')).toBe(false);

    syncBaseReactFlowRendererAssistiveVisibility(container, false);
    expect(renderer?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('safely handles the interval before the React Flow renderer mounts', () => {
    expect(syncBaseReactFlowRendererAssistiveVisibility(document.createElement('div'), true)).toBeNull();
    expect(syncBaseReactFlowRendererAssistiveVisibility(null, true)).toBeNull();
  });

  it('hides a renderer that mounts after the plugin boundary effect', async () => {
    const container = document.createElement('div');
    const unbind = bindBaseReactFlowRendererAssistiveVisibility(container, true);
    const renderer = document.createElement('div');
    renderer.className = 'react-flow__renderer';

    container.appendChild(renderer);

    await waitFor(() => expect(renderer.getAttribute('aria-hidden')).toBe('true'));
    unbind();
    expect(renderer.hasAttribute('aria-hidden')).toBe(false);
  });

  it('removes every canvas mutation entry point when editing is disabled', async () => {
    const noop = vi.fn();
    const routingSessionRuntime = createBaseReactFlowRoutingSessionRuntime();
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
        routingSessionRuntime={routingSessionRuntime}
      />,
    );

    await waitFor(() => expect(baseReactFlowProps).toHaveBeenCalled());
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
    expect(props.routingSessionRuntime).toBe(routingSessionRuntime);
    expect(props.onPaneDoubleClick).toBeUndefined();
    expect((props.nodes as Node[])[0].selected).toBe(false);
    expect((props.edges as Edge[])[0].selected).toBe(false);
  });

  it('keeps drag positions local and commits final multi-node positions once', async () => {
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
    await waitFor(() => expect(baseReactFlowProps).toHaveBeenCalled());
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

  it('forwards position changes normally outside a drag gesture', async () => {
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

    await waitFor(() => expect(baseReactFlowProps).toHaveBeenCalled());
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

  it('reconciles Shift multi-selection after React Flow finishes its click update', async () => {
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

    await waitFor(() => expect(baseReactFlowProps).toHaveBeenCalled());
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

  it('reconciles Shift multi-selection for connectors without clearing selected edges', async () => {
    const onEdgesChange = vi.fn();
    const onEdgeClick = vi.fn();
    const noop = vi.fn();
    let scheduledSelection: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      scheduledSelection = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const edges = [
      { id: 'edge-a', source: 'A', target: 'B', selected: true },
      { id: 'edge-b', source: 'B', target: 'C', selected: false },
    ] satisfies Edge[];
    render(
      <FlowchartCanvasShell
        nodes={[]}
        displayEdges={edges}
        nodeTypes={{}}
        onInit={noop}
        onNodesChange={noop}
        onEdgesChange={onEdgesChange}
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
        onEdgeClick={onEdgeClick}
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

    await waitFor(() => expect(baseReactFlowProps).toHaveBeenCalled());
    const props = baseReactFlowProps.mock.calls.at(-1)?.[0];
    act(() => {
      (props.onEdgeClick as (event: React.MouseEvent, edge: Edge) => void)(
        { shiftKey: true } as React.MouseEvent,
        edges[1],
      );
    });

    expect(onEdgeClick).toHaveBeenCalledOnce();
    expect(onEdgesChange).not.toHaveBeenCalled();
    act(() => scheduledSelection?.(16));
    expect(onEdgesChange).toHaveBeenCalledWith([
      { id: 'edge-a', type: 'select', selected: true },
      { id: 'edge-b', type: 'select', selected: true },
    ]);
  });

  it('applies smart-guide snapping inside the canvas without an upstream position write', async () => {
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

    await waitFor(() => expect(baseReactFlowProps).toHaveBeenCalled());
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
