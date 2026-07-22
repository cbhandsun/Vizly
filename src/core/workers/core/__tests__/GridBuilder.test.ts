import { describe, expect, it, vi } from 'vitest';
import { createDefaultRoutingConfig } from '../../../types/routing';
import { GridBuilder } from '../GridBuilder';

const config = createDefaultRoutingConfig();

const costAt = (
  grid: ReturnType<GridBuilder['buildGrid']>,
  x: number,
  y: number,
) => {
  const c = Math.round((x - grid.minX) / grid.size);
  const r = Math.round((y - grid.minY) / grid.size);
  return grid.data[r * grid.cols + c];
};

describe('GridBuilder', () => {
  it('builds an aligned grid and rasterizes hard obstacles with buffer zones', () => {
    const grid = new GridBuilder(config).buildGrid([
      { x: 40, y: -10, width: 20, height: 20 },
    ], { startX: 0, startY: 0, endX: 100, endY: 0 });

    expect(grid.size).toBe(20);
    expect(Math.abs(grid.minX % grid.size)).toBe(0);
    expect(Math.abs(grid.minY % grid.size)).toBe(0);
    expect(grid.maxIndex).toBe(grid.cols * grid.rows);
    expect(costAt(grid, 40, 0)).toBe(config.costs.obstacle);
    expect(costAt(grid, 20, 0)).toBe(config.costs.bufferZoneClose);
  });

  it('keeps soft zones passable while making their core more expensive', () => {
    const grid = new GridBuilder(config).buildGrid([
      { x: 40, y: -10, width: 20, height: 20, isSoftZone: true } as never,
    ], { startX: 0, startY: 0, endX: 100, endY: 0 });

    expect(costAt(grid, 40, 0)).toBe(3000);
    expect(costAt(grid, 20, 0)).toBe(config.costs.bufferZoneClose);
    expect(costAt(grid, -150, 0)).toBe(config.costs.normal);
  });

  it('does not expand short-route bounds around distant obstacles', () => {
    const grid = new GridBuilder(config).buildGrid([
      { x: 1000, y: 1000, width: 100, height: 100 },
    ], { startX: 0, startY: 0, endX: 100, endY: 0 });

    expect(grid.maxX).toBe(300);
    expect(grid.maxY).toBe(200);
  });

  it('expands long-route bounds around relevant obstacles but skips source and target obstacles', () => {
    const grid = new GridBuilder(config).buildGrid([
      { id: 'source', x: -500, y: -500, width: 100, height: 100 } as never,
      { x: 800, y: -100, width: 100, height: 100 },
    ], { startX: 0, startY: 0, endX: 1000, endY: 0 }, 'source', 'target');

    expect(grid.minX).toBe(-200);
    expect(grid.maxX).toBe(1200);
    expect(grid.minY).toBe(-300);
    expect(grid.maxY).toBe(200);
  });

  it('queries spatial indexes for relevant obstacles during bounds and rasterization', () => {
    const query = vi.fn((_bounds: unknown) => [{ x: 40, y: -10, width: 20, height: 20 }]);
    const grid = new GridBuilder(config).buildGrid(
      { query } as never,
      { startX: 0, startY: 0, endX: 100, endY: 0 },
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toMatchObject({ x: -300, y: -300, width: 700, height: 600 });
    expect(costAt(grid, 40, 0)).toBe(config.costs.obstacle);
  });

  it('uses coarser adaptive grid sizes for very long routes', () => {
    const grid = new GridBuilder(config).buildGrid([], { startX: 0, startY: 0, endX: 9000, endY: 0 });
    expect(grid.size).toBe(40);
  });
});
