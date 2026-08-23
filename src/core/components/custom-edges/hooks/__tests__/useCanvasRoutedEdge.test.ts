import { Position, type EdgeProps } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createCanvasRoutedEdgeModel } from '../useCanvasRoutedEdge';

const createProps = (data: Record<string, unknown>): EdgeProps => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceX: 100,
  sourceY: 40,
  targetX: 300,
  targetY: 40,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  data,
} as EdgeProps);

describe('canvas routed edge render model', () => {
  it('fails closed on standalone computed geometry', () => {
    const model = createCanvasRoutedEdgeModel(createProps({
      computedPath: [
        { x: 100, y: 40 },
        { x: 100, y: 240 },
        { x: 300, y: 240 },
        { x: 300, y: 40 },
      ],
    }));

    expect(model.points).toBeNull();
    expect(model.path).not.toContain('240');
  });

  it('renders bounded Routing Session geometry and label metadata', () => {
    const model = createCanvasRoutedEdgeModel(createProps({
      computedPath: [
        { x: 100, y: 40 },
        { x: 200, y: 40 },
        { x: 300, y: 40 },
      ],
      labelPosition: { x: 190, y: 30 },
      labelOffset: { x: 5, y: -2 },
    }), true);

    expect(model.points).toHaveLength(3);
    expect(model.path).toContain('M 100 40');
    expect(model.labelX).toBe(195);
    expect(model.labelY).toBe(28);
  });

  it('rejects non-finite and drag-stale Routing Session paths', () => {
    const model = createCanvasRoutedEdgeModel(createProps({
      computedPath: [{ x: Number.NaN, y: 40 }, { x: 300, y: 40 }],
      labelPosition: { x: Number.POSITIVE_INFINITY, y: 30 },
      _draggingNodeIds: ['source'],
    }), true);

    expect(model.points).toBeNull();
    expect(model.nodesDragging).toBe(true);
    expect(Number.isFinite(model.labelX)).toBe(true);
    expect(Number.isFinite(model.labelY)).toBe(true);
  });
});
