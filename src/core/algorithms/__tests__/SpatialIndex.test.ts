import { describe, expect, it } from 'vitest';
import { QuadTree } from '../SpatialIndex';

describe('QuadTree SpatialIndex', () => {
  it('inserts, queries, removes, and clears rectangles', () => {
    const tree = new QuadTree({ x: 0, y: 0, width: 200, height: 200 });
    const a = { x: 10, y: 10, width: 10, height: 10 };
    const b = { x: 150, y: 150, width: 10, height: 10 };

    tree.insert(a);
    tree.insert(b);

    expect(tree.getAll()).toEqual(expect.arrayContaining([a, b]));
    expect(tree.query({ x: 0, y: 0, width: 50, height: 50 })).toContain(a);
    expect(tree.queryLine(0, 0, 30, 30)).toContain(a);

    tree.remove(a);
    expect(tree.getAll()).not.toContain(a);
    expect(tree.getAll()).toContain(b);

    tree.clear();
    expect(tree.getAll()).toEqual([]);
  });

  it('splits into child nodes and queries across quadrants', () => {
    const tree = new QuadTree({ x: 0, y: 0, width: 400, height: 400 });
    const rects = Array.from({ length: 16 }, (_, index) => ({
      x: 10 + (index % 4) * 90,
      y: 10 + Math.floor(index / 4) * 90,
      width: 20,
      height: 20,
    }));

    rects.forEach(rect => tree.insert(rect));

    expect(tree.getAll()).toHaveLength(16);
    expect(tree.query({ x: 0, y: 0, width: 400, height: 400 })).toHaveLength(16);
    expect(tree.query({ x: 0, y: 0, width: 120, height: 120 }).length).toBeGreaterThan(0);
    expect(tree.getDebugBounds().length).toBeGreaterThan(1);
  });
});
