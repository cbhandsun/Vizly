// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, InternalNode, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { useDiagramActions, type DiagramReactFlowActions } from '../useDiagramActions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const node: Node = { id: 'node-1', position: { x: 0, y: 0 }, data: {} };
const edge: Edge = {
  id: 'edge-1',
  source: 'source',
  target: 'target',
  type: 'smoothstep',
  label: 'Order flow',
  data: { waypoints: [{ x: 10, y: 20 }] },
};

const setup = (initialEdges: Edge[], reactFlowInstance: DiagramReactFlowActions | null = null) => {
  const nodesRef = { current: [node] };
  const edgesRef = { current: initialEdges };
  const setEdges = vi.fn();
  const takeSnapshot = vi.fn();
  const hook = renderHook(() => useDiagramActions({
    nodes: [],
    edges: [],
    nodesRef,
    edgesRef,
    setNodes: vi.fn(),
    setEdges,
    selectedNodes: [],
    selectedEdges: [],
    takeSnapshot,
    reactFlowInstance,
  }));
  return { ...hook, edgesRef, setEdges, takeSnapshot };
};

const createReactFlowInstance = (zoom: number) => {
  const makeInternalNode = (id: string, x: number, y: number): InternalNode => {
    const userNode: Node = {
      id,
      position: { x, y },
      data: {},
      measured: { width: 100, height: 40 },
    };
    return {
      ...userNode,
      measured: { width: 100, height: 40 },
      internals: {
        positionAbsolute: { x, y },
        userNode,
        z: 0,
        handleBounds: undefined,
        bounds: undefined,
      },
    };
  };
  const source = makeInternalNode('source', 100, 200);
  const target = makeInternalNode('target', 300, 400);
  const setCenter = vi.fn();
  const instance = {
    getViewport: () => ({ x: 0, y: 0, zoom }),
    getInternalNode: (id: string) => id === 'source' ? source : id === 'target' ? target : undefined,
    setCenter,
    fitView: vi.fn(),
  } satisfies DiagramReactFlowActions;
  return { instance, setCenter };
};

describe('useDiagramActions edge context transactions', () => {
  it('commits conversion and restoration as one undoable state write each', () => {
    const { result, edgesRef, setEdges, takeSnapshot } = setup([edge]);

    act(() => expect(result.current.onContextMenuAction('convertToEditable', 'edge-1')).toBe(true));
    expect(edgesRef.current[0]).toMatchObject({ type: 'editable', selected: true, label: 'Order flow' });
    expect(takeSnapshot).toHaveBeenCalledWith([node], [edge]);
    expect(setEdges).toHaveBeenCalledTimes(1);

    act(() => expect(result.current.onContextMenuAction('stopEditing', 'edge-1')).toBe(true));
    expect(edgesRef.current[0]).toMatchObject({ type: 'smoothstep', selected: false, label: 'Order flow' });
    expect(takeSnapshot).toHaveBeenCalledTimes(2);
    expect(setEdges).toHaveBeenCalledTimes(2);
  });

  it('does not pollute history for missing targets or already-reset paths', () => {
    const alreadyReset = { ...edge, data: { waypoints: [] } };
    const { result, setEdges, takeSnapshot } = setup([alreadyReset]);

    act(() => {
      expect(result.current.onContextMenuAction('resetWaypoints', 'edge-1')).toBe(false);
      expect(result.current.onContextMenuAction('convertToEditable', 'missing')).toBe(false);
      expect(result.current.onContextMenuAction('stopEditing', 'edge-1')).toBe(false);
    });

    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
  });

  it('reverses the current ref state and keeps the label intact', () => {
    const { result, edgesRef, takeSnapshot } = setup([edge]);

    act(() => expect(result.current.onContextMenuAction('reverseEdge', 'edge-1')).toBe(true));

    expect(edgesRef.current[0]).toMatchObject({
      source: 'target',
      target: 'source',
      label: 'Order flow',
      data: { waypoints: [] },
    });
    expect(takeSnapshot).toHaveBeenCalledOnce();
  });

  it('raises an overview canvas to a precise editing zoom', () => {
    const { instance, setCenter } = createReactFlowInstance(0.32);
    const { result } = setup([edge], instance);
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 1;
      });

    act(() => expect(result.current.onContextMenuAction('convertToEditable', 'edge-1')).toBe(true));

    expect(setCenter).toHaveBeenCalledWith(250, 320, { zoom: 0.8, duration: 250 });
    requestAnimationFrame.mockRestore();
  });

  it('preserves an already readable viewport when entering path editing', () => {
    const { instance, setCenter } = createReactFlowInstance(0.8);
    const { result } = setup([edge], instance);

    act(() => expect(result.current.onContextMenuAction('convertToEditable', 'edge-1')).toBe(true));

    expect(setCenter).not.toHaveBeenCalled();
  });
});
