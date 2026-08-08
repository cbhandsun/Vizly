// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { useDiagramActions } from '../useDiagramActions';

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

const setup = (initialEdges: Edge[]) => {
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
    reactFlowInstance: null,
  }));
  return { ...hook, edgesRef, setEdges, takeSnapshot };
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
});
