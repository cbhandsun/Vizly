import { describe, expect, it } from 'vitest';

import {
  createFlowchartMindMapNode,
  createFlowchartStickyNoteNode,
  getFlowchartViewportCenter,
} from '../flowchartViewportNodeFactory';

describe('flowchartViewportNodeFactory', () => {
  it('computes the flow-space viewport center from DOM viewport and canvas size', () => {
    expect(getFlowchartViewportCenter({
      viewport: { x: 100, y: 80, zoom: 2 },
      canvasSize: { width: 1200, height: 800 },
    })).toEqual({ x: 250, y: 160 });
  });

  it('creates a sticky note node with centered placement and edit-ready defaults', () => {
    const stickyNode = createFlowchartStickyNoteNode({
      viewport: { x: 0, y: 0, zoom: 1 },
      canvasSize: { width: 1000, height: 800 },
      layer: 'layer-1',
      offset: 15,
      createNodeId: () => 'sticky-fixed',
    });

    expect(stickyNode).toEqual({
      id: 'sticky-fixed',
      type: 'sticky-note',
      position: { x: 415, y: 315 },
      data: {
        label: '',
        noteColor: 'yellow',
        layer: 'layer-1',
        isEditing: true,
      },
      style: { width: 200, height: 200 },
      zIndex: 1000,
    });
  });

  it('creates a mind map node with centered placement and translated label', () => {
    const mindMapNode = createFlowchartMindMapNode({
      viewport: { x: 100, y: 80, zoom: 2 },
      canvasSize: { width: 1200, height: 800 },
      layer: 'layer-2',
      label: 'Central Topic',
      createNodeId: () => 'mindmap-fixed',
    });

    expect(mindMapNode).toEqual({
      id: 'mindmap-fixed',
      type: 'mindmap',
      position: { x: 190, y: 140 },
      data: {
        label: 'Central Topic',
        layer: 'layer-2',
        isEditing: true,
      },
      style: { width: 120, height: 40 },
    });
  });
});
