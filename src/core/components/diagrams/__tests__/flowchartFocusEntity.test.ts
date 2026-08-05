import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  applyFlowchartNodeVisualSelection,
  clearFlowchartEdgeVisualSelection,
  coerceFlowchartFocusEntityDetail,
  createFlowchartFocusEntityEventHandler,
  focusFlowchartEdge,
  focusFlowchartNode,
  handleFlowchartFocusEntity,
} from '../flowchartFocusEntity';

const nodes: Node[] = [
  {
    id: 'node-1',
    type: 'default',
    position: { x: 100, y: 200 },
    data: {},
    measured: { width: 80, height: 40 },
  },
  {
    id: 'node-2',
    type: 'default',
    position: { x: 300, y: 500 },
    data: {},
    measured: { width: 120, height: 60 },
  },
];

const edges: Edge[] = [
  {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
  },
];

const createReactFlowInstance = (zoom = 1.75) => ({
  getZoom: vi.fn(() => zoom),
  setCenter: vi.fn(),
});

describe('flowchartFocusEntity', () => {
  it('synchronizes the controlled canvas selection without rewriting unchanged entities', () => {
    const selectedNodes = applyFlowchartNodeVisualSelection([
      { ...nodes[0], selected: true },
      nodes[1],
    ], 'node-2');
    const clearedEdges = clearFlowchartEdgeVisualSelection([
      { ...edges[0], selected: true },
      { id: 'edge-2', source: 'node-2', target: 'node-1', selected: false },
    ]);

    expect(selectedNodes.map((node) => node.selected)).toEqual([false, true]);
    expect(clearedEdges.map((edge) => edge.selected)).toEqual([false, false]);
    expect(clearFlowchartEdgeVisualSelection([])).toEqual([]);
  });

  it('coerces focus event detail and rejects ambiguous or unsafe values', () => {
    expect(coerceFlowchartFocusEntityDetail({
      nodeId: ' node-1 ',
      preserveZoom: true,
      zoom: 2.5,
    })).toEqual({
      nodeId: 'node-1',
      preserveZoom: true,
      zoom: 2.5,
    });

    expect(coerceFlowchartFocusEntityDetail(undefined)).toBeNull();
    expect(coerceFlowchartFocusEntityDetail({})).toBeNull();
    expect(coerceFlowchartFocusEntityDetail({ nodeId: 'a', edgeId: 'b' })).toBeNull();
    expect(coerceFlowchartFocusEntityDetail({ nodeId: 'x'.repeat(257) })).toBeNull();
    expect(coerceFlowchartFocusEntityDetail({ nodeId: 'node-1', zoom: Number.NaN }))
      .toBeNull();
    expect(coerceFlowchartFocusEntityDetail({ nodeId: 'node-1', zoom: Number.POSITIVE_INFINITY }))
      .toBeNull();
    expect(coerceFlowchartFocusEntityDetail({ nodeId: 'node-1', zoom: -1 }))
      .toBeNull();
    expect(coerceFlowchartFocusEntityDetail({ nodeId: 'node-1', preserveZoom: 'yes' }))
      .toBeNull();
  });

  it('focuses a node and clears edge selection when requested', () => {
    const reactFlowInstance = createReactFlowInstance();
    const setSelectedNodes = vi.fn();
    const setSelectedEdges = vi.fn();

    const handled = focusFlowchartNode({
      reactFlowInstance,
      nodes,
      nodeId: 'node-1',
      setSelectedNodes,
      setSelectedEdges,
      duration: 800,
      zoom: 1.2,
    });

    expect(handled).toBe(true);
    expect(reactFlowInstance.setCenter).toHaveBeenCalledWith(140, 220, {
      duration: 800,
      zoom: 1.2,
    });
    expect(setSelectedNodes).toHaveBeenCalledWith([nodes[0]]);
    expect(setSelectedEdges).toHaveBeenCalledWith([]);
  });

  it('preserves current zoom when focusing a node with preserveZoom enabled', () => {
    const reactFlowInstance = createReactFlowInstance(2.4);
    const setSelectedNodes = vi.fn();

    focusFlowchartNode({
      reactFlowInstance,
      nodes,
      nodeId: 'node-2',
      setSelectedNodes,
      preserveZoom: true,
    });

    expect(reactFlowInstance.getZoom).toHaveBeenCalled();
    expect(reactFlowInstance.setCenter).toHaveBeenCalledWith(360, 530, {
      duration: 600,
      zoom: 2.4,
    });
  });

  it('focuses an edge by centering on the midpoint between source and target nodes', () => {
    const reactFlowInstance = createReactFlowInstance();
    const setSelectedNodes = vi.fn();
    const setSelectedEdges = vi.fn();

    const handled = focusFlowchartEdge({
      reactFlowInstance,
      nodes,
      edges,
      edgeId: 'edge-1',
      setSelectedNodes,
      setSelectedEdges,
      zoom: 1.1,
    });

    expect(handled).toBe(true);
    expect(reactFlowInstance.setCenter).toHaveBeenCalledWith(200, 350, {
      duration: 600,
      zoom: 1.1,
    });
    expect(setSelectedEdges).toHaveBeenCalledWith([edges[0]]);
    expect(setSelectedNodes).toHaveBeenCalledWith([]);
  });

  it('dispatches entity focus detail through the shared handler', () => {
    const reactFlowInstance = createReactFlowInstance(1.9);
    const setSelectedNodes = vi.fn();
    const setSelectedEdges = vi.fn();

    const handled = handleFlowchartFocusEntity({
      reactFlowInstance,
      nodes,
      edges,
      detail: {
        edgeId: 'edge-1',
        preserveZoom: true,
      },
      setSelectedNodes,
      setSelectedEdges,
    });

    expect(handled).toBe(true);
    expect(reactFlowInstance.getZoom).toHaveBeenCalled();
    expect(reactFlowInstance.setCenter).toHaveBeenCalledWith(200, 350, {
      duration: 600,
      zoom: 1.9,
    });
  });

  it('creates an event handler that forwards custom event detail to the shared focus logic', () => {
    const reactFlowInstance = createReactFlowInstance(2.1);
    const setSelectedNodes = vi.fn();
    const setSelectedEdges = vi.fn();
    const handler = createFlowchartFocusEntityEventHandler({
      reactFlowInstance,
      nodes,
      edges,
      setSelectedNodes,
      setSelectedEdges,
    });

    const handled = handler({
      detail: {
        nodeId: 'node-2',
        preserveZoom: true,
      },
    });

    expect(handled).toBe(true);
    expect(reactFlowInstance.getZoom).toHaveBeenCalled();
    expect(reactFlowInstance.setCenter).toHaveBeenCalledWith(360, 530, {
      duration: 600,
      zoom: 2.1,
    });
    expect(setSelectedNodes).toHaveBeenCalledWith([nodes[1]]);
    expect(setSelectedEdges).toHaveBeenCalledWith([]);
  });

  it('rejects malformed focus events without changing selection', () => {
    const reactFlowInstance = createReactFlowInstance();
    const setSelectedNodes = vi.fn();
    const setSelectedEdges = vi.fn();
    const handler = createFlowchartFocusEntityEventHandler({
      reactFlowInstance,
      nodes,
      edges,
      setSelectedNodes,
      setSelectedEdges,
    });

    expect(handler({})).toBe(false);
    expect(handler({ detail: null })).toBe(false);
    expect(handler({ detail: { nodeId: 123 } })).toBe(false);
    expect(handler({ detail: { nodeId: 'node-1', edgeId: 'edge-1' } })).toBe(false);
    expect(reactFlowInstance.setCenter).not.toHaveBeenCalled();
    expect(setSelectedNodes).not.toHaveBeenCalled();
    expect(setSelectedEdges).not.toHaveBeenCalled();
  });

  it('returns false without mutating selection when dependencies are missing', () => {
    const setSelectedNodes = vi.fn();
    const setSelectedEdges = vi.fn();

    expect(
      focusFlowchartNode({
        reactFlowInstance: null,
        nodes,
        nodeId: 'node-1',
        setSelectedNodes,
      })
    ).toBe(false);

    expect(
      focusFlowchartEdge({
        reactFlowInstance: createReactFlowInstance(),
        nodes,
        edges,
        edgeId: 'missing-edge',
        setSelectedNodes,
        setSelectedEdges,
      })
    ).toBe(false);

    expect(
      handleFlowchartFocusEntity({
        reactFlowInstance: createReactFlowInstance(),
        nodes,
        edges,
        detail: {},
        setSelectedNodes,
        setSelectedEdges,
      })
    ).toBe(false);

    expect(setSelectedNodes).not.toHaveBeenCalled();
    expect(setSelectedEdges).not.toHaveBeenCalled();
  });
});
