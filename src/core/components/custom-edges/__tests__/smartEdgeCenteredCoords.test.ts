import { Position } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  buildSmartEdgeCenteredCoords,
  resolveSmartEdgeFallbackPositions,
} from '../smartEdgeCenteredCoords';

const emptyMultiEdge = { isManyToOne: false, isOneToMany: false, enableBus: false };

describe('buildSmartEdgeCenteredCoords', () => {
  it('uses finite prop coordinates during dragging and skips topology reads', () => {
    const getAbsolutePosition = vi.fn();
    expect(buildSmartEdgeCenteredCoords({
      nodesDragging: true,
      source: 'A',
      target: 'B',
      sourceX: Number.NaN,
      sourceY: 20,
      targetX: 30,
      targetY: Number.POSITIVE_INFINITY,
      simpleNodeMap: new Map(),
      smartLayout: null,
      multiEdgeInfo: emptyMultiEdge,
      layoutDirection: 'LR',
      respectSourceHandle: false,
      respectTargetHandle: false,
      getAbsolutePosition,
    })).toMatchObject({
      sourceX: 0,
      sourceY: 20,
      targetX: 30,
      targetY: 0,
      effectiveIsOneToMany: false,
      effectiveIsManyToOne: false,
    });
    expect(getAbsolutePosition).not.toHaveBeenCalled();
  });

  it('respects explicit handles and rejects invalid node dimensions', () => {
    const sourceNode = {
      id: 'A',
      positionAbsolute: { x: 100, y: 200 },
      width: Number.POSITIVE_INFINITY,
      height: -10,
    };
    const targetNode = {
      id: 'B',
      positionAbsolute: { x: 300, y: 400 },
      width: 60,
      height: 40,
    };
    const result = buildSmartEdgeCenteredCoords({
      nodesDragging: false,
      source: 'A',
      target: 'B',
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 0,
      sourceNode,
      targetNode,
      sourceHandleId: 'source-right',
      targetHandleId: 'target-left',
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      simpleNodeMap: new Map([['A', sourceNode], ['B', targetNode]]),
      smartLayout: null,
      multiEdgeInfo: emptyMultiEdge,
      layoutDirection: 'LR',
      respectSourceHandle: true,
      respectTargetHandle: true,
      getAbsolutePosition: () => ({ x: 0, y: 0 }),
    });

    expect(result).toMatchObject({ sourceX: 100, sourceY: 200, targetX: 300, targetY: 420 });
  });

  it('preserves geometric inference for unrecognized handle IDs', () => {
    const sourceNode = { id: 'A', positionAbsolute: { x: 100, y: 200 }, width: 80, height: 40 };
    const result = buildSmartEdgeCenteredCoords({
      nodesDragging: false,
      source: 'A',
      target: 'B',
      sourceX: 180,
      sourceY: 220,
      targetX: 300,
      targetY: 400,
      sourceNode,
      sourceHandleId: 'custom-handle',
      simpleNodeMap: new Map([['A', sourceNode]]),
      smartLayout: null,
      multiEdgeInfo: emptyMultiEdge,
      layoutDirection: 'LR',
      respectSourceHandle: true,
      respectTargetHandle: false,
      getAbsolutePosition: () => ({ x: 0, y: 0 }),
    });

    expect(result.sourceX).toBe(180);
    expect(result.sourceY).toBe(220);
  });

  it('forces shared bus endpoints from finite node geometry', () => {
    const sourceNode = { id: 'A', width: 100, height: 40 };
    const targetNode = { id: 'B', width: 80, height: 60 };
    const result = buildSmartEdgeCenteredCoords({
      nodesDragging: false,
      source: 'A',
      target: 'B',
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 0,
      sourceNode,
      targetNode,
      simpleNodeMap: new Map([['A', sourceNode], ['B', targetNode]]),
      smartLayout: null,
      multiEdgeInfo: { isOneToMany: true, isManyToOne: true, enableBus: true },
      layoutDirection: 'LR',
      respectSourceHandle: false,
      respectTargetHandle: false,
      getAbsolutePosition: id => id === 'A' ? { x: 10, y: 20 } : { x: 300, y: 400 },
    });

    expect(result.busTrunkSource).toEqual({ x: 110, y: 40 });
    expect(result.busTrunkTarget).toEqual({ x: 300, y: 430 });
  });
});

describe('resolveSmartEdgeFallbackPositions', () => {
  it('prioritizes respected handles and otherwise uses smart/default layout positions', () => {
    expect(resolveSmartEdgeFallbackPositions({
      layoutDirection: 'TB',
      sourcePosition: Position.Left,
      targetPosition: Position.Right,
      sourceHandleId: 'source-top',
      targetHandleId: 'target-bottom',
      smartLayout: null,
      respectSourceHandle: true,
      respectTargetHandle: true,
    })).toEqual({ sourcePos: Position.Top, targetPos: Position.Bottom });

    expect(resolveSmartEdgeFallbackPositions({
      layoutDirection: 'LR',
      smartLayout: {
        sourcePos: Position.Bottom,
        targetPos: Position.Top,
        sourceX: 0,
        sourceY: 0,
        targetX: 0,
        targetY: 0,
      },
      respectSourceHandle: false,
      respectTargetHandle: false,
    })).toEqual({ sourcePos: Position.Bottom, targetPos: Position.Top });
  });
});
