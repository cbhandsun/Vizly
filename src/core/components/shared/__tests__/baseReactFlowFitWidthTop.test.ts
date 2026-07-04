import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  computeBaseReactFlowFitViewport,
  computeBaseReactFlowMinorResizeThreshold,
  computeBaseReactFlowNodeBounds,
  expandBaseReactFlowBoundsForEdges,
  shouldSkipBaseReactFlowMinorResize,
} from '../baseReactFlowFitWidthTop';

describe('baseReactFlowFitWidthTop', () => {
  it('computes adaptive minor resize thresholds and skip decisions', () => {
    expect(computeBaseReactFlowMinorResizeThreshold({
      containerWidth: 1000,
      nodeCount: 400,
    })).toBeGreaterThanOrEqual(4);

    expect(shouldSkipBaseReactFlowMinorResize({
      currentSize: { width: 1000, height: 800 },
      previousSize: { width: 1003, height: 803 },
      nodeCount: 100,
    })).toBe(true);

    expect(shouldSkipBaseReactFlowMinorResize({
      currentSize: { width: 1000, height: 800 },
      previousSize: { width: 1030, height: 840 },
      nodeCount: 100,
    })).toBe(false);
  });

  it('computes node bounds using measured sizes and parent offsets', () => {
    const nodes: Node[] = [
      {
        id: 'parent',
        type: 'group',
        position: { x: 100, y: 50 },
        data: {},
        width: 300,
        height: 200,
      },
      {
        id: 'child',
        type: 'custom',
        position: { x: 20, y: 30 },
        parentId: 'parent',
        data: {},
        measured: { width: 80, height: 40 },
      },
    ];

    expect(computeBaseReactFlowNodeBounds(nodes)).toEqual({
      minX: 100,
      minY: 50,
      maxX: 400,
      maxY: 250,
    });
  });

  it('expands bounds for edge labels and smart edges', () => {
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'a',
        target: 'b',
        type: 'advanced-smart-step',
        label: 'Labeled',
        style: { strokeWidth: 3 },
      },
    ];

    expect(expandBaseReactFlowBoundsForEdges({
      bounds: { minX: 10, minY: 20, maxX: 110, maxY: 220 },
      edges,
    })).toEqual({
      minX: -13,
      minY: -35,
      maxX: 133,
      maxY: 251,
      contentWidth: 146,
      contentHeight: 286,
    });
  });

  it('computes fit viewport with safe zones and shrink protection', () => {
    const viewport = computeBaseReactFlowFitViewport({
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 200,
        maxY: 100,
        contentWidth: 200,
        contentHeight: 100,
      },
      containerSize: { width: 1000, height: 800 },
      fitPadding: 16,
      fitRatio: 0.85,
      maxFitZoom: 1,
      minZoom: 0.1,
      maxZoom: 4,
      hasInitialized: false,
      lastZoom: null,
      previousContainer: null,
    });

    expect(viewport.zoom).toBe(1);
    expect(viewport.x).toBeGreaterThan(56);
    expect(viewport.y).toBe(80);

    const preservedZoomViewport = computeBaseReactFlowFitViewport({
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 500,
        contentWidth: 1000,
        contentHeight: 500,
      },
      containerSize: { width: 1000, height: 800 },
      fitPadding: 16,
      fitRatio: 0.85,
      maxFitZoom: 1,
      minZoom: 0.1,
      maxZoom: 4,
      hasInitialized: true,
      lastZoom: 0.9,
      previousContainer: { width: 1000, height: 800 },
    });

    expect(preservedZoomViewport.zoom).toBe(0.9);
  });
});
