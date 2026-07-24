import { describe, expect, it, vi } from 'vitest';

import type { Point, Rectangle } from '../../../types/routing';
import { Position } from '../../../types/routing';
import {
  buildWorkerReverseBypassPath,
  ensureSafeWorkerStitch,
  isSameWorkerPoint,
  isWorkerPathBlocked,
} from '../edgeRoutingWorkerPathSafety';

const clearAnalyzer = () => ({
  intersectsAnyObstacle: vi.fn(() => false),
});

const rect = (x: number, y: number, width = 100, height = 60): Rectangle => ({
  x,
  y,
  width,
  height,
});

describe('edgeRoutingWorkerPathSafety', () => {
  it('uses the worker point tolerance consistently', () => {
    expect(isSameWorkerPoint({ x: 1, y: 1 }, { x: 1.2, y: 1.2 })).toBe(true);
    expect(isSameWorkerPoint({ x: 1, y: 1 }, { x: 1.3, y: 1.3 })).toBe(false);
  });

  it('checks every segment and stops at the first blocked segment', () => {
    const analyzer = {
      intersectsAnyObstacle: vi.fn((_start: Point, end: Point) => end.x === 20),
    };
    const blocked = isWorkerPathBlocked(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }],
      [],
      analyzer,
      4,
    );

    expect(blocked).toBe(true);
    expect(analyzer.intersectsAnyObstacle).toHaveBeenCalledTimes(2);
    expect(analyzer.intersectsAnyObstacle).toHaveBeenLastCalledWith(
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      [],
      4,
    );
  });

  it('stitches a disconnected start with a clear orthogonal corner', () => {
    const analyzer = {
      intersectsAnyObstacle: vi.fn((start: Point, end: Point) => (
        start.x === 0 && start.y === 0 && end.x === 20 && end.y === 20
      )),
    };
    const result = ensureSafeWorkerStitch(
      [{ x: 20, y: 20 }, { x: 40, y: 20 }],
      { x: 0, y: 0 },
      { x: 40, y: 20 },
      [],
      analyzer,
    );

    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 20, y: 20 },
      { x: 40, y: 20 },
    ]);
  });

  it('builds a vertical-flow bypass from nearby corridor obstacles only', () => {
    const analyzer = clearAnalyzer();
    const path = buildWorkerReverseBypassPath({
      layoutDirection: 'TB',
      bypassSide: Position.Left,
      sourceRect: rect(0, 0),
      targetRect: rect(0, 300),
      obstacles: [rect(-50, 120, 20, 40), rect(-500, 120, 20, 40)],
      startPoint: { x: 0, y: 30 },
      startOffset: { x: -10, y: 30 },
      endOffset: { x: -10, y: 330 },
      endPoint: { x: 0, y: 330 },
      analyzer,
    });

    expect(path).toEqual([
      { x: 0, y: 30 },
      { x: -10, y: 30 },
      { x: -110, y: 30 },
      { x: -110, y: 330 },
      { x: -10, y: 330 },
      { x: 0, y: 330 },
    ]);
  });

  it('builds a horizontal-flow top bypass outside the node bounds', () => {
    const path = buildWorkerReverseBypassPath({
      layoutDirection: 'LR',
      bypassSide: Position.Top,
      sourceRect: rect(0, 0),
      targetRect: rect(300, 0),
      obstacles: [],
      startPoint: { x: 50, y: 0 },
      startOffset: { x: 50, y: -10 },
      endOffset: { x: 350, y: -10 },
      endPoint: { x: 350, y: 0 },
      analyzer: clearAnalyzer(),
    });

    expect(path?.[2].y).toBe(-60);
    expect(path?.[3].y).toBe(-60);
  });

  it('rejects a deterministic bypass when any segment remains blocked', () => {
    const analyzer = { intersectsAnyObstacle: vi.fn(() => true) };
    const path = buildWorkerReverseBypassPath({
      bypassSide: Position.Right,
      sourceRect: rect(0, 0),
      targetRect: rect(0, 300),
      obstacles: [rect(120, 0)],
      startPoint: { x: 100, y: 30 },
      startOffset: { x: 110, y: 30 },
      endOffset: { x: 110, y: 330 },
      endPoint: { x: 100, y: 330 },
      analyzer,
    });

    expect(path).toBeNull();
  });
});
