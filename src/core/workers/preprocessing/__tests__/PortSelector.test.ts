import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rectangle } from '../../../algorithms/geometryUtils';
import { Position, createDefaultRoutingConfig } from '../../../types/routing';
import { PortSelector } from '../PortSelector';

const selectOptimalPortsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../algorithms/costAwarePorts', () => ({
  selectOptimalPorts: selectOptimalPortsMock,
}));

describe('PortSelector preprocessing facade', () => {
  beforeEach(() => {
    selectOptimalPortsMock.mockReset();
  });

  const rect: Rectangle = { x: 0, y: 0, width: 120, height: 80 };

  it('passes routing context through to cost-aware port selection', () => {
    const config = createDefaultRoutingConfig();
    const selector = new PortSelector(config);
    const sourceRect: Rectangle = { x: 0, y: 0, width: 100, height: 60 };
    const targetRect: Rectangle = { x: 240, y: 80, width: 100, height: 60 };
    const obstacles: Rectangle[] = [{ x: 120, y: 40, width: 20, height: 20 }];
    const lineObstacles = [{ start: { x: 0, y: 40 }, end: { x: 200, y: 40 } }];
    const expected = { source: Position.Right, target: Position.Left };
    selectOptimalPortsMock.mockReturnValue(expected);

    expect(selector.selectPorts(sourceRect, targetRect, obstacles, {
      effectiveDir: 'LR',
      portUsage: { 'source:right': 2 },
      sourceId: 'source',
      targetId: 'target',
      lineObstacles,
      constrainedSourcePos: Position.Right,
      constrainedTargetPos: Position.Left,
    })).toBe(expected);

    expect(selectOptimalPortsMock).toHaveBeenCalledWith(
      sourceRect,
      targetRect,
      obstacles,
      lineObstacles,
      expect.objectContaining({
        layoutDirection: 'LR',
        portUsage: { 'source:right': 2 },
        sourceId: 'source',
        targetId: 'target',
        constrainedSourcePos: Position.Right,
        constrainedTargetPos: Position.Left,
        enableDynamicPorts: config.portSelection.enableDynamicPorts,
        portSlidePadding: config.portSelection.portSlidePadding,
      }),
    );
  });

  it('uses an empty line-obstacle list by default', () => {
    const selector = new PortSelector(createDefaultRoutingConfig());
    selectOptimalPortsMock.mockReturnValue({ source: Position.Bottom, target: Position.Top });

    selector.selectPorts(rect, rect, [], {
      effectiveDir: 'TB',
      sourceId: 'a',
      targetId: 'b',
    });

    expect(selectOptimalPortsMock.mock.calls[0][3]).toEqual([]);
  });

  it('maps enum positions to handle directions', () => {
    const selector = new PortSelector(createDefaultRoutingConfig());

    expect(selector.mapPosToDir(Position.Top)).toBe('t');
    expect(selector.mapPosToDir(Position.Bottom)).toBe('b');
    expect(selector.mapPosToDir(Position.Left)).toBe('l');
    expect(selector.mapPosToDir(Position.Right)).toBe('r');
  });

  it('calculates slide bounds with clamped padding', () => {
    const config = createDefaultRoutingConfig();
    config.portSelection.portSlidePadding = -10;
    expect(new PortSelector(config).getSlideBounds(rect)).toEqual({
      minX: 0,
      maxX: 120,
      minY: 0,
      maxY: 80,
    });

    const tinyConfig = createDefaultRoutingConfig();
    tinyConfig.portSelection.portSlidePadding = 20;
    expect(new PortSelector(tinyConfig).getSlideBounds({ x: 10, y: 20, width: 10, height: 8 })).toEqual({
      minX: 0,
      maxX: 30,
      minY: 8,
      maxY: 40,
    });
  });

  it('returns static centered ports when sliding is disabled or self-looped', () => {
    const config = createDefaultRoutingConfig();
    config.portSelection.enableDynamicPorts = false;
    const selector = new PortSelector(config);

    expect(selector.getPortPointWithSlide(rect, Position.Top, { x: 1000, y: 1000 })).toEqual({ x: 60, y: 0 });
    expect(selector.getPortPointWithSlide(rect, Position.Bottom)).toEqual({ x: 60, y: 80 });
    expect(selector.getPortPointWithSlide(rect, Position.Left)).toEqual({ x: 0, y: 40 });
    expect(selector.getPortPointWithSlide(rect, Position.Right)).toEqual({ x: 120, y: 40 });

    const selfLoopConfig = createDefaultRoutingConfig();
    selfLoopConfig.portSelection.sourceId = 'same';
    selfLoopConfig.portSelection.targetId = 'same';
    const selfLoopSelector = new PortSelector(selfLoopConfig);

    expect(selfLoopSelector.getPortPointWithSlide(rect, Position.Right, { x: 1000, y: 1000 })).toEqual({
      x: 120,
      y: 40,
    });
  });

  it('slides dynamic ports toward the target while respecting central clamps', () => {
    const selector = new PortSelector(createDefaultRoutingConfig());

    expect(selector.getPortPointWithSlide({ x: 0, y: 0, width: 400, height: 200 }, Position.Bottom, {
      x: 1000,
      y: 40,
    })).toEqual({ x: 260, y: 200 });
    expect(selector.getPortPointWithSlide({ x: 0, y: 0, width: 400, height: 200 }, Position.Left, {
      x: 0,
      y: -100,
    })).toEqual({ x: 0, y: 50 });
  });

  it('distributes multiple ports across vertical and horizontal sides', () => {
    const config = createDefaultRoutingConfig();
    config.portSelection.enableDynamicPorts = false;
    const selector = new PortSelector(config);

    expect(selector.getDistributedPortPoint(rect, Position.Top, 0, 3)).toEqual({ x: 30, y: 0 });
    expect(selector.getDistributedPortPoint(rect, Position.Bottom, 2, 3)).toEqual({ x: 90, y: 80 });
    expect(selector.getDistributedPortPoint(rect, Position.Left, 0, 3)).toEqual({ x: 0, y: 20 });
    expect(selector.getDistributedPortPoint(rect, Position.Right, 2, 3)).toEqual({ x: 120, y: 60 });
    expect(selector.getDistributedPortPoint(rect, Position.Right, 0, 1)).toEqual({ x: 120, y: 40 });
  });
});
